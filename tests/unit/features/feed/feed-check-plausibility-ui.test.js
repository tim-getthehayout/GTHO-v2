/** Pool-check and feeding-sheet plausibility UI — invented ids. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import { _reset, add, getAll, getById, setSyncAdapter, update } from '../../../../src/data/store.js';
import { openFeedCheckSheet } from '../../../../src/features/feed/check.js';
import { openEditFeedCheckDialog } from '../../../../src/features/events/edit-feed-check.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
import { openMoveWizard } from '../../../../src/features/events/move-wizard.js';
import { openCloseEventSheet } from '../../../../src/features/events/close.js';
import { openSubmoveCloseSheet } from '../../../../src/features/events/submove.js';
import { openMoveFeedOutSheet } from '../../../../src/features/events/move-feed-out.js';
import * as FarmSetting from '../../../../src/entities/farm-setting.js';
import * as Group from '../../../../src/entities/group.js';
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

function elDecoyCarryoverItem() {
  const item = document.createElement('div');
  item.setAttribute('data-testid', 'feed-carryover-item');
  const type = document.createElement('select');
  type.setAttribute('data-testid', 'feed-carryover-type');
  const loc = document.createElement('select');
  loc.setAttribute('data-testid', 'feed-carryover-location');
  const remaining = document.createElement('input');
  remaining.setAttribute('data-testid', 'feed-carryover-remaining');
  item.append(type, loc, remaining);
  return item;
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
    expect(formatDmPerDay(66, { unitSystem: 'imperial' })).toBe('146 lb DM/day');
    expect(formatDmPerDay(66, { unitSystem: 'metric' })).toBe('66 kg DM/day');
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
    expect(warning.textContent).toContain('146 lb DM/day');
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


  function seedMoveDest() {
    seedRow('farmSettings', FarmSetting, { id: 'fs-ui', farmId: FARM }, 'farm_settings');
    seedRow('groups', Group, { id: 'grp-ui', name: 'Rams', farmId: FARM }, 'groups');
    seedRow('locations', Location, { id: 'loc-dest-ui', farmId: FARM, name: 'Dest', type: 'land' }, 'locations');
  }

  function driveMoveToStep3() {
    const event = getById('events', EVENT);
    openMoveWizard(event, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector('[data-testid="location-picker-item-loc-dest-ui"]').click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    const panel = document.getElementById('move-wizard-sheet-panel');
    fill(panel, '[data-testid="move-wizard-date-out"]', '2026-11-17');
    fill(panel, '[data-testid="move-wizard-time-out"]', '12:04');
    return panel;
  }

  it('move-wizard Residual warns and writes nothing until Save anyway', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    seedMoveDest();
    const panel = driveMoveToStep3();
    const residualKey = `${HAY}-${LOC}`;
    panel.querySelector(`[data-testid="move-wizard-transfer-residual-${residualKey}"]`).click();
    fill(panel, `[data-testid="move-wizard-residual-input-${residualKey}"]`, '0.66');
    const beforeChecks = getAll('eventFeedChecks').length;
    const beforeOut = getById('events', EVENT).dateOut;
    panel.querySelector('[data-testid="move-wizard-save"]').click();
    const warning = panel.querySelector('[data-testid="pool-plausibility-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('43 lb DM/day');
    expect(warning.textContent).toContain('(30%)');
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    expect(getById('events', EVENT).dateOut).toBe(beforeOut);
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
    expect(getById('events', EVENT).dateOut).toBe('2026-11-17');
  });

  it('move-wizard Move-only close shows no warning', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    seedMoveDest();
    const panel = driveMoveToStep3();
    const residualKey = `${HAY}-${LOC}`;
    expect(panel.querySelector(`[data-testid="move-wizard-transfer-move-${residualKey}"]`).checked).toBe(true);
    const residualInput = panel.querySelector(`[data-testid="move-wizard-residual-input-${residualKey}"]`);
    expect(residualInput).toBeTruthy();
    expect(residualInput.parentElement?.style.display).not.toBe('none');
    expect(residualInput.value).toBe('');
    fill(panel, `[data-testid="move-wizard-residual-input-${residualKey}"]`, '0.75');
    const beforeChecks = getAll('eventFeedChecks').length;
    panel.querySelector('[data-testid="move-wizard-save"]').click();
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeFalsy();
    expect(getById('events', EVENT).dateOut).toBe('2026-11-17');
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
  });

  it('pool-transfer Confirm current remaining warns before the confirm dialog', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const event = getById('events', EVENT);
    openMoveFeedOutSheet(event, OP, FARM, { preselectFeedTypeId: HAY, preselectLocationId: LOC });
    const panel = document.getElementById('move-feed-out-panel');
    fill(panel, '[data-testid="pool-date"]', '2026-11-17', 'change');
    fill(panel, '[data-testid="pool-time"]', '12:04');
    fill(panel, `[data-testid="pool-remaining-${HAY}-${LOC}"]`, '0.66');
    fill(panel, `[data-testid="pool-move-${HAY}-${LOC}"]`, '0.1');
    fill(panel, '[data-testid="pool-destination"]', `storage|${STORE}`, 'change');
    const beforeChecks = getAll('eventFeedChecks').length;
    button(panel, 'Save').click();
    const warning = panel.querySelector('[data-testid="pool-plausibility-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('43 lb DM/day');
    expect(confirm).not.toHaveBeenCalled();
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    const remaining = panel.querySelector(`[data-testid="pool-remaining-${HAY}-${LOC}"]`);
    const focus = vi.spyOn(remaining, 'focus');
    panel.querySelector('[data-testid="pool-plausibility-fix"]').click();
    expect(focus).toHaveBeenCalled();
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(confirm).toHaveBeenCalled();
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
  });

  it('close-event remaining warns above Save and writes nothing until Save anyway', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    seedRow('farmSettings', FarmSetting, { id: 'fs-ui', farmId: FARM }, 'farm_settings');
    const event = getById('events', EVENT);
    openCloseEventSheet(event, OP);
    const panel = document.getElementById('close-event-sheet-panel');
    fill(panel, '[data-testid="close-event-date-out"]', '2026-11-17', 'change');
    fill(panel, '[data-testid="close-event-time-out"]', '12:04');
    fill(panel, `[data-testid="close-event-feed-${HAY}-${LOC}"]`, '0.66');
    const beforeChecks = getAll('eventFeedChecks').length;
    panel.querySelector('[data-testid="close-event-save"]').click();
    const warning = panel.querySelector('[data-testid="pool-plausibility-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('43 lb DM/day');
    expect(warning.textContent).toContain('(30%)');
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    expect(getById('events', EVENT).dateOut).toBeFalsy();
    const remaining = panel.querySelector(`[data-testid="close-event-feed-${HAY}-${LOC}"]`);
    const focus = vi.spyOn(remaining, 'focus');
    panel.querySelector('[data-testid="pool-plausibility-fix"]').click();
    expect(focus).toHaveBeenCalled();
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
    expect(getById('events', EVENT).dateOut).toBe('2026-11-17');
  });

  it('close-event Save anyway is kept through the date-conflict dialog', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    seedRow('farmSettings', FarmSetting, { id: 'fs-ui', farmId: FARM }, 'farm_settings');
    seedRow('locations', Location, { id: 'loc-late-ui', farmId: FARM, name: 'Late corral', type: 'confinement' }, 'locations');
    seedRow('eventPaddockWindows', PW, { id: 'pw-late-ui', eventId: EVENT, locationId: 'loc-late-ui', dateOpened: '2026-11-18' }, 'event_paddock_windows');
    const event = getById('events', EVENT);
    openCloseEventSheet(event, OP);
    const panel = document.getElementById('close-event-sheet-panel');
    fill(panel, '[data-testid="close-event-date-out"]', '2026-11-17', 'change');
    fill(panel, '[data-testid="close-event-time-out"]', '12:04');
    fill(panel, `[data-testid="close-event-feed-${HAY}-${LOC}"]`, '0.66');
    const beforeChecks = getAll('eventFeedChecks').length;
    panel.querySelector('[data-testid="close-event-save"]').click();
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="date-conflict-dialog-title"]')).toBeFalsy();
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    expect(getById('events', EVENT).dateOut).toBeFalsy();
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(document.querySelector('[data-testid="date-conflict-dialog-title"]')).toBeTruthy();
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    expect(getById('events', EVENT).dateOut).toBeFalsy();
    document.querySelector('[data-testid="date-conflict-set-pw-late-ui"]').click();
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
    expect(getById('events', EVENT).dateOut).toBe('2026-11-17');
    expect(getById('eventPaddockWindows', 'pw-late-ui').dateOpened).toBe('2026-11-17');
  });

  it('sub-move close remaining warns above Save and writes nothing until Save anyway', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    seedRow('farmSettings', FarmSetting, { id: 'fs-ui', farmId: FARM }, 'farm_settings');
    const pw = getById('eventPaddockWindows', 'pw-corral-ui');
    openSubmoveCloseSheet(pw, OP);
    const panel = document.getElementById('submove-close-sheet-panel');
    fill(panel, '[data-testid="submove-close-date"]', '2026-11-17', 'change');
    fill(panel, '[data-testid="submove-close-time"]', '12:04');
    fill(panel, `[data-testid="submove-close-feed-${HAY}-${LOC}"]`, '0.66');
    const beforeChecks = getAll('eventFeedChecks').length;
    panel.querySelector('[data-testid="submove-close-save"]').click();
    const warning = panel.querySelector('[data-testid="pool-plausibility-warning"]');
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain('43 lb DM/day');
    expect(getAll('eventFeedChecks')).toHaveLength(beforeChecks);
    expect(getById('eventPaddockWindows', 'pw-corral-ui').dateClosed).toBeFalsy();
    panel.querySelector('[data-testid="pool-plausibility-save-anyway"]').click();
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
    expect(getById('eventPaddockWindows', 'pw-corral-ui').dateClosed).toBe('2026-11-17');
  });

  it('feeding-sheet Fix focuses the flagged carryover input', () => {
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
    button(panel, 'Save feeding').click();
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeTruthy();
    const carryover = panel.querySelector('[data-testid="feed-delivery-carryover"]');
    const flagged = carryover.querySelector('[data-testid="feed-carryover-remaining"]');
    const decoy = elDecoyCarryoverItem();
    carryover.insertBefore(decoy, carryover.querySelector('[data-testid="feed-carryover-item"]'));
    const first = decoy.querySelector('[data-testid="feed-carryover-remaining"]');
    expect(carryover.querySelector('[data-testid="feed-carryover-remaining"]')).toBe(first);
    const firstFocus = vi.spyOn(first, 'focus');
    const flaggedFocus = vi.spyOn(flagged, 'focus');
    panel.querySelector('[data-testid="pool-plausibility-fix"]').click();
    expect(flaggedFocus).toHaveBeenCalled();
    expect(firstFocus).not.toHaveBeenCalled();
  });

  it('a feeding-sheet leftover save still works when the preview throws', () => {
    seed({ mid: 0.75, include16: true, include17: false });
    update('events', EVENT, { dateOut: '2026-11-16' }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
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
    expect(panel.querySelector('[data-testid="pool-plausibility-warning"]')).toBeFalsy();
    expect(panel.querySelector('.auth-error')?.textContent || '').not.toContain('event dates');
    expect(getAll('eventFeedChecks').length).toBeGreaterThan(beforeChecks);
    expect(getAll('eventFeedEntries').length).toBeGreaterThan(beforeEntries);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(0.66);
  });

});
