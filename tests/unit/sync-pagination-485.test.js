/**
 * @file #485 — live sync pulls page past the PostgREST 1,000-row cap.
 * The fake server answers order('id').range(from, to) exactly like PostgREST
 * with max_rows = 1000: rows sorted by id, sliced to the requested window.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const srv = vi.hoisted(() => ({ tables: {}, ranges: [], fail: null, onPage: null, forever: false }));
vi.mock('../../src/data/supabase-client.js', () => {
  const builder = (table) => {
    const filters = [];
    let order = null;
    const b = {
      gt(col, value) { filters.push(row => row[col] > value); return b; },
      eq(col, value) { filters.push(row => row[col] === value); return b; },
      order(col, opts) { order = { col, opts }; return b; },
      async range(from, to) {
        srv.ranges.push({ table, from, to, order });
        const page = srv.ranges.filter(r => r.table === table).length;
        const result = srv.fail && srv.fail.table === table && srv.fail.page === page
          ? { data: null, error: { message: `page ${page} failed` } }
          : srv.forever
            ? { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: `f${from + i}` })), error: null }
            : { data: (srv.tables[table] || []).filter(row => filters.every(f => f(row))).sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0)).slice(from, to + 1).map(row => ({ ...row })), error: null };
        srv.onPage?.(table, page);
        return result;
      },
    };
    return b;
  };
  return { supabase: { from: table => ({ select: () => builder(table) }) } };
});

import { fetchAllPages, PAGE_SIZE, MAX_PAGES } from '../../src/data/supabase-pagination.js';
import { CustomSync } from '../../src/data/custom-sync.js';
import { pullEntitiesStrict, invalidateRemotePulls } from '../../src/data/pull-remote.js';
import * as store from '../../src/data/store.js';
import { supabase } from '../../src/data/supabase-client.js';
import { logger } from '../../src/utils/logger.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** n rows in shuffled insertion order, so only order('id') can return them sorted. */
function rows(n, extra = () => ({})) {
  const out = Array.from({ length: n }, (_, i) => ({ id: id(i), updated_at: `2026-11-27T00:00:00.${String(i % 1000).padStart(3, '0')}Z`, ...extra(i) }));
  return out.reverse();
}
const opRow = i => ({ name: `Op ${i}`, unit_system: 'imperial', currency: 'USD', schema_version: 51 });
const sortedIds = n => Array.from({ length: n }, (_, i) => id(i));
const rangesFor = table => srv.ranges.filter(r => r.table === table).map(r => [r.from, r.to]);

beforeEach(() => {
  srv.tables = {}; srv.ranges = []; srv.fail = null; srv.onPage = null; srv.forever = false;
  store._reset(); localStorage.clear();
  vi.restoreAllMocks();
});

describe('#485 fetchAllPages', () => {
  it.each([
    [0, [[0, 999]]],
    [999, [[0, 999]]],
    [1000, [[0, 999], [1000, 1999]]],
    [2350, [[0, 999], [1000, 1999], [2000, 2999]]],
  ])('%i rows → pages %j, every page ordered by id ascending', async (n, expected) => {
    srv.tables.events = rows(n);
    const result = await fetchAllPages(() => supabase.from('events').select('*'));
    expect(result.error).toBeNull();
    expect(result.data.map(r => r.id)).toEqual(sortedIds(n));
    expect(rangesFor('events')).toEqual(expected);
    expect(result.pages).toBe(expected.length);
    for (const r of srv.ranges) expect(r.order).toEqual({ col: 'id', opts: { ascending: true } });
  });

  it('returns no rows (data null) and the offset on a page error', async () => {
    srv.tables.events = rows(2350); srv.fail = { table: 'events', page: 2 };
    const result = await fetchAllPages(() => supabase.from('events').select('*'));
    expect(result).toMatchObject({ data: null, error: { message: 'page 2 failed' }, offset: 1000, pages: 2 });
    expect(rangesFor('events')).toHaveLength(2);
  });

  it('stops with a clear error at the page cap when the server keeps returning full pages', async () => {
    srv.forever = true;
    const result = await fetchAllPages(() => supabase.from('events').select('*'), { maxPages: 3 });
    expect(result).toMatchObject({ data: null, capped: true, pages: 3, error: { message: 'pagination cap reached (3 pages of 1000 rows)' } });
    expect(rangesFor('events')).toHaveLength(3);
    expect(PAGE_SIZE).toBe(1000);
    expect(MAX_PAGES).toBe(1000);
  });

  it('stops between pages once isCurrent() turns false and returns no rows', async () => {
    srv.tables.events = rows(2350);
    let current = true;
    srv.onPage = (_t, page) => { if (page === 1) current = false; };
    const result = await fetchAllPages(() => supabase.from('events').select('*'), { isCurrent: () => current });
    expect(result).toMatchObject({ data: null, error: null, superseded: true });
    expect(rangesFor('events')).toHaveLength(1);
  });
});

describe('#485 CustomSync.pullAll / pull', () => {
  it('pullAll returns every row of a 2,350-row table in id order across 3 pages', async () => {
    srv.tables.event_feed_entries = rows(2350);
    const out = await new CustomSync().pullAll('event_feed_entries');
    expect(out.map(r => r.id)).toEqual(sortedIds(2350));
    expect(rangesFor('event_feed_entries')).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('pullAll with exactly 1,000 rows ends on an empty second page', async () => {
    srv.tables.animals = rows(1000);
    expect((await new CustomSync().pullAll('animals'))).toHaveLength(1000);
    expect(rangesFor('animals')).toEqual([[0, 999], [1000, 1999]]);
  });

  it('pullAll error on page 2 logs (with offset) and returns [] — never a partial table', async () => {
    const spy = vi.spyOn(logger, 'error');
    srv.tables.animals = rows(1500); srv.fail = { table: 'animals', page: 2 };
    expect(await new CustomSync().pullAll('animals')).toEqual([]);
    expect(spy).toHaveBeenCalledWith('sync', 'pullAll failed for animals', { error: 'page 2 failed', offset: 1000 });
  });

  it('pullAll stops fetching once superseded (#478) and returns []', async () => {
    srv.tables.animals = rows(2350);
    let current = true;
    srv.onPage = (_t, page) => { if (page === 2) current = false; };
    expect(await new CustomSync().pullAll('animals', { isCurrent: () => current })).toEqual([]);
    expect(rangesFor('animals')).toHaveLength(2);
  });

  it('pullAll hits the default page cap cleanly on a misbehaving server', async () => {
    const spy = vi.spyOn(logger, 'error');
    srv.forever = true;
    expect(await new CustomSync().pullAll('animals')).toEqual([]);
    expect(rangesFor('animals')).toHaveLength(MAX_PAGES);
    expect(spy).toHaveBeenCalledWith('sync', 'pullAll failed for animals', expect.objectContaining({ error: expect.stringMatching(/pagination cap reached/) }));
  });

  it('pull(since) pages the filtered rows: <1,000, exactly 1,000 and 2,350', async () => {
    const sync = new CustomSync();
    srv.tables.small = rows(10).map(r => ({ ...r, updated_at: '2026-11-28T00:00:00Z' }));
    expect(await sync.pull('small', '2026-11-27T12:00:00Z')).toHaveLength(10);
    expect(rangesFor('small')).toEqual([[0, 999]]);
    srv.tables.exact = [...rows(1000).map(r => ({ ...r, updated_at: '2026-11-28T00:00:00Z' })), { id: 'zz-old', updated_at: '2026-01-01T00:00:00Z' }];
    expect(await sync.pull('exact', '2026-11-27T12:00:00Z')).toHaveLength(1000);
    expect(rangesFor('exact')).toEqual([[0, 999], [1000, 1999]]);
    srv.tables.big = rows(2350).map(r => ({ ...r, updated_at: '2026-11-28T00:00:00Z' }));
    const big = await sync.pull('big', '2026-11-27T12:00:00Z');
    expect(big.map(r => r.id)).toEqual(sortedIds(2350));
    expect(rangesFor('big')).toHaveLength(3);
  });

  it('pull error on page 2 logs and returns []', async () => {
    const spy = vi.spyOn(logger, 'error');
    srv.tables.big = rows(2350); srv.fail = { table: 'big', page: 2 };
    expect(await new CustomSync().pull('big', '2000-01-01')).toEqual([]);
    expect(spy).toHaveBeenCalledWith('sync', 'pull failed for big', { error: 'page 2 failed', offset: 1000 });
  });
});

describe('#485 pullEntitiesStrict', () => {
  beforeEach(() => store.setSyncAdapter({ isOnline: async () => true, dispose() {} }));

  it('merges all 2,350 rows of a table paged across 3 requests', async () => {
    srv.tables.operations = rows(2350, opRow);
    const result = await pullEntitiesStrict(['operations']);
    expect(result).toEqual({ ok: true, error: null, byType: { operations: { pulled: 2350, error: null } } });
    expect(store.getAll('operations').map(o => o.id).sort()).toEqual(sortedIds(2350));
    expect(rangesFor('operations')).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('exactly 1,000 rows: the empty second page ends cleanly', async () => {
    srv.tables.operations = rows(1000, opRow);
    expect((await pullEntitiesStrict(['operations'])).ok).toBe(true);
    expect(store.getAll('operations')).toHaveLength(1000);
    expect(rangesFor('operations')).toHaveLength(2);
  });

  it('an error on page 2 merges nothing — not the earlier pages, not the earlier tables', async () => {
    srv.tables.operations = rows(1500, opRow);
    srv.tables.operation_members = rows(2350, i => ({ operation_id: id(0), user_id: `u${i}`, role: 'team_member' }));
    srv.fail = { table: 'operation_members', page: 2 };
    const result = await pullEntitiesStrict(['operations', 'operationMembers']);
    expect(result).toMatchObject({ ok: false, error: 'page 2 failed', byType: { operationMembers: { pulled: 0, error: 'page 2 failed' } } });
    expect(store.getAll('operations')).toEqual([]);
    expect(store.getAll('operationMembers')).toEqual([]);
    expect(rangesFor('operation_members')).toHaveLength(2);
  });

  it('an error on page 2 of the first table merges nothing', async () => {
    srv.tables.operations = rows(2350, opRow); srv.fail = { table: 'operations', page: 2 };
    expect((await pullEntitiesStrict(['operations'])).ok).toBe(false);
    expect(store.getAll('operations')).toEqual([]);
  });

  it('#478 invalidation mid-pagination stops fetching, reports superseded and merges no page', async () => {
    srv.tables.operations = rows(2350, opRow);
    srv.onPage = (_t, page) => { if (page === 1) invalidateRemotePulls(); };
    expect(await pullEntitiesStrict(['operations', 'operationMembers'])).toMatchObject({ ok: false, error: 'superseded' });
    expect(rangesFor('operations')).toHaveLength(1);
    expect(rangesFor('operation_members')).toHaveLength(0);
    expect(store.getAll('operations')).toEqual([]);
  });

  it('a misbehaving server hits the page cap and merges nothing', async () => {
    srv.forever = true;
    const result = await pullEntitiesStrict(['operations']);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pagination cap reached/);
    expect(store.getAll('operations')).toEqual([]);
  });
});
