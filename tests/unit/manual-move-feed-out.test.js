// Historical batch-row UI/API regression fixture. Released pool forms run
// unmocked in manual-feed-pools and manual-pool-chart-refresh.
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 41 }));
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { resetForms, seed, queueSpy, button, fill, OP, FARM } from './manual-entry-helpers.js';
import { getAll, getById, init, update, remove } from '../../src/data/store.js';
import * as EventEntity from '../../src/entities/event.js';
import * as Location from '../../src/entities/location.js';
import * as Window from '../../src/entities/event-paddock-window.js';
import * as Batch from '../../src/entities/batch.js';
import * as Entry from '../../src/entities/event-feed-entry.js';
import { placeInitialBalance, balancesFor } from '../../src/features/feed/batch-balances.js';
import { openMoveFeedOutSheet } from '../../src/features/events/move-feed-out.js';
import { getLiveRemainingForMove } from '../../src/calcs/feed-state.js';
import { rowInstant } from '../../src/utils/date-utils.js';
let event, panel, queued;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00-05:00')); resetForms();
  for (const [id, type] of [['barn', 'storage'], ['other', 'storage'], ['pasture', 'confinement'], ['north', 'confinement'], ['south', 'confinement']]) seed('locations', Location, { id, farmId: FARM, name: id, type });
  event = seed('events', EventEntity, { id: 'source', farmId: FARM }); seed('events', EventEntity, { id: 'destination', farmId: FARM });
  for (const [eventId, locationId] of [['source','pasture'],['destination','north'],['destination','south']]) seed('eventPaddockWindows', Window, { eventId, locationId, dateOpened: '2026-11-05' });
  seed('batches', Batch, { id: 'hay', name: 'Hay', feedTypeId: 'hay-type', unit: 'bale', quantity: 10, remaining: 6 });
  placeInitialBalance({ operationId: OP, batchId: 'hay', locationId: 'barn', quantity: 6 });
  seed('eventFeedEntries', Entry, { id: 'original', eventId: event.id, locationId: 'pasture', batchId: 'hay', sourceLocationId: 'barn', date: '2026-11-09', time: '13:00', quantity: 4 });
  queued = queueSpy(); openMoveFeedOutSheet(event, OP, FARM, { preselectBatchId: 'hay', preselectLocationId: 'pasture' }); panel = document.querySelector('#move-feed-out-panel');
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const snapshot = () => JSON.stringify({ checks: getAll('eventFeedChecks'), items: getAll('eventFeedCheckItems'), entries: getAll('eventFeedEntries'), batch: getById('batches','hay'), balances: balancesFor('hay'), queue: localStorage.getItem('_sync_queue') });
function amountStep() {
  button(panel,'Next').click(); fill(panel,'input[type="number"]','3','change'); button(panel,'Next').click(); fill(panel,'input[type="number"]','2','change');
}
it('real inventory move Confirm atomically records the pre-move reading and removal, restores the exact holding once and queues canonical rows', () => {
  const before = snapshot(); amountStep(); expect(snapshot()).toBe(before);
  expect(panel.querySelector('[data-testid="move-return-hay-pasture"]').value).toBe('barn'); button(panel,'Next').click(); const confirm = button(panel,'Confirm'); confirm.click();
  expect(panel.querySelector('.auth-error').textContent).toBe('');
  const check = getAll('eventFeedChecks')[0], item = getAll('eventFeedCheckItems')[0], removal = getAll('eventFeedEntries').find(row => row.entryType === 'removal');
  expect(check).toMatchObject({ date: '2026-11-10', eventId: event.id }); expect(item).toMatchObject({ feedCheckId: check.id, remainingQuantity: 3, batchId:'hay', locationId:'pasture' });
  expect(removal).toMatchObject({ quantity: 2, destinationType: 'batch' }); expect(rowInstant(removal.date,removal.time) > rowInstant(check.date,check.time)).toBe(true);
  expect(getById('batches','hay').remaining).toBe(8); expect(balancesFor('hay').find(row => row.locationId==='barn').quantity).toBe(8); expect(getLiveRemainingForMove(event.id)['hay|pasture']).toBe(1);
  expect(queued('event_feed_checks')[0]).toMatchObject({ date:'2026-11-10' }); expect(queued('event_feed_entries')[0]).toMatchObject({ entry_type:'removal', quantity:2 });
  const saved = snapshot(); confirm.click(); expect(snapshot()).toBe(saved); init(); expect(getById('batches','hay').remaining).toBe(8);
});
it('real transfer requires an explicitly selected destination paddock and never changes inventory', () => {
  const before = snapshot(); amountStep(); fill(panel,'[data-testid="move-destination-type"]','event','change'); fill(panel,'[data-testid="move-destination-event"]','destination','change');
  expect(panel.querySelector('[data-testid="move-destination-location"]').value).toBe(''); button(panel,'Next').click(); expect(snapshot()).toBe(before); expect(panel.querySelector('.auth-error').textContent).not.toBe('');
  fill(panel,'[data-testid="move-destination-location"]','south','change'); button(panel,'Next').click(); expect(panel.textContent).toContain('south'); expect(panel.textContent).not.toContain('north'); button(panel,'Confirm').click();
  expect(getAll('eventFeedChecks')).toHaveLength(1); const inbound=getAll('eventFeedEntries').find(row=>row.eventId==='destination'); expect(inbound).toMatchObject({ locationId:'south',quantity:2,sourceEventId:'source' });
  expect(getById('batches','hay').remaining).toBe(6); expect(balancesFor('hay')[0].quantity).toBe(6); expect(getLiveRemainingForMove(event.id)['hay|pasture']).toBe(1); expect(getLiveRemainingForMove('destination')['hay|south']).toBe(2);
  expect(queued('event_feed_entries').find(row=>row.event_id==='destination')).toMatchObject({ location_id:'south',source_event_id:'source',quantity:2 });
});
it('invalid values, stale destinations, historical stock divergence and Cancel make no partial check, removal or credit', () => {
  let before=snapshot(); button(panel,'Next').click(); fill(panel,'input[type="number"]','-1','change'); button(panel,'Next').click(); button(panel,'Next').click(); expect(snapshot()).toBe(before);
  openMoveFeedOutSheet(event,OP,FARM,{preselectBatchId:'hay',preselectLocationId:'pasture'}); amountStep();
  fill(panel,'[data-testid="move-destination-type"]','event','change'); fill(panel,'[data-testid="move-destination-event"]','destination','change'); fill(panel,'[data-testid="move-destination-location"]','south','change'); button(panel,'Next').click();
  update('events','destination',{dateOut:'2026-11-10'},EventEntity.validate,EventEntity.toSupabaseShape,'events'); before=snapshot(); button(panel,'Confirm').click(); expect(snapshot()).toBe(before);
  openMoveFeedOutSheet(event,OP,FARM,{preselectBatchId:'hay',preselectLocationId:'pasture'}); amountStep(); button(panel,'Next').click(); update('batches','hay',{remaining:7},Batch.validate,Batch.toSupabaseShape,'batches'); before=snapshot(); button(panel,'Confirm').click(); expect(snapshot()).toBe(before); expect(panel.textContent).toContain('drift');
  openMoveFeedOutSheet(event,OP,FARM,{preselectBatchId:'hay',preselectLocationId:'pasture'}); before=snapshot(); button(panel,'Cancel').click(); expect(snapshot()).toBe(before);
});
it('failed durable storage leaves every compound row and balance unchanged, and explicit retry credits only once', () => {
  amountStep(); button(panel,'Next').click(); const confirm=button(panel,'Confirm'), before=snapshot();
  const fault=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');}); confirm.click(); expect(snapshot()).toBe(before); fault.mockRestore();
  confirm.click(); expect(getAll('eventFeedChecks')).toHaveLength(1); expect(getById('batches','hay').remaining).toBe(8); confirm.click(); expect(getById('batches','hay').remaining).toBe(8);
});
it('clock normalization keeps missing and explicit midnight equal while removals have signed quantities', () => {
  expect(rowInstant('2026-11-10',null)).toBe(rowInstant('2026-11-10','00:00:00.000'));
  expect(rowInstant('2026-11-10','12:00')).toBe(rowInstant('2026-11-10','12:00:00'));
  seed('eventFeedEntries', Entry, { eventId:event.id,locationId:'pasture',batchId:'hay',date:'2026-11-09',time:'14:00',quantity:1,entryType:'removal',destinationType:'batch' });
  expect(getLiveRemainingForMove(event.id)['hay|pasture']).toBe(3);
});

it('a removed source or destination location invalidates Confirm without orphan rows or stock changes', () => {
  amountStep(); fill(panel,'[data-testid="move-destination-type"]','event','change'); fill(panel,'[data-testid="move-destination-event"]','destination','change'); fill(panel,'[data-testid="move-destination-location"]','south','change'); button(panel,'Next').click();
  remove('locations','south','locations'); let before=snapshot(); button(panel,'Confirm').click(); expect(snapshot()).toBe(before); expect(panel.querySelector('.auth-error').textContent).not.toBe('');
  openMoveFeedOutSheet(event,OP,FARM,{preselectBatchId:'hay',preselectLocationId:'pasture'}); amountStep(); button(panel,'Next').click(); remove('events',event.id,'events'); before=snapshot(); button(panel,'Confirm').click(); expect(snapshot()).toBe(before);
});

it('an explicitly chosen different storage holding receives only the returned quantity', () => {
  amountStep(); fill(panel,'[data-testid="move-return-hay-pasture"]','other','change'); button(panel,'Next').click(); expect(panel.textContent).toContain('other'); button(panel,'Confirm').click();
  expect(getById('batches','hay').remaining).toBe(8); expect(balancesFor('hay').map(row=>[row.locationId,row.quantity]).sort()).toEqual([['barn',6],['other',2]]);
});
it('prevalidates every selected line before recording the first observation or returning stock', () => {
  seed('batches',Batch,{id:'other-hay',name:'Other hay',feedTypeId:'hay-type',unit:'bale',quantity:10,remaining:6}); placeInitialBalance({operationId:OP,batchId:'other-hay',locationId:'other',quantity:6});
  seed('eventFeedEntries',Entry,{eventId:event.id,locationId:'pasture',batchId:'other-hay',sourceLocationId:'other',date:'2026-11-09',time:'13:00',quantity:4});
  openMoveFeedOutSheet(event,OP,FARM,{preselectBatchId:'hay',preselectLocationId:'pasture'}); [...panel.querySelectorAll('div')].find(node=>node.textContent==='Other hay → pasture').click();
  button(panel,'Next').click(); button(panel,'Next').click(); button(panel,'Next').click(); update('batches','other-hay',{remaining:7},Batch.validate,Batch.toSupabaseShape,'batches');
  const before=snapshot(); button(panel,'Confirm').click(); expect(snapshot()).toBe(before); expect(getAll('eventFeedChecks')).toHaveLength(0); expect(panel.textContent).toContain('drift');
});
