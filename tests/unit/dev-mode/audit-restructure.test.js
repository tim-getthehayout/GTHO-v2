/** @file OI-0145 — audit page restructure: per-paddock-window blocks,
 * orphan feed-entry detection, group-window-to-paddock-window overlap logic,
 * DMI-8 resolver across statuses.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as ForageTypeEntity from '../../../src/entities/forage-type.js';
import * as ObservationEntity from '../../../src/entities/paddock-observation.js';
import * as FeedTypeEntity from '../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../src/entities/event-feed-entry.js';

import '../../../src/calcs/feed-forage.js';
import { renderEventAudit } from '../../../src/features/dev-mode/audit.js';
import {
  resolveCalcForCalcCard,
  getResolverScope,
} from '../../../src/features/dev-mode/audit-resolvers.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000c1';
const LOC_A = '00000000-0000-0000-0000-0000000000d1';
const LOC_B = '00000000-0000-0000-0000-0000000000d2';
const LOC_C = '00000000-0000-0000-0000-0000000000d3';
const LOC_ORPHAN = '00000000-0000-0000-0000-0000000000d9';
const GROUP_A = '00000000-0000-0000-0000-0000000000g1';
const GROUP_B = '00000000-0000-0000-0000-0000000000g2';
const CLS = '00000000-0000-0000-0000-0000000000f1';
const FT = '00000000-0000-0000-0000-00000000ff01';
const FEED_TYPE = '00000000-0000-0000-0000-00000000feed';
const BATCH = '00000000-0000-0000-0000-00000000ba01';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  // Force the unit toggle to the persistence default for deterministic render.
  localStorage.removeItem('dev-audit-unit-mode');
  // Common fixture: one operation, one farm, one event.
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-29' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
});

function seedClassAndAnimals(numAnimals = 3) {
  add('animalClasses', AnimalClassEntity.create({
    id: CLS, operationId: OP, name: 'Cow', species: 'beef_cattle', role: 'cow',
    defaultWeightKg: 540, dmiPct: 2.5, dmiPctLactating: 3.0,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  for (let i = 0; i < numAnimals; i++) {
    add('animals', AnimalEntity.create({
      id: `00000000-0000-0000-0000-00000000a00${i}`,
      operationId: OP, animalClassId: CLS, active: true, sex: 'F', tagNum: `tag-${i}`,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  }
}

function seedForageTypeAndLocations() {
  add('forageTypes', ForageTypeEntity.create({
    id: FT, operationId: OP, name: 'Cool-season grass',
    dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 50,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  for (const [id, name] of [[LOC_A, 'G-1'], [LOC_B, 'G-2'], [LOC_C, 'G-3']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name,
      areaHectares: 2, forageTypeId: FT,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
}

function seedBatch() {
  add('feedTypes', FeedTypeEntity.create({ id: FEED_TYPE, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch',
    unit: 'bale', quantity: 20, remaining: 20, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}

describe('Resolver scope dispatch (OI-0145)', () => {
  it('reports correct scope per resolver', () => {
    expect(getResolverScope('FOR-1')).toBe('paddock-window');
    expect(getResolverScope('DMI-2')).toBe('group-window');
    expect(getResolverScope('DMI-3')).toBe('event');
    expect(getResolverScope('DMI-8')).toBe('event');
    expect(getResolverScope('DOES-NOT-EXIST')).toBeNull();
  });

  it('resolveCalcForCalcCard returns scope on result', () => {
    const r = resolveCalcForCalcCard('FOR-1', { eventId: EVT });
    expect(r?.scope).toBe('paddock-window');
  });
});

describe('Group-window-to-paddock-window overlap (OI-0145 boundary cases)', () => {
  it('overlap: gw leaves on the same day pw closes (inclusive — should match)', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'Cow-Calf' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-1', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-29', dateClosed: '2026-04-30',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-1', operationId: OP, eventId: EVT, groupId: GROUP_A, animalClassId: CLS,
      dateJoined: '2026-04-30', dateLeft: '2026-04-30', headCount: 5, avgWeightKg: 540,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    renderEventAudit(seedDom());
    expect(document.querySelector('[data-testid="dev-audit-paddock-window-pw-1"]')).toBeTruthy();
    // gw-1 left the same day pw-1 closed → still overlaps via inclusive comparison.
    expect(document.querySelector('[data-testid="dev-audit-group-window-gw-1"]')).toBeTruthy();
  });

  it('no overlap: gw left strictly before pw opened', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'Cow-Calf' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-2', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-05-05',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-2', operationId: OP, eventId: EVT, groupId: GROUP_A, animalClassId: CLS,
      dateJoined: '2026-04-29', dateLeft: '2026-05-01', headCount: 5, avgWeightKg: 540,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    renderEventAudit(seedDom());
    expect(document.querySelector('[data-testid="dev-audit-paddock-window-pw-2"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="dev-audit-group-window-gw-2"]')).toBeFalsy();
  });

  it('overlap: gw joins same day a sub-move opens (inclusive)', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'Cow-Calf' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-3', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-05-01',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-3', operationId: OP, eventId: EVT, groupId: GROUP_A, animalClassId: CLS,
      dateJoined: '2026-05-01', headCount: 5, avgWeightKg: 540,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    renderEventAudit(seedDom());
    expect(document.querySelector('[data-testid="dev-audit-group-window-gw-3"]')).toBeTruthy();
  });
});

describe('Per-paddock-window block rendering (3-window strip-graze)', () => {
  it('renders 3 paddock blocks with location, forage type, observation, and feed sub-tables', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    seedBatch();
    add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'Cow-Calf' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    for (const [pwId, locId] of [['pw-g1', LOC_A], ['pw-g2', LOC_B], ['pw-g3', LOC_C]]) {
      add('eventPaddockWindows', PaddockWindowEntity.create({
        id: pwId, operationId: OP, eventId: EVT, locationId: locId,
        dateOpened: '2026-04-29', areaPct: 33,
      }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      add('paddockObservations', ObservationEntity.create({
        operationId: OP, locationId: locId, type: 'open', source: 'event', sourceId: pwId,
        date: '2026-04-29', observedAt: '2026-04-29T12:00:00Z',
        forageHeightCm: 25, forageCoverPct: 80,
      }), ObservationEntity.validate, ObservationEntity.toSupabaseShape, 'paddock_observations');
    }
    // One feed entry on G-1 with batch resolution.
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_A,
      date: '2026-04-30', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    // Group window on the event that overlaps every paddock window.
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-event', operationId: OP, eventId: EVT, groupId: GROUP_A, animalClassId: CLS,
      dateJoined: '2026-04-29', headCount: 5, avgWeightKg: 540,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    renderEventAudit(seedDom());

    expect(document.querySelector('[data-testid="dev-audit-paddock-window-pw-g1"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="dev-audit-paddock-window-pw-g2"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="dev-audit-paddock-window-pw-g3"]')).toBeTruthy();
    // FOR-1 calc card lands inside each window's block.
    expect(document.querySelector('[data-testid="dev-audit-calc-card-FOR-1-pw-g1"]')).toBeTruthy();
    // Group window with overlap is rendered inside each paddock window block.
    expect(document.querySelectorAll('[data-testid="dev-audit-group-window-gw-event"]').length).toBe(3);
    // DMI-2 card sits inside the group window sub-block — once per pw block.
    expect(document.querySelectorAll('[data-testid="dev-audit-calc-card-DMI-2-gw-event"]').length).toBe(3);
    // Feed entries table on G-1 lists the delivery; G-2/G-3 show the empty state.
    expect(document.querySelector('[data-testid="dev-audit-feed-entries-pw-g1"]').textContent).toContain('Hay Batch');
  });
});

describe('Orphan feed entries (Section 4b)', () => {
  it('surfaces feed entries whose locationId does not match any paddock window', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    seedBatch();
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-only', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_ORPHAN,
      date: '2026-04-30', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    renderEventAudit(seedDom());
    const orphans = document.querySelector('[data-testid="dev-audit-orphan-feed-entries"]');
    expect(orphans).toBeTruthy();
    expect(orphans.textContent).toContain('1');
    expect(orphans.textContent).toMatch(/no matching paddock window/);
  });

  it('reports zero orphans when every locationId matches a paddock window', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    seedBatch();
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-only', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_A,
      date: '2026-04-30', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    renderEventAudit(seedDom());
    const orphans = document.querySelector('[data-testid="dev-audit-orphan-feed-entries"]');
    expect(orphans.textContent).toContain('(0)');
  });
});

describe('Section 1 unit toggle (OI-0145)', () => {
  it('renders the 3-way toggle with radiogroup ARIA + the explanatory note', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-only', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    seedForageTypeAndLocations();

    renderEventAudit(seedDom());
    const toggle = document.querySelector('[data-testid="dev-audit-unit-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('role')).toBe('radiogroup');
    // All three buttons present.
    expect(document.querySelector('[data-testid="dev-audit-unit-metric"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="dev-audit-unit-standard"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="dev-audit-unit-hybrid"]')).toBeTruthy();
    // Default is metric → that button is aria-checked=true.
    expect(document.querySelector('[data-testid="dev-audit-unit-metric"]').getAttribute('aria-checked')).toBe('true');
  });

  it('clicking Standard persists the choice and re-renders the page in imperial', () => {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-only', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    seedForageTypeAndLocations();

    renderEventAudit(seedDom());
    document.querySelector('[data-testid="dev-audit-unit-standard"]').click();

    expect(localStorage.getItem('dev-audit-unit-mode')).toBe('standard');
    // Re-render happened — Standard now aria-checked.
    expect(document.querySelector('[data-testid="dev-audit-unit-standard"]').getAttribute('aria-checked')).toBe('true');
    // Location card areaHectares now renders in acres (2 ha × 2.47105 = 4.94 ac).
    const locCard = document.querySelector('[data-testid="dev-audit-location-' + LOC_A + '"]');
    expect(locCard.textContent).toContain('acres');
  });
});

// OI-0157-A: group-window header weight routes through formatAuditValue so
// `stored:` / `live:` lines honor the audit page's metric/standard/hybrid
// toggle. Pre-OI-0157 these were raw template literals with hardcoded ` kg`
// suffix that bypassed the toggle entirely.
describe('Group-window header weight unit toggle (OI-0157-A)', () => {
  const GW_ID = '00000000-0000-0000-0000-0000000gw157';

  function seedGwForUnitTest() {
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-157', operationId: OP, eventId: EVT, locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    seedForageTypeAndLocations();
    seedClassAndAnimals(0); // class only — no animals so live falls back to stored
    add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'Mixed Calves' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    // Tim's repro: 28 head / 253.5300428571427 kg avg, closed window.
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_ID, operationId: OP, eventId: EVT, groupId: GROUP_A, animalClassId: CLS,
      dateJoined: '2026-04-24', timeJoined: '11:37', dateLeft: '2026-04-29', timeLeft: '14:00',
      headCount: 28, avgWeightKg: 253.5300428571427,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }

  function getStoredLineText() {
    const sub = document.querySelector(`[data-testid="dev-audit-group-window-${GW_ID}"]`);
    expect(sub).toBeTruthy();
    // The stored line is the first monospace child whose text starts with "stored: ".
    const lines = sub.querySelectorAll('div');
    for (const div of lines) {
      if (div.textContent.startsWith('stored:')) return div.textContent;
    }
    throw new Error('stored: line not found');
  }

  function getLiveLineText() {
    const sub = document.querySelector(`[data-testid="dev-audit-group-window-${GW_ID}"]`);
    const lines = sub.querySelectorAll('div');
    for (const div of lines) {
      if (div.textContent.startsWith('live:')) return div.textContent;
    }
    throw new Error('live: line not found');
  }

  it('metric mode: stored line shows kg with 2-decimal rounding (no raw float)', () => {
    seedGwForUnitTest();
    renderEventAudit(seedDom());
    // Default is metric.
    const stored = getStoredLineText();
    // 253.5300428571427 → "253.53 kg" via formatAuditValue(value, 'weight', 2).
    expect(stored).toContain('253.53 kg');
    // Pre-OI-0157 raw float bug should be gone.
    expect(stored).not.toContain('253.5300428571427');
    // Head count renders as plain integer (decimals=0).
    expect(stored).toContain('28 head');
  });

  it('standard mode: stored line converts kg to lbs', () => {
    seedGwForUnitTest();
    renderEventAudit(seedDom());
    document.querySelector('[data-testid="dev-audit-unit-standard"]').click();
    const stored = getStoredLineText();
    // 253.5300428571427 kg × 2.20462 = 558.95 lbs (toFixed(2)).
    expect(stored).toContain('lbs');
    expect(stored).not.toMatch(/\bkg\b/); // bare "kg" should not appear in standard mode
    expect(stored).toContain('28 head');
  });

  it('hybrid mode: stored line shows both kg and lbs', () => {
    seedGwForUnitTest();
    renderEventAudit(seedDom());
    document.querySelector('[data-testid="dev-audit-unit-hybrid"]').click();
    const stored = getStoredLineText();
    expect(stored).toContain('253.53 kg');
    expect(stored).toContain('lbs');
    expect(stored).toContain('28 head');
  });

  it('live line uses the same unit toggle (parity with stored)', () => {
    seedGwForUnitTest();
    renderEventAudit(seedDom());
    document.querySelector('[data-testid="dev-audit-unit-standard"]').click();
    const live = getLiveLineText();
    // Live falls back to stored when no animals are seeded — same kg value.
    expect(live).toContain('lbs');
    expect(live).not.toMatch(/\bkg\b/);
    expect(live).toContain('28 head');
  });
});

describe('DMI-8 resolver — 3-day no_animals window (no group windows)', () => {
  it('returns one event-scoped instance with per-day breakdown counting no_animals', () => {
    // Event with paddock windows but no group windows → DMI-8 returns no_animals
    // every day (totalDmiKg <= 0).
    seedForageTypeAndLocations();
    add('events', EventEntity.create({
      id: 'evt-3day', operationId: OP, farmId: FARM, dateIn: '2026-04-29', dateOut: '2026-05-01',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-3day', operationId: OP, eventId: 'evt-3day', locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

    const result = resolveCalcForCalcCard('DMI-8', { eventId: 'evt-3day' });
    expect(result.applicable).toBe(true);
    expect(result.scope).toBe('event');
    const inst = result.instances[0];
    expect(inst.kind).toBe('dmi8-card');
    expect(inst.dailyBreakdown).toHaveLength(3); // 04-29, 04-30, 05-01
    expect(inst.counts.no_animals).toBe(3);
    expect(inst.counts.actual).toBe(0);
    expect(inst.windowSummary.eventStart).toBe('2026-04-29');
    expect(inst.windowSummary.dateOut).toBe('2026-05-01');
    expect(inst.windowSummary.nDays).toBe(3);
  });
});

describe('DMI-8 resolver — no_pasture_data on missing observation', () => {
  it('counts no_pasture_data days when observations are missing', () => {
    seedClassAndAnimals(3);
    seedForageTypeAndLocations();
    add('events', EventEntity.create({
      id: 'evt-noobs', operationId: OP, farmId: FARM, dateOut: '2026-04-30',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: 'pw-noobs', operationId: OP, eventId: 'evt-noobs', locationId: LOC_A,
      dateOpened: '2026-04-29',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'C' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-noobs', operationId: OP, eventId: 'evt-noobs', groupId: GROUP_A, animalClassId: CLS,
      dateJoined: '2026-04-29', headCount: 3, avgWeightKg: 540,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    // Seed memberships + weight records so the DMI-8 live recompute resolves
    // head > 0 and the cascade falls through to the no_pasture_data branch
    // (no observation seeded). Without memberships the live recompute returns
    // 0, which flips the per-day status to no_animals — that's covered by the
    // 3-day no_animals window test above.
    for (let i = 0; i < 3; i++) {
      add('animalGroupMemberships', MembershipEntity.create({
        operationId: OP, animalId: `00000000-0000-0000-0000-00000000a00${i}`, groupId: GROUP_A,
        dateJoined: '2026-04-29',
      }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    }
    // No paddock_observations seeded → DMI-8 returns no_pasture_data each day.

    const result = resolveCalcForCalcCard('DMI-8', { eventId: 'evt-noobs' });
    expect(result.applicable).toBe(true);
    const inst = result.instances[0];
    expect(inst.counts.no_pasture_data).toBe(2);
    expect(inst.sources.forageTypesMissing).toBe(false);
    expect(inst.sources.paddockWindows.total).toBe(1);
  });
});

function seedDom() {
  const c = document.createElement('div');
  c.id = 'app-content';
  document.body.appendChild(c);
  // Set hash to point at the default seeded event.
  window.location.hash = `#/dev/audit?id=${EVT}`;
  return c;
}
