/**
 * @file OI-0075 bugs 3 / 5 / 7 — Locations tab final pass.
 *
 * Drives buildLocationCard + computePasturePercent end-to-end with seeded
 * data and asserts the display behavior the spec asks for:
 *
 *   Bug 3  capacity line or informative hint renders
 *   Bug 5  stored-feed DM matches v1 calcConsumedDMI semantics
 *   Bug 7  top stat card Pasture % computes via DMI-4 mass balance
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as ForageTypeEntity from '../../src/entities/forage-type.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import * as PaddockObsEntity from '../../src/entities/paddock-observation.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
// Side-effect registration of calcs (dashboard reads them via getCalcByName).
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/capacity.js';
import { buildLocationCard, computePasturePercent } from '../../src/features/dashboard/index.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const FORAGE_TYPE = '00000000-0000-0000-0000-0000000000cc';
const CLASS = '00000000-0000-0000-0000-0000000000cd';
const LOC = '00000000-0000-0000-0000-0000000000d1';
const LOC_NO_FORAGE = '00000000-0000-0000-0000-0000000000d2';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const EVT_MISSING = '00000000-0000-0000-0000-0000000000e2';
const PW = '00000000-0000-0000-0000-0000000000f1';
const PW_MISSING = '00000000-0000-0000-0000-0000000000f2';
const GROUP = '00000000-0000-0000-0000-000000000101';
const GW = '00000000-0000-0000-0000-000000000102';
const GROUP_2 = '00000000-0000-0000-0000-000000000103';
const GW_2 = '00000000-0000-0000-0000-000000000104';
const FEED_TYPE = '00000000-0000-0000-0000-000000000111';
const BATCH = '00000000-0000-0000-0000-000000000112';

beforeAll(() => setLocale('en', enLocale));

function seedCommon() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('forageTypes', ForageTypeEntity.create({
    id: FORAGE_TYPE, operationId: OP, name: 'Mixed Pasture',
    dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 65, dmPct: 22,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow',
    dmiPct: 2.5, dmiPctLactating: 3.0, defaultWeightKg: 500,
    excretionNRate: 0.34, excretionPRate: 0.092, excretionKRate: 0.24,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  // 10 animals in the group for live head count.
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-00000000a${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      animalClassId: CLASS, dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
}

describe('OI-0075 Bug 3 — capacity line', () => {
  beforeEach(seedCommon);

  it('renders the green capacity line when forage obs + area + animals are all present', () => {
    add('locations', LocationEntity.create({
      id: LOC, operationId: OP, farmId: FARM, name: 'North 40',
      type: 'land', landUse: 'pasture', areaHectares: 4, forageTypeId: FORAGE_TYPE,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('events', EventEntity.create({
      id: EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW, operationId: OP, eventId: EVT, locationId: LOC,
      dateOpened: '2026-04-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      animalClassId: CLASS, dateJoined: '2026-04-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    // Observation lands in paddock_observations (source='event', type='open').
    add('paddockObservations', PaddockObsEntity.create({
      operationId: OP, locationId: LOC, type: 'open', source: 'event',
      sourceId: PW, observedAt: '2026-04-01T12:00:00Z',
      forageHeightCm: 20, forageCoverPct: 80,
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');

    const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP, FARM, 'imperial');
    const capText = card.textContent;
    expect(capText).toMatch(/Est\. capacity/);
    expect(capText).toMatch(/AUDs/);
    expect(capText).toMatch(/days remaining/);
    // The informative hint MUST NOT render when the full line works.
    expect(card.querySelector(`[data-testid="dashboard-capacity-hint-${EVT}"]`)).toBeFalsy();
  });

  it('renders an informative hint when forage observation is missing', () => {
    add('locations', LocationEntity.create({
      id: LOC, operationId: OP, farmId: FARM, name: 'North 40',
      type: 'land', landUse: 'pasture', areaHectares: 4, forageTypeId: FORAGE_TYPE,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('events', EventEntity.create({
      id: EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW, operationId: OP, eventId: EVT, locationId: LOC,
      dateOpened: '2026-04-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      animalClassId: CLASS, dateJoined: '2026-04-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    // No paddock observation seeded — capacity can't compute.

    const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP, FARM, 'imperial');
    const hint = card.querySelector(`[data-testid="dashboard-capacity-hint-${EVT}"]`);
    expect(hint, 'hint should render when forage observation is missing').toBeTruthy();
    expect(hint.textContent).toMatch(/forage height/);
  });

  it('renders hint naming forage type when paddock has no forage type set', () => {
    add('locations', LocationEntity.create({
      id: LOC_NO_FORAGE, operationId: OP, farmId: FARM, name: 'Orphan',
      type: 'land', landUse: 'pasture', areaHectares: 4, // no forageTypeId
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('events', EventEntity.create({
      id: EVT_MISSING, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_MISSING, operationId: OP, eventId: EVT_MISSING, locationId: LOC_NO_FORAGE,
      dateOpened: '2026-04-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_2, operationId: OP, eventId: EVT_MISSING, groupId: GROUP,
      animalClassId: CLASS, dateJoined: '2026-04-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    const event = { id: EVT_MISSING, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP, FARM, 'imperial');
    const hint = card.querySelector(`[data-testid="dashboard-capacity-hint-${EVT_MISSING}"]`);
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/forage type/);
  });
});

describe('OI-0075 Bug 5 — stored feed DMI matches v1 calcConsumedDMI', () => {
  beforeEach(seedCommon);

  it('stored feed DM uses qtyUnits × weightPerUnitKg × batch.dmPct (not bare quantity × 100%)', () => {
    // 2 bales × 500 kg/bale × 85% DM = 850 kg DM delivered.
    // Pre-fix this rendered as 2 kg "DM" (factor 425× off). Post-fix: ~850 kg.
    add('locations', LocationEntity.create({
      id: LOC, operationId: OP, farmId: FARM, name: 'North 40',
      type: 'land', landUse: 'pasture', areaHectares: 4, forageTypeId: FORAGE_TYPE,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('events', EventEntity.create({
      id: EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW, operationId: OP, eventId: EVT, locationId: LOC,
      dateOpened: '2026-04-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      animalClassId: CLASS, dateJoined: '2026-04-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    add('feedTypes', FeedTypeEntity.create({
      id: FEED_TYPE, operationId: OP, name: 'Hay', category: 'hay', unit: 'bale',
    }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    add('batches', BatchEntity.create({
      id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'H-2026-01',
      source: 'purchase', quantity: 10, remaining: 8, unit: 'bale',
      weightPerUnitKg: 500, dmPct: 85, costPerUnit: 80,
    }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
      date: '2026-04-02', quantity: 2,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP, FARM, 'imperial');
    const text = card.textContent;
    // 850 kg DM × 2.20462 = ~1874 lbs DM. Allow ±3 lbs for rounding.
    const match = text.match(/Stored feed:\s*([\d,]+)\s*lbs DM/);
    expect(match, 'Stored feed line should render').toBeTruthy();
    const lbs = parseInt(match[1].replace(/,/g, ''), 10);
    expect(lbs).toBeGreaterThan(1870);
    expect(lbs).toBeLessThan(1880);
  });
});

describe('OI-0075 Bug 7 — computePasturePercent (top stat card)', () => {
  beforeEach(seedCommon);

  it('returns null when no events supplied', () => {
    const r = computePasturePercent([]);
    expect(r.pasturePercent).toBeNull();
    expect(r.subLabel).toMatch(/no grazing events/);
  });

  it('returns null when events have no animals (totalDmi 0)', () => {
    const evtNoGws = { id: EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null };
    add('events', EventEntity.create(evtNoGws),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const r = computePasturePercent([evtNoGws]);
    expect(r.pasturePercent).toBeNull();
    expect(r.subLabel).toMatch(/no animals/);
  });

  it('computes pasture % via DMI-4 mass balance across events', () => {
    // Seed an open event with 10 head × 500 kg × 2.5% DMI over 1 day = 125 kg/day total DMI.
    // No stored feed. Pasture should be 100%.
    const evt = { id: EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: null };
    add('events', EventEntity.create(evt),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      animalClassId: CLASS, dateJoined: '2026-04-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    const r = computePasturePercent([evt]);
    expect(r.pasturePercent).not.toBeNull();
    expect(r.pasturePercent).toBe(100);
    // Color grade: 100% → green.
    expect(r.color).toBe('var(--color-green-base)');
  });

  it('shifts to amber band when 50–74% pasture', () => {
    // Total DMI (10 head × 500 × 2.5% × 1 day) = 125 kg. Stored consumed = 50 kg.
    // Pasture % = (125-50)/125 = 60% → amber. Bound the day count to 1 by
    // closing the event on the same day it opened.
    const evt = { id: EVT, operationId: OP, farmId: FARM, type: 'graze',
      dateIn: '2026-04-01', dateOut: '2026-04-01' };
    add('events', EventEntity.create(evt),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      animalClassId: CLASS, dateJoined: '2026-04-01', dateLeft: '2026-04-01',
      headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    add('feedTypes', FeedTypeEntity.create({
      id: FEED_TYPE, operationId: OP, name: 'Hay', category: 'hay', unit: 'kg',
    }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    // 100 units at 1 kg/unit × 50% DM = 50 kg DM stored.
    add('batches', BatchEntity.create({
      id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'H',
      source: 'purchase', quantity: 100, remaining: 100, unit: 'kg',
      weightPerUnitKg: 1, dmPct: 50,
    }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
      date: '2026-04-01', quantity: 100,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    const r = computePasturePercent([evt]);
    // 60% pasture.
    expect(r.pasturePercent).toBe(60);
    expect(r.color).toBe('var(--color-amber-base)');
  });
});
