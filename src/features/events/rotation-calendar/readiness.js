/**
 * @file Future grazing readiness (T0).
 * OI-0262 Ra1+Bd1+Pb1+Dz1+Sv2: REC-1 window anchored on the later of the latest
 * closed paddock window's date_closed (close obs by sourceId, else farm defaults)
 * and a survey dated after it; band runs anchor + min → anchor + max. Relative days since last graze only when no
 * window has a close date.
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
 * OI-0262 Dz1 — local calendar date (YYYY-MM-DD) of an observation timestamp.
 * Never a UTC `slice(0, 10)`: an evening ET close stamped next-day UTC keeps its
 * local date. Bare YYYY-MM-DD strings pass through unchanged.
 * @param {string|Date|null|undefined} value
 * @returns {string|null}
 */
export function localDateOf(value) {
  if (value == null || value === '') return null;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = value instanceof Date ? value : new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function instantMs(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const t = new Date(String(value)).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Latest first by real instant (not string order across offsets), then createdAt. */
function byLatestObservation(a, b) {
  const d = instantMs(b.observedAt) - instantMs(a.observedAt);
  if (d !== 0) return d;
  return instantMs(b.createdAt) - instantMs(a.createdAt);
}

function hasRecoveryDays(o) {
  return !!o && (o.recoveryMinDays != null || o.recoveryMaxDays != null);
}

/**
 * The close observation tied to a paddock window (`sourceId === pw.id`, type close).
 * @returns {object|null}
 */
export function closeObservationForWindow(pw, observations = []) {
  const matches = (observations || []).filter(o =>
    o.sourceId === pw.id && o.locationId === pw.locationId
    && o.type === 'close' && o.source !== 'survey');
  if (!matches.length) return null;
  return matches.slice().sort(byLatestObservation)[0];
}

/**
 * Pick the latest recovery-bearing observation for a location (legacy helper).
 * OI-0262 Ra1: no longer the readiness anchor — see closeRecoveryAnchor.
 */
export function pickRecoveryObservation(locationId, observations = []) {
  const withRec = (observations || [])
    .filter(o => o.locationId === locationId && hasRecoveryDays(o))
    .slice()
    .sort(byLatestObservation);
  return withRec[0] || null;
}

/**
 * OI-0262 Ra1 — close anchor: the latest closed paddock window's `dateClosed`;
 * min/max from that window's close observation (`sourceId`), else farm defaults.
 * Strip grazing: also returns the other closed strips in the anchor's strip group
 * so whole-paddock readiness waits until every strip is past its minimum.
 * @returns {null | {
 *   source: 'close', date: string, minDays: number, maxDays: number,
 *   paddockWindowId: string|null, observationId: string|null,
 *   strips: Array<{ date: string, minDays: number, maxDays: number }>,
 * }}
 */
export function closeRecoveryAnchor(locationId, {
  paddockWindows = [],
  observations = [],
  defaultRecoveryMinDays = 21,
  defaultRecoveryMaxDays = 35,
} = {}) {
  const closed = (paddockWindows || []).filter(pw => pw.locationId === locationId && pw.dateClosed);
  if (!closed.length) return null;
  const dayOf = pw => String(pw.dateClosed).slice(0, 10);
  const latestDay = closed.reduce((acc, pw) => (dayOf(pw) > acc ? dayOf(pw) : acc), '');
  const sameDay = closed.filter(pw => dayOf(pw) === latestDay);
  // Same-day closes (e.g. sub-move + parent): prefer the one whose close obs carries recovery days.
  const anchorPw = sameDay.find(pw => hasRecoveryDays(closeObservationForWindow(pw, observations)))
    || sameDay[0];
  const recoveryFor = (pw) => {
    const obs = closeObservationForWindow(pw, observations);
    return {
      obs,
      minDays: obs?.recoveryMinDays ?? defaultRecoveryMinDays,
      maxDays: obs?.recoveryMaxDays ?? defaultRecoveryMaxDays,
    };
  };
  const anchorRec = recoveryFor(anchorPw);
  const strips = [];
  if (anchorPw.isStripGraze && anchorPw.stripGroupId) {
    for (const pw of closed) {
      if (pw === anchorPw || pw.stripGroupId !== anchorPw.stripGroupId) continue;
      const rec = recoveryFor(pw);
      strips.push({ date: dayOf(pw), minDays: rec.minDays, maxDays: rec.maxDays });
    }
  }
  return {
    source: 'close',
    date: latestDay,
    minDays: anchorRec.minDays,
    maxDays: anchorRec.maxDays,
    paddockWindowId: anchorPw.id ?? null,
    observationId: anchorRec.obs?.id ?? null,
    strips,
  };
}

/**
 * Latest pasture survey for a location (`paddock_observations.source = 'survey'`),
 * dated by local calendar day.
 * @returns {null | { source: 'survey', date: string, minDays: number|null, maxDays: number|null, observationId: string|null }}
 */
export function latestSurveyAnchor(locationId, observations = []) {
  const surveys = (observations || [])
    .filter(o => o.locationId === locationId && o.source === 'survey' && localDateOf(o.observedAt))
    .slice()
    .sort(byLatestObservation);
  const o = surveys[0];
  if (!o) return null;
  return {
    source: 'survey',
    date: localDateOf(o.observedAt),
    minDays: o.recoveryMinDays ?? null,
    maxDays: o.recoveryMaxDays ?? null,
    observationId: o.id ?? null,
  };
}

/**
 * OI-0262 anchor seam — later-of(close anchor, survey anchor). Sv2 latest-wins
 * (Tim t1275u): whichever came last carries the recovery window.
 * - Survey dated strictly after the close → survey date + survey min..max,
 *   "Surveyed on" label; a survey missing recovery days takes the close anchor's
 *   min/max (close observation, else farm defaults) per field.
 * - Otherwise (no survey, earlier survey, or same-day survey) → close date +
 *   close min..max, "Estimated" label. A later close re-anchors automatically.
 * @param {ReturnType<typeof closeRecoveryAnchor>} closeAnchor
 * @param {ReturnType<typeof latestSurveyAnchor>} surveyAnchor
 * @returns {null | {
 *   date: string, minDays: number, maxDays: number,
 *   dateSource: 'close'|'survey', labelKind: 'estimated'|'surveyed', surveyDate: string|null,
 * }}
 */
export function selectReadinessAnchor(closeAnchor, surveyAnchor) {
  if (!closeAnchor) return null;
  const surveyIsLater = !!(surveyAnchor?.date && surveyAnchor.date > closeAnchor.date);
  if (surveyIsLater) {
    return {
      date: surveyAnchor.date,
      minDays: surveyAnchor.minDays ?? closeAnchor.minDays,
      maxDays: surveyAnchor.maxDays ?? closeAnchor.maxDays,
      dateSource: 'survey',
      labelKind: 'surveyed',
      surveyDate: surveyAnchor.date,
    };
  }
  return {
    date: closeAnchor.date,
    minDays: closeAnchor.minDays,
    maxDays: closeAnchor.maxDays,
    dateSource: 'close',
    labelKind: 'estimated',
    surveyDate: null,
  };
}

/** "Sep 20" — local short month + day for readiness labels. */
export function formatReadinessDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * OI-0262 Pb1 (Tim t1270u wording).
 * @param {{ labelKind: 'estimated'|'surveyed', surveyDate: string|null }} anchor
 * @param {string} earliestReturn
 */
export function readinessLabel(anchor, earliestReturn) {
  const ready = formatReadinessDate(earliestReturn);
  if (anchor?.labelKind === 'surveyed' && anchor.surveyDate) {
    return `Surveyed on ${formatReadinessDate(anchor.surveyDate)}, estimated ready ${ready}`;
  }
  return `Estimated ready ${ready}`;
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
 *   anchor?: object,
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

  // OI-0262 Ra1+Bd1: REC-1 window from the paddock close date (not the obs entry time).
  const closeAnchor = closeRecoveryAnchor(location.id, {
    paddockWindows, observations, defaultRecoveryMinDays, defaultRecoveryMaxDays,
  });
  const anchor = selectReadinessAnchor(closeAnchor, latestSurveyAnchor(location.id, observations));
  const rec1 = getCalcByName('REC-1');

  if (anchor && rec1 && anchor.minDays != null && anchor.maxDays != null) {
    let { earliestReturn, windowCloses } = rec1.fn({
      observedAt: anchor.date,
      recoveryMinDays: anchor.minDays,
      recoveryMaxDays: anchor.maxDays,
    });
    // Strip grazing: whole paddock is ready only once every strip is past its min.
    if (anchor.dateSource === 'close' && closeAnchor?.strips?.length) {
      for (const strip of closeAnchor.strips) {
        const r = rec1.fn({
          observedAt: strip.date, recoveryMinDays: strip.minDays, recoveryMaxDays: strip.maxDays,
        });
        if (r.earliestReturn > earliestReturn) earliestReturn = r.earliestReturn;
      }
      if (windowCloses < earliestReturn) windowCloses = earliestReturn;
    }
    const confidence = readinessConfidence(today, earliestReturn, windowCloses);
    return {
      mode: 'survey',
      earliestReturn,
      windowCloses,
      confidence,
      daysSinceLastGraze: daysBetweenInclusive(last, today) - 1,
      relativeRank: null,
      peerCount: 0,
      label: readinessLabel(anchor, earliestReturn),
      anchor,
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

/**
 * OI-0273 Rg0+Ro0+Rp1 — the chip by the pasture name.
 * - 'ready'  (“Ready”):  survey mode (a real recovery anchor; strip rule already
 *   folded into earliestReturn) and today ≥ earliestReturn. Past windowCloses
 *   (past_max) still plain “Ready” (Ro0).
 * - 'maybe'  (“Ready?”): relative mode (grazed before, no rest estimate) and
 *   daysSinceLastGraze ≥ the farm default minimum rest.
 * - null: active / linked (caller passes isActive), never grazed (Rg0), or not yet.
 * @param {object|null|undefined} readiness - computeReadiness result
 * @param {{ today: string, minRestDays?: number, isActive?: boolean }} opts
 * @returns {'ready'|'maybe'|null}
 */
export function readyChipKind(readiness, { today, minRestDays = 21, isActive = false } = {}) {
  if (!readiness || isActive || readiness.mode === 'active') return null;
  if (readiness.mode === 'survey') {
    return readiness.earliestReturn && today >= readiness.earliestReturn ? 'ready' : null;
  }
  if (readiness.mode === 'relative') {
    const days = readiness.daysSinceLastGraze;
    const min = Number.isFinite(Number(minRestDays)) ? Number(minRestDays) : 21;
    return days != null && days >= min ? 'maybe' : null;
  }
  return null;
}

/** OI-0273: visible chip text. */
export const READY_CHIP_TEXT = Object.freeze({ ready: 'Ready', maybe: 'Ready?' });

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

/**
 * OI-0254 Rd1 — close-event estimated readiness band (earliest→latest), or null.
 * @param {{ mode?: string, earliestReturn?: string|null, windowCloses?: string|null }|null|undefined} readiness
 * @returns {{ start: string, end: string }|null}
 */
export function readinessBandRange(readiness) {
  if (!readiness || readiness.mode !== 'survey') return null;
  const start = readiness.earliestReturn ? String(readiness.earliestReturn).slice(0, 10) : null;
  const end = readiness.windowCloses ? String(readiness.windowCloses).slice(0, 10) : null;
  if (!start || !end) return null;
  return { start, end };
}

