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
    // NOW ring follows the window (Pw1). OI-0266 (c) guard: a window still open
    // on a closed event stops at the event close, so it is not "now" either —
    // ring only when the window has no close date AND the event has no end date.
    isActive: !pw.dateClosed && !day(event?.dateOut),
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
 * Hc1 — head count at the window's end date E (pw.dateClosed, else the event's
 * dateOut when the window is still open on a closed event — OI-0266 (c) guard,
 * matching the bar — else today), each group once. Returns the picked group windows, distinct groups (label) and head.
 * @returns {{ endDate: string, picks: object[], groups: Array<{id: string, name: string}>, headCount: number }}
 */
export function headCountAtWindowEnd(pw, {
  eventGroupWindows = [],
  groups = [],
  memberships = [],
  animals = [],
  today = getLocalTodayStr(),
  event = null,
} = {}) {
  const endDate = day(pw?.dateClosed) || day(event?.dateOut) || today;
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** #466 Hd1: "Nov 19–23", "Oct 30–Nov 2", "Nov 19" (en dash). */
export function formatDayRange(start, end) {
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  const s = `${MONTHS[sm - 1]} ${sd}`;
  if (start === end) return s;
  if (sm === em && start.slice(0, 4) === end.slice(0, 4)) return `${s}–${ed}`;
  return `${s}–${MONTHS[em - 1]} ${ed}`;
}

/** #466 Hd1: "48 hd" or "105–159 hd" (en dash); null/unknown → null. */
export function formatHeadRange(hr) {
  if (!hr || hr.min == null || hr.max == null) return null;
  return hr.min === hr.max ? `${hr.min} hd` : `${hr.min}–${hr.max} hd`;
}

/**
 * #466 Hd1 (LOCKED, Tim t1602s6295; Design comment 1649) — display only.
 * Total head per day across the block, from the event's group windows that
 * overlap it (`head_count`; an open window counts live, as Hc1 does). Group
 * windows are date-granular: a window counts from its join day up to, not
 * including, its leave day (the group is elsewhere that day), so a re-split
 * on day D is counted once. A closed block counts its days before the close
 * day; a one-day or still-open block also counts its last day.
 * Any overlapping window with an unknown head count → { unknown: true } and
 * no range (the caller keeps the existing count). Calcs keep headCountAtWindowEnd.
 * @param {{ start: string, end: string, isActive?: boolean }} span - the block's dates
 * @returns {{ min: number|null, max: number|null, unknown: boolean, lines: Array<{ groupId: string, name: string, headCount: number|null, start: string, end: string, text: string }> }}
 */
export function headRangeInWindow(span, {
  eventGroupWindows = [],
  groups = [],
  memberships = [],
  animals = [],
} = {}) {
  const out = { min: null, max: null, unknown: false, lines: [] };
  if (!span?.start || !span?.end) return out;
  const { start, end } = span;
  const includeEnd = start === end || !!span.isActive;
  const days = [];
  for (let d = start; d < end || (d === end && includeEnd); d = addDays(d, 1)) days.push(d);
  if (!days.length) days.push(start);

  const valid = (eventGroupWindows || []).filter((gw) => {
    const joined = day(gw?.dateJoined);
    if (!joined) return false;
    const left = day(gw.dateLeft);
    if (left && left < joined) return false; // bad data (Hc1)
    return joined <= end && (!left || left >= start);
  });
  const activeOn = (gw, d) => {
    const joined = day(gw.dateJoined);
    const left = day(gw.dateLeft);
    if (joined > d) return false;
    if (!left) return true;
    if (d < left) return true;
    // Leave day counts only when the window is that single day.
    return d === left && joined === left;
  };
  const headOf = (gw, d) => {
    if (gw.dateLeft != null) return gw.headCount == null ? null : Number(gw.headCount);
    if (!memberships?.length) return gw.headCount == null ? null : Number(gw.headCount);
    return getLiveWindowHeadCount(gw, { memberships, animals, now: d });
  };

  const totals = [];
  for (const d of days) {
    let sum = 0;
    let any = false;
    for (const gw of valid) {
      if (!activeOn(gw, d)) continue;
      const hd = headOf(gw, d);
      if (hd == null || !Number.isFinite(hd)) out.unknown = true;
      else sum += hd;
      any = true;
    }
    if (any) totals.push(sum);
  }
  if (!out.unknown && totals.length) {
    out.min = Math.min(...totals);
    out.max = Math.max(...totals);
  }

  // Hover lines: one per group window clipped to the block; contiguous windows
  // of one group with the same head merge (Goats Nov 19–20 + Nov 20–23 → Nov 19–23).
  const lastDay = days[days.length - 1];
  const segs = valid.map((gw) => {
    const joined = day(gw.dateJoined);
    const left = day(gw.dateLeft);
    return {
      groupId: gw.groupId,
      headCount: headOf(gw, left || lastDay),
      start: joined < start ? start : joined,
      end: !left || left > end ? end : left,
    };
  }).sort((a, b) => String(a.groupId).localeCompare(String(b.groupId))
    || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const merged = [];
  for (const sg of segs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.groupId === sg.groupId && prev.headCount === sg.headCount
      && sg.start <= prev.end) {
      if (sg.end > prev.end) prev.end = sg.end;
      continue;
    }
    merged.push({ ...sg });
  }
  const order = new Map((groups || []).map((g, i) => [g.id, i]));
  out.lines = merged
    .map((sg) => {
      const name = (groups || []).find(g => g.id === sg.groupId)?.name || '—';
      const hd = sg.headCount == null || !Number.isFinite(sg.headCount) ? '—' : sg.headCount;
      return { ...sg, name, text: `${name}: ${hd} hd · ${formatDayRange(sg.start, sg.end)}` };
    })
    // Stayed latest first, then joined earliest, then the groups list order — stable hover.
    .sort((a, b) => b.end.localeCompare(a.end)
      || a.start.localeCompare(b.start)
      || ((order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0))
      || a.name.localeCompare(b.name));
  return out;
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
