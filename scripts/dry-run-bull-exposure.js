#!/usr/bin/env node
/**
 * Read-only dry-run of bull/ram/buck↔female exposure intervals (F0, E1).
 * Does NOT write to IndexedDB or Supabase.
 *
 * Usage (from repo root, with a backup JSON or fixture):
 *   node scripts/dry-run-bull-exposure.js --fixture=path/to/backup.json
 *   node scripts/dry-run-bull-exposure.js --fixture=... --migration-date=2024-06-01
 *   node scripts/dry-run-bull-exposure.js --help
 *
 * Without --fixture, prints column legend and exits 0 (no prod access).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveBullExposureIntervals,
  resolvePregCheckProtocol,
} from '../src/calcs/bull-exposure.js';

function parseArgs(argv) {
  const out = { fixture: null, migrationDate: null, outCsv: null, outJson: null, help: false };
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--fixture=')) out.fixture = a.slice(10);
    else if (a.startsWith('--migration-date=')) out.migrationDate = a.slice(17);
    else if (a.startsWith('--out-csv=')) out.outCsv = a.slice(10);
    else if (a.startsWith('--out-json=')) out.outJson = a.slice(11);
  }
  return out;
}

function help() {
  console.log(`Bull exposure dry-run (read-only; no writes).

Columns: female_id, female_tag, female_class_role, bull_id, bull_tag,
  exposure_start, exposure_end, source, source_evidence, ambiguity_flag,
  ambiguity_note, include_in_view

Options:
  --fixture=PATH          gtho-v2 backup JSON (tables.animals, animal_classes, …)
  --migration-date=YYYY-MM-DD   flag memberships/EGWs whose date_joined equals this
  --out-csv=PATH          write CSV
  --out-json=PATH         write summary JSON
  --help

Do not run against production databases. This script only reads a local fixture file.
`);
}

function fromBackup(backup) {
  const tables = backup.tables || backup;
  const mapRows = (name, fromSb) => (tables[name] || []).map(fromSb);
  // Prefer camelCase local shapes if already present; else snake_case from backup.
  const camel = (row, mapping) => {
    const out = {};
    for (const [camelKey, snake] of Object.entries(mapping)) {
      out[camelKey] = row[camelKey] ?? row[snake] ?? null;
    }
    return out;
  };
  const animals = (tables.animals || []).map(r => camel(r, {
    id: 'id', operationId: 'operation_id', classId: 'class_id', tagNum: 'tag_num',
    name: 'name', sex: 'sex', active: 'active', confirmedBred: 'confirmed_bred',
    confirmedBredDate: 'confirmed_bred_date',
  }));
  // coerce booleans
  for (const a of animals) {
    if (a.confirmedBred == null) a.confirmedBred = false;
    if (a.active == null) a.active = true;
  }
  const animalClasses = (tables.animal_classes || tables.animalClasses || []).map(r => camel(r, {
    id: 'id', operationId: 'operation_id', name: 'name', species: 'species', role: 'role',
  }));
  const memberships = (tables.animal_group_memberships || tables.animalGroupMemberships || []).map(r => camel(r, {
    id: 'id', operationId: 'operation_id', animalId: 'animal_id', groupId: 'group_id',
    dateJoined: 'date_joined', dateLeft: 'date_left',
  }));
  const eventGroupWindows = (tables.event_group_windows || tables.eventGroupWindows || []).map(r => camel(r, {
    id: 'id', operationId: 'operation_id', eventId: 'event_id', groupId: 'group_id',
    dateJoined: 'date_joined', dateLeft: 'date_left',
  }));
  return { animals, animalClasses, memberships, eventGroupWindows };
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.fixture) {
    help();
    if (!args.fixture) process.exit(0);
  }
  const raw = JSON.parse(readFileSync(resolve(args.fixture), 'utf8'));
  const { animals, animalClasses, memberships, eventGroupWindows } = fromBackup(raw);
  const classById = new Map(animalClasses.map(c => [c.id, c]));
  const animalById = new Map(animals.map(a => [a.id, a]));
  const intervals = deriveBullExposureIntervals({
    animals,
    animalClasses,
    memberships,
    eventGroupWindows,
    cattleOnly: false,
    migrationFallbackDates: args.migrationDate ? [args.migrationDate] : undefined,
  });

  const rows = intervals.map(iv => {
    const female = animalById.get(iv.femaleId);
    const bull = animalById.get(iv.bullId);
    const fCls = classById.get(female?.classId);
    return {
      female_id: iv.femaleId,
      female_tag: female?.tagNum || female?.name || '',
      female_class_role: fCls?.role || '',
      female_species: fCls?.species || '',
      bull_id: iv.bullId,
      bull_tag: bull?.tagNum || bull?.name || '',
      exposure_start: iv.exposureStart,
      exposure_end: iv.exposureEnd,
      source: iv.source,
      source_evidence: iv.sourceEvidence,
      ambiguity_flag: iv.ambiguity_flag,
      ambiguity_note: iv.ambiguity_note,
      include_in_view: iv.includeInView ? 'yes' : 'no',
    };
  });

  const byFlag = {};
  const bySource = {};
  for (const r of rows) {
    byFlag[r.ambiguity_flag] = (byFlag[r.ambiguity_flag] || 0) + 1;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
  }
  const summary = {
    dry_run: true,
    writes: false,
    protocol_defaults: {
      cattle: resolvePregCheckProtocol(null, 'cattle'),
      sheep: resolvePregCheckProtocol(null, 'sheep'),
      goat: resolvePregCheckProtocol(null, 'goat'),
    },
    rows_total: rows.length,
    by_ambiguity_flag: byFlag,
    by_source: bySource,
    females_covered: new Set(rows.map(r => r.female_id)).size,
    bulls_covered: new Set(rows.map(r => r.bull_id)).size,
  };

  const header = Object.keys(rows[0] || {
    female_id: 1, female_tag: 1, female_class_role: 1, female_species: 1, bull_id: 1, bull_tag: 1,
    exposure_start: 1, exposure_end: 1, source: 1, source_evidence: 1,
    ambiguity_flag: 1, ambiguity_note: 1, include_in_view: 1,
  });
  const csv = [header.join(',')].concat(
    rows.map(r => header.map(h => csvEscape(r[h])).join(',')),
  ).join('\n');

  if (args.outCsv) writeFileSync(resolve(args.outCsv), csv + '\n');
  if (args.outJson) writeFileSync(resolve(args.outJson), JSON.stringify(summary, null, 2) + '\n');

  console.log(JSON.stringify(summary, null, 2));
  if (!args.outCsv) {
    console.log('\n# CSV preview (first 20 rows)');
    console.log(csv.split('\n').slice(0, 21).join('\n'));
  }
}

main();
