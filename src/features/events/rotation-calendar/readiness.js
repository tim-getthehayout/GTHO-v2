/**
 * @file Future grazing readiness (T0).
 * Prefer pasture survey / REC-1 recovery window when present; else relative
 * days since last graze ranked vs other in-scope paddocks.
 */

import { getCalcByName } from '../../../utils/calc-registry.js';
import { getLocalTodayStr, daysBetweenInclusive } from '../../../utils/date-utils.js';

/**
 * Last graze end date for a location (YYYY-MM-DD), or null if never grazed.
 * Uses paddock window dateClosed, else event.dateOut, else today for open windows.
 */
export function lastGrazeDate(locationId, { paddockWindows = [], events = [], today = getLocalTodayStr() } = {}) {
  let latest = null;
  for (const pw of paddockWindows) {
    if (pw.locationId !== locationId) continue;
    const event = (events || []).find(e => e.id === pw.eventId);
    let end = pw.dateClosed || null;
    if (!end && event?.dateOut) end = event.dateOut;
    if (!end && event && !event.dateOut) end = today; // still grazing → "last" is today
    if (!end) continue;
    const day = String(end).slice(0, 10);
    if (!latest || day > latest) latest = day;
  }
  return latest;
}

/**
 * Pick the best recovery observation for a location:
 * latest paddockObservation that has recoveryMinDays and/or recoveryMaxDays
 * (or forageQuality with farm default recovery — caller may pass defaults).
 */
export function pickRecoveryObservation(locationId, observations = [], { today = getLocalTodayStr() } = {}) {
  const candidates = (observations || [])
    .filter(o => o.locationId === locationId)
    .filter(o => o.recoveryMinDays != null || o.recoveryMaxDays != null || o.observedAt)
    .slice()
    .sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || '')));
  // Prefer ones that actually carry recovery days
  const withRec = candidates.find(o => o.recoveryMinDays != null || o.recoveryMaxDays != null);
  return withRec || null;
}

/**
 * Compute readiness for one location.
 * @returns {{
 *   mode: 'survey'|'relative'|'never'|'active',
 *   earliestReturn: string|null,
 *   windowCloses: string|null,
 *   confidence: 'min'|'mid'|'max'|'past_max',
 *   daysSinceLastGraze: number|null,
 *   relativeRank: number|null,  // 1 = most rested among peers with relative mode
 *   peerCount: number,
 *   label: string,
 * }}
 */
export function computeReadiness(location, {
  today = getLocalTodayStr(),
  paddockWindows = [],
  events = [],
  observations = [],
  peerLastGrazeDates = null, // Map locationId → date|null; when provided, fills relativeRank
  defaultRecoveryMinDays = 21,
  defaultRecoveryMaxDays = 35,
  hasActiveEvent = false,
} = {}) {
  if (hasActiveEvent) {
    return {
      mode: 'active',
      earliestReturn: null,
      windowCloses: null,
      confidence: 'min',
      daysSinceLastGraze: 0,
      relativeRank: null,
      peerCount: 0,
      label: 'Grazing in progress',
    };
  }

  const last = lastGrazeDate(location.id, { paddockWindows, events, today });
  if (!last) {
    return {
      mode: 'never',
      earliestReturn: null,
      windowCloses: null,
      confidence: 'min',
      daysSinceLastGraze: null,
      relativeRank: null,
      peerCount: 0,
      label: 'Never grazed — survey to confirm',
    };
  }

  const obs = pickRecoveryObservation(location.id, observations, { today });
  const rec1 = getCalcByName('REC-1');

  if (obs && (obs.recoveryMinDays != null || obs.recoveryMaxDays != null) && obs.observedAt && rec1) {
    const minDays = obs.recoveryMinDays ?? defaultRecoveryMinDays;
    const maxDays = obs.recoveryMaxDays ?? defaultRecoveryMaxDays;
    const observedAt = String(obs.observedAt).slice(0, 10);
    const { earliestReturn, windowCloses } = rec1.fn({
      observedAt,
      recoveryMinDays: minDays,
      recoveryMaxDays: maxDays,
    });
    const confidence = readinessConfidence(today, earliestReturn, windowCloses);
    return {
      mode: 'survey',
      earliestReturn,
      windowCloses,
      confidence,
      daysSinceLastGraze: daysBetweenInclusive(last, today) - 1,
      relativeRank: null,
      peerCount: 0,
      label: `Ready ${earliestReturn} – ${windowCloses}`,
    };
  }

  // Relative days since last graze
  const daysSince = daysBetweenInclusive(last, today) - 1;
  let relativeRank = null;
  let peerCount = 0;
  if (peerLastGrazeDates instanceof Map) {
    const peers = [];
    for (const [id, date] of peerLastGrazeDates) {
      if (!date) continue;
      peers.push({ id, days: daysBetweenInclusive(date, today) - 1 });
    }
    peerCount = peers.length;
    peers.sort((a, b) => b.days - a.days); // most rested first
    const idx = peers.findIndex(p => p.id === location.id);
    relativeRank = idx >= 0 ? idx + 1 : null;
  }

  const rankText = relativeRank != null && peerCount > 0
    ? ` · #${relativeRank}/${peerCount} rested`
    : '';
  return {
    mode: 'relative',
    earliestReturn: null,
    windowCloses: null,
    confidence: 'min',
    daysSinceLastGraze: daysSince,
    relativeRank,
    peerCount,
    label: `${daysSince}d since last graze${rankText}`,
  };
}

export function readinessConfidence(today, earliestReturn, windowCloses) {
  if (!earliestReturn || !windowCloses) return 'min';
  if (today < earliestReturn) return 'min';
  if (today > windowCloses) return 'past_max';
  // Midpoint of window
  const span = daysBetweenInclusive(earliestReturn, windowCloses);
  const into = daysBetweenInclusive(earliestReturn, today);
  if (into <= Math.ceil(span / 2)) return 'mid';
  return 'max';
}

/**
 * Attach readiness (+ relative ranks) to a list of location rows.
 */
export function attachReadiness(locations, ctx) {
  const { paddockWindows = [], events = [], today = getLocalTodayStr() } = ctx;
  const peerLast = new Map();
  for (const loc of locations) {
    peerLast.set(loc.id, lastGrazeDate(loc.id, { paddockWindows, events, today }));
  }
  return locations.map(loc => {
    const active = (paddockWindows || []).some(
      pw => pw.locationId === loc.id && !pw.dateClosed && !pw.closedAt
        && (events || []).some(e => e.id === pw.eventId && !e.dateOut),
    );
    return {
      locationId: loc.id,
      readiness: computeReadiness(loc, {
        ...ctx,
        peerLastGrazeDates: peerLast,
        hasActiveEvent: active,
      }),
    };
  });
}
