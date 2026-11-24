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
import { passMemo, ref, metricsPassActive } from './metrics-memo.js';
import { ANIMAL_CLASSES_BY_SPECIES, DEFAULT_EXCRETION_RATES } from '../features/onboarding/seed-data.js';

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
  // L1: inside a metrics render pass, scan only this animal's records (same
  // order as `records`, so ties resolve exactly as the full scan does).
  const scan = records && metricsPassActive() ? (weightIndexOf(records).get(animalId) || []) : records;
  for (const w of scan || []) {
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

/**
 * L1: weight records grouped by animal, in their original order. One index per
 * record list per render pass (the pass is dropped on every store notify).
 */
function weightIndexOf(records) {
  return passMemo('weightIndex', String(ref(records)), () => {
    const byAnimal = new Map();
    for (const w of records) {
      const list = byAnimal.get(w.animalId);
      if (list) list.push(w);
      else byAnimal.set(w.animalId, [w]);
    }
    return byAnimal;
  });
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

/**
 * Live average weight for a window (see computeLiveWindowAvgWeight). L1: inside
 * a metrics render pass the same inputs return the cached value.
 */
export function getLiveWindowAvgWeight(gw, opts) {
  const { memberships, animals, animalClasses, animalWeightRecords, now } = opts;
  return passMemo('liveAvgWeight', gw && metricsPassActive()
    ? `${ref(gw)}|${now}|${ref(memberships)}|${ref(animals)}|${ref(animalClasses)}|${ref(animalWeightRecords)}`
    : null, () => computeLiveWindowAvgWeight(gw, opts));
}

function computeLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now }) {
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

/** Clear the duplicate-group-day warning set (tests). */
export function resetWarnedDuplicateGroupDays() {
  warnedDuplicateGroupDays.clear();
}

/** True when `gw` should replace `prior` for the same group on one day. */
function preferDemandWindow(prior, gw) {
  if (!prior) return true;
  const date = (gw.dateJoined || '').localeCompare(prior.dateJoined || '');
  if (date) return date > 0;
  const time = (gw.timeJoined || '').localeCompare(prior.timeJoined || '');
  if (time) return time > 0;
  const created = (gw.createdAt || '').localeCompare(prior.createdAt || '');
  if (created) return created > 0;
  return String(gw.id || '').localeCompare(String(prior.id || '')) > 0;
}

/**
 * Farm-wide filter for daily demand: the group windows that count on `dt`.
 * A window counts only if its event exists and is open on `dt` and the
 * window itself is active on `dt` (so each window is clipped to the overlap
 * of its own dates and its event's). A group counts at most once per day:
 * when two windows qualify for the same group, the latest-joined one counts
 * (dateJoined, then timeJoined, then createdAt, then id) and a logger warning
 * (console + log buffer) gives the group name, window count and date (never ids).
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
    if (preferDemandWindow(prior, gw)) byGroup.set(key, gw);
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
function liveSpeciesMix(gw, dt, opts) {
  const { memberships, animals, animalClasses, animalWeightRecords } = opts;
  if (!memberships || !animals) return null;
  return passMemo('liveSpeciesMix', metricsPassActive()
    ? `${ref(gw)}|${dt}|${ref(memberships)}|${ref(animals)}|${ref(animalClasses)}|${ref(animalWeightRecords)}`
    : null, () => computeLiveSpeciesMix(gw, dt, opts));
}

function computeLiveSpeciesMix(gw, dt, { memberships, animals, animalClasses, animalWeightRecords }) {
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

/** DMI% used when no class rate applies (no class, null class rate with no seed, or W0). */
export const DEFAULT_DMI_PCT = 2.5;

/** Class rows as an id-keyed Map, from an array or an id-keyed object. */
export function classMapOf(animalClasses) {
  if (!animalClasses) return new Map();
  if (animalClasses instanceof Map) return animalClasses;
  // L1: one Map per class list per render pass, so callers key on the same object.
  return passMemo('classMap', metricsPassActive() ? String(ref(animalClasses)) : null, () => {
    if (Array.isArray(animalClasses)) return new Map(animalClasses.map(c => [c.id, c]));
    return new Map(Object.entries(animalClasses).map(([id, c]) => [c?.id || id, c]));
  });
}

/** L1: class rows as an array, one array per class Map per render pass. */
function classValuesOf(animalClasses) {
  const map = classMapOf(animalClasses);
  return passMemo('classValues', metricsPassActive() ? String(ref(map)) : null, () => [...map.values()]);
}

/** L1: the classes key used by the pass memo (same Map → same key). */
function classesKey(animalClasses) {
  return animalClasses instanceof Map ? ref(animalClasses) : ref(classMapOf(animalClasses));
}

/**
 * OI-0279: DMI% for one class. Class rate when set; a null rate falls back to
 * the onboarding seed rate for the class species + role, else 2.5%. No class
 * is 2.5%. `source` is 'class' | 'seed' | 'no-class' | 'no-rate'.
 */
export function classDmiPct(cls) {
  if (!cls) return { pct: DEFAULT_DMI_PCT, source: 'no-class' };
  const own = Number(cls.dmiPct);
  if (cls.dmiPct != null && Number.isFinite(own) && own > 0) return { pct: own, source: 'class' };
  const seed = (ANIMAL_CLASSES_BY_SPECIES[cls.species] || []).find(c => c.role === cls.role);
  if (seed && typeof seed.dmiPct === 'number') return { pct: seed.dmiPct, source: 'seed' };
  return { pct: DEFAULT_DMI_PCT, source: 'no-rate' };
}

function prevDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Day whose member mix applies to `dt`. A closed window read on or after its
 * leave day (window totals evaluated at dateLeft) uses its last present day.
 */
function mixDay(gw, dt) {
  if (gw.dateLeft && dt >= gw.dateLeft) {
    const last = prevDay(gw.dateLeft);
    return gw.dateJoined && last < gw.dateJoined ? gw.dateJoined : last;
  }
  return dt;
}

/**
 * OI-0279: members of the window's group live on `dt` (open or closed window;
 * membership dates decide), each with heads, weight (latest record on or
 * before the day, a composite's record is the lot total; else class default ×
 * heads; else null) and class. Empty when no member is live that day.
 */
export function groupDayMembers(gw, dt, ctx = {}) {
  const { memberships, animals, animalClasses, animalWeightRecords } = ctx;
  if (!memberships || !animals || !gw) return [];
  return passMemo('groupDayMembers', metricsPassActive()
    ? `${ref(gw)}|${dt}|${ref(memberships)}|${ref(animals)}|${classesKey(animalClasses)}|${ref(animalWeightRecords)}`
    : null, () => computeGroupDayMembers(gw, dt, ctx));
}

function computeGroupDayMembers(gw, dt, { memberships, animals, animalClasses, animalWeightRecords } = {}) {
  if (!memberships || !animals || !gw) return [];
  const day = mixDay(gw, dt);
  const byId = new Map(animals.map(a => [a.id, a]));
  const classes = classMapOf(animalClasses);
  const out = [];
  for (const m of memberships) {
    if (!isMembershipLive(m, gw.groupId, day)) continue;
    const animal = byId.get(m.animalId);
    const heads = animalHeadCount(animal);
    if (heads <= 0) continue;
    const cls = animal?.classId ? (classes.get(animal.classId) || null) : null;
    const rec = animalWeightRecords ? latestWeightForAnimal(animalWeightRecords, m.animalId, day) : null;
    let weightKg = null;
    if (rec && typeof rec.weightKg === 'number' && rec.weightKg > 0) weightKg = rec.weightKg;
    else if (cls && typeof cls.defaultWeightKg === 'number' && cls.defaultWeightKg > 0) weightKg = cls.defaultWeightKg * heads;
    out.push({ animalId: m.animalId, heads, weightKg, cls });
  }
  return out;
}

/**
 * Weight-weighted mix over live members. Members with no weight are left out;
 * when members are live but none has a weight or class default, heads weight
 * the mix instead (Design ruling, OI-0279 Q3; `byHeads`). Null when no member
 * is live.
 */
function weightedMix(members, valueOf) {
  if (!members.length) return null;
  const weighed = members.filter(m => m.weightKg > 0);
  const use = weighed.length ? weighed : members;
  const w = m => (weighed.length ? m.weightKg : m.heads);
  let sw = 0, sv = 0;
  for (const m of use) { sw += w(m); sv += w(m) * valueOf(m); }
  return sw > 0 ? { value: sv / sw, used: use, byHeads: !weighed.length } : null;
}

/**
 * OI-0279 — the one place DMI% is decided for a group on a day.
 * Effective DMI% = Σ(wᵢ × pctᵢ) ÷ Σwᵢ over members live on `dt` (wᵢ = live
 * weight, see groupDayMembers; class rate via classDmiPct). No live member
 * → W0: 2.5%. Demand kg = head × avg weight × effective % / 100, where head
 * and avg follow the live/snapshot rule (pass `head` / `avgWeightKg` to reuse
 * values the caller already has). Lactating % stays unused (L0).
 * Returns { kg, dmiPct, basis, fallbacks, head, avgWeightKg } with basis
 * 'members' | 'members+default' | 'window-default' and fallbacks
 * { noClassHeads, noRateHeads, seedHeads, byHeadsHeads } counted over the
 * members in the mix (byHeadsHeads: no member had a weight, so heads weighted
 * the mix — still 'members+default').
 */
export function groupDayDmi(gw, dt, ctx = {}) {
  return passMemo('groupDayDmi', gw && metricsPassActive()
    ? `${ref(gw)}|${dt}|${ref(ctx.memberships)}|${ref(ctx.animals)}|${classesKey(ctx.animalClasses)}|${ref(ctx.animalWeightRecords)}|${ctx.head}|${ctx.avgWeightKg}`
    : null, () => computeGroupDayDmi(gw, dt, ctx));
}

function computeGroupDayDmi(gw, dt, ctx = {}) {
  const { memberships, animals, animalWeightRecords } = ctx;
  const head = ctx.head != null ? ctx.head
    : (memberships ? getLiveWindowHeadCount(gw, { memberships, animals, now: dt }) : (gw.headCount ?? 0));
  const avgWeightKg = ctx.avgWeightKg != null ? ctx.avgWeightKg
    : (memberships
      ? getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses: classValuesOf(ctx.animalClasses), animalWeightRecords, now: dt })
      : (gw.avgWeightKg ?? 0));
  const members = groupDayMembers(gw, dt, ctx);
  const fallbacks = { noClassHeads: 0, noRateHeads: 0, seedHeads: 0, byHeadsHeads: 0 };
  const pctOf = new Map(members.map(m => [m, classDmiPct(m.cls)]));
  const mix = weightedMix(members, m => pctOf.get(m).pct);
  let dmiPct = DEFAULT_DMI_PCT;
  let basis = 'window-default';
  if (mix) {
    dmiPct = mix.value;
    for (const m of mix.used) {
      const src = pctOf.get(m).source;
      if (src === 'no-class') fallbacks.noClassHeads += m.heads;
      else if (src === 'no-rate') fallbacks.noRateHeads += m.heads;
      else if (src === 'seed') fallbacks.seedHeads += m.heads;
      if (mix.byHeads) fallbacks.byHeadsHeads += m.heads;
    }
    basis = fallbacks.noClassHeads || fallbacks.noRateHeads || fallbacks.seedHeads || fallbacks.byHeadsHeads
      ? 'members+default' : 'members';
  }
  return { kg: (head || 0) * (avgWeightKg || 0) * (dmiPct / 100), dmiPct, basis, fallbacks, head, avgWeightKg };
}

/**
 * OI-0279: N/P/K excretion rates for a group on a day from the same member
 * mix (weight-weighted class rates; a member without a class rate uses
 * `defaults`). No live member → `defaults`.
 */
export function groupDayExcretionRates(gw, dt, ctx = {}, defaults = DEFAULT_EXCRETION_RATES) {
  const rates = passMemo('groupDayExcretion', gw && metricsPassActive()
    ? `${ref(gw)}|${dt}|${ref(ctx.memberships)}|${ref(ctx.animals)}|${classesKey(ctx.animalClasses)}|${ref(ctx.animalWeightRecords)}|${defaults.n}|${defaults.p}|${defaults.k}`
    : null, () => computeGroupDayExcretionRates(gw, dt, ctx, defaults));
  return { ...rates };
}

function computeGroupDayExcretionRates(gw, dt, ctx = {}, defaults = DEFAULT_EXCRETION_RATES) {
  const members = groupDayMembers(gw, dt, ctx);
  const rate = (m, key, d) => {
    const v = m.cls?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  };
  const n = weightedMix(members, m => rate(m, 'excretionNRate', defaults.n));
  if (!n) return { ...defaults };
  return {
    n: n.value,
    p: weightedMix(members, m => rate(m, 'excretionPRate', defaults.p)).value,
    k: weightedMix(members, m => rate(m, 'excretionKRate', defaults.k)).value,
  };
}

/**
 * OI-0279 tooltip note for fallbacks across groupDayDmi results or demand
 * rows, e.g. "2 head at default 2.5% (no class)". Rows that carry the same
 * `groupWindow` (one per day) count once, at their largest head. Null when
 * every result is on class rates.
 */
export function dmiBasisNote(results) {
  const list = (Array.isArray(results) ? results : [results]).filter(Boolean);
  const byKey = new Map();
  list.forEach((r, i) => {
    const key = r.groupWindow?.id ?? `#${i}`;
    const cur = byKey.get(key) || { noClass: 0, noRate: 0, seed: 0, byHeads: 0, w0: false };
    if (r.basis === 'window-default') cur.w0 = cur.w0 || r.head > 0;
    else {
      cur.noClass = Math.max(cur.noClass, r.fallbacks?.noClassHeads || 0);
      cur.noRate = Math.max(cur.noRate, r.fallbacks?.noRateHeads || 0);
      cur.seed = Math.max(cur.seed, r.fallbacks?.seedHeads || 0);
      cur.byHeads = Math.max(cur.byHeads, r.fallbacks?.byHeadsHeads || 0);
    }
    byKey.set(key, cur);
  });
  let noClass = 0, noRate = 0, seed = 0, byHeads = 0, w0 = 0;
  for (const v of byKey.values()) {
    noClass += v.noClass; noRate += v.noRate; seed += v.seed; byHeads += v.byHeads; if (v.w0) w0 += 1;
  }
  const parts = [];
  if (noClass) parts.push(`${noClass} head at default ${DEFAULT_DMI_PCT}% (no class)`);
  if (noRate) parts.push(`${noRate} head at default ${DEFAULT_DMI_PCT}% (class has no DMI %)`);
  if (seed) parts.push(`${seed} head at standard class DMI % (class has no DMI %)`);
  if (byHeads) parts.push(`${byHeads} head weighted by head (no weights)`);
  if (w0) parts.push(`${w0} group window${w0 === 1 ? '' : 's'} at default ${DEFAULT_DMI_PCT}% (no members that day)`);
  return parts.length ? parts.join('; ') : null;
}

/**
 * Per-window predicted DMI on `dt`: one row per group window that counts on
 * `dt` with head, average weight, effective per-class DMI% (OI-0279
 * groupDayDmi), its basis and fallbacks, kg and, when members are live that
 * day (open or closed window), their heads and live weight by class species
 * (`speciesMix`). Windows carry no class, so `species` is null and pasture
 * splits read `speciesMix`. `groupWindowsDailyDmiKg` is the sum of `kg`, so
 * DMI-8, FED-6 and DMI-9 share one demand. `animalClasses` is an id-keyed map
 * or an array. When `events` is given (farm demand), only windows on events
 * open on `dt` count, once per group (farmDemandWindowsOn); DMI-8 passes one
 * event's windows and no `events`.
 */
export function groupWindowsDailyDemand(dt, opts = {}) {
  const { groupWindows, memberships, animals, animalClasses, animalWeightRecords, events, groups } = opts;
  const rows = passMemo('groupWindowsDailyDemand', metricsPassActive()
    ? `${dt}|${ref(groupWindows)}|${ref(memberships)}|${ref(animals)}|${classesKey(animalClasses)}|${ref(animalWeightRecords)}|${ref(events)}|${ref(groups)}`
    : null, () => computeGroupWindowsDailyDemand(dt, opts));
  return rows.slice();
}

function computeGroupWindowsDailyDemand(dt, { groupWindows, memberships, animals, animalClasses, animalWeightRecords, events, groups } = {}) {
  const rows = [];
  const counted = events ? farmDemandWindowsOn(dt, { groupWindows, events, groups }).windows : groupWindows;
  const classMap = classMapOf(animalClasses);
  const classObj = passMemo('classObj', metricsPassActive() ? String(ref(classMap)) : null, () => Object.fromEntries(classMap));
  for (const gw of counted || []) {
    if (gw.dateJoined > dt) continue;
    if (gw.dateLeft && gw.dateLeft <= dt) continue;
    const d = groupDayDmi(gw, dt, { memberships, animals, animalClasses: classMap, animalWeightRecords });
    rows.push({ groupWindow: gw, eventId: gw.eventId, species: null, speciesMix: liveSpeciesMix(gw, dt, { memberships, animals, animalClasses: classObj, animalWeightRecords }),
      head: d.head, avgWeightKg: d.avgWeightKg, dmiPct: d.dmiPct, basis: d.basis, fallbacks: d.fallbacks, kg: d.kg });
  }
  return rows;
}

/**
 * Predicted daily DMI (kg) of every group window that counts on `dt`:
 * head × average weight × effective per-class DMI% (OI-0279), live for open
 * windows (OI-0091). Shared by DMI-8's daily demand and the feed run rate
 * forecast. When `events` is given (farm demand), only windows on events
 * open on `dt` count, once per group (farmDemandWindowsOn); DMI-8 passes one
 * event's windows and no `events`.
 * Sums `groupWindowsDailyDemand` so DMI-8, FED-6 and DMI-9 share one demand.
 */
export function groupWindowsDailyDmiKg(dt, opts = {}) {
  let total = 0;
  for (const row of groupWindowsDailyDemand(dt, opts)) total += row.kg;
  return total;
}
