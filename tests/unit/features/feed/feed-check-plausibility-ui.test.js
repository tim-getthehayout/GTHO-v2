/** Pool-check and feeding-sheet plausibility UI — invented ids. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../../../src/data/store.js';
import { openFeedCheckSheet } from '../../../../src/features/feed/check.js';
import { openEditFeedCheckDialog } from '../../../../src/features/events/edit-feed-check.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
import { placeInitialBalance } from '../../../../src/features/feed/batch-balances.js';
import { inventoryPoolSnapshot } from '../../../../src/features/feed/pool-ledger.js';
import { formatIntervalClock, formatDmPerDay } from '../../../../src/features/feed/plausibility-warning.js';
import * as Operation from '../../../../src/entities/operation.js';
import * as Farm from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as Location from '../../../../src/entities/location.js';
import * as FeedType from '../../../../src/entities/feed-type.js';
import * as Batch from '../../../../src/entities/batch.js';
import * as Entry from '../../../../src/entities/event-feed-entry.js';
import * as Check from '../../../../src/entities/event-feed-check.js';
import * as Item from '../../../../src/entities/event-feed-check-item.js';
import * as PW from '../../../../src/entities/event-paddock-window.js';
import * as GW from '../../../../src/entities/event-group-window.js';
import * as AnimalClass from '../../../../src/entities/animal-class.js';
import * as Animal from '../../../../src/entities/animal.js';
import * as Membership from '../../../../src/entities/animal-group-membership.js';

const OP = 'op-plaus-ui';
const FARM = 'farm-plaus-ui';
const EVENT = 'evt-corral-ui';
const LOC = 'loc-corral-ui';
const STORE = 'loc-store-ui';
const HAY = 'ft-hay-ui';
const BATCH = 'batch-hay-ui';
const BALE_KG = 272.16;
const DM_PCT = 90;

function seedRow(type, entity, data, table = type) {
  const row = entity.create({ operationId: OP, ...data });
  add(type, row, entity.validate, entity.toSupabaseShape, table);
  return row;
}

function fill(root, selector, value, event = 'input') {
  const control = root.querySelector(selector);
  control.value = value;
  control.dispatchEvent(new Event(event, { bubbles: true }));
  return control;
}

function button(root, text) {
  return [...root.querySelectorAll('button')].find(node => node.textContent.trim() === text);
}

function seed({ mid = 0.75, include16 = true, include17 = false, locType = 'confinement' } = {}) {
  seedRow('operations', Operation, { id: OP, name: 'Op', unitSystem: 'imperial' }, 'operations');
  seedRow('farms', Farm, { id: FARM, name: 'Farm' }, 'farms');
  seedRow('events', EventEntity, { id: EVENT, farmId: FARM, dateIn: '2026-11-09' }, 'events');
  seedRow('locations', Location, { id: LOC, farmId: FARM, name: 'Corral', type: locType }, 'locations');
  seedRow('locations', Location, { id: STORE, farmId: FARM, name: 'Shed', type: 'storage' }, 'locations');
  seedRow('feedTypes', FeedType, { id: HAY, name: 'Hay', category: 'forage', unit: 'bale' }, 'feed_types');
  const batch = seedRow('batches', Batch, {
    id: BATCH, feedTypeId: HAY, name: 'Hay', unit: 'bale', quantity: 10, remaining: 6,
    weightPerUnitKg: BALE_KG, dmPct: DM_PCT,
  }, 'batches');
  placeInitialBalance({ operationId: OP, batchId: BATCH, locationId: STORE, quantity: 6 });
  seedRow('eventPaddockWindows', PW, { id: 'pw-corral-ui', eventId: EVENT, locationId: LOC, dateOpened: '2026-11-09' }, 'event_paddock_windows');
  seedRow('eventGroupWindows', GW, { id: 'gw-ui', eventId: EVENT, groupId: 'grp-ui', dateJoined: '2026-11-09', headCount: 22, avgWeightKg: 120 }, 'event_group_windows');
  seedRow('animalClasses', AnimalClass, { id: 'cls-ui', name: 'Ram lambs', species: 'sheep', role: 'growing', defaultWeightKg: 120, dmiPct: 2.5 }, 'animal_classes');
  seedRow('animals', Animal, { id: 'an-ui', classId: 'cls-ui', name: 'Rams', sex: 'male', isBulk: true, bulkHeadCount: 22 }, 'animals');
  seedRow('animalGroupMemberships', Membership, { id: 'mem-ui', animalId: 'an-ui', groupId: 'grp-ui', dateJoined: '2026-11-09' }, 'animal_group_memberships');
  seedRow('eventFeedEntries', Entry, {
    id: 'fed-hay-ui', eventId: EVENT, locationId: LOC, batchId: BATCH,
    date: '2026-11-11', time: '10:00', quantity: 4, ...inventoryPoolSnapshot(batch),
  }, 'event_feed_entries');
  const remainings = [['chk-11-ui', '2026-11-11', '14:37', 4], ['chk-12-ui', '2026-11-12', '15:00', 3.25], ['chk-13-ui', '2026-11-13', '17:02', 2.25]];
  if (include16) remainings.push(['chk-16-ui', '2026-11-16', '09:12', mid]);
  if (include17) remainings.push(['chk-17-ui', '2026-11-17', '12:04', 0.66]);
  for (const [id, date, time, remaining] of remainings) {
    seedRow('eventFeedChecks', Check, { id, eventId: EVENT, date, time }, 'event_feed_checks');
    seedRow('eventFeedCheckItems', Item, {
      id: `item-${id}`, feedCheckId: id, locationId: LOC, feedTypeId: HAY, batchId: null,
      remainingQuantity: remaining, unitSnapshot: 'bale', weightPerUnitKgSnapshot: BALE_KG, dmPctSnapshot: DM_PCT,
    }, 'event_feed_check_items');
  }
}

describe('plausibility warning UI', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter({ push: vi.fn(), delete: vi.fn() });
  });
  afterEach(() => vi.restoreAllMocks());

  it('formats the brief’s clocks and rounded lb DM/day figures', () => {
    expect(formatIntervalClock('2026-11-16', '09:12')).toBe('Nov 16 9:12 AM');
    expect(formatIntervalClock('2026-11-17', '12:04')).toBe('Nov 17 12:04 PM');
    expect(formatDmPerDay(19.692768, { unitSystem: 'imperial' })).toBe('43 lb DM/day');
    expect(formatDmPerDay(66, { expected: true, unitSystem: 'imperial' })).toBe('146 lb/day');
  });

  it('puts Notes after every pool card on a new check and on edit', () => {
    seed({ include16: true });
    const event = getById('events', EVENT);
    openFeedCheckSheet(event, OP);
    const newPanel = document.getElementById('feed-check-sheet-panel');
    const notesAfter = panel => {
      const notes = panel.querySelector('[data-testid="pool-notes"]');
      const cards = [...panel.querySelectorAll('[data-testid="pool-card"]')];
      expect(cards.length).toBeGreaterThan(0);
      expect(notes).toBeTruthy();
      for (const card of cards) {
        expect(card.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    };
    notesAfter(newPanel);

    const check = getById('eventFeedChecks', 'chk-16-ui');
    const item = getAll('eventFeedCheckItems').find(row => row.feedCheckId === check.id);
    openEditFeedCheckDialog(check, item, event, OP);
    notesAfter(document.getElementById('edit-fc-panel'));
  });

  it('Save shows the 30% warning, writes nothing until Save anyway, and Fix focuses Remaining', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    const event = getById('events', EVENT);
    openFeedCheckSheet(event, OP);
    const panel = document.getElementById('feed-check-sheet-panel');
    fill(panel, '[data-testid="pool-date"]', '2026-11-17', 'change');
    fill(panel, '[data-testid="pool-time"]', '12:04');
    fill(panel, `[data-testid="pool-remaining-${HAY}-${LOC}"]`, '0.66');
    const before = getAll('eventFeedChecks').length;
    button(panel, 'Save').click();
    const warning = panel.querySelector('[data-testid="pool-plausibility-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('From Nov 16 9:12 AM to Nov 17 12:04 PM');
    expect(warning.textContent).toContain('43 lb DM/day');
    expect(warning.textContent).toContain('146 lb/day');
    expect(warning.textContent).toContain('(30%)');
    expect(warning.querySelectorAll('strong')).toHaveLength(2);
    expect(getAll('eventFeedChecks')).toHaveLength(before);

    const remaining = panel.querySelector(`[data-testid="pool-remaining-${HAY}-${LOC}"]`);
    const focus = vi.spyOn(remaining, 'focus');
    panel.querySelector('[data-testid="pool-plausibility-fix"]').click();
    expect(focus).toHaveBeenCalled();
    expect(getAll('eventFeedChecks')).toHaveLength(before);
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeTruthy();

    remaining.value = '0.50';
    remaining.dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeFalsy();
    fill(panel, `[data-testid="pool-remaining-${HAY}-${LOC}"]`, '0.66');
    button(panel, 'Save').click();
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeTruthy();
    expect(getAll('eventFeedChecks')).toHaveLength(before);

    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(getAll('eventFeedChecks')).toHaveLength(before + 1);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
  });

  it('the feeding-sheet leftover path shows the same warning and does not write until Save anyway', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    const event = getById('events', EVENT);
    let binding;
    openDeliverFeedSheet(event, OP, { review: { bind(value) { binding = value; }, requestConfirmation: save => save() } });
    binding.fields.lines.set([{ batchId: BATCH, qty: 1, sourceLocationId: STORE }]);
    binding.fields.locationIds.set([LOC]);
    binding.fields.quantityBasis.set('total');
    binding.fields.carryover.set({
      timing: 'before', time: '12:04', feedTypeId: HAY, remainingQuantity: 0.66,
      items: [{ feedTypeId: HAY, locationId: LOC, remainingQuantity: 0.66 }],
    });
    const panel = document.getElementById('deliver-feed-sheet-panel');
    fill(panel, 'input[type="date"]', '2026-11-17', 'change');
    const clock = [...panel.querySelectorAll('input[type="time"]')].find(node => node.dataset.testid !== 'feed-carryover-time');
    clock.value = '13:00';
    clock.dispatchEvent(new Event('input', { bubbles: true }));
    const beforeChecks = getAll('eventFeedChecks').length;
    const beforeEntries = getAll('eventFeedEntries').length;
    button(panel, 'Save feeding').click();
    const warning = panel.querySelector('[data-testid="pool-plausibility-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('43 lb DM/day');
    expect(warning.textContent).toContain('(30%)');
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    expect(getAll('eventFeedEntries')).toHaveLength(beforeEntries);
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
  });

  it('the assistant-filled feeding path shows the warning before requesting confirmation', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    const event = getById('events', EVENT);
    const requestConfirmation = vi.fn();
    let binding;
    openDeliverFeedSheet(event, OP, { review: { bind(value) { binding = value; }, requestConfirmation } });
    binding.fields.lines.set([{ batchId: BATCH, qty: 1, sourceLocationId: STORE }]);
    binding.fields.locationIds.set([LOC]);
    binding.fields.quantityBasis.set('total');
    binding.fields.carryover.set({
      timing: 'before', time: '12:04', feedTypeId: HAY, remainingQuantity: 0.66,
      items: [{ feedTypeId: HAY, locationId: LOC, remainingQuantity: 0.66 }],
    });
    const panel = document.getElementById('deliver-feed-sheet-panel');
    fill(panel, 'input[type="date"]', '2026-11-17', 'change');
    const clock = [...panel.querySelectorAll('input[type="time"]')].find(node => node.dataset.testid !== 'feed-carryover-time');
    clock.value = '13:00';
    clock.dispatchEvent(new Event('input', { bubbles: true }));
    [...panel.querySelectorAll('button')].find(node => /save/i.test(node.textContent) && !/anyway/i.test(node.textContent)).click();
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeTruthy();
    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(getAll('eventFeedEntries').every(row => row.id === 'fed-hay-ui' || row.date === '2026-11-11')).toBe(true);
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(requestConfirmation).toHaveBeenCalledTimes(1);
  });
});
