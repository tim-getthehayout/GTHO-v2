import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import '../../src/calcs/core.js';
import { resetForms, seed, queueSpy, button, fill, OP, FARM } from './manual-entry-helpers.js';
import { getAll, getById, init } from '../../src/data/store.js';
import * as Group from '../../src/entities/group.js';
import * as Animal from '../../src/entities/animal.js';
import * as Membership from '../../src/entities/animal-group-membership.js';
import * as Weight from '../../src/entities/animal-weight-record.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupWindow from '../../src/entities/event-group-window.js';
import { renderAnimalsScreen } from '../../src/features/animals/index.js';
import { convert } from '../../src/utils/units.js';
let queued;
function setup(units = 'metric') {
  resetForms(units); seed('groups', Group, { id: 'herd', name: 'Herd' });
  seed('events', EventEntity, { id: 'event', farmId: FARM });
  seed('eventGroupWindows', GroupWindow, { id: 'window', groupId: 'herd', eventId: 'event', dateJoined: '2026-11-09', headCount: 5, avgWeightKg: 400 });
  for (const [id, fields, kg] of [['cow', { tagNum: 'C1' }, 400], ['lot', { name: 'Lot', isBulk: true, bulkHeadCount: 4 }, 1600]]) {
    seed('animals', Animal, { id, ...fields });
    seed('animalGroupMemberships', Membership, { animalId: id, groupId: 'herd', dateJoined: '2026-11-01' });
    seed('animalWeightRecords', Weight, { id: 'old-' + id, animalId: id, recordedAt: '2026-11-01T12:00:00', weightKg: kg, source: 'manual' });
  }
  const mount = document.createElement('main'); document.body.append(mount); renderAnimalsScreen(mount); queued = queueSpy(); button(mount, 'Weights').click();
  return document.querySelector('#wt-sheet-panel');
}
const snapshot = () => JSON.stringify({ records: getAll('animalWeightRecords'), windows: getAll('eventGroupWindows'), queue: localStorage.getItem('_sync_queue') });
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00-05:00')); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it.each(['metric', 'imperial'])('real mixed group Save stores dated group_update individual and lot-total weights (%s)', units => {
  const panel = setup(units); expect(panel.querySelectorAll('input[type="number"]')).toHaveLength(2); expect(panel.textContent).toContain('4 head');
  fill(panel, 'input[type="date"]', '2026-11-08', 'change'); fill(panel, '[data-testid="group-weight-cow"]', '500'); fill(panel, '[data-testid="group-weight-lot"]', '600');
  button(panel, 'Commit all changes').click();
  expect(panel.querySelector('.auth-error').textContent).toBe('');
  const factor = units === 'imperial' ? convert(1, 'weight', 'toMetric') : 1;
  const records = getAll('animalWeightRecords').filter(row => row.source === 'group_update'); expect(records).toHaveLength(2);
  expect(records.find(row => row.animalId === 'cow')).toMatchObject({ recordedAt: '2026-11-08T12:00:00', weightKg: 500 * factor });
  expect(records.find(row => row.animalId === 'lot').weightKg).toBeCloseTo(2400 * factor);
  expect(getById('eventGroupWindows', 'window').dateLeft).toBe('2026-11-10');
  expect(getAll('eventGroupWindows').find(row => !row.dateLeft)).toMatchObject({ dateJoined: '2026-11-10', headCount: 5 });
  expect(getAll('eventGroupWindows').find(row => !row.dateLeft).avgWeightKg).toBeCloseTo(580 * factor);
  expect(queued('animal_weight_records')).toHaveLength(2); expect(queued('animal_weight_records').find(row => row.animal_id === 'lot')).toMatchObject({ source: 'group_update', recorded_at: '2026-11-08T12:00:00' });
  init(); expect(getAll('animalWeightRecords').filter(row => row.source === 'group_update')).toHaveLength(2);
});
it('a bad later row or invalid date makes no earlier row, queue or window split', () => {
  const panel = setup(), before = snapshot(); fill(panel, '[data-testid="group-weight-cow"]', '500'); fill(panel, '[data-testid="group-weight-lot"]', '-1');
  button(panel, 'Commit all changes').click(); expect(snapshot()).toBe(before); expect(panel.querySelector('.auth-error').textContent).not.toBe('');
  fill(panel, '[data-testid="group-weight-lot"]', '600'); fill(panel, 'input[type="date"]', '', 'change'); button(panel, 'Commit all changes').click(); expect(snapshot()).toBe(before);
});
it('blank, Cancel and failed durable persistence leave all weights and group windows untouched', () => {
  let panel = setup(), before = snapshot(); button(panel, 'Commit all changes').click(); expect(snapshot()).toBe(before);
  panel = setup(); before = snapshot(); fill(panel, '[data-testid="group-weight-cow"]', '500'); button(panel, 'Cancel').click(); expect(snapshot()).toBe(before);
  panel = setup(); before = snapshot(); fill(panel, '[data-testid="group-weight-cow"]', '500'); fill(panel, '[data-testid="group-weight-lot"]', '600');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); }); button(panel, 'Commit all changes').click();
  expect(snapshot()).toBe(before); expect(panel.querySelector('.auth-error').textContent).not.toBe('');
});
it.each([NaN, Infinity, -1, 0, '500'])('the touched weight contract rejects invalid kg %s', weightKg => {
  const record = Weight.create({ operationId: OP, animalId: 'cow', recordedAt: '2026-11-08T12:00:00', weightKg, source: 'group_update' }); expect(Weight.validate(record).valid).toBe(false);
});
