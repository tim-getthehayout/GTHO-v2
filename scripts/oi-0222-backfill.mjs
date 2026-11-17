#!/usr/bin/env node
/**
 * One-time historical hay-feeding backfill (winter 2025-26 + dropped v1 feedings).
 *
 * Never connects to a database and holds no credentials. Inputs are Tim's
 * notes file (sha256-prefix checked) and JSON from read-only SELECTs.
 *
 *   node scripts/oi-0222-backfill.mjs --notes <file> --extracts <dir> [--out <dir>]
 *        [--emit-sql <file> --operation-id <uuid>]
 *
 * --dry-run is the default: report.md, rows.csv and summary.json go to --out.
 * --emit-sql writes one guarded BEGIN…COMMIT transaction for Orchestrator to apply.
 * Row ids are UUIDv5 (URL namespace) of
 *   https://getthehayout.com/backfill/oi-0222/<table>/<source_key>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
export const ID_PREFIX = 'https://getthehayout.com/backfill/oi-0222/';
export const LB_TO_KG = 0.45359237;

export function uuidv5(name, namespace = URL_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  if (ns.length !== 16) throw new Error('invalid namespace');
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic backfill row id for `table` and `sourceKey`. */
export const backfillId = (table, sourceKey) => uuidv5(`${ID_PREFIX}${table}/${sourceKey}`);
/** Shared transfer token of one v1 transfer pair (not a table row). */
export const transferToken = pairKey => uuidv5(`${ID_PREFIX}transfer/${pairKey}`);

const round = (value, places = 2) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
const kg4 = lb => round(lb * LB_TO_KG, 4);

// ---------------------------------------------------------------------------
// Tim's decisions (reviewed constant table; 17c src/build.py is the reference).
// Note rows: [line, date, qty, type = 'untyped', species = 'cattle?', group = '', place = ''].
// ---------------------------------------------------------------------------
const NOTE_ROWS = [
  [2, "2025-10-01", 4],
  [3, "2025-10-03", 6],
  [4, "2025-10-04", 2],
  [5, "2025-10-06", 2],
  [11, "2025-10-16", 2],
  [12, "2025-10-17", 1],
  [13, "2025-10-18", 5],
  [18, "2025-10-20", 2],
  [19, "2025-10-22", 6],
  [23, "2025-10-24", 4],
  [24, "2025-10-25", 4],
  [25, "2025-10-27", 4],
  [26, "2025-10-29", 6],
  [27, "2025-10-31", 10],
  [28, "2025-11-03", 6],
  [35, "2025-11-05", 6],
  [36, "2025-11-07", 6],
  [40, "2025-11-10", 6],
  [42, "2025-11-11", 4],
  [44, "2025-11-12", 8],
  [47, "2025-11-16", 4],
  [51, "2025-11-17", 12],
  [59, "2025-11-21", 6],
  [61, "2025-11-24", 18],
  [62, "2025-11-25", 4],
  [64, "2025-12-01", 4],
  [66, "2025-12-03", 16],
  [68, "2025-12-07", 8],
  [70, "2025-12-09", 6, "grass"],
  [71, "2025-12-10", 4, "grass"],
  [72, "2025-12-11", 2, "grass"],
  [74, "2025-12-12", 18, "untyped", "cattle?", "", "E4"],
  [78, "2026-01-05", 2],
  [79, "2026-01-06", 3],
  [89, "2026-01-09", 9],
  [90, "2026-01-12", 6],
  [91, "2026-01-14", 2, "peanut"],
  [92, "2026-01-15", 2, "peanut"],
  [92, "2026-01-15", 4, "grass"],
  [93, "2026-01-16", 2, "peanut"],
  [93, "2026-01-16", 4, "grass"],
  [94, "2026-01-20", 2, "peanut"],
  [94, "2026-01-20", 20, "grass"],
  [95, "2026-01-22", 2, "peanut"],
  [96, "2026-01-24", 2, "peanut"],
  [97, "2026-01-26", 4, "peanut"],
  [98, "2026-01-28", 4, "peanut"],
  [98, "2026-01-28", 14, "grass"],
  [99, "2026-01-30", 4, "peanut"],
  [101, "2026-02-02", 4, "peanut"],
  [101, "2026-02-02", 4, "grass"],
  [101, "2026-02-02", 1, "peanut", "sheep"],
  [102, "2026-02-03", 2, "grass"],
  [103, "2026-02-05", 2, "peanut"],
  [103, "2026-02-05", 2, "grass"],
  [103, "2026-02-05", 1, "peanut", "sheep"],
  [104, "2026-02-07", 10, "grass"],
  [104, "2026-02-07", 2, "peanut"],
  [105, "2026-02-09", 4, "grass"],
  [105, "2026-02-09", 2, "peanut"],
  [106, "2026-02-12", 2, "grass"],
  [107, "2026-02-13", 2, "peanut"],
  [107, "2026-02-13", 12, "grass"],
  [107, "2026-02-13", 1, "grass", "sheep"],
  [108, "2026-02-18", 28],
  [120, "2026-02-19", 3, "grass", "sheep"],
  [120, "2026-02-19", 1, "peanut", "sheep"],
  [121, "2026-02-27", 8, "grass", "cattle", "cows"],
  [121, "2026-02-27", 1, "peanut", "sheep"],
  [123, "2026-03-04", 6, "grass", "cattle", "cows"],
  [123, "2026-03-04", 1, "peanut", "sheep"],
  [124, "2026-03-06", 2, "grass", "cattle", "cows"],
  [125, "2026-03-09", 12, "grass"],
  [126, "2026-03-13", 15, "grass"],
  [127, "2026-03-17", 2],
  [129, "2026-03-18", 1, "peanut"],
  [129, "2026-03-18", 2, "grass", "cattle?", "", "barn (storage)"],
  [132, "2026-03-19", 16, "grass", "cattle?", "", "Oak Field"],
  [133, "2026-03-19", 1, "peanut", "cattle", "corral group"],
  [134, "2026-03-19", 1, "untyped", "cattle", "Shenk group"],
  [136, "2026-03-20", 2, "grass", "cattle", "culls and calves"],
  [137, "2026-03-20", 2, "grass", "cattle", "Shenk cows"],
  [141, "2026-03-25", 6, "alfalfa", "cattle", "", "Corral"],
  [143, "2026-03-27", 5, "alfalfa", "sheep"],
  [144, "2026-03-28", 10, "alfalfa", "sheep"],
  [144, "2026-03-28", 1, "untyped", "cattle", "calves and Shenk culls"],
];

export const DECISIONS = Object.freeze({
  notesHashPrefix: 'b3f3b99e',
  // Rows dated before this go to the history lane (no v2 events before Mar 4).
  eventLaneStart: '2026-03-04',
  eventLaneEnd: '2026-04-13',
  noteRows: NOTE_ROWS,
  // 12/16 set-out of 80 bales, pro-rated 4.00/day 12/16 .. 1/4 (Tim K).
  proRates: [{ line: 76, start: '2025-12-16', days: 20, qty: 4 }],
  snapshots: {
    round: { unit: 'bale', lb: 647, dmPct: 85 },
    sq: { unit: 'sq bale', lb: 50, dmPct: 85 },
  },
  // History rows: feed type by the note's written type. Decision 3: no type written = grass.
  historyFeedTypes: { grass: 'Round bale- Grass', peanut: 'Round Bale- Peanut', untyped: 'Round bale- Grass' },
  // 17c report labels (match check only).
  reportFeedTypes: { grass: 'Round bale- Grass', peanut: 'Round Bale- Peanut', alfalfa: 'Alfalfa', untyped: '(untyped round bale)' },
  species: { 'cattle?': 'beef_cattle', cattle: 'beef_cattle', sheep: 'sheep' },
  // Event-lane note rows: "line:n" -> action. Event = v2 event id prefix; location = v2 location name.
  noteEvents: {
    '123:1': { action: 'insert', batch: 'Tarped', event: '2fc46038', location: 'G - 3', why: 'Tim C1: notes win' },
    '123:2': { action: 'exclude', category: 'sheep-peanut', why: 'Tim R: leave the Mar 4 peanut to sheep out' },
    '124:1': { action: 'skip', why: 'matched to v1 (C2 moot after O)' },
    '125:1': { action: 'skip', why: 'matched to v1' },
    '126:1': { action: 'insert', batch: 'Tarped', event: 'e00165ae', location: 'G - 2', why: 'notes only; event by date+group' },
    '127:1': { action: 'insert', batch: 'Oak Field Barn', event: 'e00165ae', location: 'G - 2', why: 'notes only; event by date+group' },
    '129:1': { action: 'skip', why: 'matched to v1' },
    '129:2': { action: 'insert', batch: 'Oak Field Barn', event: 'e00165ae', location: 'G - 2', why: 'notes only; event by date+group' },
    '132:1': { action: 'insert', batch: 'Oak Field Barn', event: '8f15a4ab', location: 'K - 5', why: 'Tim C3: notes win; Cow-Calf Herd event; K - 5 as the superseded v1 row and its check items' },
    '133:1': { action: 'insert', batch: 'Peanut Hay (opening)', event: '1f903fc6', location: 'Corral', why: 'Tim C3: notes win; corral group' },
    '134:1': { action: 'insert', batch: 'Oak Field Barn', event: 'a2350cd7', location: 'G - 2', why: 'Tim C3: notes win; Shenk group' },
    '136:1': { action: 'insert', batch: 'Oak Field Barn', event: '1f903fc6', location: 'Corral', why: 'Tim C4: notes win; culls+calves' },
    '137:1': { action: 'insert', batch: 'Oak Field Barn', event: 'a2350cd7', location: 'G - 2', why: 'Tim C4: notes win; Shenk cows' },
    '141:1': { action: 'insert', batch: 'Alfalfa Small Squares', event: '1f903fc6', location: 'Corral', why: 'notes only; event by date+group' },
    '143:1': { action: 'exclude', category: 'sheep-alfalfa', why: 'Tim P: leave the Mar 27-28 sheep alfalfa out' },
    '144:1': { action: 'exclude', category: 'sheep-alfalfa', why: 'Tim P: leave the Mar 27-28 sheep alfalfa out' },
    '144:2': { action: 'skip', why: 'Tim: same bale as v1 Mar 27 E - 1; v1 kept' },
  },
  v1: {
    batches: {
      'Oak Field Barn': { v2: 'Oak Field Barn', type: 'grass', form: 'round' },
      Tarped: { v2: 'Tarped', type: 'grass', form: 'round' },
      'Peanut Hay': { v2: 'Peanut Hay (opening)', type: 'peanut', form: 'round' },
      'Alfalfa Small Squares': { v2: 'Alfalfa Small Squares', type: 'alfalfa', form: 'sq' },
    },
    // Tim O: a copy row's id = original id + 3 or 6 digits, same date, event and quantity.
    copySuffixLengths: [3, 6],
    // Tim C1/C3/C4: notes win on these dates.
    supersedeDates: { '2026-03-04': 'Tim C1', '2026-03-19': 'Tim C3', '2026-03-20': 'Tim C4' },
    // Tim: Apr 10 J2 (v1) is the same bale as the live v2 Apr 9 J2 entry; v2 kept.
    supersedeRows: [{ date: '2026-04-10', pasture: 'J2', why: 'Tim: same bale as live v2 Apr 9 J2 entry' }],
  },
  // v1 event -> v2 event id prefix where the natural key is not one-to-one (17c pairing).
  eventPins: { 1774010178757: '7e88a2d4' },
  // v1 check items are keyed by one v1 feed type (Oak Field grass round bales).
  checkItemFeedType: 'Round bale- Grass',
  checkItemForm: 'round',
  basis: [
    { group: 'Cow-Calf Herd', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-03', head: 31, lb: 929, dmiPct: 2.5741, dmiSource: 'class_mix', source: 'tim_answer' },
    { group: 'Mixed Calves', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-18', head: 28, lb: 500, dmiPct: 2.5, dmiSource: 'class_default', source: 'tim_answer' },
    { group: 'Shenk Culls', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-18', head: 10, lb: 755, dmiPct: 2.5, dmiSource: 'class_default', source: 'tim_answer' },
    { group: 'Shenk Cows', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-18', head: 4, lb: 950, dmiPct: 2.5, dmiSource: 'class_default', source: 'tim_answer' },
    { group: 'Culls', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-18', head: 3, lb: 950, dmiPct: 2.5, dmiSource: 'class_default', source: 'tim_answer' },
    { group: 'Bull Group', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-18', head: 3, lb: 1250, dmiPct: 2.3333, dmiSource: 'class_mix', source: 'tim_answer' },
    { group: null, label: 'Sheep flock', species: 'sheep', start: '2025-10-01', end: '2026-05-31', head: 80, lb: 110, dmiPct: 3.0, dmiSource: 'class_default', source: 'tim_entry' },
  ],
  // Batch state the write is guarded against, and the locked true-ups.
  // key = how entries name the batch here; name (+ optional match) finds it in the database.
  batches: [
    { name: 'Oak Field Barn', quantity: 45, remaining: 0, reconcile: { prev: 37, next: 0 }, v2Fed: 11.06, trueUp: 8.86, end: 0, adjustmentDate: '2026-05-03',
      relabel: { source: 'opening', purchaseDate: '2026-03-15', fromPurchaseDate: '2026-03-15', costPerUnit: 45 } },
    { name: 'Tarped', quantity: 40, remaining: 0, reconcile: { prev: 40, next: 0 }, v2Fed: 0, trueUp: -5, end: 0, adjustmentDate: '2026-05-03',
      relabel: { source: 'opening', purchaseDate: '2026-03-15', fromPurchaseDate: '2026-03-15', costPerUnit: 45 } },
    // Two batches are named 'Peanut Hay'; last season's is the one with 17 bales bought
    // 2025-12-31 (2026-03-15 once relabeled). '(opening)' is a report label only.
    { key: 'Peanut Hay (opening)', name: 'Peanut Hay', match: { quantity: 17, purchaseDates: ['2025-12-31', '2026-03-15'] }, quantity: 17, remaining: 0, reconcile: { prev: 17, next: 0 }, v2Fed: 0, trueUp: -15, end: 0, adjustmentDate: '2026-05-03',
      relabel: { source: 'opening', purchaseDate: '2026-03-15', fromPurchaseDate: '2025-12-31', costPerUnit: 45 } },
    { name: 'Alfalfa Small Squares', quantity: 100, remaining: 15, reconcile: { prev: 93, next: 15 }, v2Fed: 21, trueUp: -39.5, end: 15, adjustmentDate: '2026-11-03',
      relabel: null, keep: { source: 'purchase', purchaseDate: '2026-03-24' } },
  ],
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export const EXTRACT_FILES = ['v1_deliveries', 'v1_events', 'v1_checks', 'v2_events', 'v2_checks'];

export function loadExtracts(dir) {
  const out = {};
  for (const name of EXTRACT_FILES) out[name] = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  // Optional for the dry run; the emitted SQL re-resolves feed types by name in the database.
  const feedTypes = join(dir, 'v2_feed_types.json');
  if (existsSync(feedTypes)) out.v2_feed_types = JSON.parse(readFileSync(feedTypes, 'utf8'));
  return out;
}

export function notesHashPrefix(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/** The note line exactly as written (trailing Markdown line-break spaces dropped). */
function noteLine(lines, line) {
  const value = lines[line - 1];
  if (value == null || !value.trim()) throw new Error(`notes line ${line} is missing or blank`);
  return value.replace(/\s+$/, '');
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dmLb(qty, form, decisions) {
  const s = decisions.snapshots[form];
  return qty * s.lb * s.dmPct / 100;
}

function snapshot(form, decisions) {
  const s = decisions.snapshots[form];
  return { unit: s.unit, weightKg: kg4(s.lb), dmPct: s.dmPct };
}

function noteFeedings(notesText, decisions) {
  const lines = notesText.split(/\r?\n/);
  const rows = [];
  const counter = new Map();
  for (const [line, date, qty, type = 'untyped', species = 'cattle?', group = '', place = ''] of decisions.noteRows) {
    const n = (counter.get(line) || 0) + 1;
    counter.set(line, n);
    rows.push({ line, n, date, qty, type, species, group, place });
  }
  for (const p of decisions.proRates) {
    for (let i = 0; i < p.days; i++) rows.push({ line: p.line, n: i + 1, date: addDays(p.start, i), qty: p.qty, type: 'untyped', species: 'cattle?', group: '', place: '' });
  }
  return rows.map(row => {
    const form = row.type === 'alfalfa' ? 'sq' : 'round';
    return {
      ...row,
      form,
      raw: noteLine(lines, row.line),
      sourceKey: `notes:${decisions.notesHashPrefix}:${row.line}:${row.n}`,
      lbDm: dmLb(row.qty, form, decisions),
    };
  });
}

function pairEvents(v1Events, v2Events, decisions) {
  const pair = new Map();
  const used = new Set();
  for (const e of v1Events) {
    let cands = v2Events.filter(v => v.first_open === e.date_in && v.locs.split(',').map(s => s.trim()).includes(e.pasture_name) && !used.has(v.id));
    if (cands.length > 1) {
      const sameOut = cands.filter(v => v.date_out === e.date_out);
      if (sameOut.length) cands = sameOut;
    }
    if (cands.length > 1) {
      const pin = decisions.eventPins[String(e.id)];
      const pinned = pin ? cands.filter(v => v.id.startsWith(pin)) : [];
      if (pinned.length !== 1) throw new Error(`v1 event ${e.id} pairs with ${cands.length} v2 events and has no single pin`);
      cands = pinned;
    }
    if (!cands.length) throw new Error(`v1 event ${e.id} has no v2 event`);
    pair.set(String(e.id), cands[0]);
    used.add(cands[0].id);
  }
  return pair;
}

function v2EventByPrefix(v2Events, prefix) {
  const hits = v2Events.filter(v => v.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`v2 event prefix ${prefix} matches ${hits.length} events`);
  return hits[0];
}

/** Location name for an entry: the named paddock, which must be one of the event's paddocks (no fallback). */
export function eventLocation(v2Event, name) {
  const locs = String(v2Event.locs || '').split(',').map(s => s.trim());
  if (!locs.includes(name)) throw new Error(`location "${name}" is not a paddock of v2 event ${v2Event.id.slice(0, 8)}`);
  return name;
}

function findCopies(deliveries, decisions) {
  const copyOf = new Map();
  for (const r of deliveries) {
    const s = String(r.delivery_id);
    const parents = deliveries.filter(o => {
      const p = String(o.delivery_id);
      return o !== r && p.length < s.length && s.startsWith(p) && decisions.v1.copySuffixLengths.includes(s.length - p.length)
        && o.date === r.date && o.event_id === r.event_id && Number(o.quantity) === Number(r.quantity);
    }).sort((a, b) => String(a.delivery_id).length - String(b.delivery_id).length);
    if (parents.length) copyOf.set(s, String(parents[0].delivery_id));
  }
  return copyOf;
}

export function buildPlan({ notesText, extracts, decisions = DECISIONS }) {
  const prefix = notesHashPrefix(notesText);
  if (prefix !== decisions.notesHashPrefix) throw new Error(`notes file sha256 prefix ${prefix} is not ${decisions.notesHashPrefix}`);
  const { v1_deliveries: deliveries, v1_events: v1Events, v1_checks: v1Checks, v2_events: v2Events, v2_checks: v2ChecksAll } = extracts;
  const pair = pairEvents(v1Events, v2Events, decisions);
  const notes = noteFeedings(notesText, decisions);

  const history = [];
  const entries = [];
  const transfers = [];
  const notWritten = [];
  const reportRows = [];

  for (const x of notes) {
    const species = decisions.species[x.species];
    if (!species) throw new Error(`unknown species ${x.species} on notes line ${x.line}`);
    const base = { source: 'notes', sourceKey: x.sourceKey, notesLine: x.line, date: x.date, qty: x.qty, form: x.form, type: x.type, species, group: x.group, place: x.place, lbDm: x.lbDm, raw: x.raw };
    if (x.date < decisions.eventLaneStart) {
      const feedType = decisions.historyFeedTypes[x.type];
      if (!feedType) throw new Error(`no history feed type for ${x.type} on notes line ${x.line}`);
      const row = { ...base, lane: 'history', status: 'insert', feedType };
      history.push(row); reportRows.push(row);
      continue;
    }
    const d = decisions.noteEvents[`${x.line}:${x.n}`];
    if (!d) throw new Error(`no event-lane decision for notes line ${x.line}:${x.n}`);
    if (d.action === 'insert') {
      const ev = v2EventByPrefix(v2Events, d.event);
      const row = { ...base, lane: 'event', status: 'insert', why: d.why, batch: d.batch, eventId: ev.id, location: eventLocation(ev, d.location) };
      entries.push(row); reportRows.push(row);
    } else {
      const row = { ...base, lane: d.action === 'exclude' ? 'excluded' : 'event', status: d.action === 'exclude' ? d.category : 'matched-skipped', why: d.why };
      notWritten.push(row); reportRows.push(row);
    }
  }

  const copies = findCopies(deliveries, decisions);
  for (const r of deliveries) {
    const id = String(r.delivery_id);
    const batch = decisions.v1.batches[r.batch];
    if (!batch) throw new Error(`v1 delivery ${id} has unknown batch ${r.batch}`);
    const ev = pair.get(String(r.event_id));
    if (!ev) throw new Error(`v1 delivery ${id} has no paired event`);
    const q = Number(r.quantity);
    const base = { source: 'v1', sourceKey: `v1:delivery:${id}`, v1Id: id, date: r.date, qty: q, form: batch.form, type: batch.type, species: 'beef_cattle', group: '', place: r.event_pasture,
      lbDm: dmLb(q, batch.form, decisions), batch: batch.v2, eventId: ev.id, location: eventLocation(ev, r.event_pasture), raw: r.notes || '' };
    let status = 'insert'; let why = '';
    if (r.kind === 'transfer') status = 'transfer';
    const sup = decisions.v1.supersedeRows.find(s => s.date === r.date && s.pasture === r.event_pasture);
    if (decisions.v1.supersedeDates[r.date]) { status = 'superseded'; why = `${decisions.v1.supersedeDates[r.date]}: notes win`; }
    if (sup) { status = 'superseded'; why = sup.why; }
    if (copies.has(id)) { status = 'excluded-copy'; why = `Tim O: v1 copy of ${copies.get(id)}`; }
    const row = { ...base, lane: status === 'excluded-copy' ? 'excluded' : 'event', status, why, transferPair: r.transfer_pair_id || null };
    reportRows.push(row);
    if (status === 'insert') entries.push(row);
    else if (status === 'transfer') transfers.push(row);
    else notWritten.push(row);
  }

  // Transfers: pair the negative (removal) and positive (carry) rows.
  const pairs = new Map();
  for (const t of transfers) {
    if (!t.transferPair) throw new Error(`v1 transfer ${t.v1Id} has no pair id`);
    const p = pairs.get(t.transferPair) || {};
    if (t.qty < 0) { if (p.removal) throw new Error('duplicate transfer removal'); p.removal = t; }
    else { if (p.carry) throw new Error('duplicate transfer carry'); p.carry = t; }
    pairs.set(t.transferPair, p);
  }
  for (const [key, p] of pairs) {
    if (!p.removal || !p.carry || Math.abs(p.removal.qty) !== p.carry.qty || p.removal.batch !== p.carry.batch) throw new Error(`v1 transfer pair ${key} is incomplete`);
    p.token = transferToken(key);
  }

  // Check items onto the existing v2 checks (same paired event, date and close flag).
  const v2Checks = v2ChecksAll.filter(c => c.date <= decisions.eventLaneEnd);
  const usedChecks = new Set();
  const checkItems = [];
  for (const c of v1Checks) {
    const ev = pair.get(String(c.event_id));
    if (!ev) throw new Error(`v1 check ${c.id} has no paired event`);
    const cand = v2Checks.filter(k => k.event_id === ev.id && k.date === c.check_date && k.is_close_reading === c.is_close_reading && !usedChecks.has(k.check_id));
    if (!cand.length) throw new Error(`v1 check ${c.id} has no v2 check`);
    usedChecks.add(cand[0].check_id);
    const items = typeof c.type_checks_json === 'string' ? JSON.parse(c.type_checks_json) : (c.type_checks_json || []);
    items.forEach((it, i) => {
      const qty = Number(it.remaining);
      const row = { source: 'v1', sourceKey: `v1:check-item:${c.id}:${i + 1}`, lane: 'event', status: 'check-item', date: c.check_date, qty, form: decisions.checkItemForm, type: 'grass',
        species: 'beef_cattle', place: c.pasture_name, lbDm: dmLb(qty, decisions.checkItemForm, decisions), checkId: cand[0].check_id, eventId: ev.id, location: eventLocation(ev, c.pasture_name),
        feedType: decisions.checkItemFeedType, raw: `v1 total ${it.total} (not stored)` };
      checkItems.push(row); reportRows.push(row);
    });
  }

  const batches = trueUps({ entries, decisions });
  const basis = decisions.basis.map(b => ({
    ...b,
    label: b.label ?? b.group,
    sourceKey: `basis:${b.species}:${b.label ?? b.group}:${b.start}`,
    avgWeightKg: kg4(b.lb),
    lbDmPerDay: b.head * b.lb * b.dmiPct / 100,
  }));

  const plan = { decisions, notesHash: prefix, history, entries, transfers: [...pairs.values()], checkItems, notWritten, batches, basis, reportRows };
  plan.ids = planIds(plan);
  plan.summary = summarize(plan);
  return plan;
}

function trueUps({ entries, decisions }) {
  return decisions.batches.map(b => {
    const key = b.key ?? b.name;
    const fed = entries.filter(e => e.batch === key).reduce((sum, e) => sum + e.qty, 0);
    const fedTotal = round(fed + b.v2Fed, 4);
    const trueUp = round(b.end - b.quantity + fedTotal, 4);
    if (Math.abs(trueUp - b.trueUp) > 1e-9) throw new Error(`${b.name} true-up ${trueUp} is not the locked ${b.trueUp}`);
    const offset = { prev: b.reconcile.next, next: b.reconcile.prev, delta: round(b.reconcile.prev - b.reconcile.next, 4) };
    const final = { prev: round(b.end - trueUp, 4), next: b.end, delta: trueUp };
    return { ...b, key, fedBackfill: round(fed, 4), fedTotal, offset, final };
  });
}

function planIds(plan) {
  const ids = [];
  const push = (table, key) => ids.push({ table, key, id: backfillId(table, key) });
  for (const r of plan.history) push('historical_feedings', r.sourceKey);
  for (const r of plan.basis) push('historical_animal_basis', r.sourceKey);
  for (const r of plan.entries) push('event_feed_entries', r.sourceKey);
  for (const p of plan.transfers) { push('event_feed_entries', p.removal.sourceKey); push('event_feed_entries', p.carry.sourceKey); }
  for (const r of plan.checkItems) push('event_feed_check_items', r.sourceKey);
  for (const b of plan.batches) { push('batch_adjustments', `adjustment:reverse:${b.name}`); push('batch_adjustments', `adjustment:true-up:${b.name}`); }
  if (new Set(ids.map(r => r.id)).size !== ids.length) throw new Error('duplicate backfill ids');
  return ids;
}

// ---------------------------------------------------------------------------
// Match fields (Design compares these to the 17c CSVs / REPORT)
// ---------------------------------------------------------------------------
export function summarize(plan) {
  const stored = [...plan.history, ...plan.entries];
  const add = (acc, key, r) => { acc[key] ??= { units: 0, lbDm: 0, rows: 0 }; acc[key].units += r.qty; acc[key].lbDm += r.lbDm; acc[key].rows += 1; };
  const byMonth = {}, bySpecies = {}, historyByType = {}, notWritten = {};
  for (const r of stored) {
    add(byMonth, r.date.slice(0, 7), r);
    add(bySpecies, r.species === 'sheep' ? 'sheep' : 'cattle', r);
  }
  for (const r of plan.history) add(historyByType, r.feedType, r);
  for (const r of plan.notWritten) add(notWritten, r.status, r);
  const total = stored.reduce((acc, r) => ({ units: acc.units + r.qty, lbDm: acc.lbDm + r.lbDm, rows: acc.rows + 1 }), { units: 0, lbDm: 0, rows: 0 });
  const lane = rows => ({ rows: rows.length, units: rows.reduce((s, r) => s + r.qty, 0), lbDm: rows.reduce((s, r) => s + r.lbDm, 0) });
  const fix = obj => Object.fromEntries(Object.entries(obj).sort().map(([k, v]) => [k, { rows: v.rows, units: round(v.units, 2), lbDm: round(v.lbDm, 1) }]));
  const fixOne = v => ({ rows: v.rows, units: round(v.units, 2), lbDm: round(v.lbDm, 1) });
  return {
    notesHash: plan.notesHash,
    total: fixOne(total),
    byMonth: fix(byMonth),
    bySpecies: fix(bySpecies),
    historyLane: fixOne(lane(plan.history)),
    historyByFeedType: fix(historyByType),
    historyUntyped: plan.history.filter(r => !r.feedType).length,
    historyNoWrittenType: plan.history.filter(r => r.type === 'untyped').length,
    eventLane: { ...fixOne(lane(plan.entries)), fromV1: plan.entries.filter(r => r.source === 'v1').length, fromNotes: plan.entries.filter(r => r.source === 'notes').length },
    transfers: { rows: plan.transfers.length * 2, pairs: plan.transfers.length, netUnits: round(plan.transfers.reduce((s, p) => s + p.removal.qty + p.carry.qty, 0), 4) },
    checkItems: { rows: plan.checkItems.length, checks: new Set(plan.checkItems.map(r => r.checkId)).size },
    notWritten: fix(notWritten),
    trueUps: plan.batches.map(b => ({ batch: b.key, fedTotal: b.fedTotal, offset: b.offset, trueUp: b.final, adjustmentDate: b.adjustmentDate, remainingAfter: b.end })),
    basis: {
      rows: plan.basis.length,
      cattleLbDmPerDay: round(plan.basis.filter(b => b.species !== 'sheep').reduce((s, b) => s + b.lbDmPerDay, 0), 1),
      cattleHead: plan.basis.filter(b => b.species !== 'sheep').reduce((s, b) => s + b.head, 0),
      sheepLbDmPerDay: round(plan.basis.filter(b => b.species === 'sheep').reduce((s, b) => s + b.lbDmPerDay, 0), 1),
    },
    ids: plan.ids?.length,
  };
}

/** Optional dry-run check of the run-time feed-type lookup against a read-only extract. */
export function checkFeedTypes(plan, feedTypes) {
  const names = new Set([...Object.values(plan.decisions.historyFeedTypes), plan.decisions.checkItemFeedType]);
  return [...names].map(name => {
    const hits = (feedTypes || []).filter(t => t.name === name && !t.archived);
    return { name, matches: hits.length, ok: hits.length === 1 };
  });
}

// ---------------------------------------------------------------------------
// Dry-run outputs
// ---------------------------------------------------------------------------
const CSV_COLUMNS = ['id', 'source_key', 'row_kind', 'lane', 'status', 'source', 'notes_line', 'v1_delivery_id', 'date', 'month', 'qty', 'unit', 'feed_type', 'batch', 'species', 'group_label', 'place', 'v2_event', 'v2_location', 'lb_dm', 'raw'];
const csvCell = value => { const s = value == null ? '' : String(value); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function tableOf(r) {
  if (r.status === 'check-item') return 'event_feed_check_items';
  return r.lane === 'history' ? 'historical_feedings' : 'event_feed_entries';
}

export function rowsCsv(plan) {
  const lines = [CSV_COLUMNS.join(',')];
  const label = r => r.feedType || plan.decisions.reportFeedTypes[r.type];
  const sorted = [...plan.reportRows].sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || String(a.notesLine ?? '').localeCompare(String(b.notesLine ?? '')) || a.sourceKey.localeCompare(b.sourceKey));
  for (const r of sorted) {
    const written = ['insert', 'transfer', 'check-item'].includes(r.status);
    const row = {
      id: written ? backfillId(tableOf(r), r.sourceKey) : '', source_key: r.sourceKey, row_kind: r.status === 'check-item' ? 'check_item' : 'feeding', lane: r.lane, status: r.why ? `${r.status} — ${r.why}` : r.status,
      source: r.source, notes_line: r.notesLine ?? '', v1_delivery_id: r.v1Id ?? '', date: r.date, month: r.date.slice(0, 7), qty: r.qty, unit: plan.decisions.snapshots[r.form].unit,
      feed_type: label(r), batch: r.batch ?? '', species: r.species, group_label: r.group ?? '', place: r.place ?? '', v2_event: r.eventId ? r.eventId.slice(0, 8) : '', v2_location: r.location ?? '',
      lb_dm: round(r.lbDm, 2), raw: r.raw,
    };
    lines.push(CSV_COLUMNS.map(c => csvCell(row[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const fmt = (n, places = 1) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: places });

export function reportMarkdown(plan, feedTypeCheck) {
  const s = plan.summary;
  const out = [];
  out.push('# Hay-feeding backfill — dry run', '', `Notes sha256 prefix: \`${s.notesHash}\`. No database connection; nothing written.`, '');
  out.push(`**Total stored:** ${fmt(s.total.units, 2)} units, ${fmt(s.total.lbDm, 0)} lb DM (cattle ${fmt(s.bySpecies.cattle?.units ?? 0, 2)} / ${fmt(s.bySpecies.cattle?.lbDm ?? 0, 0)}, sheep ${fmt(s.bySpecies.sheep?.units ?? 0, 2)} / ${fmt(s.bySpecies.sheep?.lbDm ?? 0, 0)}).`, '');
  out.push('| Month | Rows | Units | lb DM |', '|---|---|---|---|');
  for (const [m, v] of Object.entries(s.byMonth)) out.push(`| ${m} | ${v.rows} | ${fmt(v.units, 2)} | ${fmt(v.lbDm, 0)} |`);
  out.push('', `**History lane:** ${s.historyLane.rows} rows · ${fmt(s.historyLane.units, 2)} units · ${fmt(s.historyLane.lbDm, 0)} lb DM. By feed type: ${Object.entries(s.historyByFeedType).map(([k, v]) => `${k} ${fmt(v.units, 2)} (${v.rows} rows)`).join(' · ')}. No written type: ${s.historyNoWrittenType} rows.`);
  out.push(`**Event lane:** ${s.eventLane.rows} inserts (${s.eventLane.fromV1} v1 + ${s.eventLane.fromNotes} notes) · ${fmt(s.eventLane.units, 2)} units · ${fmt(s.eventLane.lbDm, 0)} lb DM; ${s.transfers.rows} transfer rows (${s.transfers.pairs} pairs, net ${s.transfers.netUnits}); ${s.checkItems.rows} check items on ${s.checkItems.checks} existing checks.`);
  out.push(`**Not written:** ${Object.entries(s.notWritten).map(([k, v]) => `${k} ${v.rows} (${fmt(v.units, 2)})`).join(' · ')}.`, '');
  out.push('| Batch | Fed total | Offset (prev → new, delta) | True-up (prev → new, delta) | Date | Remaining after |', '|---|---|---|---|---|---|');
  for (const b of s.trueUps) out.push(`| ${b.batch} | ${b.fedTotal} | ${b.offset.prev} → ${b.offset.next}, ${b.offset.delta > 0 ? '+' : ''}${b.offset.delta} | ${b.trueUp.prev} → ${b.trueUp.next}, ${b.trueUp.delta > 0 ? '+' : ''}${b.trueUp.delta} | ${b.adjustmentDate} | ${b.remainingAfter} |`);
  out.push('', `**Basis:** ${s.basis.rows} rows. Cattle ${s.basis.cattleHead} head, ${fmt(s.basis.cattleLbDmPerDay)} lb DM/day; sheep ${fmt(s.basis.sheepLbDmPerDay)} lb DM/day.`);
  out.push('', feedTypeCheck
    ? `**Feed-type lookup (extract):** ${feedTypeCheck.map(c => `${c.name}: ${c.matches} active match${c.matches === 1 ? '' : 'es'}${c.ok ? '' : ' — WRITE WOULD ABORT'}`).join(' · ')}`
    : '**Feed-type lookup:** no v2_feed_types.json extract given; the emitted SQL aborts unless exactly one active type has each name.');
  out.push('', `Deterministic ids: ${s.ids}.`, '');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// SQL (one guarded transaction; Orchestrator applies it)
// ---------------------------------------------------------------------------
const q = value => value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
const num = value => { if (!Number.isFinite(value)) throw new Error(`non-finite number ${value}`); return String(value); };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function emitSql(plan, { operationId }) {
  if (!UUID_RE.test(String(operationId || ''))) throw new Error('--operation-id must be a uuid');
  const d = plan.decisions;
  const op = `${q(operationId)}::uuid`;
  const refs = [];
  const ref = (kind, key) => { if (!refs.some(r => r.kind === kind && r.key === key)) refs.push({ kind, key }); return `(SELECT id FROM bf_ref WHERE kind = ${q(kind)} AND key = ${q(key)})`; };
  const loc = (eventId, name) => ref('location', `${eventId}|${name}`);
  const batchType = name => `(SELECT feed_type_id FROM public.batches WHERE id = ${ref('batch', name)})`;
  const farm = ref('farm', 'operation');
  const sql = [];
  const idList = plan.ids;

  sql.push('-- One-time historical hay-feeding backfill. Generated by scripts/oi-0222-backfill.mjs.');
  sql.push(`-- Notes sha256 prefix ${plan.notesHash}. Rows ${idList.length}. Apply only with Tim's yes and a fresh verified backup.`);
  sql.push('BEGIN;');
  sql.push('SET LOCAL lock_timeout = \'10s\';');
  sql.push(`DO $schema$
BEGIN
  IF to_regclass('public.historical_feedings') IS NULL OR to_regclass('public.historical_animal_basis') IS NULL THEN RAISE EXCEPTION 'backfill-guard: migration 045 is not applied'; END IF;
END
$schema$;`);
  sql.push('LOCK TABLE public.batches, public.batch_adjustments, public.batch_location_balances, public.event_feed_entries, public.event_feed_check_items, public.historical_feedings, public.historical_animal_basis IN SHARE ROW EXCLUSIVE MODE;');
  sql.push('CREATE TEMP TABLE bf_ids (tbl text NOT NULL, source_key text NOT NULL, id uuid NOT NULL) ON COMMIT DROP;');
  sql.push(`INSERT INTO bf_ids (tbl, source_key, id) VALUES\n${idList.map(r => `  (${q(r.table)}, ${q(r.key)}, ${q(r.id)})`).join(',\n')};`);

  // Body first so every lookup is registered; the guard block is placed before it.
  const body = [];
  const now = 'now()';
  for (const r of plan.history) {
    body.push(`INSERT INTO public.historical_feedings (id, operation_id, farm_id, date, quantity, unit_snapshot, weight_per_unit_kg_snapshot, dm_pct_snapshot, feed_type_id, feed_type_label, species, group_id, group_label, place_text, notes, source, source_key)
  VALUES (${q(backfillId('historical_feedings', r.sourceKey))}, ${op}, ${farm}, ${q(r.date)}, ${num(r.qty)}, ${q(d.snapshots[r.form].unit)}, ${num(kg4(d.snapshots[r.form].lb))}, ${num(d.snapshots[r.form].dmPct)}, ${ref('feed_type', r.feedType)}, ${q(r.feedType)}, ${q(r.species)}, NULL, ${q(r.group || null)}, ${q(r.place || null)}, ${q(r.raw)}, 'notes', ${q(r.sourceKey)})
  ON CONFLICT DO NOTHING;`);
  }
  for (const b of plan.basis) {
    body.push(`INSERT INTO public.historical_animal_basis (id, operation_id, farm_id, period_start, period_end, species, group_id, group_label, class_id, class_label, head_count, avg_weight_kg, dmi_pct_snapshot, dmi_source, source, notes, source_key)
  VALUES (${q(backfillId('historical_animal_basis', b.sourceKey))}, ${op}, ${farm}, ${q(b.start)}, ${q(b.end)}, ${q(b.species)}, ${b.group ? ref('group', b.group) : 'NULL'}, ${q(b.label)}, NULL, NULL, ${num(b.head)}, ${num(b.avgWeightKg)}, ${num(b.dmiPct)}, ${q(b.dmiSource)}, ${q(b.source)}, NULL, ${q(b.sourceKey)})
  ON CONFLICT DO NOTHING;`);
  }
  const entryCols = 'id, operation_id, event_id, batch_id, location_id, date, time, quantity, entry_type, kind, feed_type_id, unit_snapshot, weight_per_unit_kg_snapshot, dm_pct_snapshot, transfer_id, destination_type, destination_event_id, source_event_id, created_at, updated_at';
  for (const r of plan.entries) {
    const s = d.snapshots[r.form];
    body.push(`INSERT INTO public.event_feed_entries (${entryCols})
  VALUES (${q(backfillId('event_feed_entries', r.sourceKey))}, ${op}, ${q(r.eventId)}, ${ref('batch', r.batch)}, ${loc(r.eventId, r.location)}, ${q(r.date)}, NULL, ${num(r.qty)}, 'delivery', 'inventory_feeding', ${batchType(r.batch)}, ${q(s.unit)}, ${num(kg4(s.lb))}, ${num(s.dmPct)}, NULL, NULL, NULL, NULL, ${now}, ${now})
  ON CONFLICT (id) DO NOTHING;`);
  }
  for (const p of plan.transfers) {
    const s = d.snapshots[p.removal.form];
    const qty = num(p.carry.qty);
    body.push(`INSERT INTO public.event_feed_entries (${entryCols})
  VALUES (${q(backfillId('event_feed_entries', p.removal.sourceKey))}, ${op}, ${q(p.removal.eventId)}, NULL, ${loc(p.removal.eventId, p.removal.location)}, ${q(p.removal.date)}, NULL, ${qty}, 'removal', 'pool_removal', ${batchType(p.removal.batch)}, ${q(s.unit)}, ${num(kg4(s.lb))}, ${num(s.dmPct)}, ${q(p.token)}, 'event', ${q(p.carry.eventId)}, NULL, ${now}, ${now})
  ON CONFLICT (id) DO NOTHING;`);
    body.push(`INSERT INTO public.event_feed_entries (${entryCols})
  VALUES (${q(backfillId('event_feed_entries', p.carry.sourceKey))}, ${op}, ${q(p.carry.eventId)}, NULL, ${loc(p.carry.eventId, p.carry.location)}, ${q(p.carry.date)}, NULL, ${qty}, 'delivery', 'pool_carry', ${batchType(p.carry.batch)}, ${q(s.unit)}, ${num(kg4(s.lb))}, ${num(s.dmPct)}, ${q(p.token)}, NULL, NULL, ${q(p.removal.eventId)}, ${now}, ${now})
  ON CONFLICT (id) DO NOTHING;`);
  }
  for (const r of plan.checkItems) {
    const s = d.snapshots[r.form];
    body.push(`INSERT INTO public.event_feed_check_items (id, operation_id, feed_check_id, batch_id, location_id, remaining_quantity, feed_type_id, unit_snapshot, weight_per_unit_kg_snapshot, dm_pct_snapshot, created_at)
  VALUES (${q(backfillId('event_feed_check_items', r.sourceKey))}, ${op}, ${q(r.checkId)}, NULL, ${loc(r.eventId, r.location)}, ${num(r.qty)}, ${ref('feed_type', r.feedType)}, ${q(s.unit)}, ${num(kg4(s.lb))}, ${num(s.dmPct)}, ${now})
  ON CONFLICT (id) DO NOTHING;`);
  }
  for (const b of plan.batches) {
    // The offset sorts before its true-up: same transaction, so the true-up is stamped 1 ms later.
    for (const [kind, adj, stamp] of [['reverse', b.offset, 'now()'], ['true-up', b.final, "now() + interval '1 millisecond'"]]) {
      body.push(`INSERT INTO public.batch_adjustments (id, batch_id, operation_id, adjusted_by, previous_qty, new_qty, delta, reason, adjustment_date, created_at)
  VALUES (${q(backfillId('batch_adjustments', `adjustment:${kind}:${b.name}`))}, ${ref('batch', b.key)}, ${op}, NULL, ${num(adj.prev)}, ${num(adj.next)}, ${num(adj.delta)}, 'reconcile', ${q(b.adjustmentDate)}, ${stamp})
  ON CONFLICT (id) DO NOTHING;`);
    }
    const set = [`remaining = ${num(b.end)}`];
    const differs = [`remaining IS DISTINCT FROM ${num(b.end)}`];
    if (b.relabel) {
      set.push(`source = ${q(b.relabel.source)}`, `purchase_date = ${q(b.relabel.purchaseDate)}`);
      differs.push(`source IS DISTINCT FROM ${q(b.relabel.source)}`, `purchase_date IS DISTINCT FROM ${q(b.relabel.purchaseDate)}`);
    }
    body.push(`UPDATE public.batches SET ${set.join(', ')}, updated_at = now() WHERE id = ${ref('batch', b.key)} AND (${differs.join(' OR ')});`);
  }

  // ---- Guard: abort unless the live state is exactly pre-write or exactly post-write.
  const batchByKey = new Map(plan.batches.map(b => [b.key, b]));
  const refValues = refs.map(r => {
    if (r.kind !== 'batch') return `  (${q(r.kind)}, ${q(r.key)}, NULL, NULL, NULL)`;
    const b = batchByKey.get(r.key);
    if (!b) throw new Error(`batch ${r.key} has no guarded decision`);
    const dates = b.match?.purchaseDates ? `ARRAY[${b.match.purchaseDates.map(d => `${q(d)}::date`).join(', ')}]` : 'NULL';
    return `  (${q(r.kind)}, ${q(r.key)}, ${q(b.name)}, ${b.match?.quantity != null ? num(b.match.quantity) : 'NULL'}, ${dates})`;
  }).join(',\n');
  sql.push(`CREATE TEMP TABLE bf_ref (kind text NOT NULL, key text NOT NULL, name text, quantity numeric, dates date[], id uuid, PRIMARY KEY (kind, key)) ON COMMIT DROP;
INSERT INTO bf_ref (kind, key, name, quantity, dates) VALUES
${refValues};`);
  const batchGuards = plan.batches.map(b => {
    const name = q(b.key);
    const fail = what => `RAISE EXCEPTION 'backfill-guard: batch % ${what}', ${name}`;
    const values = [`r.quantity = ${num(b.quantity)}`, `r.remaining = ${num(b.remaining)}`];
    if (b.relabel) values.push(`r.cost_per_unit = ${num(b.relabel.costPerUnit)}`);
    const pre = b.relabel ? `r.purchase_date = ${q(b.relabel.fromPurchaseDate)}` : `r.source = ${q(b.keep.source)} AND r.purchase_date = ${q(b.keep.purchaseDate)}`;
    const post = b.relabel ? `r.source = ${q(b.relabel.source)} AND r.purchase_date = ${q(b.relabel.purchaseDate)}` : pre;
    const earlier = 'a.batch_id = r.id AND a.id NOT IN (SELECT id FROM bf_ids)';
    return [
      `  SELECT * INTO r FROM public.batches WHERE id = (SELECT id FROM bf_ref WHERE kind = 'batch' AND key = ${name});`,
      `  IF NOT (${values.join(' AND ')}) THEN ${fail('quantity, remaining or cost differs')}; END IF;`,
      `  IF NOT ((state = 'pre' AND ${pre}) OR (state = 'post' AND ${post})) THEN ${fail('source or purchase date differs')}; END IF;`,
      `  IF (SELECT count(*) FROM public.batch_adjustments a WHERE ${earlier}) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.batch_adjustments a WHERE ${earlier} AND a.previous_qty = ${num(b.reconcile.prev)} AND a.new_qty = ${num(b.reconcile.next)} AND a.reason = 'reconcile') THEN ${fail('does not have exactly its one earlier reconcile')}; END IF;`,
      `  IF (SELECT coalesce(sum(f.quantity), 0) FROM public.event_feed_entries f WHERE f.batch_id = r.id AND coalesce(f.kind, '') NOT IN ('pool_carry', 'pool_removal') AND f.id NOT IN (SELECT id FROM bf_ids)) <> ${num(b.v2Fed)} THEN ${fail('existing fed quantity differs')}; END IF;`,
      `  IF EXISTS (SELECT 1 FROM public.batch_location_balances l WHERE l.batch_id = r.id) AND (SELECT sum(l.quantity) FROM public.batch_location_balances l WHERE l.batch_id = r.id) <> ${num(b.end)} THEN ${fail('located balances would not sum to remaining')}; END IF;`,
    ].join('\n');
  });
  const tables = [...new Set(idList.map(r => r.table))];
  const existing = tables.map(t => `(SELECT count(*) FROM public.${t} x WHERE x.id IN (SELECT id FROM bf_ids WHERE tbl = ${q(t)}))`).join(' + ');
  sql.push(`DO $guard$
DECLARE
  n integer;
  present integer;
  state text;
  r record;
  ref record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.operations WHERE id = ${op} AND schema_version >= 45) THEN RAISE EXCEPTION 'backfill-guard: operation missing or below schema 45'; END IF;
  FOR ref IN SELECT kind, key, name, quantity, dates FROM bf_ref LOOP
    IF ref.kind = 'farm' THEN
      SELECT count(*) INTO n FROM public.farms WHERE operation_id = ${op};
      UPDATE bf_ref SET id = (SELECT id FROM public.farms WHERE operation_id = ${op} LIMIT 1) WHERE kind = ref.kind AND key = ref.key;
    ELSIF ref.kind = 'feed_type' THEN
      SELECT count(*) INTO n FROM public.feed_types WHERE operation_id = ${op} AND name = ref.key AND NOT coalesce(archived, false);
      UPDATE bf_ref SET id = (SELECT id FROM public.feed_types WHERE operation_id = ${op} AND name = ref.key AND NOT coalesce(archived, false) LIMIT 1) WHERE kind = ref.kind AND key = ref.key;
    ELSIF ref.kind = 'group' THEN
      SELECT count(*) INTO n FROM public.groups WHERE operation_id = ${op} AND name = ref.key;
      UPDATE bf_ref SET id = (SELECT id FROM public.groups WHERE operation_id = ${op} AND name = ref.key LIMIT 1) WHERE kind = ref.kind AND key = ref.key;
    ELSIF ref.kind = 'batch' THEN
      SELECT count(*) INTO n FROM public.batches b WHERE b.operation_id = ${op} AND b.name = ref.name
        AND (ref.quantity IS NULL OR b.quantity = ref.quantity) AND (ref.dates IS NULL OR b.purchase_date = ANY (ref.dates));
      UPDATE bf_ref SET id = (SELECT b.id FROM public.batches b WHERE b.operation_id = ${op} AND b.name = ref.name
        AND (ref.quantity IS NULL OR b.quantity = ref.quantity) AND (ref.dates IS NULL OR b.purchase_date = ANY (ref.dates)) LIMIT 1) WHERE kind = ref.kind AND key = ref.key;
    ELSIF ref.kind = 'location' THEN
      SELECT count(DISTINCT w.location_id) INTO n FROM public.event_paddock_windows w JOIN public.locations l ON l.id = w.location_id JOIN public.events e ON e.id = w.event_id
        WHERE e.operation_id = ${op} AND w.event_id = split_part(ref.key, '|', 1)::uuid AND l.name = substr(ref.key, position('|' in ref.key) + 1);
      UPDATE bf_ref SET id = (SELECT w.location_id FROM public.event_paddock_windows w JOIN public.locations l ON l.id = w.location_id
        WHERE w.event_id = split_part(ref.key, '|', 1)::uuid AND l.name = substr(ref.key, position('|' in ref.key) + 1) LIMIT 1) WHERE kind = ref.kind AND key = ref.key;
    ELSE
      RAISE EXCEPTION 'backfill-guard: unknown lookup kind %', ref.kind;
    END IF;
    IF n <> 1 THEN RAISE EXCEPTION 'backfill-guard: % "%" matches % rows, expected exactly 1', ref.kind, ref.key, n; END IF;
  END LOOP;
  SELECT ${existing} INTO present;
  IF present = 0 THEN state := 'pre';
  ELSIF present = ${idList.length} THEN state := 'post';
  ELSE RAISE EXCEPTION 'backfill-guard: % of ${idList.length} backfill rows already exist', present; END IF;
${batchGuards.join('\n')}
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[${[...new Set([...plan.entries, ...plan.transfers.flatMap(p => [p.removal, p.carry]), ...plan.checkItems].map(r => r.eventId))].map(id => `${q(id)}::uuid`).join(', ')}]) AS ev(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = ev.id AND e.operation_id = ${op})) THEN RAISE EXCEPTION 'backfill-guard: a paired v2 event is missing'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ${[...new Map(plan.checkItems.map(r => [r.checkId, r])).values()].map(r => `(${q(r.checkId)}::uuid, ${q(r.eventId)}::uuid, ${q(r.date)}::date)`).join(', ')}) AS c(id, event_id, date)
    WHERE NOT EXISTS (SELECT 1 FROM public.event_feed_checks k WHERE k.id = c.id AND k.event_id = c.event_id AND k.date = c.date AND k.operation_id = ${op})) THEN RAISE EXCEPTION 'backfill-guard: a target feed check is missing or moved'; END IF;
END
$guard$;`);
  sql.push(...body);
  sql.push(`DO $verify$
BEGIN
  IF (${existing}) <> ${idList.length} THEN RAISE EXCEPTION 'backfill-verify: expected ${idList.length} backfill rows'; END IF;
END
$verify$;`);
  sql.push('COMMIT;');
  return `${sql.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function parseArgs(argv) {
  const args = { dryRun: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v == null || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
    if (a === '--notes') args.notes = next();
    else if (a === '--extracts') args.extracts = next();
    else if (a === '--out') args.out = next();
    else if (a === '--emit-sql') args.emitSql = next();
    else if (a === '--operation-id') args.operationId = next();
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--decisions') args.decisions = 'builtin';
    else throw new Error(`unknown argument ${a}`);
  }
  if (!args.notes || !args.extracts) throw new Error('usage: --notes <file> --extracts <dir> [--out <dir>] [--emit-sql <file> --operation-id <uuid>]');
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const notesText = readFileSync(resolve(args.notes), 'utf8');
  const extracts = loadExtracts(resolve(args.extracts));
  const plan = buildPlan({ notesText, extracts });
  const feedTypeCheck = extracts.v2_feed_types ? checkFeedTypes(plan, extracts.v2_feed_types) : null;
  const out = resolve(args.out || 'backfill-dry-run');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.md'), reportMarkdown(plan, feedTypeCheck));
  writeFileSync(join(out, 'rows.csv'), rowsCsv(plan));
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify(plan.summary, null, 2)}\n`);
  console.log(`dry run: ${plan.summary.total.units} units, ${plan.summary.total.lbDm} lb DM -> ${out}`);
  if (args.emitSql) {
    if (feedTypeCheck?.some(c => !c.ok)) throw new Error('feed-type lookup is not exactly one active match; SQL not written');
    writeFileSync(resolve(args.emitSql), emitSql(plan, { operationId: args.operationId }));
    console.log(`sql: ${resolve(args.emitSql)} (not applied)`);
  }
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (error) { console.error(`backfill: ${error.message}`); process.exitCode = 1; }
}
