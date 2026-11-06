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
    for (const w of animalWeightRecords) {
      if (!w.animalId || !w.weightKg) continue;
      if (w.date && w.date > now) continue;
      const prev = weightsByAnimal.get(w.animalId);
      if (!prev || (w.date || '') > (prev.date || '')) {
        weightsByAnimal.set(w.animalId, w);
      }
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
