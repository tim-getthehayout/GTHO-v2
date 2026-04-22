/** @file Shared DMI-8 chart context builder (OI-0119).
 *
 * Gathers every input the DMI-8 calc needs for a given event: group windows,
 * memberships, animals, weights, feed entries, feed checks, check items,
 * batches, paddock windows, paddock_observations, forage types, locations,
 * animal classes. Centralizes:
 *   - The OI-0112 paddock_observations fix (type='open', source='event' —
 *     the prior event_observations collection was dropped in migration 029,
 *     OI-0113).
 *   - The OI-0075 Bug 3 / OI-0119 areaHectares fallback.
 *   - The OI-0117 derived event.dateIn decoration via getEventStartDate.
 *
 * Dashboard card + Event Detail §3 both import this. The date-routing
 * source-event bridge is also here as `computeDmi8Days`.
 */

import { getAll, getById } from '../../data/store.js';
import { getEventStartDate } from './event-start.js';

/**
 * Build the full DMI-8 input context for a single event.
 * Returns null if the event does not exist.
 */
export function buildDmi8ChartContext(eventId) {
  const event = getById('events', eventId);
  if (!event) return null;

  const eventStart = getEventStartDate(eventId);

  const groupWindows = getAll('eventGroupWindows').filter(gw => gw.eventId === eventId);
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === eventId);
  const feedChecks = getAll('eventFeedChecks').filter(fc => fc.eventId === eventId);
  const feedCheckItems = getAll('eventFeedCheckItems').filter(fci =>
    feedChecks.some(fc => fc.id === fci.feedCheckId),
  );
  const paddockWindows = getAll('eventPaddockWindows').filter(pw => pw.eventId === eventId);

  // OI-0112/OI-0119: paddock_observations is the sole observation source.
  // The prior event_observations table was dropped in migration 029 (OI-0113).
  // Filter to open/event-sourced here; DMI-8 picks per-window via locationId
  // + sourceId fallback.
  const observations = getAll('paddockObservations')
    .filter(o => o.type === 'open' && o.source === 'event');

  // Build forageTypes + locations maps keyed by locationId. Apply the
  // areaHectares ?? areaHa fallback once, here — no caller should read
  // `.areaHa` directly off a location entity.
  const forageTypes = {};
  const locations = {};
  for (const pw of paddockWindows) {
    const loc = getById('locations', pw.locationId);
    if (!loc) continue;
    locations[pw.locationId] = {
      areaHa: loc.areaHectares ?? loc.areaHa,
      forageTypeId: loc.forageTypeId ?? null,
      name: loc.name,
    };
    if (loc.forageTypeId) {
      const ft = getById('forageTypes', loc.forageTypeId);
      if (ft) {
        forageTypes[pw.locationId] = {
          dmKgPerCmPerHa: ft.dmKgPerCmPerHa,
          minResidualHeightCm: ft.minResidualHeightCm,
          utilizationPct: ft.utilizationPct,
        };
      }
    }
  }

  // Batches map keyed by batchId for DM conversion of feed entries + check items.
  const batches = {};
  for (const fe of feedEntries) {
    if (batches[fe.batchId]) continue;
    const b = getById('batches', fe.batchId);
    if (b) batches[fe.batchId] = { weightPerUnitKg: b.weightPerUnitKg, dmPct: b.dmPct };
  }
  for (const fci of feedCheckItems) {
    if (batches[fci.batchId]) continue;
    const b = getById('batches', fci.batchId);
    if (b) batches[fci.batchId] = { weightPerUnitKg: b.weightPerUnitKg, dmPct: b.dmPct };
  }

  // OI-0130: include `id` and `defaultWeightKg` so the map values round-trip
  // back to an id'd class-row shape at the getLiveWindowAvgWeight call-site
  // (Object.values(animalClasses) → array of { id, defaultWeightKg, ... }).
  const animalClasses = {};
  for (const gw of groupWindows) {
    if (!gw.animalClassId || animalClasses[gw.animalClassId]) continue;
    const cls = getById('animalClasses', gw.animalClassId);
    if (cls) animalClasses[gw.animalClassId] = {
      id: cls.id,
      defaultWeightKg: cls.defaultWeightKg,
      dmiPct: cls.dmiPct,
      dmiPctLactating: cls.dmiPctLactating,
    };
  }

  return {
    event: { ...event, dateIn: eventStart }, // OI-0117 derived decoration
    eventStart,
    groupWindows, memberships, animals, animalWeightRecords,
    feedEntries, feedChecks, feedCheckItems, batches,
    paddockWindows, observations,
    forageTypes, locations, animalClasses,
  };
}

/**
 * Compute the 3-day chart input array with date-routing source-event bridge.
 * For each date in the window, pick the event that owned that date (current
 * event, or sourceEvent if date < current event start) and run DMI-8 against
 * THAT event's self-contained cascade. No state handoff across events.
 *
 * @param {object} event - the current event
 * @param {object} dmi8 - the calc (from getCalcByName)
 * @param {object} [opts]
 * @param {string} [opts.today] - ISO YYYY-MM-DD override for tests
 * @returns {Array<{ date: string, label: string, result: object }>}
 */
export function computeDmi8Days(event, dmi8, opts = {}) {
  const todayStr = opts.today || new Date().toISOString().slice(0, 10);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [];
  const ctxCache = new Map(); // eventId -> context

  const ownerStart = getEventStartDate(event.id);

  function ctxFor(eventId) {
    if (ctxCache.has(eventId)) return ctxCache.get(eventId);
    const c = buildDmi8ChartContext(eventId);
    ctxCache.set(eventId, c);
    return c;
  }

  for (let i = 2; i >= 0; i--) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = dayNames[d.getDay()];
    const baseLabel = i === 0 ? `${dayName} \u2713` : dayName;

    // Date-routing: if this date precedes the current event's start and a
    // source event exists, run that event's own cascade instead.
    let ownerEventId = event.id;
    if (ownerStart && dateStr < ownerStart && event.sourceEventId) {
      ownerEventId = event.sourceEventId;
    }
    const ctx = ctxFor(ownerEventId);
    if (!ctx) continue;

    const result = dmi8.fn({
      event: ctx.event,
      date: dateStr,
      groupWindows: ctx.groupWindows,
      memberships: ctx.memberships,
      animals: ctx.animals,
      animalWeightRecords: ctx.animalWeightRecords,
      feedEntries: ctx.feedEntries,
      feedChecks: ctx.feedChecks,
      feedCheckItems: ctx.feedCheckItems,
      batches: ctx.batches,
      paddockWindows: ctx.paddockWindows,
      observations: ctx.observations,
      forageTypes: ctx.forageTypes,
      locations: ctx.locations,
      animalClasses: ctx.animalClasses,
    });
    days.push({ date: dateStr, label: baseLabel, result });
  }

  return days;
}
