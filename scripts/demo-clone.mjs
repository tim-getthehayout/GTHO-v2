#!/usr/bin/env node
/**
 * @file #450 Demo Dairy clone — builds a gtho-v2-backup (schema 51) file of
 * Tim's real farm for a separate "Demo Dairy" login. READ-ONLY: this script
 * never connects to Supabase and never writes anywhere except --out.
 *
 * Input (both are SELECT-only snapshots of prod):
 *   --in <backup.json>      a Settings → Export Backup file (rows ordered by id, #476)
 *   --in-dir <data_json/>   a CP-55 SELECT-only snapshot folder (one <table>.json per table)
 * Required:
 *   --demo-operation-id <uuid>  the empty operation the demo login created in onboarding
 *   --out <path>                output file (refused inside the repo)
 * Optional:
 *   --source-operation-id <uuid>  only needed when the input holds more than one operation
 *   --demo-user-id <uuid>         demo login's auth.users id; keeps one user_preferences row
 *                                 rewritten to it (otherwise user_preferences is emitted empty)
 *   --today YYYY-MM-DD            last day of the sample milk data (default: today, operation tz)
 *   --days <n>                    sample milk days (default 14)
 *   --summary <path>              also write the summary JSON there
 *   --scrub-names "A,B"           people's names to strip (whole word) from every text value,
 *                                 e.g. a seller's surname used in group names; never commit them
 *
 * Load is NOT part of this script: the file goes through Settings → Import Backup
 * while signed in as the demo login (separate Tim card, verified prod backup first).
 * Spec: https://git.sarnford.com/Homelab/GTHO-v2/issues/450 (comment 1771).
 */
/* eslint-disable no-console -- CLI prints a counts-only summary */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_MIGRATIONS } from '../src/data/backup-migrations.js';
import { RELEASED_SCHEMA_VERSION } from '../src/data/schema-release.js';
import { UNIT_STANDARDS } from '../src/utils/unit-standards.js';
import { ASSISTANT_TABLES, SERVER_ASSISTANT_TABLES } from '../src/features/assistant/schema.js';

export const TARGET_SCHEMA_VERSION = 51;
/** Fixed project namespace for demo ids; per demo operation a child namespace is derived. */
export const DEMO_NAMESPACE = '6f1c2d4e-450d-5a1e-9d3c-7b2a1e0f4c50';
export const DEFAULT_DAYS = 14;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tables never cloned (not in the browser restore set). */
export const EXCLUDED_TABLES = new Set(['operation_members', 'app_logs', 'release_notes', ...SERVER_ASSISTANT_TABLES]);
/** Browser tables emitted empty: personal transcripts/feedback and member-bound rows. */
export const EMPTIED_TABLES = new Set([
  ...ASSISTANT_TABLES.filter(table => !SERVER_ASSISTANT_TABLES.has(table)),
  'submissions', 'submission_field_states', 'submission_repro_steps', 'todo_assignments',
]);
/** Member FKs (operation_members.id of the real farm) set to null. */
export const NULLED_MEMBER_FKS = [['batch_adjustments', 'adjusted_by'], ['todos', 'created_by']];
/** Free text that can name people: cleared (NOT NULL columns get a neutral placeholder). */
export const SCRUB_COLUMNS = ['notes', 'note', 'cull_notes', 'description'];
export const SCRUB_EXTRA = { farms: ['address'], animal_breeding_records: ['technician'], historical_feedings: ['place_text'], milk_pickups: ['driver'] };
const NOT_NULL_TEXT = { 'animal_notes.note': 'Note removed for demo' };
export const DAIRY_DEFAULTS = Object.freeze({ dairy_mode: 'on', milk_kg_per_l: 1.0305073, milk_grazing_offset_days: 1, milk_totals_mode: 'per_pickup' });
export const STANDARD_UNIT_IDS = new Set(UNIT_STANDARDS.flatMap(unit => [unit.id, unit.legacyId]).filter(Boolean).map(id => id.toLowerCase()));

// ---------------------------------------------------------------------------
// uuid v5 + deterministic helpers
// ---------------------------------------------------------------------------
const uuidBytes = uuid => Buffer.from(uuid.replace(/-/g, ''), 'hex');
export function uuidv5(namespace, name) {
  const hash = createHash('sha1').update(uuidBytes(namespace)).update(String(name), 'utf8').digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const unit = key => createHash('sha1').update(String(key)).digest().readUInt32BE(0) / 0x100000000;
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

/** UTC ISO for a local wall time in an IANA zone. */
export function zonedIso(dateStr, hour, minute, timeZone = 'UTC') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const offsetAt = ms => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value || 'GMT';
    const mm = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return mm ? (mm[1] === '-' ? -1 : 1) * (Number(mm[2]) * 60 + Number(mm[3] || 0)) : 0;
  };
  let ms = guess - offsetAt(guess) * 60000;
  ms = guess - offsetAt(ms) * 60000; // settle across a DST edge
  return new Date(ms).toISOString();
}
export function localToday(timeZone = 'UTC', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
/** Read a CP-55 data_json folder into { schema_version, tables }. */
export function readSnapshotDir(dir) {
  const tables = {};
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const table = file.slice(0, -5);
    if (table.startsWith('_')) continue; // ad-hoc backup tables (e.g. _bak_*)
    tables[table] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return { schema_version: null, operation_id: null, tables };
}

/** Narrow a source to one real operation's browser-restorable rows, ordered by id. */
export function selectSourceOperation(source, sourceOperationId) {
  const ops = source.tables.operations || [];
  const realOp = sourceOperationId || source.operation_id || (ops.length === 1 ? ops[0].id : null);
  if (!realOp) throw new Error(`Input holds ${ops.length} operations; pass --source-operation-id.`);
  const opRow = ops.find(row => row.id === realOp);
  if (!opRow) throw new Error('Source operation row not found in input.');
  const tables = {};
  for (const [table, rows] of Object.entries(source.tables)) {
    if (EXCLUDED_TABLES.has(table) || table.startsWith('_') || !Array.isArray(rows)) continue;
    tables[table] = (table === 'operations' ? rows.filter(row => row.id === realOp) : rows.filter(row => row.operation_id === realOp)).slice().sort(byId);
  }
  const schemaVersion = source.schema_version ?? opRow.schema_version;
  return { realOp, schemaVersion, exportedBy: source.exported_by || null, tables };
}

function migrateForward(backup) {
  while (backup.schema_version < TARGET_SCHEMA_VERSION) {
    const step = BACKUP_MIGRATIONS[backup.schema_version];
    if (!step) throw new Error(`Missing backup migration ${backup.schema_version} → ${backup.schema_version + 1}.`);
    backup = step(backup);
  }
  return backup;
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------
function dairyClassName(name) {
  const n = String(name || '').trim();
  if (!n) return 'Dairy cattle';
  if (/dairy/i.test(n)) return n;
  return `Dairy ${n.charAt(0).toLowerCase()}${n.slice(1)}`;
}
const headOf = animal => (animal.is_bulk ? Math.max(0, Number(animal.bulk_head_count) || 0) : 1);
const isLive = animal => animal.active !== false && !animal.cull_date;

/**
 * Build the demo backup. Pure apart from reading the clock when `today` is omitted.
 * @returns {{ backup: object, summary: object }}
 */
export function cloneOperation(source, opts) {
  const { demoOperationId, demoUserId = null, sourceOperationId = null, days = DEFAULT_DAYS, scrubNames = [] } = opts;
  if (!UUID_ONLY.test(demoOperationId || '')) throw new Error('--demo-operation-id must be a uuid.');
  if (demoUserId != null && !UUID_ONLY.test(demoUserId)) throw new Error('--demo-user-id must be a uuid.');
  const demoOp = demoOperationId.toLowerCase();
  const sel = selectSourceOperation(globalThis.structuredClone(source), sourceOperationId);
  if (sel.realOp.toLowerCase() === demoOp) throw new Error('Demo operation must differ from the source operation.');
  if (!(sel.schemaVersion >= 14)) throw new Error('Source schema version unknown or too old.');
  if (sel.schemaVersion > RELEASED_SCHEMA_VERSION) throw new Error(`Source schema ${sel.schemaVersion} is newer than this build (${RELEASED_SCHEMA_VERSION}).`);
  let b = migrateForward({ format: 'gtho-v2-backup', format_version: 1, schema_version: sel.schemaVersion, operation_id: sel.realOp, tables: sel.tables });
  const t = b.tables;
  const ns = uuidv5(DEMO_NAMESPACE, demoOp);
  const realOpLc = sel.realOp.toLowerCase();

  // 1 · cross-login user/member rows (before the id pass so no real user id is remapped into output)
  for (const table of EMPTIED_TABLES) t[table] = [];
  const prefs = (t.user_preferences || []).slice().sort(byId);
  t.user_preferences = demoUserId && prefs.length ? [{ ...prefs[0], user_id: '__DEMO_USER__' }] : [];
  for (const [table, column] of NULLED_MEMBER_FKS) for (const row of t[table] || []) row[column] = null;

  // 2 · scrub free text
  const scrubbed = {};
  for (const [table, rows] of Object.entries(t)) {
    const cols = [...SCRUB_COLUMNS, ...(SCRUB_EXTRA[table] || [])];
    for (const row of rows) for (const col of cols) {
      if (!Object.hasOwn(row, col) || row[col] == null || row[col] === '') continue;
      row[col] = NOT_NULL_TEXT[`${table}.${col}`] ?? null;
      scrubbed[`${table}.${col}`] = (scrubbed[`${table}.${col}`] || 0) + 1;
    }
  }
  const nameRes = scrubNames.map(n => String(n).trim()).filter(Boolean).map(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'));
  let namesStripped = 0;
  if (nameRes.length) for (const rows of Object.values(t)) for (const row of rows) for (const [k, v] of Object.entries(row)) {
    if (typeof v !== 'string' || UUID_ONLY.test(v) || !nameRes.some(re => { re.lastIndex = 0; return re.test(v); })) continue;
    let next = v; for (const re of nameRes) next = next.replace(re, '');
    next = next.replace(/\s{2,}/g, ' ').replace(/^[\s\-–,:;]+|[\s\-–,:;]+$/g, '');
    row[k] = next || 'Demo'; namesStripped++;
  }
  (t.todos || []).forEach((row, i) => { row.title = `Demo task ${i + 1}`; });
  const farms = (t.farms || []).slice().sort(byId);
  farms.forEach((row, i) => { row.name = i === 0 ? 'Demo Dairy' : `Demo Dairy farm ${i + 1}`; });
  for (const row of t.operations) row.name = 'Demo Dairy';

  // 3 · beef_cattle → dairy_cattle (sheep and goats unchanged)
  const renamed = new Map();
  for (const cls of t.animal_classes || []) {
    if (cls.species !== 'beef_cattle') continue;
    const name = dairyClassName(cls.name);
    renamed.set(cls.name, name);
    cls.species = 'dairy_cattle'; cls.name = name;
  }
  for (const table of ['historical_feedings', 'historical_animal_basis']) for (const row of t[table] || []) {
    if (row.species === 'beef_cattle') row.species = 'dairy_cattle';
    if (row.class_label && renamed.has(row.class_label)) row.class_label = renamed.get(row.class_label);
  }

  // 4 · deterministic id/FK remap: every uuid anywhere in the data (ids, FKs,
  // self-FKs, secondary FKs, cohort ids, jsonb) becomes uuidv5(ns, old);
  // the real operation becomes the demo operation; standard units keep their ids.
  const remap = u => {
    const lc = u.toLowerCase();
    if (STANDARD_UNIT_IDS.has(lc)) return lc;
    if (lc === realOpLc) return demoOp;
    return uuidv5(ns, lc);
  };
  const walk = v => {
    if (typeof v === 'string') return v.replace(UUID_RE, remap);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  for (const table of Object.keys(t)) t[table] = t[table].map(walk);
  for (const row of t.user_preferences) row.user_id = demoUserId.toLowerCase();
  for (const row of t.operations) row.schema_version = TARGET_SCHEMA_VERSION;

  // 5 · dairy settings + active milking groups
  for (const fs1 of t.farm_settings || []) {
    fs1.dairy_mode = 'on';
    if (!(Number(fs1.milk_kg_per_l) > 0)) fs1.milk_kg_per_l = DAIRY_DEFAULTS.milk_kg_per_l;
    if (!Number.isInteger(fs1.milk_grazing_offset_days) || fs1.milk_grazing_offset_days < 0 || fs1.milk_grazing_offset_days > 14) fs1.milk_grazing_offset_days = DAIRY_DEFAULTS.milk_grazing_offset_days;
    if (!['per_pickup', 'spread_daily'].includes(fs1.milk_totals_mode)) fs1.milk_totals_mode = DAIRY_DEFAULTS.milk_totals_mode;
  }
  const classes = new Map((t.animal_classes || []).map(c => [c.id, c]));
  const animals = new Map((t.animals || []).map(a => [a.id, a]));
  const openMembers = new Map();
  for (const m of t.animal_group_memberships || []) {
    if (m.date_left) continue;
    const a = animals.get(m.animal_id); const c = a && classes.get(a.class_id);
    if (!a || !c || !isLive(a) || c.species !== 'dairy_cattle') continue;
    const g = openMembers.get(m.group_id) || { cows: 0, calves: 0 };
    if (c.role === 'cow' && a.sex !== 'male') g.cows += headOf(a);
    if (c.role === 'calf') g.calves += headOf(a);
    openMembers.set(m.group_id, g);
  }
  const liveGroups = (t.groups || []).filter(g => !g.archived_at);
  for (const g of t.groups || []) g.is_milking = false;
  const milking = liveGroups.filter(g => (openMembers.get(g.id)?.cows || 0) > 0).sort(byId);
  for (const g of milking) g.is_milking = true;
  const calfGroup = liveGroups.filter(g => (openMembers.get(g.id)?.calves || 0) > 0).sort((a, b) => (openMembers.get(b.id).calves - openMembers.get(a.id).calves) || byId(a, b))[0] || null;

  // Farm of a group: its open grazing window's event farm, else the first live farm.
  const events = new Map((t.events || []).map(e => [e.id, e]));
  const liveFarms = (t.farms || []).filter(f => !f.archived).sort(byId);
  const groupFarm = g => {
    const w = (t.event_group_windows || []).filter(x => x.group_id === g.id && !x.date_left).sort(byId)[0];
    return (w && events.get(w.event_id)?.farm_id) || g.farm_id || liveFarms[0]?.id || null;
  };

  // 6 · ~2 weeks of sample milk data
  const tz = t.operations[0]?.timezone || 'UTC';
  const today = opts.today || localToday(tz);
  const firstDay = addDays(today, -(days - 1));
  const pickups = []; const feedings = [];
  const cowsByFarm = new Map();
  for (const g of milking) { const f = groupFarm(g); if (f) cowsByFarm.set(f, (cowsByFarm.get(f) || 0) + openMembers.get(g.id).cows); }
  const kgPerL = farmId => Number((t.farm_settings || []).find(s => s.farm_id === farmId)?.milk_kg_per_l) || DAIRY_DEFAULTS.milk_kg_per_l;
  for (const [farmId, cows] of [...cowsByFarm].sort()) {
    // Every-other-day pickup, ~28 kg per cow per day, ±5 %.
    for (let i = 1; i < days; i += 2) {
      const day = addDays(firstDay, i);
      const at = zonedIso(day, 6, 30, tz);
      const kg = Math.round(cows * 28 * 2 * (0.95 + 0.1 * unit(`${ns}:pickup:${farmId}:${day}`)) * 10) / 10;
      pickups.push({ id: uuidv5(ns, `milk_pickup:${farmId}:${day}`), operation_id: demoOp, farm_id: farmId, picked_up_at: at, weight_kg: kg, driver: i % 4 === 1 ? 'Driver A' : 'Driver B', notes: null, created_at: at, updated_at: at });
    }
  }
  const calfFarm = calfGroup ? groupFarm(calfGroup) : [...cowsByFarm.keys()].sort()[0] || null;
  if (calfFarm && (calfGroup || cowsByFarm.size)) {
    const calves = calfGroup ? openMembers.get(calfGroup.id).calves : 2;
    for (let i = 0; i < days; i++) {
      const day = addDays(firstDay, i);
      for (const [hh, label] of [[7, 'am'], [17, 'pm']]) {
        const at = zonedIso(day, hh, 0, tz);
        const litres = Math.round(calves * 2 * (0.9 + 0.2 * unit(`${ns}:calf:${day}:${label}`)) * 10) / 10;
        feedings.push({ id: uuidv5(ns, `calf_milk_feeding:${calfFarm}:${day}:${label}`), operation_id: demoOp, farm_id: calfFarm, fed_at: at, volume_l: litres, kg_per_l_snapshot: kgPerL(calfFarm), group_id: calfGroup?.id ?? null, notes: null, created_at: at, updated_at: at });
      }
    }
  }
  t.milk_pickups = pickups;
  t.calf_milk_feedings = feedings;

  for (const table of Object.keys(t)) t[table].sort(byId);
  const backup = {
    format: 'gtho-v2-backup', format_version: 1, schema_version: TARGET_SCHEMA_VERSION,
    exported_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    exported_by: { user_id: demoUserId ? demoUserId.toLowerCase() : 'demo-clone', email: 'demo-clone' },
    operation_id: demoOp, build_stamp: 'demo-clone-450',
    counts: Object.fromEntries(['farms', 'events', 'animals', 'batches', 'todos'].map(k => [k, (t[k] || []).length])),
    tables: t,
  };

  const byClass = {};
  for (const a of t.animals || []) {
    if (!isLive(a)) continue;
    const c = classes.get(a.class_id); const key = c ? `${c.name} (${c.species})` : 'unclassed';
    byClass[key] = (byClass[key] || 0) + headOf(a);
  }
  const summary = {
    schema_version: TARGET_SCHEMA_VERSION, source_schema_version: sel.schemaVersion,
    tables: Object.keys(t).length,
    rows: Object.values(t).reduce((n, rows) => n + rows.length, 0),
    counts: Object.fromEntries(Object.entries(t).map(([k, rows]) => [k, rows.length])),
    emptied: [...EMPTIED_TABLES].sort(), user_preferences: t.user_preferences.length ? 'rewritten to demo user' : 'emptied',
    converted_classes: renamed.size, live_head_by_class: byClass,
    milking_groups: milking.map(g => ({ name: g.name, cows: openMembers.get(g.id).cows })),
    calf_group: calfGroup ? { name: calfGroup.name, calves: openMembers.get(calfGroup.id).calves } : null,
    milk_pickups: pickups.length, milk_kg_total: Math.round(pickups.reduce((n, p) => n + p.weight_kg, 0) * 10) / 10,
    calf_milk_feedings: feedings.length, calf_litres_total: Math.round(feedings.reduce((n, f) => n + f.volume_l, 0) * 10) / 10,
    sample_window: { from: firstDay, to: today, timezone: tz },
    events: (t.events || []).length, paddocks: (t.locations || []).length, feed_batches: (t.batches || []).length,
    scrubbed, names_stripped: namesStripped,
    warnings: [
      ...(milking.length ? [] : ['No live dairy cow group found: no group flagged milking and no pickups seeded.']),
      ...(calfGroup ? [] : ['No calf group found: calf feedings use a nominal 2 calves and no group.']),
    ],
  };
  return { backup, summary };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument ${a}`);
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = argv[++i];
    if (out[key] == null || out[key].startsWith('--')) throw new Error(`Missing value for ${a}`);
  }
  return out;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function assertOutsideRepo(file, root = REPO_ROOT) {
  const rel = path.relative(root, path.resolve(file));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('--out/--summary must be outside the repo (the clone holds real farm data).');
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.out) throw new Error('--out is required.');
  if (!args.demoOperationId) throw new Error('--demo-operation-id is required.');
  if (!!args.in === !!args.inDir) throw new Error('Pass exactly one of --in <backup.json> or --in-dir <data_json/>.');
  assertOutsideRepo(args.out);
  if (args.summary) assertOutsideRepo(args.summary);
  const source = args.in ? JSON.parse(fs.readFileSync(args.in, 'utf8')) : readSnapshotDir(args.inDir);
  if (args.in && source.format !== 'gtho-v2-backup') throw new Error('--in is not a gtho-v2-backup file.');
  const { backup, summary } = cloneOperation(source, {
    demoOperationId: args.demoOperationId, demoUserId: args.demoUserId ?? null,
    sourceOperationId: args.sourceOperationId ?? null, today: args.today, days: args.days ? Number(args.days) : DEFAULT_DAYS,
    scrubNames: args.scrubNames ? args.scrubNames.split(',') : [],
  });
  fs.writeFileSync(args.out, JSON.stringify(backup, null, 2));
  if (args.summary) fs.writeFileSync(args.summary, JSON.stringify(summary, null, 2));
  // Counts only: no ids, names of people or notes are printed.
  console.log(JSON.stringify({ out: path.basename(args.out), tables: summary.tables, rows: summary.rows, milking_groups: summary.milking_groups.length, milk_pickups: summary.milk_pickups, calf_milk_feedings: summary.calf_milk_feedings, warnings: summary.warnings }, null, 1));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(`demo-clone: ${err.message}`); process.exit(1); }
}
