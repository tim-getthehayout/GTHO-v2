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

export function getLiveWindowHeadCount(gw, { memberships, now }) {
  if (gw.dateLeft != null) return gw.headCount ?? 0;
  if (!memberships || !now) return gw.headCount ?? 0;
  return memberships.filter(m => isMembershipLive(m, gw.groupId, now)).length;
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

export function getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now }) {
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

  let sum = 0;
  let count = 0;
  for (const id of liveAnimalIds) {
    const rec = weightsByAnimal.get(id);
    if (rec && typeof rec.weightKg === 'number') {
      sum += rec.weightKg;
      count += 1;
    }
  }
  if (count === 0) return gw.avgWeightKg ?? 0;
  return sum / count;
}
