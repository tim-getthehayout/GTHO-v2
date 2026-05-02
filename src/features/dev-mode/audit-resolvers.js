/** @file OI-0145 — Audit-card sidecar resolvers (post-restructure).
 *
 * Per Q6 lock (Option 1 — no calc-file touches per OI-0142) and OI-0145's
 * structural update on 2026-05-02:
 *   - Resolvers live OUTSIDE calc files. They pull inputs from the store,
 *     annotate each input with a source string + measureType, and call
 *     `getCalcByName(name).fn(...)` for the output. They MUST NOT
 *     re-implement formula logic — the audit must show what the calc
 *     actually returns, never a re-implementation.
 *   - The audit iterates `getAllCalcs()`. For each registered calc, the
 *     audit calls `resolveCalcForCalcCard(calcName, ctx)`. If a resolver
 *     exists, the dispatch table also reports its `scope`:
 *       * 'paddock-window' — instance per paddock window (rendered inside
 *         that window's Section 4 block).
 *       * 'group-window' — instance per group window (rendered inside the
 *         overlapping paddock window's Section 4 block).
 *       * 'event' — instance(s) at event scope (rendered in Section 5).
 *   - If no resolver exists for a calc, the audit skips it — additional
 *     calcs surface automatically once their resolver lands (OI-0144).
 */

import { getAll, getById } from '../../data/store.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';
import { buildDmi8ChartContext } from '../events/dmi-chart-context.js';
import { getEventStartDate } from '../events/event-start.js';

/**
 * Helper: build an `{ name, value, source, measureType, missing }` annotation.
 * `source` is a human-readable trace (e.g. `eventGroupWindows.<id>.headCount`).
 * `measureType` is one of `units.js` CONVERSIONS keys (`weight`, `length`,
 * `area`, `dmYieldDensity`, etc.) — null/undefined for unitless inputs.
 * `missing` flags inputs whose source row wasn't found (renders red).
 */
function input(name, value, source, measureType = null, missing = false) {
  return { name, value, source, measureType, missing };
}

/** DMI-2 — per group window. Returns one instance per overlapping window. */
function resolveDMI2(ctx) {
  const calc = getCalcByName('DMI-2');
  if (!calc) return null;

  const groupWindows = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId && !gw.dateLeft);
  if (groupWindows.length === 0) {
    return { name: 'DMI-2', applicable: false, reason: 'No open group windows on this event.' };
  }

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const today = new Date().toISOString().slice(0, 10);

  const instances = [];
  for (const gw of groupWindows) {
    const group = getById('groups', gw.groupId);
    const cls = gw.animalClassId ? animalClasses.find(c => c.id === gw.animalClassId) : null;

    // Mirror DMI-8's fallback: when memberships aren't populated, the live
    // recompute returns 0; fall back to the window's stored values so the
    // audit reflects the same value calc consumers see in the dashboard.
    const rawLiveHead = getLiveWindowHeadCount(gw, { memberships, now: today });
    const liveHead = rawLiveHead || (gw.headCount ?? 0);
    const headSource = rawLiveHead
      ? `eventGroupWindows.${gw.id}.headCount (live)`
      : `eventGroupWindows.${gw.id}.headCount (stored fallback)`;
    const rawLiveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now: today });
    const liveAvg = rawLiveAvg || (gw.avgWeightKg ?? 0);
    const avgSource = rawLiveAvg
      ? `eventGroupWindows.${gw.id}.avgWeightKg (live)`
      : `eventGroupWindows.${gw.id}.avgWeightKg (stored fallback)`;
    const dmiPct = cls?.dmiPct ?? 2.5;
    const dmiPctLactating = cls?.dmiPctLactating ?? null;
    const isLactating = false; // OI-0144 placeholder.

    const inputs = [
      input('headCount', liveHead, headSource),
      input('avgWeightKg', liveAvg, avgSource, 'weight'),
      input('dmiPct', dmiPct, cls ? `animalClasses.${cls.id}.dmiPct` : 'fallback (2.5%)', null, !cls),
      input('dmiPctLactating', dmiPctLactating, cls ? `animalClasses.${cls.id}.dmiPctLactating` : 'n/a'),
      input('isLactating', isLactating, 'placeholder (OI-0144 follow-on)'),
    ];

    let output, gateStatus = 'ok';
    try {
      output = calc.fn({ headCount: liveHead, avgWeightKg: liveAvg, dmiPct, dmiPctLactating, isLactating });
    } catch (err) {
      output = null;
      gateStatus = `error: ${err.message}`;
    }

    instances.push({
      label: group?.name ? `Group: ${group.name}` : `Window ${gw.id.slice(0, 8)}`,
      // OI-0145: scope rendering also wants the group window id so the audit
      // can tuck the card into the matching group window sub-block within
      // the overlapping paddock window's Section 4 block.
      groupWindowId: gw.id,
      inputs, output, gateStatus,
      outputMeasure: 'weight', outputSuffix: ' DM/day',
    });
  }

  return { name: 'DMI-2', applicable: true, instances };
}

/** DMI-3 — sums DMI-2 outputs across overlapping group windows (event scope). */
function resolveDMI3(ctx) {
  const calc = getCalcByName('DMI-3');
  if (!calc) return null;

  const dmi2 = resolveDMI2(ctx);
  if (!dmi2 || !dmi2.applicable) {
    return { name: 'DMI-3', applicable: false, reason: 'No DMI-2 inputs available.' };
  }

  const groupDmiTargets = dmi2.instances.map(inst => ({
    groupDmiKgPerDay: typeof inst.output === 'number' ? inst.output : 0,
  }));

  const inputs = [
    input(
      'groupDmiTargets',
      groupDmiTargets,
      `composed from DMI-2 outputs across ${dmi2.instances.length} window(s)`,
    ),
  ];

  let output, gateStatus = 'ok';
  try {
    output = calc.fn({ groupDmiTargets });
  } catch (err) {
    output = null;
    gateStatus = `error: ${err.message}`;
  }

  return {
    name: 'DMI-3',
    applicable: true,
    instances: [{
      label: 'Event total',
      inputs, output, gateStatus,
      outputMeasure: 'weight', outputSuffix: ' DM/day',
    }],
  };
}

/** FOR-1 — per paddock window. Inputs from forage type + paddock observation. */
function resolveFOR1(ctx) {
  const calc = getCalcByName('FOR-1');
  if (!calc) return null;

  const paddockWindows = getAll('eventPaddockWindows').filter(
    pw => pw.eventId === ctx.eventId && !pw.dateClosed,
  );
  if (paddockWindows.length === 0) {
    return { name: 'FOR-1', applicable: false, reason: 'No open paddock windows on this event.' };
  }

  const observations = getAll('paddockObservations');
  const forageTypes = getAll('forageTypes');

  const instances = [];
  for (const pw of paddockWindows) {
    const loc = getById('locations', pw.locationId);
    if (!loc) continue;

    // OI-0107 picker: prefer sourceId === pw.id; else most-recent type=open / source=event.
    const candidates = observations.filter(o => o.locationId === pw.locationId && o.type === 'open' && o.source === 'event');
    const obs = candidates.find(o => o.sourceId === pw.id)
      || candidates.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      || null;

    const ft = loc.forageTypeId ? forageTypes.find(f => f.id === loc.forageTypeId) : null;

    const inputs = [
      input('forageHeightCm', obs?.forageHeightCm ?? null, obs ? `paddockObservations.${obs.id}.forageHeightCm` : 'no observation', 'length', !obs),
      input('residualHeightCm', ft?.minResidualHeightCm ?? null, ft ? `forageTypes.${ft.id}.minResidualHeightCm` : 'no forage type', 'length', !ft),
      input('areaHectares', loc.areaHectares ?? null, `locations.${loc.id}.areaHectares`, 'area', loc.areaHectares == null),
      input('areaPct', pw.areaPct ?? 100, `eventPaddockWindows.${pw.id}.areaPct`),
      input('coverPct', obs?.forageCoverPct ?? null, obs ? `paddockObservations.${obs.id}.forageCoverPct` : 'no observation', null, !obs),
      input('dmKgPerCmPerHa', ft?.dmKgPerCmPerHa ?? null, ft ? `forageTypes.${ft.id}.dmKgPerCmPerHa` : 'no forage type', 'dmYieldDensity', !ft),
    ];

    let output = null;
    let gateStatus = 'ok';
    const anyMissing = inputs.some(i => i.missing);
    if (anyMissing) {
      gateStatus = 'gated: missing inputs';
    } else {
      try {
        output = calc.fn({
          forageHeightCm: obs.forageHeightCm,
          residualHeightCm: ft.minResidualHeightCm,
          areaHectares: loc.areaHectares,
          areaPct: pw.areaPct ?? 100,
          coverPct: obs.forageCoverPct,
          dmKgPerCmPerHa: ft.dmKgPerCmPerHa,
        });
      } catch (err) {
        gateStatus = `error: ${err.message}`;
      }
    }

    instances.push({
      label: loc.name || `Loc ${loc.id.slice(0, 8)}`,
      paddockWindowId: pw.id,
      inputs, output, gateStatus,
      outputMeasure: 'weight', outputSuffix: ' DM',
    });
  }

  return { name: 'FOR-1', applicable: true, instances };
}

/**
 * DMI-8 — per-day cascade walk over the event window. Returns one event-scoped
 * instance with `chips`, `sources`, `dailyBreakdown` shape that the audit
 * renderer turns into the spec'd card (chip row + sources roll-up + auto-
 * expand <details> daily breakdown).
 *
 * Calls `getCalcByName('DMI-8').fn(...)` once per day — never re-implements.
 */
function resolveDMI8(ctx) {
  const calc = getCalcByName('DMI-8');
  if (!calc) return null;

  const event = getById('events', ctx.eventId);
  if (!event) {
    return { name: 'DMI-8', applicable: false, reason: 'Event not found.' };
  }
  const dmi8Ctx = buildDmi8ChartContext(ctx.eventId);
  if (!dmi8Ctx) {
    return { name: 'DMI-8', applicable: false, reason: 'DMI-8 context unavailable.' };
  }

  const eventStart = getEventStartDate(ctx.eventId);
  if (!eventStart) {
    return { name: 'DMI-8', applicable: false, reason: 'Event start date is not derivable.' };
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastDate = event.dateOut || todayStr;
  if (lastDate < eventStart) {
    return { name: 'DMI-8', applicable: false, reason: 'Event window is empty.' };
  }

  // Walk every day in the event window (inclusive both ends).
  const dailyBreakdown = [];
  const counts = { actual: 0, estimated: 0, needs_check: 0, no_animals: 0, no_pasture_data: 0 };
  let assumedFullCoverDays = 0;

  const cursor = new Date(`${eventStart}T00:00:00Z`);
  const stop = new Date(`${lastDate}T00:00:00Z`);
  while (cursor.getTime() <= stop.getTime()) {
    const dateStr = cursor.toISOString().slice(0, 10);
    let result;
    try {
      result = calc.fn({
        event: dmi8Ctx.event,
        date: dateStr,
        groupWindows: dmi8Ctx.groupWindows,
        memberships: dmi8Ctx.memberships,
        animals: dmi8Ctx.animals,
        animalWeightRecords: dmi8Ctx.animalWeightRecords,
        feedEntries: dmi8Ctx.feedEntries,
        feedChecks: dmi8Ctx.feedChecks,
        feedCheckItems: dmi8Ctx.feedCheckItems,
        batches: dmi8Ctx.batches,
        paddockWindows: dmi8Ctx.paddockWindows,
        observations: dmi8Ctx.observations,
        forageTypes: dmi8Ctx.forageTypes,
        locations: dmi8Ctx.locations,
        animalClasses: dmi8Ctx.animalClasses,
      });
    } catch (err) {
      result = { status: 'no_pasture_data', reason: `error: ${err.message}` };
    }
    if (counts[result.status] != null) counts[result.status] += 1;
    if (result.hint === 'assumed_full_cover') assumedFullCoverDays += 1;

    // Paddock window ids open on this date (8-char slice).
    const pwOpenIds = dmi8Ctx.paddockWindows
      .filter(pw => pw.dateOpened <= dateStr && (!pw.dateClosed || pw.dateClosed >= dateStr))
      .map(pw => pw.id.slice(0, 8));

    dailyBreakdown.push({
      date: dateStr,
      status: result.status,
      totalDmiKg: result.totalDmiKg ?? null,
      pastureDmiKg: result.pastureDmiKg ?? null,
      storedDmiKg: result.storedDmiKg ?? null,
      deficitKg: result.deficitKg ?? null,
      pwOpenIds,
      hint: result.hint || null,
      reason: result.reason || null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Sources roll-up.
  const openPaddocks = dmi8Ctx.paddockWindows.filter(pw => !pw.dateClosed);
  const closedPaddocks = dmi8Ctx.paddockWindows.length - openPaddocks.length;
  const distinctOpenLocs = new Set(openPaddocks.map(pw => pw.locationId));
  const forageTypeMissing = openPaddocks.some(pw => !dmi8Ctx.forageTypes[pw.locationId]);
  const batchIdsReferenced = new Set([
    ...dmi8Ctx.feedEntries.map(e => e.batchId),
    ...dmi8Ctx.feedCheckItems.map(ci => ci.batchId),
  ]);
  const batchesMissing = [...batchIdsReferenced].some(id => !dmi8Ctx.batches[id]);

  const openGroupWindows = dmi8Ctx.groupWindows.filter(gw => !gw.dateLeft);
  const totalGroupWindows = dmi8Ctx.groupWindows.length;

  const sources = {
    groupWindows: { open: openGroupWindows.length, total: totalGroupWindows },
    feedEntries: dmi8Ctx.feedEntries.length,
    feedChecks: dmi8Ctx.feedChecks.length,
    feedCheckItems: dmi8Ctx.feedCheckItems.length,
    paddockWindows: { total: dmi8Ctx.paddockWindows.length, closed: closedPaddocks, open: openPaddocks.length },
    forageTypesMissing: forageTypeMissing,
    forageTypeLocations: distinctOpenLocs.size,
    batchesReferenced: batchIdsReferenced.size,
    batchesMissing,
  };

  const windowSummary = {
    eventStart,
    dateOut: event.dateOut || null,
    nDays: dailyBreakdown.length,
  };

  return {
    name: 'DMI-8',
    applicable: true,
    instances: [{
      label: 'Event cascade',
      kind: 'dmi8-card',
      windowSummary,
      counts,
      assumedFullCoverDays,
      sources,
      dailyBreakdown,
    }],
  };
}

/** Dispatcher table — `{ fn, scope }` per resolver. */
const RESOLVERS = {
  'DMI-2': { fn: resolveDMI2, scope: 'group-window' },
  'DMI-3': { fn: resolveDMI3, scope: 'event' },
  'DMI-8': { fn: resolveDMI8, scope: 'event' },
  'FOR-1': { fn: resolveFOR1, scope: 'paddock-window' },
};

/**
 * Resolve a calc card for a given calc name + audit context. Returns null when
 * no resolver exists. The dispatcher result includes the resolver's `scope`
 * so the audit renderer knows where to place the card.
 *
 * @param {string} calcName
 * @param {{ eventId: string }} ctx
 * @returns {{ name, applicable, scope, instances?, reason? } | null}
 */
export function resolveCalcForCalcCard(calcName, ctx) {
  const entry = RESOLVERS[calcName];
  if (!entry) return null;
  const result = entry.fn(ctx);
  if (!result) return null;
  return { ...result, scope: entry.scope };
}

/** Test seam — list of resolver-backed calc names. */
export function getResolverNames() {
  return Object.keys(RESOLVERS);
}

/** Test seam — get scope for a calc name (returns null if no resolver). */
export function getResolverScope(calcName) {
  return RESOLVERS[calcName]?.scope ?? null;
}
