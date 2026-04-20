/**
 * @file OI-0118 — Edit Paddock Window dialog renders pre/post-graze observation cards.
 *
 * Covers the six spec cases:
 *   1. Pre-graze card renders on open window.
 *   2. Pre-graze card renders on closed window.
 *   3. Post-graze card renders only on closed window (absent on open).
 *   4. Save with no prior observation → add('paddockObservations', ...) called
 *      with correct sourceId, type, source.
 *   5. Save with prior observation → update('paddockObservations', obs.id, ...)
 *      called; no duplicate row created.
 *   6. Round-trip: save → reopen dialog → initialValues pre-populates.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as PaddockObsEntity from '../../src/entities/paddock-observation.js';
import { openEditPaddockWindowDialog } from '../../src/features/events/edit-paddock-window.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/survey-bale-ring.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000c1';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const PW_OPEN = '00000000-0000-0000-0000-0000000000e1';
const PW_CLOSED = '00000000-0000-0000-0000-0000000000e2';

beforeAll(() => setLocale('en', enLocale));

function seed() {
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
    id: LOC, operationId: OP, farmId: FARM, name: 'Home paddock',
    type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_OPEN, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-16', timeOpened: '08:30', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_CLOSED, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-10', timeOpened: '09:00',
    dateClosed: '2026-04-15', timeClosed: '17:00', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function openDialogFor(pwId) {
  const pw = getById('eventPaddockWindows', pwId);
  const event = getById('events', EVT);
  openEditPaddockWindowDialog(pw, event, OP);
  return document.getElementById('edit-pw-panel');
}

describe('OI-0118 — edit-paddock-window pre/post-graze cards', () => {
  beforeEach(seed);

  it('renders the pre-graze card on an open paddock window', () => {
    const panel = openDialogFor(PW_OPEN);
    expect(panel.querySelector(`[data-testid="edit-pw-pregraze-${PW_OPEN}"]`)).toBeTruthy();
    expect(panel.querySelector('[data-testid="obs-card-forage-height"]')).toBeTruthy();
    expect(panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_OPEN}"]`)).toBeTruthy();
  });

  it('renders the pre-graze card on a closed paddock window (historical edit)', () => {
    const panel = openDialogFor(PW_CLOSED);
    expect(panel.querySelector(`[data-testid="edit-pw-pregraze-${PW_CLOSED}"]`)).toBeTruthy();
    expect(panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_CLOSED}"]`)).toBeTruthy();
  });

  it('renders the post-graze card only on closed windows (absent on open)', () => {
    const openPanel = openDialogFor(PW_OPEN);
    expect(openPanel.querySelector(`[data-testid="edit-pw-postgraze-${PW_OPEN}"]`)).toBeFalsy();

    const closedPanel = openDialogFor(PW_CLOSED);
    expect(closedPanel.querySelector(`[data-testid="edit-pw-postgraze-${PW_CLOSED}"]`)).toBeTruthy();
    expect(closedPanel.querySelector('[data-testid="obs-card-residual-height"]')).toBeTruthy();
    expect(closedPanel.querySelector(`[data-testid="edit-pw-postgraze-save-${PW_CLOSED}"]`)).toBeTruthy();
  });

  it('Save with no prior observation inserts a new paddock_observations row with sourceId=pw.id, type=open, source=event', () => {
    const panel = openDialogFor(PW_OPEN);
    const heightInput = panel.querySelector('[data-testid="obs-card-forage-height"]');
    heightInput.value = '6'; // 6 in → ~15.24 cm
    panel.querySelector('[data-testid="obs-card-forage-cover"]').value = '70';
    panel.querySelector('[data-testid="obs-card-notes"]').value = 'pre-graze new';

    panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_OPEN}"]`).click();

    const rows = getAll('paddockObservations').filter(o => o.sourceId === PW_OPEN);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.source).toBe('event');
    expect(row.type).toBe('open');
    expect(row.locationId).toBe(LOC);
    expect(row.operationId).toBe(OP);
    expect(row.forageCoverPct).toBe(70);
    expect(row.notes).toBe('pre-graze new');
    expect(Math.abs(row.forageHeightCm - 15.24)).toBeLessThan(0.1);
  });

  it('Save with prior observation updates the existing row rather than inserting a duplicate', () => {
    const existingId = '00000000-0000-0000-0000-00000000f001';
    add('paddockObservations', PaddockObsEntity.create({
      id: existingId,
      operationId: OP,
      locationId: LOC,
      observedAt: '2026-04-16T08:30:00Z',
      type: 'open',
      source: 'event',
      sourceId: PW_OPEN,
      forageCoverPct: 50,
      notes: 'original',
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');

    const panel = openDialogFor(PW_OPEN);
    const coverInput = panel.querySelector('[data-testid="obs-card-forage-cover"]');
    expect(coverInput.value).toBe('50'); // initialValues hydrated
    coverInput.value = '90';
    const notesInput = panel.querySelector('[data-testid="obs-card-notes"]');
    notesInput.value = 'updated';

    panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_OPEN}"]`).click();

    const rows = getAll('paddockObservations').filter(o => o.sourceId === PW_OPEN);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existingId);
    expect(rows[0].forageCoverPct).toBe(90);
    expect(rows[0].notes).toBe('updated');
  });

  it('Round-trip: save pre-graze → reopen dialog → initialValues pre-populates from the saved row', () => {
    const panel = openDialogFor(PW_CLOSED);
    panel.querySelector('[data-testid="obs-card-forage-cover"]').value = '65';
    panel.querySelector('[data-testid="obs-card-notes"]').value = 'round-trip';
    panel.querySelector(`[data-testid="edit-pw-pregraze-save-${PW_CLOSED}"]`).click();

    // Reopen dialog and inspect the re-hydrated inputs.
    const panel2 = openDialogFor(PW_CLOSED);
    expect(panel2.querySelector('[data-testid="obs-card-forage-cover"]').value).toBe('65');
    expect(panel2.querySelector('[data-testid="obs-card-notes"]').value).toBe('round-trip');
  });

  it('Post-graze save on a closed window inserts a row with type=close, source=event, sourceId=pw.id', () => {
    const panel = openDialogFor(PW_CLOSED);
    // Scope queries to the post-graze wrapper — the pre-graze card also
    // exposes a `obs-card-notes` selector, so a panel-wide querySelector
    // would pick the pre-graze notes first.
    const postWrap = panel.querySelector(`[data-testid="edit-pw-postgraze-${PW_CLOSED}"]`);
    postWrap.querySelector('[data-testid="obs-card-residual-height"]').value = '3';
    postWrap.querySelector('[data-testid="obs-card-recovery-min"]').value = '25';
    postWrap.querySelector('[data-testid="obs-card-recovery-max"]').value = '50';
    postWrap.querySelector('[data-testid="obs-card-notes"]').value = 'post-close';

    panel.querySelector(`[data-testid="edit-pw-postgraze-save-${PW_CLOSED}"]`).click();

    const rows = getAll('paddockObservations').filter(o => o.sourceId === PW_CLOSED && o.type === 'close');
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('event');
    expect(rows[0].type).toBe('close');
    expect(rows[0].recoveryMinDays).toBe(25);
    expect(rows[0].recoveryMaxDays).toBe(50);
    expect(rows[0].notes).toBe('post-close');
  });
});
