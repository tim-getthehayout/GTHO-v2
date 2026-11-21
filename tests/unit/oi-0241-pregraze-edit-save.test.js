/**
 * @file Destination pre-graze copy + Event Detail pasture edit save.
 *
 * A: Event Detail has no inline Pre-Graze / Post-Graze cards (list + Edit only).
 * B1: Green Save on Edit paddock window persists paddock_observations.
 * B2: Small-card Save advances updatedAt, enqueues + marks unacked; failure toasts
 *     and never flashes Saved.
 * C: Move wizard destination pre-graze shows unambiguous new-event copy.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getById, setSyncAdapter } from '../../src/data/store.js';
import { listUnacked } from '../../src/data/unacked.js';
import { markEntries } from '../../src/data/unacked.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as PaddockObsEntity from '../../src/entities/paddock-observation.js';
import { openEditPaddockWindowDialog } from '../../src/features/events/edit-paddock-window.js';
import { openEventDetailSheet, closeEventDetailSheet } from '../../src/features/events/detail.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/survey-bale-ring.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000c1';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const PW_OPEN = '00000000-0000-0000-0000-0000000000e1';
const OBS_ID = '00000000-0000-0000-0000-00000000f001';

beforeAll(() => setLocale('en', enLocale));

function seedBase() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'F-1',
    type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_OPEN, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-16', timeOpened: '08:30', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function seedExistingObs() {
  add('paddockObservations', PaddockObsEntity.create({
    id: OBS_ID,
    operationId: OP,
    locationId: LOC,
    observedAt: '2026-04-16T08:30:00.000Z',
    type: 'open',
    source: 'event',
    sourceId: PW_OPEN,
    forageHeightCm: 5.08,
    forageCoverPct: 100,
    forageQuality: 50,
    forageCondition: 'fair',
    createdAt: '2026-04-16T08:30:00.000Z',
    updatedAt: '2026-04-16T08:30:00.000Z',
  }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
}

function openDialog() {
  const pw = getById('eventPaddockWindows', PW_OPEN);
  const event = getById('events', EVT);
  openEditPaddockWindowDialog(pw, event, OP);
  return document.getElementById('edit-pw-panel');
}

function queueingAdapter(writes) {
  return {
    enqueueWrite(table, record, operation) {
      writes.push({ table, record, operation });
      markEntries([{ table, record, operation, enqueued_at: new Date().toISOString() }]);
      return {
        entries: [{ table, record, operation }],
        result: Promise.resolve({ id: record.id, success: true }),
        cancel() {},
      };
    },
    scheduleFlush() {},
    push() {},
    pushBatch() {},
    pull() {},
    pullAll() {},
    delete() {},
    isOnline: () => true,
    getStatus: () => 'idle',
    onStatusChange: () => {},
  };
}

describe('A — Event Detail drops inline Pre-Graze / Post-Graze', () => {
  beforeEach(seedBase);

  it('paddock list remains; detail-pregraze / detail-postgraze cards are absent', () => {
    seedExistingObs();
    openEventDetailSheet({ id: EVT }, OP, FARM);
    expect(document.querySelector(`[data-testid="detail-paddock-${PW_OPEN}"]`)).toBeTruthy();
    expect(document.querySelector(`[data-testid="detail-pregraze-card-${PW_OPEN}"]`)).toBeNull();
    expect(document.querySelector(`[data-testid="detail-pregraze-save-${PW_OPEN}"]`)).toBeNull();
    expect(document.querySelector('[data-testid="detail-pre-graze"]')?.children.length || 0).toBe(0);
    expect(document.querySelector('[data-testid="detail-post-graze"]')?.children.length || 0).toBe(0);
    closeEventDetailSheet();
  });
});

describe('B1 — green Save persists pre-graze observations', () => {
  beforeEach(() => {
    seedBase();
    seedExistingObs();
  });

  it('Edit → change cover → green Save updates paddock_observations and advances updatedAt', () => {
    const before = getById('paddockObservations', OBS_ID);
    const panel = openDialog();
    panel.querySelector('[data-testid="obs-card-forage-cover"]').value = '70';
    panel.querySelector('[data-testid="obs-card-notes"]').value = 'green-save';
    panel.querySelector(`[data-testid="edit-pw-save-${PW_OPEN}"]`).click();

    const after = getById('paddockObservations', OBS_ID);
    expect(after.forageCoverPct).toBe(70);
    expect(after.notes).toBe('green-save');
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    // Sheet closed after successful green Save
    expect(document.getElementById('edit-pw-wrap')?.classList.contains('open')).toBe(false);
  });
});

describe('B2 — small-card Save enqueue + failure toast', () => {
  it('small-card Save advances updatedAt and leaves queue/unacked for paddock_observations', () => {
    seedBase();
    seedExistingObs();
    const writes = [];
    setSyncAdapter(queueingAdapter(writes));
    const before = getById('paddockObservations', OBS_ID);

    const panel = openDialog();
    panel.querySelector('[data-testid="obs-card-forage-cover"]').value = '90';
    panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_OPEN}"]`).click();

    const after = getById('paddockObservations', OBS_ID);
    expect(after.forageCoverPct).toBe(90);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    expect(writes.some(w => w.table === 'paddock_observations' && w.operation === 'update' && w.record.id === OBS_ID)).toBe(true);
    expect(listUnacked().some(m => m.table === 'paddock_observations' && m.id === OBS_ID)).toBe(true);
    const savedFlash = panel.querySelector(`[data-testid="edit-pw-pregraze-saved-${PW_OPEN}"]`);
    expect(savedFlash.style.opacity).toBe('1');
  });

  it('small-card Save failure toasts and does not flash Saved', () => {
    seedBase();
    seedExistingObs();
    setSyncAdapter({
      enqueueWrite() {
        // Pretend enqueue "succeeded" to the store but never marked unacked —
        // persistObservationCard must treat that as failure.
        return {
          entries: [],
          result: Promise.resolve({ success: false }),
          cancel() {},
        };
      },
      scheduleFlush() {},
    });

    const panel = openDialog();
    panel.querySelector('[data-testid="obs-card-forage-cover"]').value = '88';
    panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_OPEN}"]`).click();

    const toast = document.querySelector('[data-testid="edit-pw-pregraze-save-error"]');
    expect(toast).toBeTruthy();
    const savedFlash = panel.querySelector(`[data-testid="edit-pw-pregraze-saved-${PW_OPEN}"]`);
    expect(savedFlash.style.opacity === '' || savedFlash.style.opacity === '0').toBe(true);
  });

  it('blur of date does not close the sheet (no race with small-card Save)', () => {
    seedBase();
    seedExistingObs();
    const panel = openDialog();
    const dateInput = panel.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
    dateInput.dispatchEvent(new Event('blur'));
    // Panel still present with pre-graze card after blur save
    expect(document.getElementById('edit-pw-panel')).toBeTruthy();
    expect(panel.querySelector(`[data-testid="edit-pw-pregraze-${PW_OPEN}"]`)).toBeTruthy();
  });
});

describe('C — move wizard destination pasture copy', () => {
  it('exposes dest pre-graze hint + titled card under Open New Event', async () => {
    // Light check of i18n + renderPreGrazeCard titleKey wiring without full wizard seed.
    const { renderPreGrazeCard } = await import('../../src/features/observations/pre-graze-card.js');
    const { t } = await import('../../src/i18n/i18n.js');
    expect(t('event.destPreGrazeHint')).toMatch(/new event/i);
    expect(t('event.destPreGrazeHint')).toMatch(/not the event you/i);
    const card = renderPreGrazeCard({ titleKey: 'event.destPreGrazeTitle' });
    expect(card.container.textContent).toContain(t('event.destPreGrazeTitle'));
  });
});
