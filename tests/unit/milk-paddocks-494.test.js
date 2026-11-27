/**
 * #494 milk page UI + paddock collapse (Tim card t1724s6788). Client-side only.
 *  - summarizeGrazingBlocks(): groups sharing the exact paddock set → one entry.
 *  - paddockCell(): grazing date once; one entry per paddock set; > 6 chips → "+N more" / "Show less".
 *  - All view: grazing cell on the Day total / Pickup total row only; Pickups / Calves views keep it per row.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], proofs: [], missingTables: [] }));
vi.mock('../../src/data/supabase-client.js', async () => {
  const { makeBackupClient } = await import('./historical-backup-double.js');
  return { supabase: makeBackupClient(db) };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { _reset, setSyncAdapter, mergeRemote } from '../../src/data/store.js';
import * as MilkPickup from '../../src/entities/milk-pickup.js';
import * as CalfMilk from '../../src/entities/calf-milk-feeding.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import { summarizeGrazingBlocks, milkingGrazingOn } from '../../src/features/milk/milk-calcs.js';
import { buildMilkRows, _resetMilkPage, MILK_PADDOCK_CHIP_LIMIT } from '../../src/features/milk/index.js';

const OP = '00000000-0000-4000-8000-0000000494a1';
const FARM = '00000000-0000-4000-8000-0000000494f1';
const DAIRY_CLASS = '00000000-0000-4000-8000-0000000494c1';
const at = (m, d, h, min = 0) => new Date(2026, m - 1, d, h, min).toISOString();
const pickup = (id, ts, kg) => MilkPickup.create({ id, operationId: OP, farmId: FARM, pickedUpAt: ts, weightKg: kg });
const feeding = (id, ts, litres) => CalfMilk.create({ id, operationId: OP, farmId: FARM, fedAt: ts, volumeL: litres, kgPerLSnapshot: 1.0305073 });
const q = (root, id) => root.querySelector(`[data-testid="${id}"]`);
const qa = (root, id) => [...root.querySelectorAll(`[data-testid="${id}"]`)];
const PADDOCKS = Array.from({ length: 11 }, (_, i) => ({ id: `L${String(i + 1).padStart(2, '0')}`, name: `P${i + 1}` }));
const GROUPS = ['Milkers A', 'Milkers B', 'Milkers C'].map((name, i) => ({ id: `g${i + 1}`, name, isMilking: true, archivedAt: null }));

/** 3 milking groups all on event e1 → 11 paddocks (the Tim screenshot case), optional extra group on its own paddock. */
function seed({ totals = 'per_pickup', withSolo = false } = {}) {
  mergeRemote('operations', [{ id: OP, name: 'Op', unitSystem: 'imperial' }]);
  mergeRemote('farms', [{ id: FARM, operationId: OP, name: 'Home' }]);
  mergeRemote('farmSettings', [FarmSetting.create({ id: 'fs1', farmId: FARM, operationId: OP, dairyMode: 'on', milkTotalsMode: totals, milkGrazingOffsetDays: 1, milkKgPerL: 1.0305073 })]);
  mergeRemote('animalClasses', [{ id: DAIRY_CLASS, operationId: OP, name: 'Cows', species: 'dairy_cattle', role: 'cow' }]);
  mergeRemote('animals', [{ id: 'a1', operationId: OP, classId: DAIRY_CLASS, sex: 'female', active: true, cullDate: null }]);
  mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: FARM, fieldModeQuickActions: null }]);
  const groups = withSolo ? [...GROUPS, { id: 'g9', name: 'Fresh', isMilking: true, archivedAt: null }] : GROUPS;
  mergeRemote('groups', groups.map(g => ({ ...g, operationId: OP })));
  mergeRemote('eventGroupWindows', groups.map((g, i) => ({
    id: `gw${i}`, operationId: OP, groupId: g.id, eventId: g.id === 'g9' ? 'e9' : 'e1', dateJoined: '2026-11-01', dateLeft: null, headCount: 10, avgWeightKg: 500,
  })));
  const pws = PADDOCKS.map((p, i) => ({ id: `pw${i}`, operationId: OP, eventId: 'e1', locationId: p.id, dateOpened: '2026-11-01', dateClosed: null }));
  if (withSolo) pws.push({ id: 'pw99', operationId: OP, eventId: 'e9', locationId: 'L99', dateOpened: '2026-11-01', dateClosed: null });
  mergeRemote('eventPaddockWindows', pws);
  mergeRemote('locations', [...PADDOCKS, { id: 'L99', name: 'Solo' }].map(l => ({ ...l, operationId: OP, farmId: FARM, type: 'land' })));
  mergeRemote('milkPickups', [pickup('p1', at(11, 9, 6), 300), pickup('p2', at(11, 11, 6), 400)]);
  mergeRemote('calfMilkFeedings', [feeding('f1', at(11, 10, 7), 20), feeding('f2', at(11, 11, 8), 25)]);
}
const build = (view) => buildMilkRows({ view, from: '2026-11-01', to: '2026-11-30', farmId: FARM, groupIds: null, unitSystem: 'imperial' });

beforeEach(() => {
  localStorage.clear(); _reset(); _resetMilkPage();
  document.body.innerHTML = '';
  db.rows = {}; db.calls = []; db.proofs = []; db.missingTables = [];
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });

describe('#494 summarizeGrazingBlocks', () => {
  const block = (g, l) => ({ groupId: g, groupName: `G-${g}`, locationId: l, locationName: `N-${l}` });
  it('3 groups sharing the same 11 paddocks → 1 entry with 11 paddocks and the 3 group names once', () => {
    const blocks = [];
    for (const g of ['a', 'b', 'c']) for (const p of PADDOCKS) blocks.push(block(g, p.id));
    expect(blocks).toHaveLength(33);
    const out = summarizeGrazingBlocks(blocks);
    expect(out).toHaveLength(1);
    expect(out[0].groupIds).toEqual(['a', 'b', 'c']);
    expect(out[0].groupNames).toEqual(['G-a', 'G-b', 'G-c']);
    expect(out[0].paddocks.map(p => p.locationId)).toEqual(PADDOCKS.map(p => p.id));
  });
  it('2 groups on different paddocks → 2 entries', () => {
    const out = summarizeGrazingBlocks([block('a', 'L1'), block('b', 'L2')]);
    expect(out).toHaveLength(2);
    expect(out.map(e => [e.groupIds, e.paddocks.map(p => p.locationName)])).toEqual([[['a'], ['N-L1']], [['b'], ['N-L2']]]);
  });
  it('same set in a different order still merges; overlapping but unequal sets stay separate', () => {
    const out = summarizeGrazingBlocks([block('a', 'L1'), block('a', 'L2'), block('b', 'L2'), block('b', 'L1'), block('c', 'L1')]);
    expect(out.map(e => e.groupIds)).toEqual([['a', 'b'], ['c']]);
  });
  it('empty → empty', () => {
    expect(summarizeGrazingBlocks([])).toEqual([]);
    expect(summarizeGrazingBlocks()).toEqual([]);
  });
  it('works on real milkingGrazingOn output', () => {
    const ctx = {
      groups: GROUPS, locations: PADDOCKS, today: '2026-11-24', offsetDays: 1,
      groupWindows: GROUPS.map(g => ({ groupId: g.id, eventId: 'e1', dateJoined: '2026-11-01', dateLeft: null })),
      paddockWindows: PADDOCKS.map(p => ({ eventId: 'e1', locationId: p.id, dateOpened: '2026-11-01', dateClosed: null })),
    };
    const { blocks } = milkingGrazingOn('2026-11-11', ctx);
    expect(blocks).toHaveLength(33);
    expect(summarizeGrazingBlocks(blocks)).toHaveLength(1);
  });
});

describe('#494 paddock cell', () => {
  it('one grazing-date header; 3 groups × 11 paddocks → one entry, names once, 11 chips (6 shown)', () => {
    seed();
    const rows = build('pickups');
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      const cell = q(r, 'milk-paddock');
      expect(qa(cell, 'milk-paddock-date')).toHaveLength(1);
      expect(qa(cell, 'milk-paddock-group')).toHaveLength(1);
      expect(q(cell, 'milk-paddock-group').dataset.groupIds).toBe('g1,g2,g3');
      expect(q(cell, 'milk-paddock-group').textContent).toContain('Milkers A, Milkers B, Milkers C');
      const chips = qa(cell, 'milk-paddock-block');
      expect(chips).toHaveLength(11);
      expect(chips.filter(c => !c.hidden)).toHaveLength(MILK_PADDOCK_CHIP_LIMIT);
      expect(chips.every(c => c.dataset.groupId === 'g1,g2,g3')).toBe(true);
    }
    const cell = q(rows[0], 'milk-paddock');
    expect(cell.dataset.grazingDate).toBe('2026-11-10');
    expect(q(cell, 'milk-paddock-date').textContent).toBe('Grazed Nov 10, 26');
    // The date appears once per cell, not once per chip (was "· group · date" on every block).
    expect(cell.textContent.split('Nov 10').length - 1).toBe(1);
  });

  it('distinct paddock sets stay separate entries under the single date header', () => {
    seed({ withSolo: true });
    const cell = q(build('pickups')[0], 'milk-paddock');
    expect(qa(cell, 'milk-paddock-date')).toHaveLength(1);
    const entries = qa(cell, 'milk-paddock-group');
    expect(entries.map(e => e.dataset.groupIds)).toEqual(['g1,g2,g3', 'g9']);
    expect(qa(entries[1], 'milk-paddock-block').map(c => c.textContent)).toEqual(['Solo']);
    expect(q(entries[1], 'milk-paddock-more')).toBeNull();
  });

  it('> 6 paddocks: "+N more" / "Show less" toggle that never triggers the row click', () => {
    seed();
    const row = build('pickups')[0];
    document.body.appendChild(row);
    const rowClick = vi.fn();
    row.addEventListener('click', rowClick);
    const cell = q(row, 'milk-paddock');
    const more = q(cell, 'milk-paddock-more');
    const visible = () => qa(cell, 'milk-paddock-block').filter(c => !c.hidden).length;
    expect(more.textContent).toBe('+5 more');
    expect(more.getAttribute('type')).toBe('button');
    more.click();
    expect(rowClick).not.toHaveBeenCalled();
    expect(more.textContent).toBe('Show less');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(visible()).toBe(11);
    more.click();
    expect(rowClick).not.toHaveBeenCalled();
    expect(more.textContent).toBe('+5 more');
    expect(visible()).toBe(6);
    expect(document.querySelector('.sheet-wrap.open, [data-testid="milk-pickup-sheet"]')).toBeNull();
    // A click on the row itself still reaches the row.
    row.querySelector('.milk-row__what').click();
    expect(rowClick).toHaveBeenCalledTimes(1);
  });

  it('exactly 6 or fewer paddocks: no toggle', () => {
    const blocks = PADDOCKS.slice(0, 6).map(p => ({ groupId: 'g1', groupName: 'A', locationId: p.id, locationName: p.name }));
    expect(summarizeGrazingBlocks(blocks)[0].paddocks).toHaveLength(6);
    seed();
    mergeRemote('eventPaddockWindows', PADDOCKS.slice(6).map((p, i) => ({ id: `pw${i + 6}`, operationId: OP, eventId: 'e1', locationId: p.id, dateOpened: '2026-11-01', dateClosed: '2026-11-01' })));
    const cell = q(build('pickups')[0], 'milk-paddock');
    expect(qa(cell, 'milk-paddock-block')).toHaveLength(6);
    expect(q(cell, 'milk-paddock-more')).toBeNull();
  });
});

describe('#494 which rows carry the grazing cell', () => {
  const kinds = rows => rows.map(r => [r.dataset.testid, !!q(r, 'milk-paddock')]);
  it('All view, per_pickup: Pickup total rows only; nested pickup / calves rows omit it', () => {
    seed({ totals: 'per_pickup' });
    const rows = build('all');
    const totals = rows.filter(r => r.dataset.testid === 'milk-row-pickup-total');
    expect(totals).toHaveLength(2);
    expect(totals.every(r => q(r, 'milk-paddock'))).toBe(true);
    const children = rows.filter(r => r.classList.contains('milk-row--pickup') || r.classList.contains('milk-row--calves'));
    expect(children.length).toBeGreaterThanOrEqual(4);
    expect(children.every(r => !q(r, 'milk-paddock'))).toBe(true);
    expect(children.every(r => r.classList.contains('milk-row--child'))).toBe(true);
    expect(rows.filter(r => q(r, 'milk-paddock-date')).every(r => r.classList.contains('milk-row--total'))).toBe(true);
  });
  it('All view, spread_daily: Day total rows only', () => {
    seed({ totals: 'spread_daily' });
    const rows = build('all');
    const days = rows.filter(r => r.dataset.testid === 'milk-row-day');
    expect(days.length).toBeGreaterThan(0);
    expect(days.every(r => q(r, 'milk-paddock'))).toBe(true);
    const children = rows.filter(r => r.dataset.testid === 'milk-row-pickup' || r.dataset.testid === 'milk-row-calves');
    expect(children.length).toBe(4);
    expect(kinds(children).every(([, has]) => !has)).toBe(true);
  });
  it('Pickups-only and Calves-only views keep the grazing cell on every row', () => {
    seed();
    const p = build('pickups'), c = build('calves');
    expect(p).toHaveLength(2);
    expect(c).toHaveLength(2);
    for (const r of [...p, ...c]) {
      expect(q(r, 'milk-paddock')).toBeTruthy();
      expect(qa(r, 'milk-paddock-date')).toHaveLength(1);
      expect(r.classList.contains('milk-row--child')).toBe(false);
    }
  });
});

describe('#494 responsive .milk-* CSS in main.css', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');
  it.each([
    '.milk-screen', '.milk-toolbar', '.milk-groups', '.milk-offset', '.milk-list', '.milk-row',
    '.milk-row--total', '.milk-row--pickup', '.milk-row--calves', '.milk-row--est', '.milk-row--child', '.milk-row--clickable:hover',
    '.milk-row__when', '.milk-row__what', '.milk-row__farm', '.milk-paddock', '.milk-paddock__header',
    '.milk-paddock__group', '.milk-paddock__chips', '.milk-paddock__block', '.milk-paddock__more',
  ])('has a rule for %s', (sel) => {
    expect(css).toMatch(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,{:.\\[>]`));
  });
  it('desktop two-column grid at ≥768px; chips wrap with a gap; colours come from theme tokens', () => {
    const block = css.slice(css.indexOf('#494 Milk page'));
    expect(block).toMatch(/@media \(min-width: 768px\)\s*{[\s\S]*\.milk-row\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    expect(block).toMatch(/\.milk-paddock__chips\s*{[^}]*flex-wrap: wrap;[^}]*gap:/);
    expect(block).not.toMatch(/:[^;{}]*#[0-9a-fA-F]{3,8}\b/); // no raw hex colours
  });
});
