import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { resetForms, seed, button, queueSpy, OP } from './manual-entry-helpers.js';
import * as FeedType from '../../src/entities/feed-type.js';
import { getAll, getById, init } from '../../src/data/store.js';
import { openFeedTypesSheet } from '../../src/features/locations/index.js';
import { convert } from '../../src/utils/units.js';
beforeEach(() => resetForms());
afterEach(() => vi.restoreAllMocks());
const root = () => document.querySelector('#feed-types-panel');
function weight(value) { const inputs = root().querySelectorAll('input[type="number"]'); inputs[1].value = value; }
it.each(['metric', 'imperial'])('actual %s Add, Edit and unchanged Save preserve kg and mapped payload', units => {
  resetForms(units); const queued = queueSpy(); openFeedTypesSheet(OP);
  root().querySelector('input[type="text"]').value = 'hay'; weight('100.25'); button(root(), 'Add type').click();
  const expected = units === 'metric' ? 100.25 : convert(100.25, 'weight', 'toMetric');
  let row = getAll('feedTypes')[0]; expect(row.defaultWeightKg).toBeCloseTo(expected, 10);
  expect(queued('feed_types').at(-1).default_weight_kg).toBeCloseTo(expected, 10);
  expect(root().textContent).toContain(units === 'metric' ? '(kg)' : '(lb)');
  button(root(), 'Edit').click(); button(root(), 'Save changes').click();
  expect(getById('feedTypes', row.id).defaultWeightKg).toBeCloseTo(expected, 10);
  button(root(), 'Edit').click(); weight('20.5'); button(root(), 'Save changes').click();
  row = getById('feedTypes', row.id); expect(row.defaultWeightKg).toBeCloseTo(units === 'metric' ? 20.5 : convert(20.5, 'weight', 'toMetric'), 10);
  init(); expect(getById('feedTypes', row.id).defaultWeightKg).toBe(row.defaultWeightKg);
});
it('blank is null, zero survives, negative or nonfinite weight never writes', () => {
  const row = seed('feedTypes', FeedType, { name: 'hay', category: 'hay', unit: 'bale', defaultWeightKg: 10 });
  const queued = queueSpy(); openFeedTypesSheet(OP); button(root(), 'Edit').click(); weight('-1'); button(root(), 'Save changes').click();
  expect(getById('feedTypes', row.id).defaultWeightKg).toBe(10); expect(queued('feed_types')).toHaveLength(0);
  weight('0'); button(root(), 'Save changes').click(); expect(getById('feedTypes', row.id).defaultWeightKg).toBe(0);
  button(root(), 'Edit').click(); weight(''); button(root(), 'Save changes').click(); expect(getById('feedTypes', row.id).defaultWeightKg).toBeNull();
  expect(FeedType.validate({ ...row, defaultWeightKg: Infinity }).valid).toBe(false);
});
