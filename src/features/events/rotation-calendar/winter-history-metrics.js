/**
 * @file #451 — store-facing glue for the winter hay history (calcs/winter-history.js).
 * One figure for every date-range total: the calendar season/Period totals strip
 * (Calendar and List share it) and the Home Total/Pasture DMI. Not used by the
 * run rate, forecasts or rotation readiness. History has no location, so the
 * OI-0251 archive toggle does not apply (always included).
 *
 * Event windows win: a basis row's day is clipped when its group has an
 * event-window need that day; a basis row with no group is clipped when any
 * event window of the same species has need that day. A window's species is
 * its live members' species that day, else the species of every animal ever
 * in that group (e.g. the OI-0251 Sheep-history window, no live members).
 */
import { groupWindowsDailyDemand } from '../../../calcs/window-helpers.js';
import {
  computeWinterHistory, sliceWinterHistory, historySpeciesKey, winterHistoryBlocks,
} from '../../../calcs/winter-history.js';
import { deriveEventStartDate } from './location-metrics.js';

/** Species keys of every animal ever in each group (memberships, any date). */
export function groupSpeciesEver({ memberships = [], animals = [], animalClasses = [] } = {}) {
  const animalById = new Map((animals || []).map(a => [a.id, a]));
  const classes = Array.isArray(animalClasses) ? animalClasses : Object.values(animalClasses || {});
  const classById = new Map(classes.map(c => [c.id, c]));
  const out = new Map();
  for (const m of memberships || []) {
    const cls = classById.get(animalById.get(m.animalId)?.classId);
    const key = historySpeciesKey(cls?.species);
    if (!key) continue;
    if (!out.has(m.groupId)) out.set(m.groupId, new Set());
    out.get(m.groupId).add(key);
  }
  return out;
}

/** isClipped(row, date) for computeWinterHistory, from the event windows in ctx. */
export function winterHistoryClipFn(ctx = {}) {
  const { paddockWindows = [], groupWindows = [] } = ctx;
  const events = (ctx.events || []).map(event => ({
    id: event.id,
    dateIn: event.dateIn || deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }),
    dateOut: event.dateOut ?? null,
  })).filter(e => e.dateIn);
  const everSpecies = groupSpeciesEver(ctx);
  const demandOpts = {
    groupWindows,
    memberships: ctx.memberships || [],
    animals: ctx.animals || [],
    animalClasses: ctx.animalClasses || [],
    animalWeightRecords: ctx.animalWeightRecords || [],
    events,
    groups: ctx.groups || [],
  };
  const byDate = new Map();
  const needOn = (date) => {
    if (byDate.has(date)) return byDate.get(date);
    const groups = new Set();
    const species = new Set();
    for (const row of groupWindowsDailyDemand(date, demandOpts)) {
      if (!(row.head > 0)) continue;
      const groupId = row.groupWindow?.groupId;
      if (groupId) groups.add(groupId);
      const live = row.speciesMix?.heads ? [...row.speciesMix.heads.keys()].map(historySpeciesKey).filter(Boolean) : [];
      const keys = live.length ? live : [...(everSpecies.get(groupId) || [])];
      for (const k of keys) species.add(k);
    }
    const v = { groups, species };
    byDate.set(date, v);
    return v;
  };
  return (row, date) => {
    const need = needOn(date);
    return row.groupId ? need.groups.has(row.groupId) : need.species.has(historySpeciesKey(row.species));
  };
}

let lastDeps = null;
let lastHistory = null;
const DEP_KEYS = ['historicalAnimalBasis', 'historicalFeedings', 'events', 'paddockWindows', 'groupWindows', 'memberships', 'animals', 'animalClasses', 'animalWeightRecords'];

/** Window-independent history for this ctx (re-used while the ctx arrays are unchanged). */
export function winterHistoryFor(ctx = {}) {
  const deps = DEP_KEYS.map(k => ctx[k]);
  if (lastDeps && deps.every((d, i) => d === lastDeps[i])) return lastHistory;
  const basisRows = ctx.historicalAnimalBasis || [];
  const feedingRows = ctx.historicalFeedings || [];
  lastHistory = (basisRows.length || feedingRows.length)
    ? computeWinterHistory({ basisRows, feedingRows, isClipped: winterHistoryClipFn(ctx) })
    : new Map();
  lastDeps = deps;
  return lastHistory;
}

/**
 * Winter history over [windowStart, min(windowEnd, today)] — need, hay eaten,
 * pasture (11-18 rule) and hay over need, total and by species.
 */
export function winterHistoryTotals(ctx = {}, windowStart, windowEnd, today) {
  const through = today && windowEnd > today ? today : windowEnd;
  return sliceWinterHistory(winterHistoryFor(ctx), windowStart, through);
}

/** Calendar blocks for the Winter history row (one per basis row, clipped dates). */
export function winterHistoryBlocksFor(ctx = {}) {
  return winterHistoryBlocks(winterHistoryFor(ctx));
}
