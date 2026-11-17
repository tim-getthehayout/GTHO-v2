/** @file Feed Day Goal card: run-rate section mounted on the real Feed screen. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add, update, setSyncAdapter } from '../../../../src/data/store.js';
import { renderFeedScreen } from '../../../../src/features/feed/index.js';
import { renderRunRatePanel, feedRunRateInput } from '../../../../src/features/feed/run-rate-panel.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import { getLocalTodayStr } from '../../../../src/utils/date-utils.js';
import { formatShortDate } from '../../../../src/utils/date-format.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../../src/entities/event-feed-entry.js';
import * as CheckEntity from '../../../../src/entities/event-feed-check.js';
import * as CheckItemEntity from '../../../../src/entities/event-feed-check-item.js';
import * as PaddockWindowEntity from '../../../../src/entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../../../src/entities/event-group-window.js';
import * as GroupEntity from '../../../../src/entities/group.js';
import * as MembershipEntity from '../../../../src/entities/animal-group-membership.js';
import * as AnimalClassEntity from '../../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../../src/entities/animal.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC = '00000000-0000-0000-0000-0000000001a1';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';
const GROUP = '00000000-0000-0000-0000-0000000000d1';
const CLS = '00000000-0000-0000-0000-0000000000c1';
const HERD = '00000000-0000-0000-0000-0000000000a1';

function localDay(offset) {
  const base = new Date(`${getLocalTodayStr()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}
const put = (collection, entity, data, table) => add(collection, entity.create({ operationId: OP, ...data }), entity.validate, entity.toSupabaseShape, table);
const snap = { feedTypeId: FT, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80 };

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  put('farms', FarmEntity, { id: FARM, name: 'Farm' }, 'farms');
  put('locations', LocationEntity, { id: LOC, farmId: FARM, name: 'North', type: 'land' }, 'locations');
  put('events', EventEntity, { id: EVT, farmId: FARM }, 'events');
  put('eventPaddockWindows', PaddockWindowEntity, { eventId: EVT, locationId: LOC, dateOpened: localDay(-29) }, 'event_paddock_windows');
  put('feedTypes', FeedTypeEntity, { id: FT, name: 'Grass Hay', category: 'forage', unit: 'bale', dmPct: 80 }, 'feed_types');
  put('batches', BatchEntity, { id: BATCH, feedTypeId: FT, name: 'Hay', unit: 'bale', quantity: 50, remaining: 35, weightPerUnitKg: 500, dmPct: 80, costPerUnit: 60 }, 'batches');
  put('eventFeedEntries', FeedEntryEntity, { eventId: EVT, batchId: BATCH, locationId: LOC, date: localDay(-29), time: '09:00', quantity: 10, kind: 'inventory_feeding', ...snap }, 'event_feed_entries');
  put('eventFeedEntries', FeedEntryEntity, { eventId: EVT, batchId: BATCH, locationId: LOC, date: localDay(-20), time: '09:00', quantity: 5, kind: 'inventory_feeding', ...snap }, 'event_feed_entries');
  for (const [id, day, q] of [['00000000-0000-0000-0000-00000000c001', -25, 6], ['00000000-0000-0000-0000-00000000c002', -15, 1]]) {
    put('eventFeedChecks', CheckEntity, { id, eventId: EVT, date: localDay(day), time: '12:00' }, 'event_feed_checks');
    put('eventFeedCheckItems', CheckItemEntity, { feedCheckId: id, locationId: LOC, remainingQuantity: q, ...snap }, 'event_feed_check_items');
  }
  put('animalClasses', AnimalClassEntity, { id: CLS, name: 'Cow', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 500 }, 'animal_classes');
  put('animals', AnimalEntity, { id: HERD, sex: 'female', active: true, classId: CLS, isBulk: true, bulkHeadCount: 10 }, 'animals');
  put('groups', GroupEntity, { id: GROUP, name: 'Herd' }, 'groups');
  put('animalGroupMemberships', MembershipEntity, { animalId: HERD, groupId: GROUP, dateJoined: localDay(-29) }, 'animal_group_memberships');
  put('eventGroupWindows', GroupWindowEntity, { eventId: EVT, groupId: GROUP, dateJoined: localDay(-29), headCount: 10, avgWeightKg: 500, animalClassId: CLS }, 'event_group_windows');
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFeedScreen(container);
  return container;
}
const text = id => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;

describe('feed run rate on the Feed Day Goal card', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
    globalThis.localStorage?.clear();
    // Fixed clock: pills are clipped to the default budget period start (Oct 1).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('pills are clipped to the default budget period start: the 60-day pill shows 48 days on Nov 17, 2026', () => {
    expect(feedRunRateInput(60, '2026-11-17').periodStart).toBe('2026-10-01');
    expect(feedRunRateInput(30, '2027-09-30').periodStart).toBe('2026-10-01');
    seed();
    mount();
    document.querySelector('[data-testid="feed-run-rate-pill-60"]').click();
    expect(getLocalTodayStr()).toBe('2026-11-17');
    expect(text('feed-run-rate-measured')).toBe(`Measured 10 of 48 days, through ${formatShortDate(localDay(-16))}`);
    expect(text('feed-implied-pasture-detail')).toContain('of 48 days');
  });

  it('shows measured bales/day, consumed, residual, DMI vs forecast, and the renamed need cell', () => {
    seed();
    mount();
    expect(text('feed-run-rate')).toContain('Daily need (DMI)');
    expect(document.querySelector('[data-testid="feed-run-rate-pill-30"]').getAttribute('aria-pressed')).toBe('true');
    expect(text('feed-run-rate-line')).toBe('Run rate: 1 round bales/day · 400 kg DM/day');
    expect(text('feed-run-rate-measured')).toBe(`Measured 10 of 30 days, through ${formatShortDate(localDay(-16))}`);
    expect(text('feed-run-rate-partial')).toBeNull();
    expect(text('feed-run-rate-consumed')).toContain('10 round bales');
    expect(text('feed-run-rate-consumed')).toContain('4000 kg DM');
    expect(text('feed-run-rate-consumed')).toContain('$600');
    expect(text('feed-run-rate-residual')).toContain('No events closed in the last 30 days');
    expect(text('feed-run-rate-dmi')).toBe('DMI: actual 400 kg DM/day vs forecast (avg of 10 measured days) 125 kg DM/day (320%)');
  });

  it('implied pasture is the headline: 0 and muted when stored eaten exceeds demand, with the over-demand line', () => {
    seed();
    mount();
    const section = document.querySelector('[data-testid="feed-run-rate-section"]');
    const head = document.querySelector('[data-testid="feed-implied-pasture"]');
    // Headline sits above the run-rate line.
    expect(section.children[1]).toBe(head);
    expect(head.textContent).toBe('Pasture (implied): 0 kg DM/day · 0% of demand');
    expect(head.style.color).toBe('var(--text3)');
    expect(text('feed-implied-pasture-detail')).toBe('Demand 125 kg DM/day · stored eaten 400 kg DM/day · counted 10 of 30 days');
    expect(text('feed-implied-pasture-over')).toBe('Stored feed over demand: 275 kg DM/day (220% of demand)');
    expect(text('feed-implied-pasture-over-hint')).toContain('feeding waste');
    expect(text('feed-implied-pasture-cattle')).toBe('Cattle: 0.0 kg DM/head/day · 0% of demand');
  });

  it('implied pasture above 0 is green with per-head cattle figures; no counted day is Unknown, not 0', () => {
    seed();
    update('animals', HERD, { bulkHeadCount: 100 }, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    mount();
    const head = document.querySelector('[data-testid="feed-implied-pasture"]');
    expect(head.textContent).toBe('Pasture (implied): 850 kg DM/day · 68% of demand');
    expect(head.style.color).toBe('var(--green)');
    expect(text('feed-implied-pasture-over')).toBeNull();
    expect(text('feed-implied-pasture-cattle')).toBe('Cattle: 8.5 kg DM/head/day · 68% of demand');
    expect(text('feed-implied-pasture-sheep')).toBeNull();
    document.querySelector('[data-testid="feed-run-rate-pill-7"]').click();
    expect(text('feed-implied-pasture')).toBe('Pasture (implied): Unknown');
    expect(text('feed-implied-pasture-reason')).toBe('Needs two checks of the same feed, or a day with no hay out');
    expect(text('feed-implied-pasture')).not.toContain('0 kg');
  });

  it('pills switch the window, show the empty state without zeros, and are remembered on the device', () => {
    seed();
    mount();
    document.querySelector('[data-testid="feed-run-rate-pill-7"]').click();
    expect(text('feed-run-rate-empty')).toBe('No feed checks in the last 7 days. Run rate needs two checks of the same feed.');
    expect(text('feed-run-rate-line')).toBeNull();
    expect(text('feed-run-rate-consumed')).toBeNull();
    expect(text('feed-run-rate-dmi')).toBeNull();
    document.body.replaceChildren();
    mount();
    expect(document.querySelector('[data-testid="feed-run-rate-pill-7"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('the same panel component renders standalone for the scorecard to reuse', () => {
    seed();
    const panel = renderRunRatePanel({ unitSys: 'metric' });
    document.body.appendChild(panel);
    expect(panel.getAttribute('data-testid')).toBe('feed-run-rate-section');
    expect(text('feed-run-rate-line')).toBe('Run rate: 1 round bales/day · 400 kg DM/day');
    expect(text('feed-run-rate-dmi')).toBe('DMI: actual 400 kg DM/day vs forecast (avg of 10 measured days) 125 kg DM/day (320%)');
    // The window choice is shared with the Feed card (one device preference).
    document.querySelector('[data-testid="feed-run-rate-pill-14"]').click();
    document.body.replaceChildren();
    mount();
    expect(document.querySelector('[data-testid="feed-run-rate-pill-14"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('residual at close with no reading shows Unknown, not 0, and a feed type change refreshes the card', async () => {
    seed();
    // Close the event yesterday without a close reading; feed is still in the pool.
    update('events', EVT, { dateOut: localDay(-1) }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    mount();
    const residual = text('feed-run-rate-residual');
    expect(residual).toContain('Unknown DM');
    expect(residual).toContain('Unknown $');
    expect(residual).toContain('Closes without a reading: 1');
    expect(residual).not.toContain('$0');
    const before = document.querySelector('[data-testid="feed-run-rate-section"]');
    update('feedTypes', FT, { name: 'Grass Hay 2' }, FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('[data-testid="feed-run-rate-section"]')).not.toBe(before);
  });
});
