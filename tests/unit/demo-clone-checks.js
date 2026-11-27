/**
 * #450 dry-run checks for a demo clone file. Used by demo-clone-dryrun.test.js
 * (synthetic in the gates; a real file only when DEMO_CLONE_* env vars are set).
 * Checks: real validateBackup / preflightUnits / preflightAssistantRestore,
 * FK integrity (FK map parsed from supabase/migrations), per-table count
 * parity, zero leftover source ids, optional PGlite restore, sample report.
 */
import fs from 'node:fs';
import { validateBackup, preflightAssistantRestore, BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
import { preflightUnits } from '../../src/data/unit-backup.js';
import { UNIT_STANDARDS, UNIT_TABLES } from '../../src/utils/unit-standards.js';
import { EMPTIED_TABLES, STANDARD_UNIT_IDS, TARGET_SCHEMA_VERSION } from '../../scripts/demo-clone.mjs';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** [table, column, parentTable] for every single-column FK in the migrations (composite: last column). */
export function migrationForeignKeys(dir = 'supabase/migrations') {
  const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('\n').replace(/--[^\n]*/g, '');
  const out = []; const ref = /REFERENCES\s+(?:public\.)?"?(\w+)"?\s*\(/i;
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\s*\);/gi)) {
    for (const line of m[2].split(/,\s*\n/)) {
      const c = line.trim().match(/^"?(\w+)"?\s+\w+/); const r = line.match(ref);
      if (c && r && !/^(CONSTRAINT|FOREIGN|PRIMARY|UNIQUE|CHECK)$/i.test(c[1])) out.push([m[1], c[1], r[1]]);
      const f = line.match(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:public\.)?"?(\w+)"?/i);
      if (f) out.push([m[1], f[1].split(',').at(-1).trim(), f[2]]);
    }
  }
  for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
    for (const a of m[2].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?(\w+)"?[^,;]*?REFERENCES\s+(?:public\.)?"?(\w+)"?/gi)) out.push([m[1], a[1], a[2]]);
    for (const a of m[2].matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:public\.)?"?(\w+)"?/gi)) out.push([m[1], a[1].split(',').at(-1).trim(), a[2]]);
  }
  const seen = new Set();
  return out.filter(fk => { const k = fk.join('.'); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Every FK value in the clone points at a row in the clone (or a standard unit). */
export function fkIntegrity(backup, fks = migrationForeignKeys()) {
  const ids = {};
  for (const [table, rows] of Object.entries(backup.tables)) ids[table] = new Set(rows.map(r => r.id));
  for (const unit of UNIT_STANDARDS) (ids[unit.table] ||= new Set()).add(unit.id);
  const failures = []; let checked = 0;
  for (const [table, column, parent] of fks) {
    const rows = backup.tables[table];
    if (!rows) continue;
    for (const row of rows) {
      const v = row[column];
      if (v == null) continue;
      checked++;
      if (!ids[parent]?.has(v)) failures.push(`${table}.${column} → ${parent}`);
    }
  }
  return { checked, failures: [...new Set(failures)], failureCount: failures.length };
}

/** Every uuid anywhere in the source (ids, FKs, jsonb, envelope). */
export function sourceUuids(source) {
  const set = new Set();
  JSON.stringify(source).replace(UUID_RE, u => { set.add(u.toLowerCase()); return u; });
  return set;
}

/** Source uuids still present in the clone (standard unit ids allowed). */
export function leftoverIds(backup, sourceSet) {
  const left = new Set();
  JSON.stringify(backup).replace(UUID_RE, u => { const lc = u.toLowerCase(); if (sourceSet.has(lc) && !STANDARD_UNIT_IDS.has(lc)) left.add(lc); return u; });
  return left.size;
}

/** Source farm/operation names, exporter email and any listed people's names left in the clone (count only). */
export function sourceNamesLeft(source, backup, scrubNames = []) {
  const ops = source.tables.operations || []; const farms = source.tables.farms || [];
  const words = [...ops.map(o => o.name), ...farms.map(f => f.name), source.exported_by?.email, ...scrubNames].filter(w => typeof w === 'string' && w.trim().length > 2 && !/^demo/i.test(w.trim()));
  const text = JSON.stringify(backup).toLowerCase();
  return words.filter(w => new RegExp(`\\b${w.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)).length;
}

/** Expected per-table counts: source rows, except emptied tables, user_preferences and seeded milk tables. */
export function countParity(selectedTables, backup, { userPreferences }) {
  const mismatches = [];
  for (const table of new Set([...Object.keys(selectedTables), ...Object.keys(backup.tables)])) {
    const got = (backup.tables[table] || []).length;
    let want = (selectedTables[table] || []).length;
    if (EMPTIED_TABLES.has(table)) want = 0;
    if (table === 'user_preferences') want = userPreferences ? Math.min(1, want) : 0;
    if (table === 'milk_pickups' || table === 'calf_milk_feedings') continue; // seeded
    if (got !== want) mismatches.push({ table, want, got });
  }
  return mismatches;
}

/** Target catalog double: only the shared standard units exist (empty demo operation). */
export function emptyDemoTarget() {
  const rows = table => UNIT_STANDARDS.filter(u => u.table === table).map(u => ({ id: u.id, operation_id: null, name: u.name }));
  return {
    from(table) {
      let start = 0, end = 999;
      const q = { select: () => q, order: () => q, eq: () => q, range: (a, b) => { start = a; end = b; return q; }, then: (res, rej) => Promise.resolve({ data: UNIT_TABLES.includes(table) ? rows(table).slice(start, end + 1) : [], error: null }).then(res, rej) };
      return q;
    },
    rpc: async name => (name === 'unit_restore_id_conflicts' ? { data: false, error: null } : { data: [{ outcome: 'prepared', fence_token: 'dry-run' }], error: null }),
  };
}

export async function runPreflights(backup) {
  const validation = validateBackup(backup);
  const copy = globalThis.structuredClone(backup);
  const units = await preflightUnits(copy, backup.operation_id, emptyDemoTarget(), TARGET_SCHEMA_VERSION);
  const authority = await preflightAssistantRestore(backup, backup.operation_id, emptyDemoTarget());
  return { validateBackup: validation, preflightUnits: units, preflightAssistantRestore: { success: authority.success, error: authority.error } };
}

/** Restore the clone into a scratch PGlite built from a CP-55 schema catalog (+ any later migration files). */
export async function pgliteRestore(backup, { pglitePath, catalogPath, extraMigrations = [] }) {
  const { PGlite } = await import(pglitePath);
  const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const db = new PGlite();
  const res = { errors: [], fk_failures: [], fk_skipped: [], count_mismatches: [], restored_rows: 0, fks_added: 0 };
  await db.exec("SET TimeZone='UTC'; CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid'; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN others THEN NULL; END $$; CREATE TABLE auth.users (id uuid PRIMARY KEY);");
  // The demo login is the only auth user the clone may reference.
  for (const r of backup.tables.user_preferences || []) if (r.user_id) await db.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [r.user_id]);
  const cols = {}; for (const x of cat.columns) (cols[x.t] ||= []).push(x);
  const catTables = Object.keys(cols).filter(t => BROWSER_FK_ORDER.includes(t) || t === 'operation_members');
  for (const t of catTables) {
    const mk = withDef => `CREATE TABLE public."${t}" (` + cols[t].map(x => `"${x.col}" ${x.type}` + (withDef && x.default && x.generated !== 's' ? ` DEFAULT ${x.default}` : '') + (x.notnull ? ' NOT NULL' : '')).join(', ') + ')';
    try { await db.exec(mk(true)); } catch { try { await db.exec(mk(false)); } catch (e) { res.errors.push(`create ${t}: ${e.message}`); } }
  }
  for (const k of cat.constraints.filter(k => k.type !== 'f' && catTables.includes(k.t))) {
    try { await db.exec(`ALTER TABLE public."${k.t}" ADD CONSTRAINT "${k.name}" ${k.def}`); } catch (e) { res.errors.push(`constraint ${k.t}.${k.name}: ${e.message}`); }
  }
  for (const file of extraMigrations) {
    try { await db.exec(fs.readFileSync(file, 'utf8')); } catch (e) { res.errors.push(`migration ${file}: ${e.message}`); }
  }
  for (const u of UNIT_STANDARDS) await db.query(`INSERT INTO public."${u.table}" (id, name, operation_id, created_at, updated_at) VALUES ($1, $2, NULL, now(), now())`, [u.id, u.name]);
  for (const t of BROWSER_FK_ORDER) {
    const rows = backup.tables[t] || [];
    if (!rows.length) continue;
    try {
      await db.query(`INSERT INTO public."${t}" SELECT * FROM json_populate_recordset(NULL::public."${t}", $1::json)`, [JSON.stringify(rows)]);
      const n = (await db.query(`SELECT count(*)::int n FROM public."${t}"`)).rows[0].n - (UNIT_TABLES.includes(t) ? UNIT_STANDARDS.filter(u => u.table === t).length : 0);
      res.restored_rows += n;
      if (n !== rows.length) res.count_mismatches.push({ t, want: rows.length, got: n });
    } catch (e) { res.errors.push(`insert ${t}: ${e.message}`); }
  }
  // FKs last: ADD CONSTRAINT validates every loaded row (self-FKs included).
  for (const k of cat.constraints.filter(k => k.type === 'f' && catTables.includes(k.t))) {
    const target = k.def.match(/REFERENCES\s+(?:public\.)?"?([\w.]+)"?/i)?.[1];
    // Server-only assistant tables are outside the browser restore set (their client-side referrers are emitted empty).
    if (target && target !== 'auth.users' && !catTables.includes(target)) { res.fk_skipped.push(`${k.t} → ${target}`); continue; }
    try { await db.exec(`ALTER TABLE public."${k.t}" ADD CONSTRAINT "${k.name}" ${k.def}`); res.fks_added++; } catch (e) { res.fk_failures.push(`${k.t}.${k.name}: ${e.message.split('\n')[0]}`); }
  }
  res.ok = !res.errors.length && !res.fk_failures.length && !res.count_mismatches.length;
  await db.close();
  return res;
}

/** Everything in one report (counts and names of classes/groups only; no ids). */
export async function dryRunReport({ source, selectedTables, backup, summary, userPreferences, pglite, scrubNames = [] }) {
  const preflight = await runPreflights(backup);
  const fk = fkIntegrity(backup);
  const report = {
    preflight: { validateBackup: preflight.validateBackup.valid, preflightUnits: preflight.preflightUnits.success, preflightAssistantRestore: preflight.preflightAssistantRestore.success, errors: [preflight.validateBackup.error, preflight.preflightUnits.error, preflight.preflightAssistantRestore.error].filter(Boolean) },
    fk_integrity: { checked: fk.checked, failures: fk.failures },
    count_parity_mismatches: countParity(selectedTables, backup, { userPreferences }),
    leftover_source_ids: leftoverIds(backup, sourceUuids(source)),
    source_names_left: sourceNamesLeft(source, backup, scrubNames),
    real_operation_rows: Object.values(backup.tables).flat().filter(r => r.operation_id != null && r.operation_id !== backup.operation_id).length,
    sample: { live_head_by_class: summary.live_head_by_class, milking_groups: summary.milking_groups, calf_group: summary.calf_group, milk_pickups: summary.milk_pickups, milk_kg_total: summary.milk_kg_total, calf_milk_feedings: summary.calf_milk_feedings, calf_litres_total: summary.calf_litres_total, events: summary.events, paddocks: summary.paddocks, feed_batches: summary.feed_batches, tables: summary.tables, rows: summary.rows, warnings: summary.warnings },
  };
  if (pglite) report.pglite = await pgliteRestore(backup, pglite);
  report.pass = report.preflight.validateBackup && report.preflight.preflightUnits && report.preflight.preflightAssistantRestore
    && !fk.failures.length && !report.count_parity_mismatches.length && report.leftover_source_ids === 0 && report.source_names_left === 0 && report.real_operation_rows === 0 && (!pglite || report.pglite.ok);
  return report;
}
