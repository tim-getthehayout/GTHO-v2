/** @file OI-0119 — shared DMI-8 chart context builder tests.
 *
 * Verifies:
 *   - observations sourced from paddock_observations, NOT event_observations.
 *   - locations[locId].areaHa falls back to areaHectares.
 *   - event.dateIn is decorated with getEventStartDate (OI-0117).
 *   - date-routing source-event bridge in computeDmi8Days.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as PaddockObsEntity from '../../src/entities/paddock-observation.js';
import * as ForageTypeEntity from '../../src/entities/forage-type.js';
import { buildDmi8ChartContext, computeDmi8Days } from '../../src/features/events/dmi-chart-context.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import '../../src/calcs/feed-forage.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000c1';
const FT = '00000000-0000-0000-0000-0000000000c2';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const SRC_EVT = '00000000-0000-0000-0000-0000000000d2';
const PW = '00000000-0000-0000-0000-0000000000e1';
const PW_SRC = '00000000-0000-0000-0000-0000000000e2';

beforeAll(() => setLocale('en', enLocale));

function seed() {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('forageTypes', ForageTypeEntity.create({
    id: FT, operationId: OP, name: 'Mixed Grass',
    dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'G1',
    type: 'land', landUse: 'pasture', areaHectares: 2, forageTypeId: FT,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  // Source event + its paddock window
  add('events', EventEntity.create({
    id: SRC_EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: '2026-04-09',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_SRC, operationId: OP, eventId: SRC_EVT, locationId: LOC,
    dateOpened: '2026-04-01', dateClosed: '2026-04-09', timeOpened: '08:00', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  // Current event with sourceEventId pointing at the source
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null, sourceEventId: SRC_EVT,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-10', timeOpened: '08:30', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  // Pre-graze observation in paddock_observations (the real table).
  add('paddockObservations', PaddockObsEntity.create({
    operationId: OP, locationId: LOC,
    observedAt: '2026-04-10T08:30:00Z',
    type: 'open', source: 'event', sourceId: PW,
    forageHeightCm: 25, forageCoverPct: 80,
  }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
}

describe('OI-0119 — buildDmi8ChartContext', () => {
  beforeEach(seed);

  it('reads observations from paddock_observations (not event_observations)', () => {
    const ctx = buildDmi8ChartContext(EVT);
    expect(ctx).toBeTruthy();
    expect(ctx.observations.length).toBeGreaterThan(0);
    // All observations are paddock-obs-shaped (have type + source, NOT eventId).
    for (const o of ctx.observations) {
      expect(o.type).toBe('open');
      expect(o.source).toBe('event');
      expect('eventId' in o).toBe(false);
    }
  });

  it('applies areaHectares ?? areaHa fallback in locations map', () => {
    const ctx = buildDmi8ChartContext(EVT);
    expect(ctx.locations[LOC].areaHa).toBe(2);
  });

  it('decorates event.dateIn with derived getEventStartDate', () => {
    const ctx = buildDmi8ChartContext(EVT);
    // Event start = earliest child window's dateOpened.
    expect(ctx.event.dateIn).toBe('2026-04-10');
    expect(ctx.eventStart).toBe('2026-04-10');
  });

  it('returns null when eventId does not resolve to an event', () => {
    const ctx = buildDmi8ChartContext('does-not-exist');
    expect(ctx).toBeNull();
  });
});

describe('OI-0119 — computeDmi8Days date-routing source-event bridge', () => {
  beforeEach(() => {
    seed();
    // Also seed a source-event observation so its cascade can succeed.
    add('paddockObservations', PaddockObsEntity.create({
      operationId: OP, locationId: LOC,
      observedAt: '2026-04-01T08:00:00Z',
      type: 'open', source: 'event', sourceId: PW_SRC,
      forageHeightCm: 25, forageCoverPct: 80,
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
  });

  it('routes pre-start dates to the source event context', () => {
    const dmi8 = getCalcByName('DMI-8');
    const event = buildDmi8ChartContext(EVT).event;
    // Today = 2026-04-11 → window is [2026-04-09, 2026-04-10, 2026-04-11].
    // 2026-04-09 < event.dateIn (2026-04-10) → should resolve against SRC_EVT.
    const days = computeDmi8Days(event, dmi8, { today: '2026-04-11' });
    expect(days).toHaveLength(3);
    // The first day pre-dates the current event; expect a real result (not empty bar).
    // We don't need to assert exact kg — just that DMI-8 returned a status that
    // isn't undefined, which would indicate the bridge silently dropped the day.
    expect(days[0].date).toBe('2026-04-09');
    expect(days[0].result?.status).toBeDefined();
  });

  it('OI-0122 — pre-start days are blank when sourceEventId is NULL', () => {
    // Regression guard for the OI-0122 bug: before the fix at move-wizard.js:680,
    // same-farm rotations were created with sourceEventId = null, defeating the
    // date-routing bridge. With sourceEventId stripped, pre-start days should
    // have no result (or an empty/zero-cascade result), proving the bridge was
    // doing the work the code fix + backfill enables.
    _reset();
    localStorage.clear();
    seed();
    add('paddockObservations', PaddockObsEntity.create({
      operationId: OP, locationId: LOC,
      observedAt: '2026-04-01T08:00:00Z',
      type: 'open', source: 'event', sourceId: PW_SRC,
      forageHeightCm: 25, forageCoverPct: 80,
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
    // Mutate the current event so its sourceEventId is null — simulating the
    // pre-OI-0122 same-farm rotation state.
    const evtRecord = buildDmi8ChartContext(EVT).event;
    const evtNoSource = { ...evtRecord, sourceEventId: null };
    const dmi8 = getCalcByName('DMI-8');
    const days = computeDmi8Days(evtNoSource, dmi8, { today: '2026-04-11' });
    expect(days).toHaveLength(3);
    // Day 2026-04-10 (event's own start) still resolves via EVT's own context.
    expect(days[1].result?.status).toBeDefined();
    // Day 2026-04-09 pre-dates EVT and has no source to route to → the bridge
    // runs EVT's own cascade, but EVT has no paddock window open that day, so
    // pastureDmi is zero (the "blank bar" symptom).
    expect(days[0].date).toBe('2026-04-09');
    expect(days[0].result?.pastureDmiKg ?? 0).toBe(0);
  });
});
