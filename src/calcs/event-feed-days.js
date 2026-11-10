/** @file Shared event-scoped end-of-today feed-days projection (OI-0209 / FOR-4).
 *
 * Pure confinement cards replace the pasture-capacity line with
 * "Est. feed remaining: ~N days" (end-of-today daily-model estimate).
 * Dashboard and Event Detail must call this once — do not use farm-wide
 * Feed-screen days or the dashboard feed-mass fallback.
 */

import { isPureConfinementOnDate, hasInvalidFeedConversion } from './location-type.js';
import { hasUnknownLiveWindowWeights } from './window-helpers.js';

const HIDDEN = Object.freeze({
  visible: false,
  days: null,
  remainingStoredDmKg: null,
  remainingPastureDmKg: null,
  demandKg: null,
  isPureConfinement: false,
  reason: 'hidden',
});

function hide(reason, extra = {}) {
  return { ...HIDDEN, reason, ...extra };
}

/**
 * @param {object} opts
 * @param {Function} opts.dmi8Fn  DMI-8 calc function
 * @param {Function} opts.for4Fn  FOR-4 calc function
 * @param {object} opts.ctx       buildDmi8ChartContext result (or equivalent)
 * @param {string} opts.today     YYYY-MM-DD
 * @returns {{ visible: boolean, days: number|null, remainingStoredDmKg: number|null,
 *   remainingPastureDmKg: number|null, demandKg: number|null,
 *   isPureConfinement: boolean, reason: string, dmi8?: object }}
 */
export function projectEventFeedDays({ dmi8Fn, for4Fn, ctx, today } = {}) {
  if (!dmi8Fn || !for4Fn || !ctx?.event || !today) {
    return hide('missing_context');
  }

  const eventId = ctx.event.id;
  const isPureConfinement = isPureConfinementOnDate({
    paddockWindows: ctx.paddockWindows,
    locations: ctx.locations,
    eventId,
    date: today,
  });

  if (hasInvalidFeedConversion(ctx.feedEntries, ctx.feedCheckItems, ctx.batches)) {
    return hide('invalid_conversion', { isPureConfinement });
  }

  const result = dmi8Fn({
    event: ctx.event,
    date: today,
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

  if (!result || result.status === 'no_animals') {
    return hide('zero_demand', { isPureConfinement, dmi8: result });
  }
  if (result.status === 'no_pasture_data' || result.status === 'needs_check') {
    return hide(result.status, { isPureConfinement, dmi8: result });
  }

  const demandKg = Number(result.totalDmiKg);
  if (!Number.isFinite(demandKg) || demandKg <= 0) {
    return hide('zero_demand', { isPureConfinement, dmi8: result });
  }

  const openGroups = (ctx.groupWindows || []).filter(gw => gw.eventId === eventId && !gw.dateLeft);
  const weightOpts = {
    memberships: ctx.memberships,
    animals: ctx.animals,
    animalClasses: ctx.animalClasses,
    animalWeightRecords: ctx.animalWeightRecords,
    now: today,
  };
  if (openGroups.some(gw => hasUnknownLiveWindowWeights(gw, weightOpts))) {
    return hide('unknown_weight', { isPureConfinement, dmi8: result, demandKg });
  }

  const remainingStoredDmKg = Number(result.remainingStoredDmKg);
  const remainingPastureDmKg = isPureConfinement ? 0 : Number(result.remainingPastureDmKg);
  if (!Number.isFinite(remainingStoredDmKg) || remainingStoredDmKg < 0
      || !Number.isFinite(remainingPastureDmKg) || remainingPastureDmKg < 0) {
    return hide('invalid_remaining', { isPureConfinement, dmi8: result });
  }

  const days = for4Fn({
    remainingStoredDmKg,
    forageEstimateKg: remainingPastureDmKg,
    groupDmiKgPerDay: demandKg,
  });
  if (!Number.isFinite(days) || days < 0) {
    return hide('invalid_days', { isPureConfinement, dmi8: result, demandKg, remainingStoredDmKg, remainingPastureDmKg });
  }

  return {
    visible: true,
    days,
    remainingStoredDmKg,
    remainingPastureDmKg,
    demandKg,
    isPureConfinement,
    reason: remainingStoredDmKg === 0 && remainingPastureDmKg === 0 ? 'depleted' : 'ok',
    dmi8: result,
  };
}

/** Display text for a visible pure-confinement estimate. */
export function formatFeedRemainingLabel(days) {
  const n = Math.round(Number(days) * 100) / 100;
  return `Est. feed remaining: ~${n.toFixed(2)} days`;
}

export const FEED_REMAINING_ESTIMATE_CAPTION = 'end-of-today daily-model estimate';
