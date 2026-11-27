/** @file Cull animal sheet — individual + composite head cull.
 *
 * Captures date + reason + notes, persists via entity fields (active=false,
 * cullDate, cullReason, cullNotes), and closes open animal_group_memberships
 * on the cull date.
 *
 * Composites: heads-to-cull 1…H. Partial (N < H) spawns a culled bulk lot and
 * reduces the living composite; full (N = H) deactivates the composite. Partial
 * culls offer one-tap device-local undo. Full composite Reactivate restores
 * memberships and reactivates an archived group.
 *
 * Pure helpers are exported for unit testing.
 */

import { el, clear } from '../../ui/dom.js';
import { Sheet, ensureSheetDOM } from '../../ui/sheet.js';
import { showToast } from '../../ui/toast.js';
import { t } from '../../i18n/i18n.js';
import {
  getAll, getById, add, update, remove, splitGroupWindow, reactivateGroup, maybeSplitForGroup,
} from '../../data/store.js';
import {
  getLiveWindowHeadCount, getLiveWindowAvgWeight, latestWeightForAnimal,
  animalHeadCount, reduceCompositeTotals,
} from '../../calcs/window-helpers.js';
import { maybeShowEmptyGroupPrompt } from './empty-group-prompt.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { display } from '../../utils/units.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { logger } from '../../utils/logger.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

let cullSheet = null;
let compositePickerSheet = null;

/** Device-local undo snapshot for the last partial composite cull on this device. */
let lastPartialCullUndo = null;

/** The 9 v1 cull reasons, in display order. */
export const CULL_REASONS = [
  'Sold',
  'Died (natural)',
  'Died (injury)',
  'Euthanized',
  'Culled (production)',
  'Culled (health)',
  'Culled (age)',
  'Culled (temperament)',
  'Other',
];

const SHEET_SHELL = {
  wrapId: 'cull-sheet-wrap',
  panelId: 'cull-sheet-panel',
  zIndex: '230',
  onBackdropClick: () => cullSheet?.close(),
};

function ensurePickerDOM() {
  if (document.getElementById('composite-cull-picker-wrap')) return;
  document.body.appendChild(el('div', {
    className: 'sheet-wrap',
    id: 'composite-cull-picker-wrap',
    style: { zIndex: '231' },
  }, [
    el('div', { className: 'sheet-backdrop', onClick: () => compositePickerSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'composite-cull-picker-panel' }),
  ]));
}

/** Plain cull toasts stay up 5 s (undo toasts 8 s). */
const CULL_TOAST = { duration: 5000 };

/**
 * Toast with a one-tap Undo button (device-local reverse of the last partial cull).
 * @param {string} message
 * @param {() => void} onUndo
 */
export function showCullUndoToast(message, onUndo) {
  showToast(message, 'cull-toast', {
    duration: 8000,
    action: {
      label: t('animal.cullUndo'),
      className: 'btn btn-outline btn-xs',
      testid: 'cull-undo-btn',
      style: { color: 'var(--bg)', borderColor: 'var(--bg)', flexShrink: '0' },
      onClick: () => {
        try { onUndo(); } catch (err) { logger.warn('cull', 'Undo failed', { err: err?.message }); }
      },
    },
  });
}

/**
 * Build the human-readable label for the animal in the sheet header.
 * Pure: exported for testing.
 *
 * @param {object} args - { animal, latestWeightKg, unitSys }
 * @returns {string} e.g. "A-0042 · Tag 203 · 1,120 lbs"
 */
export function buildAnimalLabel({ animal, latestWeightKg, unitSys }) {
  const parts = [];
  const idLabel = animal.name || animal.eid || animal.id?.slice(0, 8);
  if (idLabel) parts.push(idLabel);
  if (animal.tagNum) parts.push(`Tag ${animal.tagNum}`);
  if (animal.isBulk) {
    const heads = animalHeadCount(animal);
    if (heads > 0) parts.push(`${heads} head`);
  }
  if (latestWeightKg != null) {
    parts.push(display(latestWeightKg, 'weight', unitSys || 'imperial', 0));
  }
  return parts.filter(Boolean).join(' \u00B7 ');
}

/**
 * Validate heads-to-cull for a composite. Pure.
 * @param {unknown} raw
 * @param {number} headCount
 * @returns {{ ok: true, heads: number } | { ok: false, error: string }}
 */
export function validateHeadsToCull(raw, headCount) {
  const H = Math.floor(Number(headCount) || 0);
  if (H < 1) return { ok: false, error: t('animal.cullHeadsInvalid') };
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > H) {
    return { ok: false, error: t('animal.cullHeadsRange', { max: H }) };
  }
  return { ok: true, heads: n };
}

/**
 * Living composites currently in a group (open membership, active, head > 0).
 * Pure store read. Exported for testing / group-card entry.
 * @param {string} groupId
 * @returns {object[]}
 */
export function livingCompositesInGroup(groupId) {
  if (!groupId) return [];
  const animalsById = new Map(getAll('animals').map(a => [a.id, a]));
  const out = [];
  for (const m of getAll('animalGroupMemberships')) {
    if (m.groupId !== groupId || m.dateLeft) continue;
    const a = animalsById.get(m.animalId);
    if (!a || a.isBulk !== true || a.active === false) continue;
    if (animalHeadCount(a) < 1) continue;
    out.push(a);
  }
  return out;
}

/** @returns {object|null} last partial-cull undo snapshot (test helper) */
export function getLastPartialCullUndo() {
  return lastPartialCullUndo;
}

/** Clear device-local undo (test helper). */
export function clearPartialCullUndo() {
  lastPartialCullUndo = null;
}

/**
 * Split open event_group_windows for groups whose live composition just changed.
 * Same OI-0137 rule as individual cull: changeDate is always today.
 * @param {Iterable<string>} groupIds
 * @returns {Array<object>}
 */
function splitWindowsForGroups(groupIds) {
  const splitResults = [];
  const todayStr = getLocalTodayStr();
  const openEvents = new Set(getAll('events').filter(e => !e.dateOut).map(e => e.id));
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');

  for (const groupId of groupIds) {
    const openGWs = getAll('eventGroupWindows').filter(
      w => w.groupId === groupId && !w.dateLeft && openEvents.has(w.eventId),
    );
    for (const gw of openGWs) {
      const closedSnapshot = {
        id: gw.id,
        dateLeft: gw.dateLeft ?? null,
        timeLeft: gw.timeLeft ?? null,
        headCount: gw.headCount,
        avgWeightKg: gw.avgWeightKg,
      };
      const liveHead = getLiveWindowHeadCount({ ...gw, dateLeft: null }, { memberships, animals, now: todayStr });
      const liveAvg = getLiveWindowAvgWeight(
        { ...gw, dateLeft: null },
        { memberships, animals, animalClasses, animalWeightRecords, now: todayStr },
      );
      const result = splitGroupWindow(groupId, gw.eventId, todayStr, null, {
        headCount: liveHead,
        avgWeightKg: liveAvg,
      });
      splitResults.push({
        groupId,
        closedId: result.closedId,
        newId: result.newId,
        closedSnapshot,
      });
    }
  }
  return splitResults;
}

/**
 * Commit a cull. Updates the animal record and closes every open
 * animal_group_memberships row on the cull date.
 *
 * @param {object} args
 * @returns {{ closedMembershipIds: Array<string>, splitResults: Array<object>, kind: 'full' }}
 */
export function confirmCull({ animal, cullDate, cullReason, cullNotes }) {
  update(
    'animals', animal.id,
    { active: false, cullDate, cullReason, cullNotes: cullNotes || null },
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
  );

  const closedMembershipIds = [];
  const affectedGroupIds = new Set();
  const openMems = getAll('animalGroupMemberships').filter(m => m.animalId === animal.id && !m.dateLeft);
  for (const m of openMems) {
    update(
      'animalGroupMemberships', m.id,
      { dateLeft: cullDate, reason: 'cull' },
      MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships',
    );
    closedMembershipIds.push(m.id);
    if (m.groupId) affectedGroupIds.add(m.groupId);
  }

  const splitResults = splitWindowsForGroups(affectedGroupIds);

  logger.info('cull', 'Animal culled', {
    animalId: animal.id, cullDate, cullReason,
    closedMemberships: closedMembershipIds.length,
    splitWindows: splitResults.length,
  });

  for (const groupId of affectedGroupIds) {
    maybeShowEmptyGroupPrompt(groupId);
  }

  return { closedMembershipIds, splitResults, kind: 'full' };
}

/**
 * Partial composite cull (N < H): spawn a culled bulk lot; reduce living composite.
 * Does not close the source membership. One-tap undo via {@link undoPartialBulkCull}.
 *
 * @param {object} args
 * @returns {{ kind: 'partial', culledLotId: string, undo: object, splitResults: Array<object> }}
 */
export function confirmPartialBulkCull({
  animal, cullDate, cullReason, cullNotes, headsToCull, operationId,
}) {
  const headBefore = animalHeadCount(animal);
  const validated = validateHeadsToCull(headsToCull, headBefore);
  if (!validated.ok) throw new Error(validated.error);
  const N = validated.heads;
  if (N >= headBefore) {
    throw new Error('confirmPartialBulkCull requires N < H; use confirmCull for full cull');
  }

  const latest = latestWeightForAnimal(getAll('animalWeightRecords'), animal.id);
  const weightBefore = latest?.weightKg ?? null;
  const reduced = reduceCompositeTotals({
    headBefore,
    weightKg: weightBefore,
    headsToRemove: N,
  });

  update(
    'animals', animal.id,
    { bulkHeadCount: reduced.headAfter },
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
  );

  let sourceWeightRecordId = null;
  if (reduced.weightKgAfter != null && reduced.weightKgAfter > 0 && typeof weightBefore === 'number') {
    const rec = WeightRecordEntity.create({
      operationId,
      animalId: animal.id,
      recordedAt: new Date().toISOString(),
      weightKg: reduced.weightKgAfter,
      source: 'manual',
      notes: 'Composite reduced by partial cull',
    });
    add('animalWeightRecords', rec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
    sourceWeightRecordId = rec.id;
  }

  const culledWeightKg = (
    typeof weightBefore === 'number'
    && typeof reduced.weightKgAfter === 'number'
  )
    ? Math.max(0, weightBefore - reduced.weightKgAfter)
    : null;

  const sourceName = animal.name || animal.tagNum || t('animal.compositeFallbackName');
  const culledLot = AnimalEntity.create({
    operationId,
    classId: animal.classId ?? null,
    name: `${sourceName} \u00B7 culled`,
    sex: animal.sex,
    isBulk: true,
    bulkHeadCount: N,
    active: false,
    cullDate,
    cullReason,
    cullNotes: cullNotes || null,
  });
  add('animals', culledLot, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');

  let culledLotWeightRecordId = null;
  if (culledWeightKg != null && culledWeightKg > 0) {
    const wRec = WeightRecordEntity.create({
      operationId,
      animalId: culledLot.id,
      recordedAt: new Date().toISOString(),
      weightKg: culledWeightKg,
      source: 'manual',
      notes: 'Culled lot share from partial composite cull',
    });
    add('animalWeightRecords', wRec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
    culledLotWeightRecordId = wRec.id;
  }

  const openMem = getAll('animalGroupMemberships').find(
    m => m.animalId === animal.id && !m.dateLeft,
  );
  const affectedGroupIds = new Set();
  if (openMem?.groupId) affectedGroupIds.add(openMem.groupId);

  const splitResults = splitWindowsForGroups(affectedGroupIds);

  const undo = {
    kind: 'partial-bulk-cull',
    sourceAnimalId: animal.id,
    sourceHeadBefore: headBefore,
    sourceWeightRecordId,
    culledLotId: culledLot.id,
    culledLotWeightRecordId,
    groupId: openMem?.groupId ?? null,
    windowSplits: splitResults.map(s => ({
      closedId: s.closedId,
      newId: s.newId,
      closedSnapshot: s.closedSnapshot,
    })),
  };
  lastPartialCullUndo = undo;

  logger.info('cull', 'Partial composite cull', {
    animalId: animal.id, headsCulled: N, headAfter: reduced.headAfter,
    culledLotId: culledLot.id, splitWindows: splitResults.length,
  });

  return { kind: 'partial', culledLotId: culledLot.id, undo, splitResults };
}

/**
 * Confirm composite cull: routes to partial or full based on heads.
 * @param {object} args
 * @returns {{ kind: 'partial'|'full', ... }}
 */
export function confirmBulkCull({
  animal, cullDate, cullReason, cullNotes, headsToCull, operationId,
}) {
  const H = animalHeadCount(animal);
  const validated = validateHeadsToCull(headsToCull, H);
  if (!validated.ok) throw new Error(validated.error);
  const N = validated.heads;
  if (N === H) {
    lastPartialCullUndo = null;
    return confirmCull({ animal, cullDate, cullReason, cullNotes });
  }
  return confirmPartialBulkCull({
    animal, cullDate, cullReason, cullNotes, headsToCull: N, operationId,
  });
}

/**
 * Reverse the last partial composite cull on this device (no migration).
 * @param {object} [snapshot] - defaults to lastPartialCullUndo
 * @returns {boolean} true if something was undone
 */
export function undoPartialBulkCull(snapshot = lastPartialCullUndo) {
  if (!snapshot || snapshot.kind !== 'partial-bulk-cull') return false;

  for (const split of snapshot.windowSplits || []) {
    if (split.newId && getById('eventGroupWindows', split.newId)) {
      remove('eventGroupWindows', split.newId, 'event_group_windows');
    }
    if (split.closedId && split.closedSnapshot && getById('eventGroupWindows', split.closedId)) {
      update(
        'eventGroupWindows', split.closedId,
        {
          dateLeft: split.closedSnapshot.dateLeft,
          timeLeft: split.closedSnapshot.timeLeft,
          headCount: split.closedSnapshot.headCount,
          avgWeightKg: split.closedSnapshot.avgWeightKg,
        },
        GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows',
      );
    }
  }

  if (snapshot.culledLotWeightRecordId && getById('animalWeightRecords', snapshot.culledLotWeightRecordId)) {
    remove('animalWeightRecords', snapshot.culledLotWeightRecordId, 'animal_weight_records');
  }
  if (snapshot.culledLotId && getById('animals', snapshot.culledLotId)) {
    remove('animals', snapshot.culledLotId, 'animals');
  }
  if (snapshot.sourceWeightRecordId && getById('animalWeightRecords', snapshot.sourceWeightRecordId)) {
    remove('animalWeightRecords', snapshot.sourceWeightRecordId, 'animal_weight_records');
  }
  if (snapshot.sourceAnimalId && getById('animals', snapshot.sourceAnimalId)) {
    update(
      'animals', snapshot.sourceAnimalId,
      { bulkHeadCount: snapshot.sourceHeadBefore },
      AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
    );
  }

  if (lastPartialCullUndo === snapshot || lastPartialCullUndo?.culledLotId === snapshot.culledLotId) {
    lastPartialCullUndo = null;
  }

  logger.info('cull', 'Partial composite cull undone', {
    sourceAnimalId: snapshot.sourceAnimalId,
    culledLotId: snapshot.culledLotId,
  });
  return true;
}

/**
 * Reactivate a culled animal — clears all four cull fields.
 * Individuals: user reassigns to a group manually (v1).
 * Composites: reopen cull-closed memberships and reactivate archived groups.
 *
 * @param {object} args
 * @param {object} args.animal
 */
export function reactivateAnimal({ animal }) {
  const wasBulk = animal.isBulk === true;
  const cullDate = animal.cullDate || null;

  update(
    'animals', animal.id,
    { active: true, cullDate: null, cullReason: null, cullNotes: null },
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
  );

  if (wasBulk) {
    const closed = getAll('animalGroupMemberships').filter(m => (
      m.animalId === animal.id
      && m.reason === 'cull'
      && m.dateLeft
      && (!cullDate || m.dateLeft === cullDate)
    ));
    const groupIds = new Set();
    for (const m of closed) {
      update(
        'animalGroupMemberships', m.id,
        { dateLeft: null, reason: null },
        MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships',
      );
      if (m.groupId) groupIds.add(m.groupId);
    }
    const todayStr = getLocalTodayStr();
    for (const groupId of groupIds) {
      const group = getById('groups', groupId);
      if (group?.archivedAt) reactivateGroup(groupId);
      maybeSplitForGroup(groupId, todayStr);
    }
  }

  logger.info('cull', 'Animal reactivated', { animalId: animal.id, wasBulk });
}

/**
 * Open the Cull Sheet for an animal (individual or composite).
 *
 * @param {object} animal - the animal record being culled
 * @param {string} operationId
 * @param {() => void} [onCommitted] - optional callback after successful cull
 */
export function openCullSheet(animal, operationId, onCommitted) {
  if (!animal) return;
  ensureSheetDOM(SHEET_SHELL);
  if (!cullSheet) cullSheet = new Sheet('cull-sheet-wrap');
  const panel = document.getElementById('cull-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isComposite = animal.isBulk === true;
  const headCount = isComposite ? animalHeadCount(animal) : 1;

  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, [
    isComposite ? t('animal.cullCompositeTitle') : t('animal.cullTitle'),
  ]));

  const unitSys = getUnitSystem();
  const latestWeightKg = latestWeightForAnimal(getAll('animalWeightRecords'), animal.id)?.weightKg ?? null;
  const label = buildAnimalLabel({ animal, latestWeightKg, unitSys });

  panel.appendChild(el('div', {
    'data-testid': 'cull-animal-label',
    style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' },
  }, [label]));

  let headsInput = null;
  if (isComposite) {
    headsInput = el('input', {
      type: 'number',
      min: '1',
      max: String(headCount),
      step: '1',
      value: '1',
      'data-testid': 'cull-heads-input',
    });
    panel.appendChild(el('div', { className: 'field' }, [
      el('label', {}, [t('animal.cullHeads')]),
      headsInput,
      el('div', {
        style: { fontSize: '11px', color: 'var(--text2)', marginTop: '4px' },
        'data-testid': 'cull-heads-hint',
      }, [t('animal.cullHeadsHint', { max: headCount })]),
    ]));
  }

  const dateInput = el('input', { type: 'date', value: getLocalTodayStr(), 'data-testid': 'cull-date-input' });
  const reasonSelect = el('select', { 'data-testid': 'cull-reason-select' },
    CULL_REASONS.map(r => el('option', { value: r }, [r])),
  );
  reasonSelect.value = 'Sold';

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, [t('animal.cullDate')]), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, [t('animal.cullReason')]), reasonSelect]),
  ]));

  const notesInput = el('input', {
    type: 'text',
    placeholder: t('animal.cullNotesPlaceholder'),
    'data-testid': 'cull-notes-input',
  });
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, [
      t('animal.cullNotes'),
      ' ',
      el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [t('animal.optional')]),
    ]),
    notesInput,
  ]));

  panel.appendChild(el('div', {
    style: { background: 'var(--amber-l)', borderLeft: '3px solid var(--amber)', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', color: 'var(--amber-d)' },
  }, [isComposite ? t('animal.cullCompositeInfoBanner') : t('animal.cullInfoBanner')]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'cull-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', {
      className: 'btn btn-amber',
      'data-testid': 'cull-confirm',
      onClick: () => {
        clear(statusEl);
        const cullDate = dateInput.value;
        const cullReason = reasonSelect.value;
        const cullNotes = notesInput.value.trim() || null;
        if (!cullDate) {
          statusEl.appendChild(el('span', {}, [t('animal.cullDateRequired')]));
          return;
        }
        try {
          if (isComposite) {
            const headsRaw = headsInput ? headsInput.value : '1';
            const result = confirmBulkCull({
              animal, cullDate, cullReason, cullNotes,
              headsToCull: headsRaw, operationId,
            });
            cullSheet.close();
            const idLabel = animal.name || animal.eid || animal.id?.slice(0, 8);
            if (result.kind === 'partial') {
              showCullUndoToast(
                t('animal.cullPartialToast', { label: idLabel, count: Number(headsRaw) }),
                () => {
                  undoPartialBulkCull(result.undo);
                  showToast(t('animal.cullUndoDone'), 'cull-toast', CULL_TOAST);
                  if (onCommitted) onCommitted();
                },
              );
            } else {
              showToast(t('animal.cullFullToast', { label: idLabel, reason: cullReason }), 'cull-toast', CULL_TOAST);
            }
            if (onCommitted) onCommitted();
          } else {
            confirmCull({ animal, cullDate, cullReason, cullNotes });
            cullSheet.close();
            const idLabel = animal.name || animal.eid || animal.id?.slice(0, 8);
            const tagPart = animal.tagNum ? ` (${animal.tagNum})` : '';
            showToast(`${idLabel}${tagPart} marked as culled (${cullReason}). Removed from group — DMI targets updated.`, 'cull-toast', CULL_TOAST);
            if (onCommitted) onCommitted();
          }
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('animal.cullConfirm')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => cullSheet.close(),
    }, [t('action.cancel')]),
  ]));

  cullSheet.open();
}

/**
 * Group-card Cull entry: open the bulk cull sheet for the group's living composite(s).
 * One composite → sheet directly. Multiple → minimal picker (no invented multi-cull UX).
 *
 * @param {object} group
 * @param {string} operationId
 * @param {() => void} [onCommitted]
 */
export function openCullFromGroupCard(group, operationId, onCommitted) {
  if (!group?.id) return;
  const composites = livingCompositesInGroup(group.id);
  if (composites.length === 0) return;
  if (composites.length === 1) {
    openCullSheet(composites[0], operationId, onCommitted);
    return;
  }

  ensurePickerDOM();
  if (!compositePickerSheet) compositePickerSheet = new Sheet('composite-cull-picker-wrap');
  const panel = document.getElementById('composite-cull-picker-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', {
    style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' },
    'data-testid': 'composite-cull-picker-title',
  }, [t('animal.cullPickCompositeTitle')]));
  panel.appendChild(el('div', {
    style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' },
  }, [t('animal.cullPickCompositeHint', { group: group.name || '' })]));

  for (const a of composites) {
    const heads = animalHeadCount(a);
    const label = a.name || a.tagNum || a.id.slice(0, 8);
    panel.appendChild(el('button', {
      className: 'btn btn-outline',
      style: { width: '100%', marginBottom: '6px', textAlign: 'left' },
      'data-testid': `composite-cull-pick-${a.id}`,
      onClick: () => {
        compositePickerSheet.close();
        openCullSheet(a, operationId, onCommitted);
      },
    }, [`${label} (${heads} head)`]));
  }

  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => compositePickerSheet.close(),
    }, [t('action.cancel')]),
  ]));

  compositePickerSheet.open();
}

/**
 * Render the red culled-state banner with reason + date + notes + Reactivate.
 * Returns the element so the caller can append it.
 *
 * @param {object} animal
 * @param {() => void} onReactivated - called after successful reactivation
 * @returns {HTMLElement}
 */
export function buildCulledBanner(animal, onReactivated) {
  const idLabel = animal.name || animal.eid || animal.id?.slice(0, 8);
  const tagPart = animal.tagNum ? ` (${animal.tagNum})` : '';

  return el('div', {
    'data-testid': 'culled-banner',
    style: { background: 'var(--red-l)', borderLeft: '3px solid var(--red)', borderRadius: '6px', padding: '10px 12px', marginBottom: '0' },
  }, [
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--red-d)' } }, [
      `${t('animal.culledLabel')} \u2014 ${animal.cullReason || ''}`,
    ]),
    el('div', { style: { fontSize: '12px', color: 'var(--red-d)', marginTop: '2px' } }, [
      `${animal.cullDate || ''}${animal.cullNotes ? ' \u00B7 ' + animal.cullNotes : ''}`,
    ]),
    el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'reactivate-btn',
      style: { marginTop: '6px' },
      onClick: () => {
        const confirmMsg = animal.isBulk
          ? t('animal.reactivateCompositeConfirm').replace('{label}', `${idLabel}${tagPart}`)
          : t('animal.reactivateConfirm').replace('{label}', `${idLabel}${tagPart}`);
        if (!confirm(confirmMsg)) return;
        reactivateAnimal({ animal });
        if (onReactivated) onReactivated();
      },
    }, [t('animal.reactivate')]),
  ]);
}
