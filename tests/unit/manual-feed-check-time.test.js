// Historical batch-row UI/API regression fixture. Released pool forms run
// unmocked in manual-feed-pools and manual-pool-chart-refresh.
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 41 }));
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import { resetForms, seed, queueSpy, button, fill, OP, FARM } from './manual-entry-helpers.js';
import { getAll, getById } from '../../src/data/store.js';
import * as EventEntity from '../../src/entities/event.js';
import * as Location from '../../src/entities/location.js';
import * as Window from '../../src/entities/event-paddock-window.js';
import * as Batch from '../../src/entities/batch.js';
import * as Entry from '../../src/entities/event-feed-entry.js';
import * as Check from '../../src/entities/event-feed-check.js';
import * as Item from '../../src/entities/event-feed-check-item.js';
import { openFeedCheckSheet } from '../../src/features/feed/check.js';
import { openEditFeedCheckDialog } from '../../src/features/events/edit-feed-check.js';
import { openEventDetailSheet, closeEventDetailSheet } from '../../src/features/events/detail.js';
import { getLiveRemainingForMove } from '../../src/calcs/feed-state.js';
let event, queued;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00-05:00')); resetForms();
  event = seed('events', EventEntity, { id: 'event', farmId: FARM });
  seed('locations', Location, { id: 'yard', farmId: FARM, name: 'Yard', type: 'confinement' });
  seed('eventPaddockWindows', Window, { eventId: event.id, locationId: 'yard', dateOpened: '2026-11-05' });
  seed('batches', Batch, { id: 'hay', name: 'Hay', feedTypeId: 'type', unit: 'bale', quantity: 10, remaining: 4 });
  seed('eventFeedEntries', Entry, { eventId: event.id, locationId: 'yard', batchId: 'hay', date: '2026-11-09', time: '13:00', quantity: 6 });
  queued = queueSpy();
});
afterEach(() => { closeEventDetailSheet(); vi.restoreAllMocks(); vi.useRealTimers(); });
function addForm() { openFeedCheckSheet(event, OP); return document.querySelector('#feed-check-sheet-panel'); }
function snapshot() { return JSON.stringify({ checks: getAll('eventFeedChecks'), items: getAll('eventFeedCheckItems'), batch: getById('batches', 'hay'), queue: localStorage.getItem('_sync_queue') }); }
it('real backdated Save clears the silent clock, requires explicit time, names it, and leaves a 12:59 check before a 13:00 feeding', async () => {
  const panel = addForm(); expect(panel.querySelector('input[type="time"]').value).not.toBe('');
  fill(panel, 'input[type="date"]', '2026-11-09', 'change');
  expect(panel.querySelector('input[type="time"]').value).toBe(''); expect(panel.textContent).toContain('Enter or confirm');
  fill(panel, 'input[type="number"]', '2'); const before = snapshot(); button(panel, 'Save feed check').click(); expect(snapshot()).toBe(before);
  fill(panel, 'input[type="time"]', '12:59'); expect(panel.querySelector('[data-testid="explicit-time"]').textContent).toContain('12:59');
  button(panel, 'Save feed check').click(); expect(getAll('eventFeedChecks')[0]).toMatchObject({ date: '2026-11-09', time: '12:59' });
  expect(getLiveRemainingForMove(event.id)['hay|yard']).toBe(8); expect(queued('event_feed_checks').at(-1)).toMatchObject({ date: '2026-11-09', time: '12:59' });
  expect(getById('batches', 'hay').remaining).toBe(4);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  openEventDetailSheet(event, OP, FARM); expect(document.querySelector('#event-detail-sheet-panel').textContent).toContain('12:59');
});
it('an explicit after-feeding check of eight does not add the captured six again', () => {
  const opening = seed('eventFeedChecks', Check, { eventId: event.id, date: '2026-11-09', time: '12:59' });
  seed('eventFeedCheckItems', Item, { feedCheckId: opening.id, batchId: 'hay', locationId: 'yard', remainingQuantity: 2 });
  const panel = addForm(); fill(panel, 'input[type="date"]', '2026-11-09', 'change'); fill(panel, 'input[type="time"]', '13:01');
  // The recorded count is independent of delivery totals and may exceed the estimate.
  fill(panel, 'input[type="number"]', '8'); button(panel, 'Save feed check').click();
  expect(getAll('eventFeedCheckItems').at(-1)?.remainingQuantity).toBe(8); expect(getLiveRemainingForMove(event.id)['hay|yard']).toBe(8);
});
it('existing historical Edit requires clock confirmation, preserves its clock, and Cancel/invalid input write nothing', () => {
  const check = seed('eventFeedChecks', Check, { eventId: event.id, date: '2026-11-09', time: '12:59' });
  const item = seed('eventFeedCheckItems', Item, { feedCheckId: check.id, batchId: 'hay', locationId: 'yard', remainingQuantity: 2 });
  openEditFeedCheckDialog(check, item, event, OP); let panel = document.querySelector('#edit-fc-panel'); let before = snapshot();
  expect(panel.querySelector('input[type="time"]').value).toBe('12:59'); button(panel, 'Save').click(); expect(snapshot()).toBe(before);
  button(panel, 'Confirm time 12:59').click(); expect(panel.querySelector('[data-testid="explicit-time"]').textContent).toContain('12:59');
  button(panel, 'Save').click(); expect(getById('eventFeedChecks', check.id).time).toBe('12:59');
  openEditFeedCheckDialog(getById('eventFeedChecks', check.id), getById('eventFeedCheckItems', item.id), event, OP); panel = document.querySelector('#edit-fc-panel'); before = snapshot();
  fill(panel, 'input[type="date"]', ''); fill(panel, 'input[type="time"]', ''); button(panel, 'Save').click(); expect(snapshot()).toBe(before);
  button(panel, 'Cancel').click(); expect(snapshot()).toBe(before);
});
