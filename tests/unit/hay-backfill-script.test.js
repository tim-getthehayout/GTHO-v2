/** Backfill script: deterministic ids, Tim's decision table, synthetic dry run and the emitted SQL text. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DECISIONS, URL_NAMESPACE, uuidv5, backfillId, transferToken, buildPlan, emitSql, rowsCsv, reportMarkdown, checkFeedTypes, parseArgs, notesHashPrefix, eventLocation,
} from '../../scripts/oi-0222-backfill.mjs';
import { NOTES, IDS, decisions, extracts } from '../fixtures/hay-backfill/fixture.mjs';

const plan = () => buildPlan({ notesText: NOTES, extracts: extracts(), decisions: decisions() });

describe('deterministic ids', () => {
  it('uses the RFC 4122 URL namespace and matches the fixed 044 standard ids', () => {
    expect(URL_NAMESPACE).toBe('6ba7b811-9dad-11d1-80b4-00c04fd430c8');
    expect(uuidv5('https://getthehayout.com/units/dose_units/capsule')).toBe('ce6066fe-4b4d-5933-8520-aab9102ee8cf');
    expect(uuidv5('https://getthehayout.com/units/input_product_units/bag')).toBe('3ce85e47-0115-5268-b89e-2b41b9a157e4');
  });
  it('names backfill rows by table and source key', () => {
    expect(backfillId('historical_feedings', 'notes:b3f3b99e:2:1')).toBe(uuidv5('https://getthehayout.com/backfill/oi-0222/historical_feedings/notes:b3f3b99e:2:1'));
    expect(backfillId('event_feed_entries', 'k')).not.toBe(backfillId('historical_feedings', 'k'));
    expect(transferToken('p')).toBe(uuidv5('https://getthehayout.com/backfill/oi-0222/transfer/p'));
    expect(backfillId('a', 'b')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("Tim's decision table", () => {
  const history = [
    ...DECISIONS.noteRows.map(([line, date, qty, type = 'untyped']) => ({ line, date, qty, type })),
    ...DECISIONS.proRates.flatMap(p => Array.from({ length: p.days }, () => ({ line: p.line, date: p.start, qty: p.qty, type: 'untyped' }))),
  ].filter(r => r.date < DECISIONS.eventLaneStart);
  const sum = rows => rows.reduce((s, r) => s + r.qty, 0);
  it('holds the 89 history rows and 454 units; the 54 rows with no written type are grass', () => {
    expect(history).toHaveLength(89);
    expect(sum(history)).toBe(454);
    const untyped = history.filter(r => r.type === 'untyped');
    expect(untyped).toHaveLength(54);
    expect(sum(untyped)).toBe(312);
    expect(sum(history.filter(r => r.type === 'grass'))).toBe(102);
    expect(sum(history.filter(r => r.type === 'peanut'))).toBe(40);
    expect(DECISIONS.historyFeedTypes).toEqual({ grass: 'Round bale- Grass', peanut: 'Round Bale- Peanut', untyped: 'Round bale- Grass' });
  });
  it('keeps the 647 lb / 50 lb at 85% snapshots and the 1,533.8 + 264 lb DM/day basis', () => {
    expect(DECISIONS.snapshots).toEqual({ round: { unit: 'bale', lb: 647, dmPct: 85 }, sq: { unit: 'sq bale', lb: 50, dmPct: 85 } });
    const perDay = rows => Math.round(rows.reduce((s, b) => s + b.head * b.lb * b.dmiPct / 100, 0) * 10) / 10;
    expect(perDay(DECISIONS.basis.filter(b => b.species === 'beef_cattle'))).toBe(1533.8);
    expect(perDay(DECISIONS.basis.filter(b => b.species === 'sheep'))).toBe(264);
    expect(DECISIONS.basis.reduce((s, b) => s + (b.species === 'beef_cattle' ? b.head : 0), 0)).toBe(79);
  });
  it('carries the locked offsets, true-ups, dates and relabels', () => {
    expect(DECISIONS.batches.map(b => [b.name, b.reconcile.prev - b.reconcile.next, b.trueUp, b.adjustmentDate, b.end, b.relabel?.source ?? null, b.relabel?.purchaseDate ?? null]))
      .toEqual([
        ['Oak Field Barn', 37, 8.86, '2026-05-03', 0, 'opening', '2026-03-15'],
        ['Tarped', 40, -5, '2026-05-03', 0, 'opening', '2026-03-15'],
        ['Peanut Hay', 17, -15, '2026-05-03', 0, 'opening', '2026-03-15'],
        ['Alfalfa Small Squares', 78, -39.5, '2026-11-03', 15, null, null],
      ]);
    expect(DECISIONS.batches.filter(b => b.relabel && b.relabel.fromPurchaseDate !== b.relabel.purchaseDate).map(b => b.key ?? b.name)).toEqual(['Peanut Hay (opening)']);
  });
  it("finds last season's Peanut Hay by name plus quantity 17 and its before/after purchase date; '(opening)' is only a label", () => {
    const peanut = DECISIONS.batches.find(b => b.key === 'Peanut Hay (opening)');
    expect(peanut).toMatchObject({ name: 'Peanut Hay', quantity: 17, match: { quantity: 17, purchaseDates: ['2025-12-31', '2026-03-15'] } });
    expect(peanut.match.purchaseDates).toEqual([peanut.relabel.fromPurchaseDate, peanut.relabel.purchaseDate]);
    expect(DECISIONS.batches.map(b => b.name)).not.toContain('Peanut Hay (opening)');
    expect(DECISIONS.noteEvents['133:1'].batch).toBe('Peanut Hay (opening)');
    expect(DECISIONS.v1.batches['Peanut Hay'].v2).toBe('Peanut Hay (opening)');
  });
  it('puts notes line 132 on K - 5', () => {
    expect(DECISIONS.noteEvents['132:1'].location).toBe('K - 5');
  });
});

describe('eventLocation', () => {
  const ev = { id: 'abcdef12-0000-4000-8000-000000000000', locs: 'J3 - 4, K - 1, K - 3, K - 5', wins: 'J3 - 4@2026-03-19..; K - 5@2026-03-19..' };
  it('returns a named paddock of the event', () => {
    expect(eventLocation(ev, 'K - 5')).toBe('K - 5');
  });
  it('stops instead of falling back when the named location is not in the event', () => {
    expect(() => eventLocation(ev, 'K - 9')).toThrow(/location "K - 9" is not a paddock of v2 event abcdef12/);
    expect(() => eventLocation(ev, 'J3 - 4, K - 1, K - 3, K - 5')).toThrow(/is not a paddock/);
  });
  it('makes the dry run stop when a notes event names a location outside its event', () => {
    const d = decisions();
    d.noteEvents['5:1'].location = 'East';
    expect(() => buildPlan({ notesText: NOTES, extracts: extracts(), decisions: d })).toThrow(/location "East" is not a paddock/);
  });
});

describe('batch lookup disambiguator', () => {
  it('carries name, quantity and purchase dates into the SQL lookup for a keyed batch', () => {
    const d = decisions();
    Object.assign(d.batches[0], { key: 'Grass lot (opening)', name: 'Grass lot', match: { quantity: 10, purchaseDates: ['2026-01-01', '2026-03-15'] } });
    d.noteEvents['5:1'].batch = 'Grass lot (opening)';
    d.v1.batches['Grass lot'].v2 = 'Grass lot (opening)';
    const p = buildPlan({ notesText: NOTES, extracts: extracts(), decisions: d });
    const base = buildPlan({ notesText: NOTES, extracts: extracts(), decisions: decisions() });
    expect(p.summary.total).toEqual(base.summary.total);
    const sql = emitSql(p, { operationId: '00000000-0000-4000-8000-000000000001' });
    expect(sql).toContain("('batch', 'Grass lot (opening)', 'Grass lot', 10, ARRAY['2026-01-01'::date, '2026-03-15'::date])");
    expect(sql).toMatch(/b\.name = ref\.name\s+AND \(ref\.quantity IS NULL OR b\.quantity = ref\.quantity\) AND \(ref\.dates IS NULL OR b\.purchase_date = ANY \(ref\.dates\)\)/);
    expect(sql).toContain('adjustment:reverse:Grass lot');
  });
  it('refuses to emit SQL for a batch with no guarded decision', () => {
    const d = decisions();
    d.noteEvents['5:1'].batch = 'Unknown lot';
    d.v1.batches['Grass lot'].v2 = 'Unknown lot';
    expect(() => emitSql(buildPlan({ notesText: NOTES, extracts: extracts(), decisions: d }), { operationId: '00000000-0000-4000-8000-000000000001' })).toThrow();
  });
});

describe('synthetic dry run', () => {
  it('refuses a notes file with another hash', () => {
    expect(() => buildPlan({ notesText: `${NOTES}x`, extracts: extracts(), decisions: decisions() })).toThrow(/sha256 prefix/);
  });
  it('splits lanes, keeps raw lines, and applies copy, supersede, skip and exclude rules', () => {
    const p = plan();
    expect(p.history.map(r => [r.sourceKey.split(':').slice(2).join(':'), r.qty, r.feedType])).toEqual([
      ['2:1', 4, 'Hay'], ['4:1', 2, 'Peanut'], ['4:2', 3, 'Hay'], ['3:1', 2, 'Hay'], ['3:2', 2, 'Hay'],
    ]);
    expect(p.history[0].raw).toBe('10/1- fed 4 bales');
    expect(p.history[3]).toMatchObject({ date: '2025-12-16', raw: '12/16- Fed 4 bales' });
    expect(p.entries.map(r => [r.sourceKey, r.qty, r.batch, r.eventId, r.location])).toEqual([
      [`notes:${notesHashPrefix(NOTES)}:5:1`, 2, 'Grass lot', IDS.ev1, 'North'],
      ['v1:delivery:5001', 3, 'Grass lot', IDS.ev1, 'North'],
    ]);
    expect(p.notWritten.map(r => [r.sourceKey.replace(/^notes:[0-9a-f]+/, 'notes'), r.status])).toEqual([
      ['notes:6:1', 'sheep-peanut'], ['notes:7:1', 'matched-skipped'], ['v1:delivery:5001000', 'excluded-copy'], ['v1:delivery:5002', 'superseded'],
    ]);
    expect(p.transfers).toHaveLength(1);
    expect(p.transfers[0]).toMatchObject({ removal: { eventId: IDS.ev1, qty: -0.5 }, carry: { eventId: IDS.ev2, qty: 0.5, location: 'South' }, token: transferToken('pair-1') });
    expect(p.checkItems.map(r => [r.sourceKey, r.qty, r.checkId, r.location])).toEqual([['v1:check-item:7001:1', 1.5, IDS.check, 'North']]);
  });
  it('summarizes the match fields', () => {
    const s = plan().summary;
    expect(s.total).toEqual({ rows: 7, units: 18, lbDm: Math.round(18 * 647 * 0.85 * 10) / 10 });
    expect(s.historyLane.rows).toBe(5);
    expect(s.historyNoWrittenType).toBe(3);
    expect(s.eventLane).toMatchObject({ rows: 2, units: 5, fromV1: 1, fromNotes: 1 });
    expect(s.transfers).toEqual({ rows: 2, pairs: 1, netUnits: 0 });
    expect(s.checkItems).toEqual({ rows: 1, checks: 1 });
    expect(s.trueUps).toEqual([{ batch: 'Grass lot', fedTotal: 6, offset: { prev: 0, next: 5, delta: 5 }, trueUp: { prev: 4, next: 0, delta: -4 }, adjustmentDate: '2026-05-03', remainingAfter: 0 }]);
    expect(s.basis).toEqual({ rows: 2, cattleLbDmPerDay: 250, cattleHead: 10, sheepLbDmPerDay: 66 });
    expect(s.ids).toBe(14);
  });
  it('aborts when the computed true-up differs from the locked value', () => {
    const d = decisions(); d.batches = [{ ...d.batches[0], trueUp: -3 }];
    expect(() => buildPlan({ notesText: NOTES, extracts: extracts(), decisions: d })).toThrow(/true-up/);
  });
  it('aborts on an ambiguous event pairing without a pin, and follows a pin', () => {
    const x = extracts();
    x.v2_events.push({ ...x.v2_events[0], id: 'eeee0009-0000-4000-8000-000000000009' });
    expect(() => buildPlan({ notesText: NOTES, extracts: x, decisions: decisions() })).toThrow(/no single pin/);
    const d = decisions(); d.eventPins = { 101: 'eeee0001' };
    expect(buildPlan({ notesText: NOTES, extracts: x, decisions: d }).entries[1].eventId).toBe(IDS.ev1);
  });
  it('writes CSV and report with ids only for written rows', () => {
    const p = plan();
    const csv = rowsCsv(p).trim().split('\n');
    expect(csv).toHaveLength(1 + 5 + 2 + 4 + 2 + 1);
    expect(csv[0]).toBe('id,source_key,row_kind,lane,status,source,notes_line,v1_delivery_id,date,month,qty,unit,feed_type,batch,species,group_label,place,v2_event,v2_location,lb_dm,raw');
    expect(csv.find(line => line.includes('v1:delivery:5001000'))).toMatch(/^,/);
    expect(reportMarkdown(p, null)).toContain('no v2_feed_types.json extract');
  });
  it('checks the run-time feed type lookup against an extract', () => {
    const p = plan();
    expect(checkFeedTypes(p, [{ name: 'Hay', archived: false }, { name: 'Peanut', archived: false }]).every(c => c.ok)).toBe(true);
    expect(checkFeedTypes(p, [{ name: 'Hay' }, { name: 'Hay' }, { name: 'Peanut', archived: true }]).map(c => [c.name, c.matches])).toEqual([['Hay', 2], ['Peanut', 0]]);
  });
});

describe('emitted SQL', () => {
  it('needs a uuid operation id', () => {
    expect(() => emitSql(plan(), {})).toThrow(/operation-id/);
  });
  it('is one guarded transaction of idempotent inserts with reconcile adjustments', () => {
    const sql = emitSql(plan(), { operationId: IDS.op });
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
    expect(sql.indexOf('DO $guard$')).toBeLessThan(sql.indexOf('INSERT INTO public.historical_feedings'));
    const inserts = sql.match(/INSERT INTO public\.\w+ \(id,[\s\S]*?;\n/g);
    expect(inserts).toHaveLength(14);
    for (const insert of inserts) expect(insert).toMatch(/ON CONFLICT( \(id\))? DO NOTHING;\n$/);
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP (TABLE|COLUMN|INDEX|POLICY|CONSTRAINT)\b|\bALTER\b/);
    expect(sql.match(/'reconcile'/g).length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("source = 'opening', purchase_date = '2026-03-15'");
  });
});

describe('script boundaries', () => {
  const source = readFileSync(path.resolve(__dirname, '../../scripts/oi-0222-backfill.mjs'), 'utf8');
  it('never opens a database connection or reads credentials', () => {
    expect(source).not.toMatch(/supabase|createClient|postgres:\/\/|PGPASSWORD|process\.env|fetch\(|node:net|node:http/i);
    expect(source).toMatch(/^import \{ createHash \} from 'node:crypto';$/m);
  });
  it('parses the CLI; dry run is the default', () => {
    expect(parseArgs(['--notes', 'n', '--extracts', 'e'])).toMatchObject({ dryRun: true, notes: 'n', extracts: 'e' });
    expect(parseArgs(['--notes', 'n', '--extracts', 'e', '--emit-sql', 'o.sql', '--operation-id', IDS.op])).toMatchObject({ emitSql: 'o.sql', operationId: IDS.op });
    expect(() => parseArgs(['--notes', 'n'])).toThrow(/usage/);
    expect(() => parseArgs(['--notes', 'n', '--extracts', 'e', '--apply'])).toThrow(/unknown argument/);
  });
});
