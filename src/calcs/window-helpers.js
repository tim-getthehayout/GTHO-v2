/**
 * @file Live read helpers for event_group_window — OI-0091.
 *
 * Rule: stored snapshot for closed windows, live recompute for open windows.
 * When an event_group_window has `dateLeft == null`, calc/render paths must
 * read through these helpers rather than the window's `headCount` /
 * `avgWeightKg` fields, which are authoritative only for closed windows.
 *
 * Membership gating (per session brief "Known traps"):
 *   dateJoined <= now  AND  (dateLeft == null OR dateLeft > now)
 * Inclusive lower bound, exclusive upper bound — a cull on 2026-04-15
 * closes the old window at 2026-04-15 and opens a new one on 2026-04-15;
 * the new window's live count excludes the animal that left that day.
 *
 * Pure functions, no store deps. Caller threads memberships / animals /
 * animalWeightRecords + `now`.
 */

import { logger } from '../utils/logger.js';

function isMembershipLive(m, groupId, now) {
  if (m.groupId !== groupId) return false;
  if (m.dateJoined && m.dateJoined > now) return false;
  if (m.dateLeft && m.dateLeft <= now) return false;
  return true;
}

/**
 * Head represented by one animal row.
 * An individual is 1. A composite is bulkHeadCount, floored at 0.
 * A missing animal record stays 1 so older callers that lack the row do not drop a membership.
 */
export function animalHeadCount(animal) {
  if (!animal || animal.isBulk !== true) return 1;
  const n = Number(animal.bulkHeadCount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Head across memberships. Pass `animals` so composites contribute bulkHeadCount.
 * Without `animals`, each membership counts as 1 (pre-composite behavior).
 */
export function sumMembershipHeads(memberships, animals, pred) {
  const byId = new Map((animals || []).map(a => [a.id, a]));
  let head = 0;
  for (const m of memberships || []) {
    if (pred && !pred(m)) continue;
    head += animals ? animalHeadCount(byId.get(m.animalId)) : 1;
  }
  return head;
}

/**
 * Yes on the composite-reduce prompt.
 * Head drops by the number of individuals added, floored at 0.
 * Weight drops by that same share of the composite's latest total weight, floored at 0.
 * No weight on file leaves weightKgAfter null (nothing to subtract).
 */
export function reduceCompositeTotals({ headBefore, weightKg, headsToRemove }) {
  const before = Math.max(0, Math.floor(Number(headBefore) || 0));
  const remove = Math.max(0, Math.floor(Number(headsToRemove) || 0));
  const applied = Math.min(remove, before);
  const headAfter = Math.max(0, before - remove);
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg)) {
    return { headAfter, weightKgAfter: null };
  }
  if (before <= 0 || applied <= 0) return { headAfter, weightKgAfter: Math.max(0, weightKg) };
  return { headAfter, weightKgAfter: Math.max(0, weightKg - (weightKg * applied / before)) };
}

/** Calendar day of a weight row. Records store recordedAt; older rows may only have date. */
export function weightRecordDay(record) {
  const stamp = record?.recordedAt || record?.date || '';
  return String(stamp).slice(0, 10);
}

/**
 * Latest finite weight for one animal on or before `now` (YYYY-MM-DD).
 * Ordering uses the full recordedAt timestamp, then date. A same-day
 * timestamp is included: only the calendar day is compared with `now`.
 */
export function latestWeightForAnimal(records, animalId, now) {
  let best = null;
  let bestStamp = '';
  for (const w of records || []) {
    if (w.animalId !== animalId) continue;
    if (typeof w.weightKg !== 'number' || !Number.isFinite(w.weightKg)) continue;
    const day = weightRecordDay(w);
    if (now && day && day > now) continue;
    const stamp = w.recordedAt || w.date || '';
    if (!best || stamp > bestStamp) {
      best = w;
      bestStamp = stamp;
    }
  }
  return best;
}

export function getLiveWindowHeadCount(gw, { memberships, now, animals } = {}) {
  if (gw.dateLeft != null) return gw.headCount ?? 0;
  if (!memberships || !now) return gw.headCount ?? 0;
  const live = memberships.filter(m => isMembershipLive(m, gw.groupId, now));
  if (!animals) return live.length;
  return sumMembershipHeads(live, animals);
}

/**
 * OI-0095 helper: return the single currently-open event_paddock_window for
 * a (locationId, eventId) pair, or null. Used by calcs/renders that need
 * "what area_pct is in force right now" without scanning every window.
 *
 * Pure — requires the `paddockWindows` array to be passed in. Callers threading
 * through fresh store state (e.g., dashboard/index.js, locations/index.js)
 * should `getAll('eventPaddockWindows')` and pass that array.
 *
 * @param {string} locationId
 * @param {string} eventId
 * @param {Array} paddockWindows
 * @returns {object|null}
 */
export function getOpenPwForLocation(locationId, eventId, paddockWindows) {
  if (!locationId || !eventId || !paddockWindows) return null;
  return paddockWindows.find(
    pw => pw.locationId === locationId && pw.eventId === eventId && !pw.dateClosed,
  ) || null;
}

export function getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now }) {
  if (gw.dateLeft != null) return gw.avgWeightKg ?? 0;
  if (!memberships || !animals || !now) return gw.avgWeightKg ?? 0;

  const liveAnimalIds = memberships
    .filter(m => isMembershipLive(m, gw.groupId, now))
    .map(m => m.animalId);
  if (liveAnimalIds.length === 0) return gw.avgWeightKg ?? 0;

  const weightsByAnimal = new Map();
  if (animalWeightRecords) {
    const seen = new Set();
    for (const w of animalWeightRecords) {
      if (!w.animalId || seen.has(w.animalId)) continue;
      seen.add(w.animalId);
      const latest = latestWeightForAnimal(animalWeightRecords, w.animalId, now);
      if (latest) weightsByAnimal.set(w.animalId, latest);
    }
  }

  // OI-0130: class-default fallback tier. V2_CALCULATION_SPEC.md fallback
  // chain is live → snapshot → class default → 0; this map covers tier 3.
  const classDefaultByAnimalId = new Map();
  if (animalClasses && animals) {
    const classById = new Map(animalClasses.map(c => [c.id, c]));
    for (const id of liveAnimalIds) {
      const a = animals.find(an => an.id === id);
      const cls = a?.classId ? classById.get(a.classId) : null;
      if (cls && typeof cls.defaultWeightKg === 'number' && cls.defaultWeightKg > 0) {
        classDefaultByAnimalId.set(id, cls.defaultWeightKg);
      }
    }
  }

  const animalById = new Map(animals.map(a => [a.id, a]));
  let sum = 0;
  let count = 0;
  for (const id of liveAnimalIds) {
    const animal = animalById.get(id);
    const rec = weightsByAnimal.get(id);
    // A composite weight record is the lot total, and the class default is per head.
    if (animal?.isBulk === true) {
      const heads = animalHeadCount(animal);
      if (heads <= 0) continue;
      if (rec && typeof rec.weightKg === 'number') {
        sum += rec.weightKg;
        count += heads;
      } else if (classDefaultByAnimalId.has(id)) {
        sum += classDefaultByAnimalId.get(id) * heads;
        count += heads;
      }
      continue;
    }
    if (rec && typeof rec.weightKg === 'number') {
      sum += rec.weightKg;
      count += 1;
    } else if (classDefaultByAnimalId.has(id)) {
      sum += classDefaultByAnimalId.get(id);
      count += 1;
    }
    // else: no per-animal weight and no class default — drop from count
    // rather than pollute the average with a false zero.
  }
  if (count === 0) return gw.avgWeightKg ?? 0;
  return sum / count;
}

/** True when any live animal in an open window lacks a weight record and a class default. */
export function hasUnknownLiveWindowWeights(gw, opts) {
  if (gw.dateLeft != null) return false;
  if (!opts?.memberships || !opts?.animals || !opts?.now) return false;
  const liveAnimalIds = opts.memberships
    .filter(m => isMembershipLive(m, gw.groupId, opts.now))
    .map(m => m.animalId);
  if (!liveAnimalIds.length) return false;
  const animalById = new Map(opts.animals.map(a => [a.id, a]));
  const classes = opts.animalClasses;
  const classById = new Map(Array.isArray(classes) ? classes.map(c => [c.id, c]) : Object.entries(classes || {}).map(([id, c]) => [c.id || id, c]));
  for (const id of liveAnimalIds) {
    const rec = latestWeightForAnimal(opts.animalWeightRecords, id, opts.now);
    if (rec && typeof rec.weightKg === 'number') continue;
    const animal = animalById.get(id);
    const cls = animal?.classId ? classById.get(animal.classId) : null;
    if (cls && typeof cls.defaultWeightKg === 'number' && cls.defaultWeightKg > 0) continue;
    return true;
  }
  return false;
}

/** An event is open on `dt` when dateIn ≤ dt and it has no dateOut or dt < dateOut. */
export function eventOpenOn(event, dt) {
  return !!event?.dateIn && event.dateIn <= dt && (!event.dateOut || dt < event.dateOut);
}

const warnedDuplicateGroupDays = new Set();

/**
 * Farm-wide filter for daily demand: the group windows that count on `dt`.
 * A window counts only if its event exists and is open on `dt` and the
 * window itself is active on `dt` (so each window is clipped to the overlap
 * of its own dates and its event's). A group counts at most once per day:
 * when two windows qualify for the same group, the latest-joined one counts
 * and a logger warning (console + log buffer) gives the group name, window
 * count and date (never ids).
 * `events` is an array or an id-keyed map; `groups` (optional) supplies names.
 */
export function farmDemandWindowsOn(dt, { groupWindows, events, groups } = {}) {
  const eventById = Array.isArray(events) ? new Map(events.map(e => [e.id, e])) : new Map(Object.entries(events || {}));
  const byGroup = new Map();
  const counts = new Map();
  for (const gw of groupWindows || []) {
    if (gw.dateJoined > dt) continue;
    if (gw.dateLeft && gw.dateLeft <= dt) continue;
    if (!eventOpenOn(eventById.get(gw.eventId), dt)) continue;
    const key = gw.groupId ?? gw.id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const prior = byGroup.get(key);
    if (!prior || (gw.dateJoined || '') > (prior.dateJoined || '')) byGroup.set(key, gw);
  }
  let duplicates = 0;
  for (const [key, n] of counts) {
    if (n < 2) continue;
    duplicates += n - 1;
    const warnKey = `${key}|${dt}`;
    if (warnedDuplicateGroupDays.has(warnKey)) continue;
    warnedDuplicateGroupDays.add(warnKey);
    const groupList = Array.isArray(groups) ? groups : Object.values(groups || {});
    const name = groupList.find(g => g.id === key)?.name || 'A group';
    // Diagnostic only: the group name, count and date (no ids).
    logger.warn('demand', `${name} has ${n} open windows on ${dt}; counted once`, { windows: n, date: dt });
  }
  return { windows: [...byGroup.values()], duplicates };
}

/**
 * Members live on `dt` by class species: heads, and live weight (latest weight
 * record on or before `dt`, else class default × heads, as the average-weight
 * helper). Works for closed windows too (membership dates decide). Null when
 * no member is live that day.
 */
function liveSpeciesMix(gw, dt, { memberships, animals, animalClasses, animalWeightRecords }) {
  if (!memberships || !animals) return null;
  const byId = new Map(animals.map(a => [a.id, a]));
  const heads = new Map(), weights = new Map();
  for (const m of memberships) {
    if (!isMembershipLive(m, gw.groupId, dt)) continue;
    const animal = byId.get(m.animalId);
    const cls = animal?.classId && animalClasses ? animalClasses[animal.classId] : null;
    const species = cls?.species ?? null;
    const n = animalHeadCount(animal);
    heads.set(species, (heads.get(species) ?? 0) + n);
    const rec = animalWeightRecords ? latestWeightForAnimal(animalWeightRecords, m.animalId, dt) : null;
    const kg = rec && typeof rec.weightKg === 'number' ? rec.weightKg
      : (cls && typeof cls.defaultWeightKg === 'number' && cls.defaultWeightKg > 0 ? cls.defaultWeightKg * n : 0);
    weights.set(species, (weights.get(species) ?? 0) + kg);
  }
  return heads.size ? { heads, weights } : null;
}

/**
 * Per-window predicted DMI on `dt`: one row per group window that counts
 * on `dt` with head, average weight, class DMI% (2.5 when unset), kg, the
 * window class species (null when the window has no class) and, when members
 * are live that day (open or closed window), their heads and live weight by
 * class species (`speciesMix`). `groupWindowsDailyDmiKg` is the
 * sum of `kg`, so DMI-8, FED-6 and DMI-9 share one demand.
 * `animalClasses` is a map keyed by class id. When `events` is given (farm
 * demand), only windows on events open on `dt` count, once per group
 * (farmDemandWindowsOn); DMI-8 passes one event's windows and no `events`.
 */
export function groupWindowsDailyDemand(dt, { groupWindows, memberships, animals, animalClasses, animalWeightRecords, events, groups } = {}) {
  const rows = [];
  const counted = events ? farmDemandWindowsOn(dt, { groupWindows, events, groups }).windows : groupWindows;
  for (const gw of counted || []) {
    if (gw.dateJoined > dt) continue;
    if (gw.dateLeft && gw.dateLeft <= dt) continue;
    const cls = gw.animalClassId && animalClasses ? animalClasses[gw.animalClassId] : null;
    const pct = cls?.dmiPct ?? 2.5;
    const head = memberships
      ? getLiveWindowHeadCount(gw, { memberships, animals, now: dt })
      : (gw.headCount ?? 0);
    const avg = memberships
      // OI-0130: the helper expects the { id, defaultWeightKg, ... } array shape.
      ? getLiveWindowAvgWeight(gw, {
          memberships, animals,
          animalClasses: animalClasses ? Object.values(animalClasses) : null,
          animalWeightRecords, now: dt,
        })
      : (gw.avgWeightKg ?? 0);
    rows.push({ groupWindow: gw, eventId: gw.eventId, species: cls?.species ?? null, speciesMix: liveSpeciesMix(gw, dt, { memberships, animals, animalClasses, animalWeightRecords }),
      head, avgWeightKg: avg, dmiPct: pct, kg: head * avg * (pct / 100) });
  }
  return rows;
}

/**
 * Predicted daily DMI (kg) of every group window that counts on `dt`:
 * head × average weight × class DMI% (2.5 when unset), live for open windows
 * (OI-0091). Shared by DMI-8's daily demand and the feed run rate forecast.
 * `animalClasses` is a map keyed by class id. When `events` is given (farm
 * demand), only windows on events open on `dt` count, once per group
 * (farmDemandWindowsOn); DMI-8 passes one event's windows and no `events`.
 * Sums `groupWindowsDailyDemand` so DMI-8, FED-6 and DMI-9 share one demand.
 */
export function groupWindowsDailyDmiKg(dt, opts = {}) {
  let total = 0;
  for (const row of groupWindowsDailyDemand(dt, opts)) total += row.kg;
  return total;
}
