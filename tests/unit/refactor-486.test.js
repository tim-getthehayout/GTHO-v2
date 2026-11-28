/**
 * @file #486 (Tim card t1699s6699) — behavior-preserving refactor guards.
 *  1. feed/index.js split: same public exports, < 500 lines, every module-level
 *     `let` has exactly one owner module, no circular imports among the feed
 *     screen modules, and the screen's sheet backdrops still close their sheets.
 *  2. All three shiftDate copies kept for strict parity (they throw RangeError
 *     on an invalid date; addDays returns 'NaN-NaN-NaN'). Valid-range parity
 *     vs addDays (date format, ± offsets, month / year ends, leap day, DST).
 *  3. unitLabel: the feed-package pluralizers in check.js / delivery.js are not
 *     the units-core API, so they are kept (documented).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { _reset, add, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedIndex from '../../src/features/feed/index.js';
import * as FeedTypesSheet from '../../src/features/feed/feed-types-sheet.js';
import * as FeedDayGoal from '../../src/features/feed/feed-day-goal.js';
import { addDays } from '../../src/utils/date-utils.js';
import { unitLabel as coreUnitLabel } from '../../src/utils/units-core.js';
import { FEED_UNITS } from '../../src/utils/feed-units.js';
import { shiftDate as runRateShiftDate } from '../../src/calcs/feed-run-rate.js';
import { shiftDate as milkShiftDate } from '../../src/features/milk/milk-calcs.js';
import { homePeriodRange } from '../../src/features/dashboard/home-dmi.js';

const read = p => readFileSync(resolve(process.cwd(), p), 'utf8');
const FEED = 'src/features/feed/';
const SPLIT = ['index.js', 'feed-day-goal.js', 'feed-types-sheet.js', 'batch-detail.js', 'batch-sheets.js'];

describe('#486 feed/index.js split', () => {
  it('keeps exactly the pre-split public exports (same functions, re-exported)', () => {
    // Pre-split export list of feed/index.js at 2bc4b02.
    expect(Object.keys(FeedIndex).sort()).toEqual(['buildFeedTypeRow', 'farmWideActiveDmiKg', 'openFeedTypeSheet', 'renderFeedScreen']);
    expect(FeedIndex.buildFeedTypeRow).toBe(FeedTypesSheet.buildFeedTypeRow);
    expect(FeedIndex.openFeedTypeSheet).toBe(FeedTypesSheet.openFeedTypeSheet);
    expect(FeedIndex.farmWideActiveDmiKg).toBe(FeedDayGoal.farmWideActiveDmiKg);
  });

  it('index.js is under 500 lines', () => {
    expect(read(FEED + 'index.js').split('\n').length).toBeLessThan(500);
  });

  it('every module-level `let` has exactly one owner module', () => {
    const owners = {};
    for (const f of SPLIT) {
      for (const m of read(FEED + f).matchAll(/^(?:export )?let (\w+)/gm)) (owners[m[1]] ||= []).push(f);
    }
    expect(owners).toEqual({
      unsubs: ['index.js'], showArchived: ['index.js'],
      feedTypeSheet: ['feed-types-sheet.js'],
      batchDetailSheet: ['batch-detail.js'], detailBatchId: ['batch-detail.js'], batchListRenderer: ['batch-detail.js'],
      batchSheet: ['batch-sheets.js'], batchMoveSheet: ['batch-sheets.js'], batchAdjustSheet: ['batch-sheets.js'],
    });
    // No module exports a mutable binding (importers could not reassign it anyway).
    for (const f of SPLIT) expect(read(FEED + f)).not.toMatch(/^export let /m);
  });

  it('no circular imports among the split modules (index → detail → sheets; types and goal are leaves)', () => {
    const graph = {};
    for (const f of SPLIT) {
      graph[f] = [...read(FEED + f).matchAll(/from '\.\/([\w-]+\.js)'/g)].map(m => m[1]).filter(d => SPLIT.includes(d));
    }
    expect(graph['feed-day-goal.js']).toEqual([]);
    expect(graph['feed-types-sheet.js']).toEqual([]);
    expect(graph['batch-sheets.js']).toEqual([]);
    expect(graph['batch-detail.js']).toEqual(['batch-sheets.js']);
    const seen = new Set(), stack = new Set();
    const visit = (n) => {
      expect(stack.has(n)).toBe(false);
      if (seen.has(n)) return;
      seen.add(n); stack.add(n);
      graph[n].forEach(visit);
      stack.delete(n);
    };
    SPLIT.forEach(visit);
  });

  describe('screen sheet backdrops and the open-detail delete still behave', () => {
    const OP = '00000000-0000-0000-0000-0000000486aa';
    const FT = '00000000-0000-0000-0000-0000000486f1';
    const BATCH = '00000000-0000-0000-0000-0000000486b1';
    const isOpen = id => document.getElementById(id).classList.contains('open');
    const backdrop = id => document.querySelector(`#${id} > .sheet-backdrop`);
    const click = tid => document.querySelector(`[data-testid="${tid}"]`).click();
    beforeEach(() => {
      setLocale('en', en);
      _reset();
      document.body.replaceChildren();
      setSyncAdapter(null);
      add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
      add('farms', FarmEntity.create({ operationId: OP, name: 'Farm' }), FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
      add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
      add('batches', BatchEntity.create({ id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch', unit: 'bale', quantity: 20, remaining: 10 }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
      const c = document.createElement('div');
      document.body.appendChild(c);
      FeedIndex.renderFeedScreen(c);
    });
    afterEach(() => vi.restoreAllMocks());

    it('backdrops are no-ops before a sheet was ever opened', () => {
      for (const id of ['feed-type-sheet-wrap', 'batch-sheet-wrap', 'batch-adjust-sheet-wrap', 'batch-detail-sheet-wrap', 'batch-move-sheet-wrap']) {
        expect(() => backdrop(id).click()).not.toThrow();
        expect(isOpen(id)).toBe(false);
      }
    });

    it('feed type, batch, adjust and detail sheets open and close from their backdrop', () => {
      for (const [btn, id] of [
        ['feed-add-type-btn', 'feed-type-sheet-wrap'],
        ['feed-add-batch-btn', 'batch-sheet-wrap'],
        [`feed-batch-adjust-${BATCH}`, 'batch-adjust-sheet-wrap'],
        [`feed-batch-details-${BATCH}`, 'batch-detail-sheet-wrap'],
      ]) {
        click(btn);
        expect(isOpen(id)).toBe(true);
        backdrop(id).click();
        expect(isOpen(id)).toBe(false);
      }
    });

    it('deleting the batch whose detail sheet is open closes the detail sheet (getDetailBatchId)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      click(`feed-batch-details-${BATCH}`);
      expect(isOpen('batch-detail-sheet-wrap')).toBe(true);
      click(`feed-batch-delete-${BATCH}`);
      expect(isOpen('batch-detail-sheet-wrap')).toBe(false);
    });
  });
});

describe('#486 shiftDate → addDays parity', () => {
  // The three pre-#486 copies were byte-identical: UTC midnight arithmetic.
  const utcCopy = (ymd, days) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const ZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'America/Santiago', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu'];
  const OFFSETS = [-800, -366, -365, -31, -30, -29, -14, -13, -7, -2, -1, 0, 1, 2, 6, 13, 28, 29, 30, 31, 59, 365, 366, 800];
  const EDGES = [
    '2024-02-28', '2024-02-29', '2024-03-01', '2025-02-28', '2025-03-01', '2028-02-29', '2100-02-28', '2000-02-29',
    '2025-12-31', '2026-01-01', '2026-01-31', '2026-04-30', '2026-06-30', '2026-12-31',
    '2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01', '2026-11-02', // US DST 2026
    '2026-03-28', '2026-03-29', '2026-10-25', '2026-04-05', '2026-09-27', '2026-09-06', '2026-04-04', // EU / AU / NZ / CL / BR-ish
    '1999-12-31', '1970-01-01',
  ];
  const sweep = [];
  for (let d = '2023-12-25'; d <= '2029-01-05'; d = utcCopy(d, 1)) sweep.push(d);
  const origTz = process.env.TZ;
  afterEach(() => { process.env.TZ = origTz; if (origTz === undefined) delete process.env.TZ; });

  it.each(ZONES)('addDays matches the UTC copy in %s (every day 2023-12-25..2029-01-05 × offsets, plus edges)', (zone) => {
    process.env.TZ = zone;
    // Node honors a runtime TZ change: prove the zone is really active.
    const probe = new Date('2026-07-01T12:00:00Z').getTimezoneOffset();
    if (zone === 'UTC') expect(probe).toBe(0);
    if (zone === 'America/New_York') expect(probe).toBe(240);
    const mismatches = [];
    for (const ymd of [...sweep, ...EDGES]) {
      for (const n of OFFSETS) {
        const want = utcCopy(ymd, n);
        const got = addDays(ymd, n);
        if (got !== want) mismatches.push(`${ymd}${n >= 0 ? '+' : ''}${n}: ${got} ≠ ${want}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('home-dmi period starts still match the UTC copy (valid range)', () => {
    expect(homePeriodRange('7d', { today: '2026-03-10' })).toEqual({ start: '2026-03-04', end: '2026-03-10' });
    expect(homePeriodRange('30d', { today: '2026-11-15' })).toEqual({ start: '2026-10-17', end: '2026-11-15' });
    expect(homePeriodRange('24h', { today: '2026-11-01' })).toEqual({ start: '2026-11-01', end: '2026-11-01' });
  });

  it('all three kept copies throw RangeError on an invalid date (addDays returns NaN-NaN-NaN)', () => {
    const homeSrc = read('src/features/dashboard/home-dmi.js');
    const homeFn = homeSrc.match(/function shiftDate\(ymd, days\) \{[\s\S]*?\n\}/)[0];
    const homeShiftDate = new Function(`${homeFn}; return shiftDate;`)();
    for (const fn of [runRateShiftDate, milkShiftDate, homeShiftDate]) {
      expect(() => fn('not-a-date', 1)).toThrow(RangeError);
      expect(fn('2026-03-08', 1)).toBe(addDays('2026-03-08', 1));
    }
    expect(addDays('not-a-date', 1)).toBe('NaN-NaN-NaN');
    expect(() => homePeriodRange('7d', { today: 'not-a-date' })).toThrow(RangeError);
    for (const f of ['src/calcs/feed-run-rate.js', 'src/features/dashboard/home-dmi.js', 'src/features/milk/milk-calcs.js']) {
      expect(read(f)).toMatch(/#486: kept \(not addDays\)/);
    }
  });
});

describe('#486 unitLabel: feed-package pluralizers are kept', () => {
  const extract = (file) => {
    const src = read(file);
    const m = src.match(/\nfunction unitLabel\(unit\) \{\n[\s\S]*?\n\}\n/);
    expect(m).toBeTruthy();
    expect(src).toMatch(/#486: kept on purpose/);
    return { text: m[0], fn: new Function(`${m[0]}; return unitLabel;`)() };
  };
  const check = extract(FEED + 'check.js');
  const delivery = extract(FEED + 'delivery.js');
  const INPUTS = [...FEED_UNITS, 'round-bale', 'square-bale', 'tub', 'bag', 'ton', 'lb', 'kg', 'pallet', '', null, undefined];

  it('the two local copies are identical to each other', () => {
    expect(check.text).toBe(delivery.text);
    for (const u of INPUTS) expect(check.fn(u)).toBe(delivery.fn(u));
  });

  it('units-core unitLabel is a different API (measureType, unitSystem): it throws for every feed unit, so no call site can switch', () => {
    expect(check.fn('bale')).toBe('bales');
    expect(check.fn('sq bale')).toBe('sq bales');
    expect(check.fn('lb')).toBe('lbs');
    expect(check.fn(undefined)).toBe('units');
    for (const u of INPUTS) {
      let core;
      try { core = coreUnitLabel(u, 'imperial'); } catch { core = Symbol('throws'); }
      expect(core).not.toBe(check.fn(u));
    }
  });
});
