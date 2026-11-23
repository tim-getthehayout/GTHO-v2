/**
 * @file OI-0264 Pw1+Hc1+Mw1+Cn1 — Rotation past blocks are per paddock window.
 * Pure helpers (store-free) for the bar span, head count at the window's end,
 * window-scoped label metrics, and the sub-move connectors between paddocks of
 * one event. Rendering lives in calendar-grid.js / past-block.js.
 */

import { daysBetweenInclusive, getLocalTodayStr } from '../../../utils/date-utils.js';
import { getLiveWindowHeadCount } from '../../../calcs/window-helpers.js';
import { computeLocationMetrics } from './location-metrics.js';

const day = (v) => (v ? String(v).slice(0, 10) : null);

/**
 * Pw1 — bar span for one paddock window: dateOpened → dateClosed; an open window
 * runs to today; a window still open on a closed event stops at the event close.
 * A window that closes after its event draws as recorded.
 * @returns {{ start: string, end: string, days: number, isActive: boolean }|null}
 */
export function pastWindowSpan(pw, event, { today = getLocalTodayStr(), fallbackStart = null } = {}) {
  if (!pw) return null;
  const start = day(pw.dateOpened) || day(fallbackStart);
  if (!start) return null;
  let end = day(pw.dateClosed);
  if (!end) end = day(event?.dateOut) || today;
  if (end < start) end = start;
  return {
    start,
    end,
    days: daysBetweenInclusive(start, end),
    // NOW ring follows the window, not the event (Pw1).
    isActive: !pw.dateClosed,
  };
}

function cmpNullLast(a, b) {
  // Descending preference: larger value wins; null is the least preferred.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return String(b).localeCompare(String(a));
}

/**
 * Hc1 tie-break among one group's windows present on E: latest dateJoined,
 * then timeJoined (null last); then the later dateLeft (open = latest), then timeLeft.
 */
export function compareGroupWindowPreference(a, b) {
  const dj = cmpNullLast(day(a.dateJoined), day(b.dateJoined));
  if (dj) return dj;
  const tj = cmpNullLast(a.timeJoined, b.timeJoined);
  if (tj) return tj;
  const leftA = a.dateLeft == null ? '9999-12-31' : day(a.dateLeft);
  const leftB = b.dateLeft == null ? '9999-12-31' : day(b.dateLeft);
  const dl = String(leftB).localeCompare(String(leftA));
  if (dl) return dl;
  if (a.dateLeft == null || b.dateLeft == null) return 0;
  return cmpNullLast(a.timeLeft, b.timeLeft);
}

/** Hc1 presence on E — inclusive at both ends; bad windows (left < joined) skipped. */
export function groupWindowPresentOnEnd(gw, endDate) {
  const joined = day(gw?.dateJoined);
  if (!joined || !endDate) return false;
  const left = day(gw.dateLeft);
  if (left && left < joined) return false; // bad data
  if (joined > endDate) return false;
  if (left && left < endDate) return false;
  return true;
}

/**
 * Hc1 — head count at the window's end date E (pw.dateClosed, else today), each
 * group once. Returns the picked group windows, distinct groups (label) and head.
 * @returns {{ endDate: string, picks: object[], groups: Array<{id: string, name: string}>, headCount: number }}
 */
export function headCountAtWindowEnd(pw, {
  eventGroupWindows = [],
  groups = [],
  memberships = [],
  animals = [],
  today = getLocalTodayStr(),
} = {}) {
  const endDate = day(pw?.dateClosed) || today;
  const byGroup = new Map();
  for (const gw of eventGroupWindows || []) {
    if (!groupWindowPresentOnEnd(gw, endDate)) continue;
    const list = byGroup.get(gw.groupId) || [];
    list.push(gw);
    byGroup.set(gw.groupId, list);
  }
  const picks = [];
  for (const list of byGroup.values()) {
    picks.push(list.slice().sort(compareGroupWindowPreference)[0]);
  }
  const headCount = picks.reduce((sum, gw) => sum
    + (getLiveWindowHeadCount(gw, { memberships, animals, now: endDate }) || 0), 0);
  const groupList = [];
  for (const gw of picks) {
    const g = (groups || []).find(x => x.id === gw.groupId);
    if (g) groupList.push({ id: g.id, name: g.name });
  }
  return { endDate, picks, groups: groupList, headCount };
}

/**
 * Mw1 — label metrics for one paddock window: the List metrics calc
 * (`computeLocationMetrics`) scoped to the window's dates, its event and the
 * window itself. storedFeedOnly (OI-0256) wins; unknown DMI → null (OI-0253).
 * @returns {{ auds: number|null, dmi: number|null, pasturePct: number|null, feedPct: number|null, storedFeedOnly: boolean, raw: object|null }}
 */
export function computePaddockWindowMetrics(pw, location, event, span, ctx = {}) {
  const raw = runWindowMetrics(pw, location, event, span, ctx);
  const auds = raw?.audsKnown ? raw.auds : null;
  // OI-0256 Mt1 first: stored-feed-only window is Pasture 0 / Feed 100 / 0 DMI.
  if (pw?.noPasture) {
    return { auds, dmi: 0, pasturePct: 0, feedPct: 100, storedFeedOnly: true, raw };
  }
  const dmiKnown = !!raw?.dmiKnown && raw.dmiKg != null;
  const dmi = dmiKnown ? raw.dmiKg : null;
  let pasturePct = null;
  let feedPct = null;
  if (dmiKnown) {
    const stored = Number(raw.storedFeedDmiKg) || 0;
    const total = dmi + stored;
    // Known zero demand → "—%" rather than a fake 100/0.
    if (total > 0) {
      pasturePct = (dmi / total) * 100;
      feedPct = 100 - pasturePct;
    }
  }
  return { auds, dmi, pasturePct, feedPct, storedFeedOnly: false, raw };
}

function runWindowMetrics(pw, location, event, span, ctx) {
  if (!pw || !location || !event || !span) return null;
  return computeLocationMetrics(location, {
    ...ctx,
    windowStart: span.start,
    windowEnd: span.end,
    events: [event],
    onlyPaddockWindowId: pw.id,
  });
}

function windowOrder(a, b) {
  const d = String(day(a.dateOpened) || '').localeCompare(String(day(b.dateOpened) || ''));
  if (d) return d;
  const t = String(a.timeOpened || '').localeCompare(String(b.timeOpened || ''));
  if (t) return t;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function openOn(pw, date) {
  const o = day(pw.dateOpened);
  if (!o || o > date) return false;
  const c = day(pw.dateClosed);
  return !c || c > date;
}

/**
 * Cn1 — connectors for one event: every window opening after the event's first
 * window links from the source bar at its open date. Source = earliest-opened
 * window still open that day; if none, the one closed most recently on/before it.
 * Windows opening together on the first day link to the first window.
 * @param {object[]} eventWindows - paddock windows of one event
 * @returns {Array<{ date: string, fromPwId: string, toPwId: string, fromLocationId: string, toLocationId: string }>}
 */
export function eventConnectors(eventWindows = []) {
  const wins = (eventWindows || []).filter(pw => day(pw.dateOpened)).slice().sort(windowOrder);
  if (wins.length < 2) return [];
  const first = wins[0];
  const firstDay = day(first.dateOpened);
  const out = [];
  for (const w of wins.slice(1)) {
    const date = day(w.dateOpened);
    let source;
    if (date === firstDay) {
      source = first;
    } else {
      const candidates = wins.filter(x => x !== w && day(x.dateOpened) <= date);
      source = candidates.find(x => openOn(x, date)) || null;
      if (!source) {
        const closedBefore = candidates
          .filter(x => day(x.dateClosed) && day(x.dateClosed) <= date)
          .sort((a, b) => String(day(b.dateClosed)).localeCompare(String(day(a.dateClosed))));
        source = closedBefore[0] || null;
      }
    }
    if (!source) continue;
    out.push({
      date,
      fromPwId: source.id,
      toPwId: w.id,
      fromLocationId: source.locationId,
      toLocationId: w.locationId,
    });
  }
  return out;
}
