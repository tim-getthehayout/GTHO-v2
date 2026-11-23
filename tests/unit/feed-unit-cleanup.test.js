/** @file Shared closed feed-unit list: save normalization, fold-on-read, pickers and pool counting. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import { renderFeedScreen } from '../../src/features/feed/index.js';
import { openFeedTypesSheet } from '../../src/features/locations/index.js';
import { inventoryPoolSnapshot } from '../../src/features/feed/pool-ledger.js';
import { replayFeedPools, poolKey, poolReading } from '../../src/calcs/feed-pools.js';
import { FEED_UNITS, POOL_COUNT_UNITS, normalizeFeedUnit, foldFeedUnit } from '../../src/utils/feed-units.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const BARN = '00000000-0000-0000-0000-0000000000c1';
const GRASS = '00000000-0000-0000-0000-0000000000f1';
const ALFALFA = '00000000-0000-0000-0000-0000000000f2';
const OLD = '00000000-0000-0000-0000-0000000000b1';

describe('normalizeFeedUnit / foldFeedUnit', () => {
  it('is the locked closed list in picker order', () => {
    expect(FEED_UNITS).toEqual(['bale', 'sq bale', 'ton', 'kg', 'lb', 'bag']);
  });
  it.each(['Bale', ' bale ', 'bales', 'bal', 'BALE', 'Bales', 'rb', 'round bale', 'Round  Bales'])('%j saves as bale', value => {
    expect(normalizeFeedUnit(value)).toBe('bale');
  });
  it.each(['sq bale', 'Sq Bale', 'sq  bales', 'square bale', 'Square Bales', 'small square', 'small squares'])('%j saves as sq bale', value => {
    expect(normalizeFeedUnit(value)).toBe('sq bale');
  });
  it.each([['tons', 'ton'], ['KG', 'kg'], ['kgs', 'kg'], ['lbs', 'lb'], ['Bags', 'bag']])('%j saves as %j', (value, unit) => {
    expect(normalizeFeedUnit(value)).toBe(unit);
  });
  it.each([['round-bale', 'bale'], ['Round-Bales', 'bale'], ['sq-bale', 'sq bale'], ['Sq-Bales', 'sq bale'], [' round - bale ', 'bale']])('hyphenated legacy %j saves as %j', (value, unit) => {
    expect(normalizeFeedUnit(value)).toBe(unit);
  });
  it.each(['', '   ', '-', 'flake', 'tonne', null, undefined, 5])('rejects %j', value => {
    expect(normalizeFeedUnit(value)).toBeNull();
  });
  it('folds unknown values to a cleaned form that never matches a list unit', () => {
    expect(foldFeedUnit('  Flake ')).toBe('flake');
    expect(foldFeedUnit(null)).toBeNull();
    expect(foldFeedUnit('Round-Bales')).toBe('bale');
    expect(FEED_UNITS).not.toContain(foldFeedUnit('half-ton'));
  });
});

describe('pool counting folds legacy spellings and counts sq bale', () => {
  const key = feedTypeId => poolKey({ eventId: 'e', locationId: 'p', feedTypeId });
  const feeding = (id, feedTypeId, unit, q = 2, w = 400) => ({ id, eventId: 'e', locationId: 'p', feedTypeId, kind: 'inventory_feeding', batchId: id, date: '2026-11-05', time: `1${id.length}:00`, quantity: q, unitSnapshot: unit, weightPerUnitKgSnapshot: w, dmPctSnapshot: 85 });
  const input = (types, entries, batches = []) => ({ eventId: 'e', feedTypes: types, entries, checks: [], items: [], batches });

  it('a pool fed from Bale history counts as bale, mixed with bale', () => {
    const pool = replayFeedPools(input([{ id: 'g', unit: 'bale' }], [feeding('a', 'g', 'Bale'), feeding('bb', 'g', 'bale')])).get(key('g'));
    expect(pool).toMatchObject({ q: 4, unit: 'bale', massBased: false });
    expect(poolReading(pool, 1, 'Bale').unitSnapshot).toBe('bale');
  });
  it('a legacy batch-read row (no snapshot) with batch unit Bale counts as bale', () => {
    const legacy = { id: 'l', eventId: 'e', locationId: 'p', batchId: 'B', date: '2026-11-05', time: '10:00', quantity: 3 };
    const pool = replayFeedPools(input([{ id: 'g', unit: 'Bale' }], [legacy], [{ id: 'B', feedTypeId: 'g', unit: 'Bale', weightPerUnitKg: 400, dmPct: 85 }])).get(key('g'));
    expect(pool).toMatchObject({ q: 3, unit: 'bale', massBased: false });
  });
  it('an all sq bale Alfalfa pool counts by bale', () => {
    expect(POOL_COUNT_UNITS.has('sq bale')).toBe(true);
    const pool = replayFeedPools(input([{ id: 'alf', unit: 'sq bale' }], [feeding('a', 'alf', 'sq bale', 10, 25), feeding('bb', 'alf', 'Sq Bales', 5, 25)])).get(key('alf'));
    expect(pool).toMatchObject({ q: 15, unit: 'sq bale', massBased: false });
  });
  it('a bag pool counts by bag when the type and snapshot units agree, and falls back to mass otherwise', () => {
    expect(POOL_COUNT_UNITS.has('bag')).toBe(true);
    const pool = replayFeedPools(input([{ id: 'sup', unit: 'bag' }], [feeding('a', 'sup', 'bag', 4, 20), feeding('bb', 'sup', 'Bags', 2, 20)])).get(key('sup'));
    expect(pool).toMatchObject({ q: 6, unit: 'bag', massBased: false });
    expect(poolReading(pool, 1, 'bag').unitSnapshot).toBe('bag');
    const mismatch = replayFeedPools(input([{ id: 'sup', unit: 'lb' }], [feeding('a', 'sup', 'bag', 4, 20)])).get(key('sup'));
    expect(mismatch).toMatchObject({ q: 80, unit: 'kg', massBased: true });
  });
  it('a legacy round-bale feed type agrees with bale feedings and counts by bale', () => {
    const pool = replayFeedPools(input([{ id: 'g', unit: 'round-bale' }], [feeding('a', 'g', 'bale', 3)])).get(key('g'));
    expect(pool).toMatchObject({ q: 3, unit: 'bale', massBased: false });
  });
  it('a unit that differs from its feed type still falls back to mass', () => {
    const pool = replayFeedPools(input([{ id: 'g', unit: 'bale' }], [feeding('a', 'g', 'sq bale')])).get(key('g'));
    expect(pool).toMatchObject({ massBased: true, unit: 'kg' });
  });
  it('new feedings snapshot the canonical unit of a legacy batch', () => {
    expect(inventoryPoolSnapshot({ feedTypeId: 'g', unit: 'Bale', weightPerUnitKg: 400, dmPct: 85 }).unitSnapshot).toBe('bale');
    expect(inventoryPoolSnapshot({ feedTypeId: 'g', unit: 'flake' }).unitSnapshot).toBe('flake');
  });
});

describe('real feed forms', () => {
  let confirmSpy;
  const $ = id => document.querySelector(`[data-testid="${id}"]`);
  const options = select => [...select.options].map(o => [o.value, o.textContent]);
  const change = (select, value) => { select.value = value; select.dispatchEvent(new Event('change')); };
  const inject = (select, value) => { const o = document.createElement('option'); o.value = value; o.textContent = value; select.appendChild(o); select.value = value; };

  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
    add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }), FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
    add('locations', LocationEntity.create({ id: BARN, operationId: OP, farmId: FARM, name: 'Hay Barn', type: 'storage' }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('feedTypes', FeedTypeEntity.create({ id: GRASS, operationId: OP, name: 'Grass', category: 'hay', unit: 'bale' }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    add('feedTypes', FeedTypeEntity.create({ id: ALFALFA, operationId: OP, name: 'Alfalfa', category: 'hay', unit: 'sq bale', dmPct: 88 }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  });
  function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderFeedScreen(container);
  }
  afterEach(() => vi.restoreAllMocks());

  function startBatch(name) {
    mount();
    $('feed-add-batch-btn').click();
    $('batch-sheet-name').value = name;
    $('batch-sheet-quantity').value = '10';
    $(`batch-location-item-${BARN}`).click();
  }

  it('batch unit is a picker over the shared list, labelled Round bale, defaulting to the feed type unit', () => {
    mount();
    $('feed-add-batch-btn').click();
    const unit = $('batch-sheet-unit');
    expect(unit.tagName).toBe('SELECT');
    expect(options(unit)).toEqual([['bale', 'Round bale'], ['sq bale', 'Sq bale'], ['ton', 'Ton'], ['kg', 'kg'], ['lb', 'lb'], ['bag', 'Bag']]);
    $('batch-sheet-feed-type').value = GRASS; $('batch-sheet-feed-type').dispatchEvent(new Event('change'));
    expect(unit.value).toBe('bale');
    change($('batch-sheet-feed-type'), ALFALFA);
    expect(unit.value).toBe('sq bale');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('new Alfalfa batch saves sq bale through the real form', () => {
    startBatch('Alfalfa lot');
    change($('batch-sheet-feed-type'), ALFALFA);
    $('batch-sheet-save').click();
    const batch = getAll('batches').find(b => b.name === 'Alfalfa lot');
    expect(batch).toMatchObject({ feedTypeId: ALFALFA, unit: 'sq bale' });
  });

  it('changing away from the type unit asks; declining restores it and accepting saves it', () => {
    startBatch('Grass lot');
    change($('batch-sheet-feed-type'), GRASS);
    confirmSpy.mockReturnValueOnce(false);
    change($('batch-sheet-unit'), 'ton');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Round bale');
    expect($('batch-sheet-unit').value).toBe('bale');
    change($('batch-sheet-unit'), 'ton');
    expect($('batch-sheet-unit').value).toBe('ton');
    $('batch-sheet-save').click();
    expect(getAll('batches').find(b => b.name === 'Grass lot').unit).toBe('ton');
  });

  it.each(['Bale', ' bale ', 'bales', 'bal'])('a submitted %j saves as bale', raw => {
    startBatch('Lot');
    change($('batch-sheet-feed-type'), GRASS);
    inject($('batch-sheet-unit'), raw);
    $('batch-sheet-save').click();
    expect(getAll('batches').find(b => b.name === 'Lot').unit).toBe('bale');
  });

  it('a value outside the list is refused with no write', () => {
    startBatch('Bad lot');
    inject($('batch-sheet-unit'), 'flake');
    $('batch-sheet-save').click();
    expect($('batch-sheet-status').textContent).toBe('Choose a unit from the list.');
    expect(getAll('batches')).toHaveLength(0);
    expect(getAll('batchLocationBalances')).toHaveLength(0);
  });

  it('the source picker offers opening, and editing a relabeled opening batch keeps opening', () => {
    add('batches', BatchEntity.create({ id: OLD, operationId: OP, feedTypeId: GRASS, name: 'Carried lot', source: 'opening', quantity: 37, remaining: 0, unit: 'bale', costPerUnit: 45, purchaseDate: '2026-03-15' }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    mount();
    $(`feed-batch-edit-${OLD}`).click();
    expect(options($('batch-sheet-source'))).toEqual([['purchase', 'Purchase'], ['harvest', 'Harvest'], ['opening', 'Opening'], ['transfer', 'Transfer']]);
    expect($('batch-sheet-source').value).toBe('opening');
    $('batch-sheet-save').click();
    expect(getById('batches', OLD)).toMatchObject({ source: 'opening', quantity: 37, costPerUnit: 45, purchaseDate: '2026-03-15' });
  });

  it('an existing Bale batch opens as Round bale and an ordinary save stores bale', () => {
    add('batches', BatchEntity.create({ id: OLD, operationId: OP, feedTypeId: GRASS, name: 'Nov lot', source: 'purchase', quantity: 150, remaining: 150, unit: 'Bale', costPerUnit: 56.66 }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    mount();
    expect(getById('batches', OLD).unit).toBe('Bale'); // nothing rewrites it on load
    $(`feed-batch-edit-${OLD}`).click();
    expect($('batch-sheet-unit').value).toBe('bale');
    $('batch-sheet-save').click();
    expect(getById('batches', OLD).unit).toBe('bale');
    expect(getById('batches', OLD).costPerUnit).toBe(56.66);
  });

  it('an unrecognised legacy batch unit must be chosen before saving; the record is untouched until then', () => {
    add('batches', BatchEntity.create({ id: OLD, operationId: OP, feedTypeId: GRASS, name: 'Odd lot', source: 'purchase', quantity: 5, remaining: 5, unit: 'flake' }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    mount();
    $(`feed-batch-edit-${OLD}`).click();
    expect($('batch-sheet-unit').value).toBe('');
    expect($('batch-sheet-unit').options[0].textContent).toBe('Choose a unit');
    $('batch-sheet-save').click();
    expect($('batch-sheet-status').textContent).toBe('Choose a unit from the list.');
    expect(getById('batches', OLD).unit).toBe('flake');
  });

  it('existing Alfalfa (sq bale) feed type opens and saves without changing its unit', () => {
    mount();
    $(`feed-type-edit-${ALFALFA}`).click();
    expect($('feed-type-sheet-unit').value).toBe('sq bale');
    expect(options($('feed-type-sheet-unit')).map(([v]) => v)).toEqual(FEED_UNITS);
    $('feed-type-sheet-save').click();
    expect(getById('feedTypes', ALFALFA)).toMatchObject({ unit: 'sq bale', dmPct: 88 });
  });

  it('a legacy round-bale feed type opens as Round bale and an ordinary save stores bale', () => {
    add('feedTypes', FeedTypeEntity.create({ id: OLD, operationId: OP, name: 'Old round', category: 'hay', unit: 'round-bale' }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    mount();
    expect(getById('feedTypes', OLD).unit).toBe('round-bale'); // not rewritten on load
    $(`feed-type-edit-${OLD}`).click();
    expect($('feed-type-sheet-unit').value).toBe('bale');
    $('feed-type-sheet-save').click();
    expect(getById('feedTypes', OLD).unit).toBe('bale');
  });

  it('feed-type sheet normalizes and refuses values outside the list', () => {
    mount();
    $('feed-add-type-btn').click();
    $('feed-type-sheet-name').value = 'Straw';
    inject($('feed-type-sheet-unit'), 'Square Bales');
    $('feed-type-sheet-save').click();
    expect(getAll('feedTypes').find(ft => ft.name === 'Straw').unit).toBe('sq bale');
    $('feed-add-type-btn').click();
    $('feed-type-sheet-name').value = 'Odd';
    inject($('feed-type-sheet-unit'), 'flake');
    $('feed-type-sheet-save').click();
    expect(getAll('feedTypes').find(ft => ft.name === 'Odd')).toBeUndefined();
  });

  it('Locations feed-types form uses the same list: Alfalfa keeps sq bale and round-bale is no longer offered', () => {
    // OI-0265 Ft1: Feed types dialog Edit opens the Feeds-screen dialog.
    document.querySelectorAll('[data-testid="feed-screen"]').forEach(n => n.remove());
    document.querySelectorAll('#feed-type-sheet-wrap').forEach(n => n.remove());
    openFeedTypesSheet(OP);
    const panel = document.getElementById('feed-types-panel');
    const edit = [...panel.querySelectorAll('button')].find(b => b.textContent === 'Edit' && b.closest('.ft-row').textContent.includes('Alfalfa'));
    edit.click();
    const unit = $('feed-type-sheet-unit');
    expect(options(unit).map(([v]) => v)).toEqual(FEED_UNITS);
    expect(options(unit).map(([v]) => v)).not.toContain('round-bale');
    expect(unit.value).toBe('sq bale');
    $('feed-type-sheet-save').click();
    expect(getById('feedTypes', ALFALFA).unit).toBe('sq bale');
    expect(getById('feedTypes', GRASS).unit).toBe('bale');
  });
});
