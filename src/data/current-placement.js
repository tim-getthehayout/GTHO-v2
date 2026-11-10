/** @file Shared current-placement resolver (OI-0205).
 *
 * Only open group windows whose parent event exists and is open count as
 * placed. When more than one such window exists, pick the latest-joined
 * event (dateJoined, then timeJoined, then id) and return every distinct
 * open paddock of that event. Do not union distinct open events, and do
 * not treat a valid open window as unplaced. Pure: no I/O, no mutation.
 */

/** Latest-joined first; never fall back to input/insertion order. */
export function compareGroupWindowsLatestFirst(a, b) {
  return (b.dateJoined || '').localeCompare(a.dateJoined || '')
    || (b.timeJoined || '').localeCompare(a.timeJoined || '')
    || String(b.id || '').localeCompare(String(a.id || ''));
}

function comparePaddockWindowsEarliestFirst(a, b) {
  return (a.dateOpened || '').localeCompare(b.dateOpened || '')
    || (a.timeOpened || '').localeCompare(b.timeOpened || '')
    || String(a.id || '').localeCompare(String(b.id || ''));
}

function asMap(items) {
  if (!items) return new Map();
  if (items instanceof Map) return items;
  return new Map(items.map((item) => [item.id, item]));
}

export function isOpenEvent(event) {
  return !!(event && !event.dateOut);
}

/**
 * Distinct open paddocks on an event, earliest-open first.
 * Duplicate location windows keep a single label (first in that order).
 */
export function listOpenPaddocksForEvent(eventId, paddockWindows = [], locations = []) {
  const locMap = asMap(locations);
  const seen = new Set();
  const result = [];
  const windows = (paddockWindows || [])
    .filter((w) => w.eventId === eventId && !w.dateClosed)
    .slice()
    .sort(comparePaddockWindowsEarliestFirst);
  for (const window of windows) {
    if (seen.has(window.locationId)) continue;
    seen.add(window.locationId);
    const loc = locMap.get(window.locationId);
    result.push({
      locationId: window.locationId,
      name: loc?.name || null,
      window,
    });
  }
  return result;
}

export function formatPaddockDisplayName(paddocks) {
  const names = (paddocks || []).map((p) => p.name).filter(Boolean);
  if (names.length) return names.join(', ');
  if ((paddocks || []).length) return '?';
  return '';
}

function emptyPlacement() {
  return {
    placed: false,
    eventId: null,
    event: null,
    farmId: null,
    groupWindow: null,
    groupWindows: [],
    locationIds: [],
    locationNames: [],
    displayName: '',
    openEventIds: [],
    hasConflictingOpenEvents: false,
  };
}

/**
 * Resolve the current placement for a group from already-loaded records.
 *
 * @returns {object} placement — `placed` is true iff at least one open
 *   group window has an existing open parent event. `hasConflictingOpenEvents`
 *   is informational only (OI-0205 leaves display policy for distinct
 *   conflicting events as an open product question); callers must not union
 *   those events or show "unplaced" when `placed` is true.
 */
export function resolveCurrentPlacement({
  groupId,
  groupWindows = [],
  events = [],
  paddockWindows = [],
  locations = [],
} = {}) {
  if (!groupId) return emptyPlacement();

  const eventMap = asMap(events);
  const valid = (groupWindows || [])
    .filter((w) => w.groupId === groupId && !w.dateLeft)
    .filter((w) => isOpenEvent(eventMap.get(w.eventId)))
    .slice()
    .sort(compareGroupWindowsLatestFirst);

  if (!valid.length) return emptyPlacement();

  const openEventIds = [];
  const seenEvents = new Set();
  for (const window of valid) {
    if (seenEvents.has(window.eventId)) continue;
    seenEvents.add(window.eventId);
    openEventIds.push(window.eventId);
  }

  const eventId = openEventIds[0];
  const event = eventMap.get(eventId) || null;
  const windowsOnEvent = valid.filter((w) => w.eventId === eventId);
  const paddocks = listOpenPaddocksForEvent(eventId, paddockWindows, locations);
  const locationNames = paddocks.map((p) => p.name).filter(Boolean);

  return {
    placed: true,
    eventId,
    event,
    farmId: event?.farmId ?? null,
    groupWindow: windowsOnEvent[0] || null,
    groupWindows: windowsOnEvent,
    locationIds: paddocks.map((p) => p.locationId),
    locationNames,
    displayName: formatPaddockDisplayName(paddocks),
    openEventIds,
    hasConflictingOpenEvents: openEventIds.length > 1,
  };
}
