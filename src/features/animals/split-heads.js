/** @file Split heads off a composite (bulk split).
 *
 * Extends Split Group: when a composite is selected, heads 1…H can peel off
 * into a new living composite (N < H) or move the whole composite (N = H).
 * One-tap reverse-write undo on the splitting device — no migration.
 *
 * Pure helpers are exported for unit testing.
 */

import { showToast } from '../../ui/toast.js';
import { t } from '../../i18n/i18n.js';
import {
  getAll, getById, add, update, remove, splitGroupWindow,
} from '../../data/store.js';
import {
  getLiveWindowHeadCount, getLiveWindowAvgWeight, latestWeightForAnimal,
  animalHeadCount, reduceCompositeTotals,
} from '../../calcs/window-helpers.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { logger } from '../../utils/logger.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

/** Device-local undo snapshot for the last composite head-split on this device. */
let lastSplitUndo = null;

/**
 * Validate heads-to-split for a composite. Pure.
 * @param {unknown} raw
 * @param {number} headCount
 * @returns {{ ok: true, heads: number } | { ok: false, error: string }}
 */
export function validateHeadsToSplit(raw, headCount) {
  const H = Math.floor(Number(headCount) || 0);
  if (H < 1) return { ok: false, error: t('animal.splitHeadsInvalid') };
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > H) {
    return { ok: false, error: t('animal.splitHeadsRange', { max: H }) };
  }
  return { ok: true, heads: n };
}

/** Suggested new-group name for a split destination (S1). */
export function suggestSplitGroupName(sourceGroupName) {
  const base = String(sourceGroupName || '').trim() || t('animal.compositeFallbackName');
  return `${base} split`;
}

/** @returns {object|null} */
export function getLastSplitUndo() {
  return lastSplitUndo;
}

/** Clear device-local undo (test helper). */
export function clearSplitUndo() {
  lastSplitUndo = null;
}

/**
 * Toast with a one-tap Undo button (device-local reverse of the last split).
 * @param {string} message
 * @param {() => void} onUndo
 */
export function showSplitUndoToast(message, onUndo) {
  showToast(message, 'split-toast', {
    duration: 8000,
    action: {
      label: t('animal.splitUndo'),
      className: 'btn btn-outline btn-xs',
      testid: 'split-undo-btn',
      style: { color: 'var(--bg)', borderColor: 'var(--bg)', flexShrink: '0' },
      onClick: () => {
        try { onUndo(); } catch (err) { logger.warn('split', 'Undo failed', { err: err?.message }); }
      },
    },
  });
}

/**
 * Split open event_group_windows for the given groups (OI-0137 / today pin).
 * Returns snapshots so undo can reverse the writes.
 * @param {Iterable<string>} groupIds
 * @returns {Array<object>}
 */
export function splitWindowsForGroups(groupIds) {
  const todayStr = getLocalTodayStr();
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const openEvents = new Set(
    getAll('events').filter(e => !e.dateOut).map(e => e.id),
  );
  const splitResults = [];
  const seen = new Set();
  for (const groupId of groupIds) {
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
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
      const liveHead = getLiveWindowHeadCount({ ...gw, dateLeft: null }, {
        memberships, animals, now: todayStr,
      });
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

function reverseWindowSplits(windowSplits) {
  for (const split of windowSplits || []) {
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
}

/**
 * N < H: create a new living composite with N heads; reduce source to H−N.
 * Does not call confirmCompositeReductions (S3). Source membership stays open.
 *
 * @returns {{ kind: 'partial', newAnimalId: string, undo: object, splitResults: Array<object> }}
 */
export function confirmPartialCompositeSplit({
  sourceAnimal,
  sourceGroupId,
  targetGroupId,
  headsToSplit,
  splitDate,
  notes,
  operationId,
  createdGroupId = null,
  runWindowSplits = true,
}) {
  if (!sourceAnimal?.isBulk) throw new Error('confirmPartialCompositeSplit requires a composite');
  if (!targetGroupId) throw new Error('targetGroupId is required');
  if (!splitDate) throw new Error(t('animal.splitDateRequired'));

  const headBefore = animalHeadCount(sourceAnimal);
  const validated = validateHeadsToSplit(headsToSplit, headBefore);
  if (!validated.ok) throw new Error(validated.error);
  const N = validated.heads;
  if (N >= headBefore) {
    throw new Error('confirmPartialCompositeSplit requires N < H; use confirmWholeCompositeMove for N = H');
  }

  const latest = latestWeightForAnimal(getAll('animalWeightRecords'), sourceAnimal.id);
  const weightBefore = latest?.weightKg ?? null;
  const reduced = reduceCompositeTotals({
    headBefore,
    weightKg: weightBefore,
    headsToRemove: N,
  });

  update(
    'animals', sourceAnimal.id,
    { bulkHeadCount: reduced.headAfter },
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
  );

  let sourceWeightRecordId = null;
  if (reduced.weightKgAfter != null && typeof weightBefore === 'number') {
    const rec = WeightRecordEntity.create({
      operationId,
      animalId: sourceAnimal.id,
      recordedAt: new Date().toISOString(),
      weightKg: reduced.weightKgAfter,
      source: 'manual',
      notes: 'Composite reduced by head split',
    });
    add('animalWeightRecords', rec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
    sourceWeightRecordId = rec.id;
  }

  const splitWeightKg = (
    typeof weightBefore === 'number'
    && typeof reduced.weightKgAfter === 'number'
  )
    ? Math.max(0, weightBefore - reduced.weightKgAfter)
    : null;

  const sourceName = sourceAnimal.name || sourceAnimal.tagNum || t('animal.compositeFallbackName');
  const newAnimal = AnimalEntity.create({
    operationId,
    classId: sourceAnimal.classId ?? null,
    name: `${sourceName} \u00B7 split`,
    sex: sourceAnimal.sex,
    isBulk: true,
    bulkHeadCount: N,
    active: true,
    notes: notes ? String(notes).trim() || null : null,
  });
  add('animals', newAnimal, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');

  let newWeightRecordId = null;
  if (splitWeightKg != null && splitWeightKg > 0) {
    const wRec = WeightRecordEntity.create({
      operationId,
      animalId: newAnimal.id,
      recordedAt: new Date().toISOString(),
      weightKg: splitWeightKg,
      source: 'manual',
      notes: 'Split-off lot share from composite head split',
    });
    add('animalWeightRecords', wRec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
    newWeightRecordId = wRec.id;
  }

  const destMem = MembershipEntity.create({
    operationId,
    animalId: newAnimal.id,
    groupId: targetGroupId,
    dateJoined: splitDate,
    reason: 'split',
  });
  add('animalGroupMemberships', destMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');

  const affected = new Set([sourceGroupId, targetGroupId].filter(Boolean));
  const splitResults = runWindowSplits ? splitWindowsForGroups(affected) : [];

  const undo = {
    kind: 'partial-composite-split',
    sourceAnimalId: sourceAnimal.id,
    sourceHeadBefore: headBefore,
    sourceWeightRecordId,
    newAnimalId: newAnimal.id,
    newWeightRecordId,
    destMembershipId: destMem.id,
    sourceGroupId: sourceGroupId || null,
    targetGroupId,
    createdGroupId: createdGroupId || null,
    windowSplits: splitResults.map(s => ({
      closedId: s.closedId,
      newId: s.newId,
      closedSnapshot: s.closedSnapshot,
    })),
  };
  lastSplitUndo = undo;

  logger.info('split', 'Partial composite head split', {
    sourceAnimalId: sourceAnimal.id,
    headsSplit: N,
    headAfter: reduced.headAfter,
    newAnimalId: newAnimal.id,
    targetGroupId,
    splitWindows: splitResults.length,
  });

  return { kind: 'partial', newAnimalId: newAnimal.id, undo, splitResults };
}

/**
 * N = H: whole-composite move of the existing animal to destination.
 * Never leaves an active 0-head source composite.
 *
 * @returns {{ kind: 'whole-move', undo: object, splitResults: Array<object>, closedMembershipId: string|null, newMembershipId: string }}
 */
export function confirmWholeCompositeMove({
  sourceAnimal,
  sourceGroupId,
  targetGroupId,
  splitDate,
  notes,
  operationId,
  createdGroupId = null,
  runWindowSplits = true,
}) {
  if (!sourceAnimal) throw new Error('sourceAnimal is required');
  if (!targetGroupId) throw new Error('targetGroupId is required');
  if (!splitDate) throw new Error(t('animal.splitDateRequired'));

  if (notes && String(notes).trim()) {
    const existing = sourceAnimal.notes ? `${sourceAnimal.notes}\n` : '';
    update(
      'animals', sourceAnimal.id,
      { notes: `${existing}${String(notes).trim()}` },
      AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
    );
  }

  const allMems = getAll('animalGroupMemberships');
  const oldMem = allMems.find(
    m => m.animalId === sourceAnimal.id
      && (!sourceGroupId || m.groupId === sourceGroupId)
      && !m.dateLeft,
  );
  let closedMembershipId = null;
  let closedMembershipSnapshot = null;
  if (oldMem) {
    closedMembershipSnapshot = {
      id: oldMem.id,
      dateLeft: oldMem.dateLeft ?? null,
      reason: oldMem.reason ?? null,
      groupId: oldMem.groupId,
    };
    update(
      'animalGroupMemberships', oldMem.id,
      { dateLeft: splitDate, reason: 'split' },
      MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships',
    );
    closedMembershipId = oldMem.id;
  }

  const newMem = MembershipEntity.create({
    operationId,
    animalId: sourceAnimal.id,
    groupId: targetGroupId,
    dateJoined: splitDate,
    reason: 'split',
  });
  add('animalGroupMemberships', newMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');

  const affected = new Set([
    sourceGroupId || oldMem?.groupId || null,
    targetGroupId,
  ].filter(Boolean));
  const splitResults = runWindowSplits ? splitWindowsForGroups(affected) : [];

  const undo = {
    kind: 'whole-composite-move',
    sourceAnimalId: sourceAnimal.id,
    closedMembershipId,
    closedMembershipSnapshot,
    newMembershipId: newMem.id,
    sourceGroupId: sourceGroupId || oldMem?.groupId || null,
    targetGroupId,
    createdGroupId: createdGroupId || null,
    notesApplied: !!(notes && String(notes).trim()),
    notesBefore: sourceAnimal.notes ?? null,
    windowSplits: splitResults.map(s => ({
      closedId: s.closedId,
      newId: s.newId,
      closedSnapshot: s.closedSnapshot,
    })),
  };
  lastSplitUndo = undo;

  logger.info('split', 'Whole composite move', {
    sourceAnimalId: sourceAnimal.id,
    targetGroupId,
    splitWindows: splitResults.length,
  });

  return {
    kind: 'whole-move',
    undo,
    splitResults,
    closedMembershipId,
    newMembershipId: newMem.id,
  };
}

/**
 * Route composite split: N < H → partial; N = H → whole move.
 * @returns {{ kind: 'partial'|'whole-move', undo: object, ... }}
 */
export function confirmCompositeHeadSplit({
  sourceAnimal,
  sourceGroupId,
  targetGroupId,
  headsToSplit,
  splitDate,
  notes,
  operationId,
  createdGroupId = null,
  runWindowSplits = true,
}) {
  const H = animalHeadCount(sourceAnimal);
  const validated = validateHeadsToSplit(headsToSplit, H);
  if (!validated.ok) throw new Error(validated.error);
  const N = validated.heads;
  if (N === H) {
    return confirmWholeCompositeMove({
      sourceAnimal,
      sourceGroupId,
      targetGroupId,
      splitDate,
      notes,
      operationId,
      createdGroupId,
      runWindowSplits,
    });
  }
  return confirmPartialCompositeSplit({
    sourceAnimal,
    sourceGroupId,
    targetGroupId,
    headsToSplit: N,
    splitDate,
    notes,
    operationId,
    createdGroupId,
    runWindowSplits,
  });
}

/**
 * Reverse the last composite split on this device (no migration).
 * @param {object} [snapshot]
 * @returns {boolean}
 */
export function undoCompositeSplit(snapshot = lastSplitUndo) {
  if (!snapshot) return false;

  reverseWindowSplits(snapshot.windowSplits);

  if (snapshot.kind === 'partial-composite-split') {
    if (snapshot.destMembershipId && getById('animalGroupMemberships', snapshot.destMembershipId)) {
      remove('animalGroupMemberships', snapshot.destMembershipId, 'animal_group_memberships');
    }
    if (snapshot.newWeightRecordId && getById('animalWeightRecords', snapshot.newWeightRecordId)) {
      remove('animalWeightRecords', snapshot.newWeightRecordId, 'animal_weight_records');
    }
    if (snapshot.newAnimalId && getById('animals', snapshot.newAnimalId)) {
      remove('animals', snapshot.newAnimalId, 'animals');
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
  } else if (snapshot.kind === 'whole-composite-move') {
    if (snapshot.newMembershipId && getById('animalGroupMemberships', snapshot.newMembershipId)) {
      remove('animalGroupMemberships', snapshot.newMembershipId, 'animal_group_memberships');
    }
    if (snapshot.closedMembershipId && snapshot.closedMembershipSnapshot
      && getById('animalGroupMemberships', snapshot.closedMembershipId)) {
      update(
        'animalGroupMemberships', snapshot.closedMembershipId,
        {
          dateLeft: snapshot.closedMembershipSnapshot.dateLeft,
          reason: snapshot.closedMembershipSnapshot.reason,
        },
        MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships',
      );
    }
    if (snapshot.notesApplied && snapshot.sourceAnimalId && getById('animals', snapshot.sourceAnimalId)) {
      update(
        'animals', snapshot.sourceAnimalId,
        { notes: snapshot.notesBefore },
        AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
      );
    }
  } else {
    return false;
  }

  // Drop a destination group we created if it is now empty (no open memberships).
  if (snapshot.createdGroupId && getById('groups', snapshot.createdGroupId)) {
    const stillOpen = getAll('animalGroupMemberships').some(
      m => m.groupId === snapshot.createdGroupId && !m.dateLeft,
    );
    if (!stillOpen) {
      // Also drop any windows we may have opened on that new group (already
      // reversed above when they were in windowSplits.newId).
      for (const w of getAll('eventGroupWindows').filter(x => x.groupId === snapshot.createdGroupId)) {
        remove('eventGroupWindows', w.id, 'event_group_windows');
      }
      remove('groups', snapshot.createdGroupId, 'groups');
    }
  }

  if (lastSplitUndo === snapshot
    || lastSplitUndo?.newAnimalId === snapshot.newAnimalId
    || lastSplitUndo?.newMembershipId === snapshot.newMembershipId) {
    lastSplitUndo = null;
  }

  logger.info('split', 'Composite split undone', {
    kind: snapshot.kind,
    sourceAnimalId: snapshot.sourceAnimalId,
  });
  return true;
}

