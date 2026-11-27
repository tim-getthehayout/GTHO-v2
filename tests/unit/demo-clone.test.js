/**
 * #450 Demo Dairy clone — unit tests for scripts/demo-clone.mjs (synthetic data only).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  uuidv5, zonedIso, cloneOperation, parseArgs, assertOutsideRepo, main, REPO_ROOT,
  EMPTIED_TABLES, EXCLUDED_TABLES, STANDARD_UNIT_IDS, DAIRY_DEFAULTS, DEMO_NAMESPACE,
} from '../../scripts/demo-clone.mjs';
import { BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
import { ASSISTANT_TABLES, SERVER_ASSISTANT_TABLES } from '../../src/features/assistant/schema.js';
import { syntheticSource, fid, REAL_OP, REAL_USER, REAL_MEMBER, DEMO_OP, DEMO_USER } from './demo-clone-fixture.js';

const clone = (opts = {}, source = syntheticSource()) => cloneOperation(source, { demoOperationId: DEMO_OP, today: '2026-11-26', ...opts });
const ns = uuidv5(DEMO_NAMESPACE, DEMO_OP);
const map = old => uuidv5(ns, old);

describe('uuid v5 and time helpers', () => {
  it('matches the RFC 4122 v5 test vector', () => {
    expect(uuidv5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });
  it('zonedIso converts a local wall time in both DST states', () => {
    expect(zonedIso('2026-11-26', 6, 30, 'America/New_York')).toBe('2026-11-26T11:30:00.000Z');
    expect(zonedIso('2026-07-01', 6, 30, 'America/New_York')).toBe('2026-07-01T10:30:00.000Z');
  });
});

describe('table set', () => {
  it('outputs exactly the 68-table browser restore set at schema 51', () => {
    const { backup } = clone();
    expect(backup.schema_version).toBe(51);
    expect(backup.tables.operations[0].schema_version).toBe(51);
    expect(Object.keys(backup.tables).sort()).toEqual([...BROWSER_FK_ORDER].sort());
    expect(BROWSER_FK_ORDER).toHaveLength(68);
  });
  it('drops members, logs, release notes and server assistant tables from a CP-55 snapshot', () => {
    const { backup } = clone({}, syntheticSource({ format: 'dir' }));
    for (const table of EXCLUDED_TABLES) expect(backup.tables).not.toHaveProperty(table);
    expect(Object.keys(backup.tables).sort()).toEqual([...BROWSER_FK_ORDER].sort());
  });
  it('a snapshot with two operations needs --source-operation-id', () => {
    const src = syntheticSource({ format: 'dir', extraOperation: true });
    expect(() => clone({}, src)).toThrow(/source-operation-id/);
    expect(clone({ sourceOperationId: REAL_OP }, src).backup.tables.farms).toHaveLength(1);
  });
  it('rows of another operation are never cloned', () => {
    const { backup } = clone();
    expect(backup.tables.farms).toHaveLength(1);
    expect(backup.tables.events).toHaveLength(2);
    expect(Object.values(backup.tables).flat().every(r => r.operation_id == null || r.operation_id === DEMO_OP)).toBe(true);
  });
});

describe('ids and FKs', () => {
  it('is deterministic and remaps every id with uuidv5(demo namespace, old id); the real operation becomes the demo operation', () => {
    const a = clone().backup, b = clone().backup;
    expect({ ...a, exported_at: null }).toEqual({ ...b, exported_at: null });
    expect(a.operation_id).toBe(DEMO_OP);
    expect(a.tables.operations[0].id).toBe(DEMO_OP);
    expect(a.tables.events.map(e => e.id).sort()).toEqual([fid('events:a'), fid('events:b')].map(map).sort());
  });
  it('remaps self-FKs and secondary FKs', () => {
    const t = clone().backup.tables;
    const calf = t.animals.find(a => a.id === map(fid('animals:calf1')));
    expect(calf.dam_id).toBe(map(fid('animals:cow1')));
    expect(calf.sire_animal_id).toBe(map(fid('animals:cow2')));
    expect(t.events.find(e => e.id === map(fid('events:b'))).source_event_id).toBe(map(fid('events:a')));
    const efe = t.event_feed_entries[0];
    expect(efe.source_event_id).toBe(map(fid('events:a')));
    expect(efe.destination_event_id).toBe(map(fid('events:b')));
    for (const col of ['return_batch_id', 'return_storage_location_id', 'source_location_id', 'feed_type_id']) expect(efe[col]).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(t.event_paddock_windows.map(w => w.open_cohort_id))).toEqual(new Set([map(fid('cohort-1'))]));
  });
  it('keeps standard unit ids and remaps custom units with their references', () => {
    const t = clone().backup.tables;
    const std = t.animal_treatments.find(r => STANDARD_UNIT_IDS.has(r.dose_unit_id));
    expect(std).toBeTruthy();
    expect(t.dose_units).toEqual([expect.objectContaining({ id: map(fid('dose:custom')), operation_id: DEMO_OP, name: 'scoop' })]);
    expect(t.animal_treatments.some(r => r.dose_unit_id === map(fid('dose:custom')))).toBe(true);
    expect(t.input_products[0].unit_id).toBe(map(fid('ipu:custom')));
    expect(STANDARD_UNIT_IDS.has(t.amendments[0].qty_unit_id)).toBe(true);
  });
});

describe('cross-login user and member rows', () => {
  it('empties member-bound and personal tables and nulls member FKs', () => {
    const { backup } = clone();
    const t = backup.tables;
    for (const table of EMPTIED_TABLES) expect(t[table]).toEqual([]);
    for (const table of ASSISTANT_TABLES.filter(x => !SERVER_ASSISTANT_TABLES.has(x))) expect(EMPTIED_TABLES.has(table)).toBe(true);
    for (const table of ['submissions', 'submission_field_states', 'submission_repro_steps', 'todo_assignments']) expect(EMPTIED_TABLES.has(table)).toBe(true);
    expect(t.batch_adjustments.every(r => r.adjusted_by === null)).toBe(true);
    expect(t.todos.every(r => r.created_by === null)).toBe(true);
    expect(t.user_preferences).toEqual([]);
    const text = JSON.stringify(backup);
    for (const id of [REAL_USER, REAL_MEMBER, REAL_OP]) expect(text).not.toContain(id);
    expect(text).not.toContain('real@example.test');
  });
  it('with --demo-user-id keeps one user_preferences row owned by the demo user', () => {
    const t = clone({ demoUserId: DEMO_USER }).backup.tables;
    expect(t.user_preferences).toHaveLength(1);
    expect(t.user_preferences[0]).toMatchObject({ user_id: DEMO_USER, operation_id: DEMO_OP, active_farm_id: t.farms[0].id });
  });
  it('refuses a non-uuid or same-as-source demo operation', () => {
    expect(() => clone({ demoOperationId: 'demo' })).toThrow(/uuid/);
    expect(() => clone({ demoOperationId: REAL_OP })).toThrow(/differ/);
  });
});

describe('beef → dairy and scrubbing', () => {
  it('converts beef_cattle classes to dairy_cattle with dairy names; sheep, goats and dairy classes are unchanged', () => {
    const { backup, summary } = clone();
    const byName = Object.fromEntries(backup.tables.animal_classes.map(c => [c.name, c.species]));
    expect(byName).toEqual({ 'Dairy cows': 'dairy_cattle', 'Dairy calves': 'dairy_cattle', Ewes: 'sheep', Does: 'goat', 'Dairy heifers': 'dairy_cattle' });
    expect(summary.converted_classes).toBe(2);
    expect(backup.tables.historical_animal_basis[0]).toMatchObject({ species: 'dairy_cattle', class_label: 'Dairy cows' });
    expect(backup.tables.historical_feedings[0].species).toBe('sheep');
  });
  it('renames the farm and operation and clears notes and people-naming text', () => {
    const t = clone().backup.tables;
    expect(t.farms[0]).toMatchObject({ name: 'Demo Dairy', address: null, notes: null });
    expect(t.operations[0].name).toBe('Demo Dairy');
    expect(t.animals.every(a => a.notes == null && a.cull_notes == null)).toBe(true);
    expect(t.events.every(e => e.notes == null)).toBe(true);
    expect(t.animal_notes[0].note).toBe('Note removed for demo'); // NOT NULL
    expect(t.animal_breeding_records[0].technician).toBeNull();
    expect(t.todos[0]).toMatchObject({ title: 'Demo task 1', description: null, note: null });
    const text = JSON.stringify(t);
    for (const s of ['Jane', 'Bob', 'Tom', 'Sam', 'Pat', 'Mike', 'Joe', 'Smith', 'Real Road']) expect(text).not.toContain(s);
  });
  it('--farm-name overrides the demo operation and farm name; default stays "Demo Dairy"', () => {
    const src = syntheticSource();
    src.tables.farms.push({ ...src.tables.farms[0], id: fid('farms:b'), name: 'Second Place' });
    const t = clone({ farmName: 'Down East Dairy' }, src).backup.tables;
    expect(t.operations[0].name).toBe('Down East Dairy');
    expect(t.farms.map(f => f.name).sort()).toEqual(['Down East Dairy', 'Down East Dairy farm 2']);
    expect(clone({ farmName: '  ' }).backup.tables.operations[0].name).toBe('Demo Dairy');
    expect(parseArgs(['--farm-name', 'Down East Dairy'])).toEqual({ farmName: 'Down East Dairy' });
  });
  it('--scrub-names strips listed people\'s names from any text (whole word)', () => {
    const src = syntheticSource();
    src.tables.groups[0].name = 'Zed Cows';
    src.tables.historical_animal_basis[0].group_label = 'Zed cows';
    const { backup, summary } = clone({ scrubNames: ['zed'] }, src);
    expect(backup.tables.groups.find(g => g.is_milking).name).toBe('Cows');
    expect(backup.tables.historical_animal_basis[0].group_label).toBe('cows');
    expect(JSON.stringify(backup)).not.toMatch(/zed/i);
    expect(summary.names_stripped).toBe(2);
  });
});

describe('schema 51 dairy data', () => {
  it('flags only live groups with live dairy cows as milking and sets valid dairy settings', () => {
    const { backup, summary } = clone();
    const flagged = backup.tables.groups.filter(g => g.is_milking).map(g => g.name);
    expect(flagged).toEqual(['Cow herd']); // archived herd and sheep/calf groups stay off
    expect(backup.tables.groups.every(g => typeof g.is_milking === 'boolean')).toBe(true);
    expect(summary.milking_groups).toEqual([{ name: 'Cow herd', cows: 12 }]); // 2 cows + bulk 10
    expect(backup.tables.farm_settings[0]).toMatchObject(DAIRY_DEFAULTS);
  });
  it('seeds 14 days of pickups (every other day) and twice-daily calf feedings within the 051 constraints', () => {
    const { backup, summary } = clone();
    const { milk_pickups: p, calf_milk_feedings: f, farms, groups } = backup.tables;
    expect(p).toHaveLength(7);
    expect(f).toHaveLength(28);
    expect(summary.sample_window).toEqual({ from: '2026-11-13', to: '2026-11-26', timezone: 'America/New_York' });
    for (const r of p) {
      expect(r).toMatchObject({ operation_id: DEMO_OP, farm_id: farms[0].id, notes: null });
      expect(r.weight_kg).toBeGreaterThan(12 * 28 * 2 * 0.94);
      expect(r.weight_kg).toBeLessThan(12 * 28 * 2 * 1.06);
      expect(['Driver A', 'Driver B']).toContain(r.driver);
      expect(r.picked_up_at.endsWith(':30:00.000Z')).toBe(true);
    }
    const calfGroup = groups.find(g => g.name === 'Calf pen');
    for (const r of f) {
      expect(r).toMatchObject({ operation_id: DEMO_OP, farm_id: farms[0].id, group_id: calfGroup.id, kg_per_l_snapshot: 1.0305073 });
      expect(r.volume_l).toBeGreaterThan(0);
    }
    expect(new Set([...p, ...f].map(r => r.id)).size).toBe(35);
    expect(p.at(-1).picked_up_at <= '2026-11-27').toBe(true);
  });
  it('warns and seeds no pickups when no live dairy cow group exists', () => {
    const src = syntheticSource();
    src.tables.animal_classes.find(c => c.role === 'cow').species = 'sheep';
    const { backup, summary } = clone({}, src);
    expect(backup.tables.milk_pickups).toEqual([]);
    expect(summary.warnings.join(' ')).toMatch(/No live dairy cow group/);
  });
});

describe('CLI', () => {
  it('parses flags and refuses output inside the repo', () => {
    expect(parseArgs(['--in', 'a.json', '--demo-operation-id', DEMO_OP, '--out', '/tmp/x.json'])).toEqual({ in: 'a.json', demoOperationId: DEMO_OP, out: '/tmp/x.json' });
    expect(() => parseArgs(['--out'])).toThrow(/Missing value/);
    expect(() => assertOutsideRepo(path.join(REPO_ROOT, 'demo.json'))).toThrow(/outside the repo/);
    expect(() => assertOutsideRepo(path.join(os.tmpdir(), 'demo.json'))).not.toThrow();
  });
  it('writes the clone and summary from a backup file and prints counts only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-clone-'));
    const input = path.join(dir, 'in.json'); const out = path.join(dir, 'out.json'); const sum = path.join(dir, 'sum.json');
    fs.writeFileSync(input, JSON.stringify(syntheticSource()));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    main(['--in', input, '--demo-operation-id', DEMO_OP, '--out', out, '--summary', sum, '--today', '2026-11-26']);
    const written = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(written.operation_id).toBe(DEMO_OP);
    expect(JSON.parse(fs.readFileSync(sum, 'utf8')).milk_pickups).toBe(7);
    const printed = log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(printed).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(() => main(['--in', input, '--in-dir', dir, '--demo-operation-id', DEMO_OP, '--out', out])).toThrow(/exactly one/);
    log.mockRestore();
    fs.rmSync(dir, { recursive: true });
  });
});
