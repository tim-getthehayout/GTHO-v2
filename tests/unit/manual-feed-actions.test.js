import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import { resetForms, seed, queueSpy, button, fill, OP, FARM } from './manual-entry-helpers.js';
import { getAll, getById, init } from '../../src/data/store.js';
import * as Batch from '../../src/entities/batch.js';
import * as Entry from '../../src/entities/event-feed-entry.js';
import * as Location from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as Window from '../../src/entities/event-paddock-window.js';
import { placeInitialBalance, moveBatchQuantity, balancesFor } from '../../src/features/feed/batch-balances.js';
import { openEventDetailSheet, closeEventDetailSheet } from '../../src/features/events/detail.js';
import { closeForm, openAddMode, openEditMode, renderInlineFeedForm } from '../../src/features/events/feed-entry-inline-form.js';
let event, mount, queued;
const batch = id => seed('batches', Batch, { id, name: id, feedTypeId: 'hay', quantity: 10, remaining: 10, unit: 'bale' });
const source = (id, quantity) => balancesFor(id).find(row => row.locationId === quantity)?.quantity;
function render() { renderInlineFeedForm(mount, { event, operationId: OP }); }
function edit(entry, quantity, batchId, from) {
  openEditMode(entry); render();
  if (batchId) fill(mount, '[data-testid="feed-form-batch"]', batchId, 'change');
  if (from) fill(mount, `[data-testid="feed-form-source-${batchId || entry.batchId}"]`, from, 'change');
  fill(mount, 'input[type="number"]', String(quantity)); button(mount, 'Save changes').click();
}
function invariant(id, total) { expect(getById('batches', id).remaining).toBe(total); expect(balancesFor(id).reduce((sum, row) => sum + row.quantity, 0)).toBe(total); }
beforeEach(() => {
  resetForms(); closeForm();
  for (const id of ['barn', 'other', 'pasture']) seed('locations', Location, { id, farmId: FARM, name: id });
  event = seed('events', EventEntity, { id: 'event', farmId: FARM });
  seed('eventPaddockWindows', Window, { eventId: event.id, locationId: 'pasture', dateOpened: '2026-01-01' });
  batch('hay-a'); batch('hay-b');
  for (const id of ['hay-a', 'hay-b']) placeInitialBalance({ operationId: OP, batchId: id, locationId: 'barn', quantity: 10 });
  moveBatchQuantity({ operationId: OP, batchId: 'hay-a', fromLocationId: 'barn', toLocationId: 'other', quantity: 4 });
  mount = document.createElement('div'); document.body.append(mount); queued = queueSpy();
});
afterEach(() => { closeEventDetailSheet(); closeForm(); vi.restoreAllMocks(); });
it('FA-01 actual Add/Edit/Delete preserve exact source holdings and queued rows', () => {
  openAddMode(event); render(); [...mount.querySelectorAll('.batch-sel')].find(node => node.textContent.includes('hay-a')).click();
  fill(mount, '[data-testid="feed-form-source-hay-a"]', 'barn', 'change'); fill(mount, 'input[type="number"]', '2'); button(mount, 'Add to event').click();
  let entry = getAll('eventFeedEntries')[0]; expect(entry.sourceLocationId).toBe('barn'); invariant('hay-a', 8); expect(source('hay-a', 'barn')).toBe(4); expect(source('hay-a', 'other')).toBe(4);
  expect(queued('event_feed_entries').at(-1)).toMatchObject({ source_location_id: 'barn', quantity: 2 });
  edit(entry, 1); invariant('hay-a', 9); expect(source('hay-a', 'barn')).toBe(5);
  entry = getAll('eventFeedEntries')[0]; edit(entry, 3); invariant('hay-a', 7); expect(source('hay-a', 'barn')).toBe(3);
  entry = getAll('eventFeedEntries')[0]; edit(entry, 2, 'hay-b', 'barn'); invariant('hay-a', 10); invariant('hay-b', 8);
  entry = getAll('eventFeedEntries')[0]; edit(entry, 1, 'hay-a', 'other'); invariant('hay-a', 9); invariant('hay-b', 10); expect(source('hay-a', 'other')).toBe(3);
  vi.spyOn(globalThis, 'confirm').mockReturnValue(true); openEventDetailSheet(event, OP, FARM);
  const deleteButton = [...document.querySelectorAll('#event-detail-sheet-panel button')].find(node => node.textContent === '×'); expect(deleteButton).toBeTruthy(); deleteButton.click();
  expect(getAll('eventFeedEntries')).toHaveLength(0); invariant('hay-a', 10); expect(source('hay-a', 'other')).toBe(4);
  init(); expect(getAll('eventFeedEntries')).toHaveLength(0); invariant('hay-a', 10);
});
it('FA-01 rejects source overdraw before any row or inventory write', () => {
  openAddMode(event); render(); [...mount.querySelectorAll('.batch-sel')].find(node => node.textContent.includes('hay-a')).click();
  fill(mount, '[data-testid="feed-form-source-hay-a"]', 'barn', 'change'); fill(mount, 'input[type="number"]', '7'); button(mount, 'Add to event').click();
  expect(mount.textContent).toContain('Not enough inventory'); expect(getAll('eventFeedEntries')).toHaveLength(0); invariant('hay-a', 10); expect(queued('event_feed_entries')).toHaveLength(0);
});
it('FA-01 legacy unplaced stock reverses without inventing a source; located legacy with unknown source refuses inventory changes', () => {
  batch('legacy'); const old = seed('eventFeedEntries', Entry, { eventId: event.id, locationId: 'pasture', batchId: 'legacy', date: '2026-01-02', quantity: 2 });
  edit(old, 1); expect(getById('batches', 'legacy').remaining).toBe(11); expect(balancesFor('legacy')).toEqual([]);
  const unknown = seed('eventFeedEntries', Entry, { eventId: event.id, locationId: 'pasture', batchId: 'hay-a', date: '2026-01-02', quantity: 2 });
  edit(unknown, 1); expect(mount.textContent).toContain('original source is unknown'); expect(getById('eventFeedEntries', unknown.id).quantity).toBe(2); invariant('hay-a', 10);
});

it('rejects an actual edit overdraw and an invalid date with no queued stock changes', () => {
  const old = seed('eventFeedEntries', Entry, { eventId: event.id, locationId: 'pasture', batchId: 'hay-a', sourceLocationId: 'barn', date: '2026-01-02', quantity: 2 });
  const before = JSON.stringify(balancesFor('hay-a'));
  edit(old, 20); expect(getById('eventFeedEntries', old.id).quantity).toBe(2);
  expect(JSON.stringify(balancesFor('hay-a'))).toBe(before); expect(queued('batches')).toHaveLength(0);
  openEditMode(old); render(); fill(mount, 'input[type="date"]', ''); button(mount, 'Save changes').click();
  expect(getById('eventFeedEntries', old.id).date).toBe('2026-01-02'); expect(queued('event_feed_entries')).toHaveLength(0);
});
it('actual Add rolls back row, balances and queue if local persistence fails', () => {
  openAddMode(event); render(); [...mount.querySelectorAll('.batch-sel')].find(node => node.textContent.includes('hay-a')).click();
  fill(mount, '[data-testid="feed-form-source-hay-a"]', 'barn', 'change'); fill(mount, 'input[type="number"]', '2');
  const before = JSON.stringify(balancesFor('hay-a'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  button(mount, 'Add to event').click();
  expect(getAll('eventFeedEntries')).toHaveLength(0); expect(JSON.stringify(balancesFor('hay-a'))).toBe(before);
  invariant('hay-a', 10); expect(queued('event_feed_entries')).toHaveLength(0);
});
