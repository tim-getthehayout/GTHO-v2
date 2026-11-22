/**
 * @file OI-0255 past-event detail sheet — open (Ui1) + field presence (Dt1).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetSheetScrollLock } from '../../src/ui/sheet.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PwEntity from '../../src/entities/event-paddock-window.js';
import * as GwEntity from '../../src/entities/event-group-window.js';
import * as ObsEntity from '../../src/entities/paddock-observation.js';
import {
  buildPastEventDetailModel,
  openPastEventDetailSheet,
  isPastEventDetailSheetOpen,
  resetPastEventDetailSheet,
  findPwObservation,
} from '../../src/features/events/rotation-calendar/past-event-detail-sheet.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000c1';
const GROUP = '00000000-0000-0000-0000-0000000000d1';
const EVENT = '00000000-0000-0000-0000-0000000000e1';
const PW = '00000000-0000-0000-0000-0000000000f1';
const GW = '00000000-0000-0000-0000-0000000000g1';
const OPEN_OBS = '00000000-0000-0000-0000-0000000000o1';
const CLOSE_OBS = '00000000-0000-0000-0000-0000000000o2';

beforeAll(() => setLocale('en', enLocale));

function seedBase({ closed = true } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'Paddock E-1', type: 'land', landUse: 'pasture',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('events', EventEntity.create({
    id: EVENT, operationId: OP, farmId: FARM,
    dateOut: closed ? '2026-06-10' : null,
    timeOut: closed ? '16:00' : null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PwEntity.create({
    id: PW, operationId: OP, eventId: EVENT, locationId: LOC,
    dateOpened: '2026-06-01', timeOpened: '08:00',
    dateClosed: closed ? '2026-06-10' : null,
    timeClosed: closed ? '16:00' : null,
  }), PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventGroupWindows', GwEntity.create({
    id: GW, operationId: OP, eventId: EVENT, groupId: GROUP,
    dateJoined: '2026-06-01', dateLeft: closed ? '2026-06-10' : null,
    headCount: 12, avgWeightKg: 400,
  }), GwEntity.validate, GwEntity.toSupabaseShape, 'event_group_windows');
}

function seedOpening() {
  add('paddockObservations', ObsEntity.create({
    id: OPEN_OBS, operationId: OP, locationId: LOC,
    observedAt: '2026-06-01T08:00:00.000Z', type: 'open', source: 'event', sourceId: PW,
    forageHeightCm: 25.4, forageCoverPct: 80, forageQuality: 4,
    forageCondition: 'good', baleRingResidueCount: 2, notes: 'Lush',
  }), ObsEntity.validate, ObsEntity.toSupabaseShape, 'paddock_observations');
}

function seedClosing() {
  add('paddockObservations', ObsEntity.create({
    id: CLOSE_OBS, operationId: OP, locationId: LOC,
    observedAt: '2026-06-10T16:00:00.000Z', type: 'close', source: 'event', sourceId: PW,
    residualHeightCm: 7.6, recoveryMinDays: 21, recoveryMaxDays: 35, notes: 'Clean',
  }), ObsEntity.validate, ObsEntity.toSupabaseShape, 'paddock_observations');
}

afterEach(() => {
  resetPastEventDetailSheet();
  resetSheetScrollLock();
  document.body.innerHTML = '';
});

describe('OI-0255 buildPastEventDetailModel (Dt1 fields)', () => {
  beforeEach(() => {
    seedBase();
    seedOpening();
    seedClosing();
  });

  it('returns location, groups, dates, opening + closing readings', () => {
    const m = buildPastEventDetailModel({ eventId: EVENT, paddockWindowId: PW });
    expect(m).not.toBeNull();
    expect(m.locationName).toBe('Paddock E-1');
    expect(m.groupNames).toBe('Herd A');
    expect(m.dateOpened).toBe('2026-06-01');
    expect(m.timeOpened).toBe('08:00');
    expect(m.dateClosed).toBe('2026-06-10');
    expect(m.opening.forageHeightCm).toBe(25.4);
    expect(m.opening.forageCoverPct).toBe(80);
    expect(m.opening.forageCondition).toBe('good');
    expect(m.closing.residualHeightCm).toBe(7.6);
    expect(m.closing.recoveryMinDays).toBe(21);
    expect(m.closing.recoveryMaxDays).toBe(35);
  });

  it('returns null when paddock window does not belong to event', () => {
    expect(buildPastEventDetailModel({ eventId: EVENT, paddockWindowId: 'missing' })).toBeNull();
  });

  it('null opening/closing when no observations', () => {
    seedBase();
    const m = buildPastEventDetailModel({ eventId: EVENT, paddockWindowId: PW });
    expect(m.opening).toBeNull();
    expect(m.closing).toBeNull();
  });
});

describe('OI-0255 findPwObservation', () => {
  beforeEach(() => {
    seedBase();
    seedOpening();
  });

  it('prefers sourceId match over newer unrelated obs', () => {
    add('paddockObservations', ObsEntity.create({
      id: '00000000-0000-0000-0000-0000000000o9',
      operationId: OP, locationId: LOC,
      observedAt: '2026-06-05T08:00:00.000Z', type: 'open', source: 'event',
      sourceId: 'other-pw', forageHeightCm: 99, createdAt: '2026-06-05T08:00:00.000Z',
    }), ObsEntity.validate, ObsEntity.toSupabaseShape, 'paddock_observations');
    const obs = findPwObservation(LOC, PW, 'open');
    expect(obs.id).toBe(OPEN_OBS);
    expect(obs.forageHeightCm).toBe(25.4);
  });
});

describe('OI-0255 openPastEventDetailSheet (Ui1 + Dt1 DOM)', () => {
  beforeEach(() => {
    seedBase();
    seedOpening();
    seedClosing();
  });

  it('opens a sheet over the page (Ui1) and shows key fields + readings (Dt1)', () => {
    openPastEventDetailSheet({ eventId: EVENT, paddockWindowId: PW });
    expect(isPastEventDetailSheetOpen()).toBe(true);

    const wrap = document.querySelector('[data-testid="past-event-detail-sheet"]');
    expect(wrap).toBeTruthy();
    expect(wrap.classList.contains('open')).toBe(true);

    expect(document.querySelector('[data-testid="past-event-detail-title"]')?.textContent)
      .toBe('Past event');
    expect(document.querySelector('[data-testid="past-event-detail-location-value"]')?.textContent)
      .toBe('Paddock E-1');
    expect(document.querySelector('[data-testid="past-event-detail-groups-value"]')?.textContent)
      .toBe('Herd A');
    expect(document.querySelector('[data-testid="past-event-detail-opened-value"]')?.textContent)
      .toContain('2026-06-01');
    expect(document.querySelector('[data-testid="past-event-detail-closed-value"]')?.textContent)
      .toContain('2026-06-10');

    expect(document.querySelector('[data-testid="past-event-detail-opening-heading"]')?.textContent)
      .toMatch(/Pre-Graze/i);
    expect(document.querySelector('[data-testid="past-event-detail-opening-height-value"]')?.textContent)
      .toMatch(/in|cm/);
    expect(document.querySelector('[data-testid="past-event-detail-opening-cover-value"]')?.textContent)
      .toBe('80%');
    expect(document.querySelector('[data-testid="past-event-detail-opening-condition-value"]')?.textContent)
      .toBe('Good');

    expect(document.querySelector('[data-testid="past-event-detail-closing-heading"]')?.textContent)
      .toMatch(/Post-Graze/i);
    expect(document.querySelector('[data-testid="past-event-detail-closing-residual-value"]')?.textContent)
      .toMatch(/in|cm/);
    expect(document.querySelector('[data-testid="past-event-detail-closing-recovery-min-value"]')?.textContent)
      .toBe('21');
    expect(document.querySelector('[data-testid="past-event-detail-closing-recovery-max-value"]')?.textContent)
      .toBe('35');
  });

  it('closes via Close button and backdrop', () => {
    openPastEventDetailSheet({ eventId: EVENT, paddockWindowId: PW });
    document.querySelector('[data-testid="past-event-detail-close"]').click();
    expect(isPastEventDetailSheetOpen()).toBe(false);

    openPastEventDetailSheet({ eventId: EVENT, paddockWindowId: PW });
    document.querySelector('[data-testid="past-event-detail-backdrop"]').click();
    expect(isPastEventDetailSheetOpen()).toBe(false);
  });

  it('shows empty-state copy when readings are missing', () => {
    seedBase();
    openPastEventDetailSheet({ eventId: EVENT, paddockWindowId: PW });
    expect(document.querySelector('[data-testid="past-event-detail-opening-empty"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="past-event-detail-closing-empty"]')).toBeTruthy();
  });

  it('does not open when ids are invalid', () => {
    openPastEventDetailSheet({ eventId: 'nope', paddockWindowId: PW });
    expect(isPastEventDetailSheetOpen()).toBe(false);
    expect(document.querySelector('[data-testid="past-event-detail-sheet"]')).toBeNull();
  });
});

describe('OI-0255 calendar-grid past-block click wiring', () => {
  it('calendar-grid imports and calls openPastEventDetailSheet (not navigate away)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve('src/features/events/rotation-calendar/calendar-grid.js'),
      'utf8',
    );
    expect(src).toContain("from './past-event-detail-sheet.js'");
    expect(src).toContain('openPastEventDetailSheet({ eventId: event.id, paddockWindowId: pw.id })');
    // Past-block click must not navigate away (Ui3 rejected)
    expect(src).not.toMatch(/eventId:\s*event\.id,\s*onClickBlock:\s*\(\)\s*=>\s*navigate\('#\/events'\)/);
  });
});
