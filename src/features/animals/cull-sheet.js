/** @file Cull animal sheet — V1 parity (OI-0086 / GH-13).
 *
 * Replaces the broken window.prompt() stub. Captures date + reason + notes,
 * persists to Supabase via entity fields (active=false, cullDate, cullReason,
 * cullNotes), and closes any open animal_group_memberships on the cull date.
 *
 * Pure helpers (confirmCull, reactivateAnimal) are exported for unit testing.
 */

import { el, clear } from '../../ui/dom.js';
import { Sheet } from '../../ui/sheet.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, update, splitGroupWindow } from '../../data/store.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';
import { maybeShowEmptyGroupPrompt } from './empty-group-prompt.js';
import { today } from '../../utils/date-utils.js';
import { display } from '../../utils/units.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { logger } from '../../utils/logger.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';

let cullSheet = null;

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

function ensureSheetDOM() {
  if (document.getElementById('cull-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'cull-sheet-wrap', style: { zIndex: '230' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => cullSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'cull-sheet-panel' }),
  ]));
}

function showCullToast(message) {
  const existing = document.querySelector('[data-testid="cull-toast"]');
  if (existing) existing.remove();
  const toast = el('div', {
    'data-testid': 'cull-toast',
    style: { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', zIndex: '400', maxWidth: '90%' },
  }, [message]);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
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
  if (latestWeightKg != null) {
    parts.push(display(latestWeightKg, 'weight', unitSys || 'imperial', 0));
  }
  return parts.filter(Boolean).join(' \u00B7 ');
}

/**
 * Commit a cull. Updates the animal record and closes every open
 * animal_group_memberships row on the cull date.
 *
 * Pure (does the store mutations, but no DOM): exported for unit testing.
 *
 * @param {object} args
 * @param {object} args.animal      - animal record
 * @param {string} args.cullDate    - ISO date
 * @param {string} args.cullReason  - one of CULL_REASONS
 * @param {string|null} args.cullNotes
 * @returns {{ closedMembershipIds: Array<string> }}
 */
export function confirmCull({ animal, cullDate, cullReason, cullNotes }) {
  update(
    'animals', animal.id,
    { active: false, cullDate, cullReason, cullNotes: cullNotes || null },
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals'
  );

  const closedMembershipIds = [];
  const affectedGroupIds = new Set();
  const openMems = getAll('animalGroupMemberships').filter(m => m.animalId === animal.id && !m.dateLeft);
  for (const m of openMems) {
    update(
      'animalGroupMemberships', m.id,
      { dateLeft: cullDate, reason: 'cull' },
      MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships'
    );
    closedMembershipIds.push(m.id);
    if (m.groupId) affectedGroupIds.add(m.groupId);
  }

  // OI-0091: split the group's open event_group_window on cull. Memberships are
  // already closed above, so helpers compute the post-cull live values at cullDate.
  const splitResults = [];
  for (const groupId of affectedGroupIds) {
    const openGWs = getAll('eventGroupWindows').filter(w => w.groupId === groupId && !w.dateLeft);
    const memberships = getAll('animalGroupMemberships');
    const animals = getAll('animals');
    const animalClasses = getAll('animalClasses');
    const animalWeightRecords = getAll('animalWeightRecords');
    for (const gw of openGWs) {
      const liveHead = getLiveWindowHeadCount({ ...gw, dateLeft: null }, { memberships, now: cullDate });
      const liveAvg = getLiveWindowAvgWeight({ ...gw, dateLeft: null }, { memberships, animals, animalClasses, animalWeightRecords, now: cullDate });
      splitResults.push(splitGroupWindow(groupId, gw.eventId, cullDate, null, {
        headCount: liveHead,
        avgWeightKg: liveAvg,
      }));
    }
  }

  logger.info('cull', 'Animal culled', {
    animalId: animal.id, cullDate, cullReason,
    closedMemberships: closedMembershipIds.length,
    splitWindows: splitResults.length,
  });

  // OI-0090 / SP-11: after the window commits, surface the empty-group prompt
  // for any group that just lost its last live member. Helper is a no-op if
  // the group still has open memberships.
  for (const groupId of affectedGroupIds) {
    maybeShowEmptyGroupPrompt(groupId);
  }

  return { closedMembershipIds, splitResults };
}

/**
 * Reactivate a culled animal — clears all four cull fields. The user must
 * reassign to a group manually after reactivation (matches v1).
 *
 * Pure (mutations only, no DOM): exported for unit testing.
 */
export function reactivateAnimal({ animal }) {
  update(
    'animals', animal.id,
    { active: true, cullDate: null, cullReason: null, cullNotes: null },
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals'
  );
  logger.info('cull', 'Animal reactivated', { animalId: animal.id });
}

/**
 * Open the Cull Sheet for an animal.
 *
 * @param {object} animal - the animal record being culled
 * @param {string} operationId
 * @param {() => void} [onCommitted] - optional callback after successful cull (e.g. to close parent sheet)
 */
export function openCullSheet(animal, operationId, onCommitted) {
  ensureSheetDOM();
  if (!cullSheet) cullSheet = new Sheet('cull-sheet-wrap');
  const panel = document.getElementById('cull-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, [t('animal.cullTitle')]));

  const unitSys = getUnitSystem();
  const weights = getAll('animalWeightRecords').filter(w => w.animalId === animal.id);
  weights.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestWeightKg = weights[0]?.weightKg ?? null;
  const label = buildAnimalLabel({ animal, latestWeightKg, unitSys });

  panel.appendChild(el('div', {
    'data-testid': 'cull-animal-label',
    style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' },
  }, [label]));

  // Date + Reason row
  const dateInput = el('input', { type: 'date', value: today() });
  const reasonSelect = el('select', {},
    CULL_REASONS.map(r => el('option', { value: r }, [r]))
  );
  reasonSelect.value = 'Sold';

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, [t('animal.cullDate')]), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, [t('animal.cullReason')]), reasonSelect]),
  ]));

  // Notes
  const notesInput = el('input', {
    type: 'text',
    placeholder: t('animal.cullNotesPlaceholder'),
  });
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, [
      t('animal.cullNotes'),
      ' ',
      el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [t('animal.optional')]),
    ]),
    notesInput,
  ]));

  // Info banner
  panel.appendChild(el('div', {
    style: { background: 'var(--amber-l)', borderLeft: '3px solid var(--amber)', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', color: 'var(--amber-d)' },
  }, [t('animal.cullInfoBanner')]));

  const statusEl = el('div', { className: 'auth-error' });
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
          confirmCull({ animal, cullDate, cullReason, cullNotes });
          cullSheet.close();
          const idLabel = animal.name || animal.eid || animal.id?.slice(0, 8);
          const tagPart = animal.tagNum ? ` (${animal.tagNum})` : '';
          showCullToast(`${idLabel}${tagPart} marked as culled (${cullReason}). Removed from group — DMI targets updated.`);
          if (onCommitted) onCommitted();
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
 * Render the red culled-state banner with reason + date + notes + Reactivate.
 * Returns the element so the caller can append it.
 *
 * @param {object} animal
 * @param {() => void} onReactivated - called after successful reactivation (e.g. to close parent sheet)
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
        if (!confirm(t('animal.reactivateConfirm').replace('{label}', `${idLabel}${tagPart}`))) return;
        reactivateAnimal({ animal });
        if (onReactivated) onReactivated();
      },
    }, [t('animal.reactivate')]),
  ]);
}
