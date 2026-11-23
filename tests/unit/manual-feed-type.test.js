// OI-0265 Ft1: the Feed types dialog's inline form is retired; Add / Edit open the
// Feeds-screen dialog (#feed-type-sheet-panel). Same kg round-trip guarantees.
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { resetForms, seed, button, queueSpy, OP } from './manual-entry-helpers.js';
import * as FeedType from '../../src/entities/feed-type.js';
import { getAll, getById, init } from '../../src/data/store.js';
import { openFeedTypesSheet } from '../../src/features/locations/index.js';
import { convert } from '../../src/utils/units.js';
beforeEach(() => resetForms());
afterEach(() => vi.restoreAllMocks());
const root = () => document.querySelector('#feed-types-panel');
const dlg = () => document.querySelector('#feed-type-sheet-panel');
const $ = id => dlg().querySelector(`[data-testid="${id}"]`);
function weight(value) { $('feed-type-sheet-weight').value = value; }
const save = () => $('feed-type-sheet-save').click();
const flush = () => new Promise(r => setTimeout(r, 0)); // store notify is microtask-coalesced
it.each(['metric', 'imperial'])('actual %s Add, Edit and unchanged Save preserve kg and mapped payload', async units => {
  resetForms(units); const queued = queueSpy(); openFeedTypesSheet(OP);
  root().querySelector('[data-testid="feed-types-dialog-add"]').click();
  $('feed-type-sheet-name').value = 'hay'; weight('100.25'); save();
  const expected = units === 'metric' ? 100.25 : convert(100.25, 'weight', 'toMetric');
  let row = getAll('feedTypes')[0]; expect(row.defaultWeightKg).toBeCloseTo(expected, 10);
  expect(queued('feed_types').at(-1).default_weight_kg).toBeCloseTo(expected, 10);
  expect(dlg().textContent).toContain(units === 'metric' ? '(kg)' : '(lbs)');
  await flush();
  button(root(), 'Edit').click(); save();
  // The Feeds dialog shows imperial weight as whole lbs (toFixed(0)); metric is exact.
  if (units === 'metric') expect(getById('feedTypes', row.id).defaultWeightKg).toBeCloseTo(expected, 10);
  else expect(getById('feedTypes', row.id).defaultWeightKg).toBeCloseTo(convert(100, 'weight', 'toMetric'), 10);
  button(root(), 'Edit').click(); weight('20.5'); save();
  row = getById('feedTypes', row.id); expect(row.defaultWeightKg).toBeCloseTo(units === 'metric' ? 20.5 : convert(20.5, 'weight', 'toMetric'), 10);
  init(); expect(getById('feedTypes', row.id).defaultWeightKg).toBe(row.defaultWeightKg);
});
it('blank is null, zero survives, negative or nonfinite weight never writes', () => {
  const row = seed('feedTypes', FeedType, { name: 'hay', category: 'hay', unit: 'bale', defaultWeightKg: 10 });
  const queued = queueSpy(); openFeedTypesSheet(OP); button(root(), 'Edit').click(); weight('-1'); save();
  expect(getById('feedTypes', row.id).defaultWeightKg).toBe(10); expect(queued('feed_types')).toHaveLength(0);
  weight('0'); save(); expect(getById('feedTypes', row.id).defaultWeightKg).toBe(0);
  button(root(), 'Edit').click(); weight(''); save(); expect(getById('feedTypes', row.id).defaultWeightKg).toBeNull();
  expect(FeedType.validate({ ...row, defaultWeightKg: Infinity }).valid).toBe(false);
});
