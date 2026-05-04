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
import { daysBetweenInclusive } from '../../utils/date-utils.js';

// OI-0157-B2 helper: NRC beef-cattle excretion-rate defaults. Used by NPK-1
// resolver when an animal class doesn't carry its own per-class rates.
// Values match NPK-1's example block in `src/calcs/core.js`.
const NRC_DEFAULT_EXCRETION = { n: 0.145, p: 0.041, k: 0.136 };

// OI-0157-B2 helper: pick the NPK price row applicable to an event start.
// Lookup rule (locked NPK-2 spec, advanced.js:12): latest
// `npk_price_history.effective_date ≤ event_date` for the farm; falls back
// to the earliest available row if no history exists before the event date.
// Returns null when the table has no rows for the farm — caller should
// gate (`applicable: false, reason: 'Set NPK prices in Settings → NPK
// Prices to enable.'`).
function pickNpkPrices(farmId, eventStartDate) {
  const all = getAll('npkPriceHistory').filter(r => r.farmId === farmId);
  if (all.length === 0) return null;
  const prior = all.filter(r => r.effectiveDate && r.effectiveDate <= eventStartDate);
  if (prior.length > 0) {
    return prior.slice().sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0];
  }
  return all.slice().sort((a, b) => (a.effectiveDate || '').localeCompare(b.effectiveDate || ''))[0];
}

// OI-0157-B2 helper: compute per-group-window NPK from the registered
// NPK-1 calc. Returns `{ instances: [{ gw, nKg, pKg, kKg, missing }] }`
// where `missing` flags rows that fell back to NRC defaults. Used by both
// resolveNPK1 (renders the cards) and resolveNPK2 / resolveCST3 / resolveNPK3
// (consume the totals). Centralized here to avoid drifting four copies of
// the same per-window walk.
function computeNpk1PerWindow(ctx) {
  const calc = getCalcByName('NPK-1');
  if (!calc) return null;
  const groupWindows = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId && !gw.dateLeft);
  if (groupWindows.length === 0) return { calc, groupWindows: [], rows: [] };

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const today = new Date().toISOString().slice(0, 10);
  const eventStart = getEventStartDate(ctx.eventId) || today;

  const rows = [];
  for (const gw of groupWindows) {
    const cls = gw.animalClassId ? animalClasses.find(c => c.id === gw.animalClassId) : null;
    const rawHead = getLiveWindowHeadCount(gw, { memberships, now: today });
    const headCount = rawHead || (gw.headCount ?? 0);
    const rawAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now: today });
    const avgWeightKg = rawAvg || (gw.avgWeightKg ?? 0);
    const startDate = gw.dateJoined || eventStart;
    const days = Math.max(daysBetweenInclusive(startDate, today), 0);
    const nFromCls = cls?.excretionNRate;
    const pFromCls = cls?.excretionPRate;
    const kFromCls = cls?.excretionKRate;
    const nRate = nFromCls ?? NRC_DEFAULT_EXCRETION.n;
    const pRate = pFromCls ?? NRC_DEFAULT_EXCRETION.p;
    const kRate = kFromCls ?? NRC_DEFAULT_EXCRETION.k;
    let output = { nKg: 0, pKg: 0, kKg: 0 };
    let gateStatus = 'ok';
    try {
      output = calc.fn({
        headCount, avgWeightKg, days,
        excretionNRate: nRate, excretionPRate: pRate, excretionKRate: kRate,
      });
    } catch (err) {
      gateStatus = `error: ${err.message}`;
    }
    rows.push({
      gw, cls, headCount, avgWeightKg, days,
      nRate, pRate, kRate,
      nFromCls, pFromCls, kFromCls,
      output, gateStatus,
    });
  }
  return { calc, groupWindows, rows };
}

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

/* ----------------------------------------------------------------------- *
 * OI-0157-B2 — NPK / fertility / stocking-density resolvers.
 *
 * 9 resolvers added: NPK-1 / NPK-2 / NPK-3 / NPK-4 / CST-3 / REC-1 +
 * ANI-AU / ANI-AUD / ANI-ADA (the three new registrations from B1).
 * Each follows the DMI-2 / FOR-1 pattern: pull inputs from the store,
 * annotate via `input(...)`, call `getCalcByName(name).fn(...)`, return
 * `{ name, applicable, instances|reason }`. Cross-resolver dependencies
 * (NPK-2 / CST-3 / NPK-3 needing NPK-1 sums; ANI-ADA needing ANI-AUD
 * sums) re-run the per-window computation locally — same self-contained
 * pattern as DMI-3.
 * ----------------------------------------------------------------------- */

/** NPK-1 — per group window. Uses class excretion rates with NRC fallback. */
function resolveNPK1(ctx) {
  const data = computeNpk1PerWindow(ctx);
  if (!data) return null;
  if (data.groupWindows.length === 0) {
    return { name: 'NPK-1', applicable: false, reason: 'No open group windows on this event.' };
  }
  const instances = [];
  for (const row of data.rows) {
    const { gw, cls, headCount, avgWeightKg, days,
            nRate, pRate, kRate, nFromCls, pFromCls, kFromCls,
            output, gateStatus } = row;
    const group = getById('groups', gw.groupId);
    const inputs = [
      input('headCount', headCount, `eventGroupWindows.${gw.id}.headCount (live)`),
      input('avgWeightKg', avgWeightKg, `eventGroupWindows.${gw.id}.avgWeightKg (live)`, 'weight'),
      input('days', days, `daysBetweenInclusive(${gw.dateJoined || 'eventStart'}, today)`),
      input('excretionNRate', nRate,
        nFromCls != null ? `animalClasses.${cls.id}.excretionNRate` : 'fallback (NRC beef defaults)',
        null, nFromCls == null),
      input('excretionPRate', pRate,
        pFromCls != null ? `animalClasses.${cls.id}.excretionPRate` : 'fallback (NRC beef defaults)',
        null, pFromCls == null),
      input('excretionKRate', kRate,
        kFromCls != null ? `animalClasses.${cls.id}.excretionKRate` : 'fallback (NRC beef defaults)',
        null, kFromCls == null),
    ];
    instances.push({
      label: group?.name ? `Group: ${group.name}` : `Window ${gw.id.slice(0, 8)}`,
      groupWindowId: gw.id,
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: ' kg NPK',
    });
  }
  return { name: 'NPK-1', applicable: true, instances };
}

/** NPK-2 — event scope. Sum of NPK-1 outputs × farm's effective NPK prices. */
function resolveNPK2(ctx) {
  const calc = getCalcByName('NPK-2');
  if (!calc) return null;
  const event = getById('events', ctx.eventId);
  if (!event) return { name: 'NPK-2', applicable: false, reason: 'Event not found.' };

  const data = computeNpk1PerWindow(ctx);
  if (!data || data.groupWindows.length === 0) {
    return { name: 'NPK-2', applicable: false, reason: 'No open group windows on this event.' };
  }
  const eventStart = getEventStartDate(ctx.eventId) || new Date().toISOString().slice(0, 10);
  const prices = pickNpkPrices(event.farmId, eventStart);
  if (!prices) {
    return {
      name: 'NPK-2',
      applicable: false,
      reason: 'Set NPK prices in Settings → NPK Prices to enable.',
    };
  }

  const totalN = data.rows.reduce((s, r) => s + (r.output?.nKg || 0), 0);
  const totalP = data.rows.reduce((s, r) => s + (r.output?.pKg || 0), 0);
  const totalK = data.rows.reduce((s, r) => s + (r.output?.kKg || 0), 0);

  const inputs = [
    input('nKg', totalN, `composed: Σ NPK-1[${data.rows.length}].output.nKg`, 'weight'),
    input('pKg', totalP, `composed: Σ NPK-1[${data.rows.length}].output.pKg`, 'weight'),
    input('kKg', totalK, `composed: Σ NPK-1[${data.rows.length}].output.kKg`, 'weight'),
    input('nPricePerKg', prices.nPricePerKg, `npkPriceHistory.${prices.id}.nPricePerKg (effective ${prices.effectiveDate})`),
    input('pPricePerKg', prices.pPricePerKg, `npkPriceHistory.${prices.id}.pPricePerKg (effective ${prices.effectiveDate})`),
    input('kPricePerKg', prices.kPricePerKg, `npkPriceHistory.${prices.id}.kPricePerKg (effective ${prices.effectiveDate})`),
  ];
  let output = null, gateStatus = 'ok';
  try {
    output = calc.fn({
      nKg: totalN, pKg: totalP, kKg: totalK,
      nPricePerKg: prices.nPricePerKg ?? 0,
      pPricePerKg: prices.pPricePerKg ?? 0,
      kPricePerKg: prices.kPricePerKg ?? 0,
    });
  } catch (err) {
    gateStatus = `error: ${err.message}`;
  }
  return {
    name: 'NPK-2',
    applicable: true,
    instances: [{
      label: 'Event total',
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: ' $',
    }],
  };
}

/** NPK-3 — paddock-window scope. Area-weighted distribution per open paddock window. */
function resolveNPK3(ctx) {
  const calc = getCalcByName('NPK-3');
  if (!calc) return null;
  const paddockWindows = getAll('eventPaddockWindows').filter(pw => pw.eventId === ctx.eventId && !pw.dateClosed);
  if (paddockWindows.length === 0) {
    return { name: 'NPK-3', applicable: false, reason: 'No open paddock windows on this event.' };
  }
  const data = computeNpk1PerWindow(ctx);
  if (!data || data.groupWindows.length === 0) {
    return { name: 'NPK-3', applicable: false, reason: 'No open group windows on this event.' };
  }

  const totalN = data.rows.reduce((s, r) => s + (r.output?.nKg || 0), 0);
  const totalP = data.rows.reduce((s, r) => s + (r.output?.pKg || 0), 0);
  const totalK = data.rows.reduce((s, r) => s + (r.output?.kKg || 0), 0);

  // Build the windows-shape NPK-3.fn expects. `durationHours` uses days
  // since pw open as a coarse proxy (the registered formula is symmetric
  // in any consistent duration unit).
  const today = new Date().toISOString().slice(0, 10);
  const windowsPayload = paddockWindows.map(pw => {
    const loc = getById('locations', pw.locationId);
    const days = Math.max(daysBetweenInclusive(pw.dateOpened || today, today), 0);
    return {
      pwId: pw.id,
      durationHours: days * 24,
      areaHectares: loc?.areaHectares ?? 0,
      areaPct: pw.areaPct ?? 100,
    };
  });

  let outputs = [];
  let gateStatus = 'ok';
  try {
    outputs = calc.fn({
      windows: windowsPayload.map(({ durationHours, areaHectares, areaPct }) =>
        ({ durationHours, areaHectares, areaPct })),
      totalNKg: totalN, totalPKg: totalP, totalKKg: totalK,
    });
  } catch (err) {
    gateStatus = `error: ${err.message}`;
    outputs = paddockWindows.map(() => ({ nKg: 0, pKg: 0, kKg: 0 }));
  }

  const instances = paddockWindows.map((pw, i) => {
    const loc = getById('locations', pw.locationId);
    const w = windowsPayload[i];
    const inputs = [
      input('durationHours', w.durationHours, `eventPaddockWindows.${pw.id}.dateOpened → today × 24`),
      input('areaHectares', w.areaHectares, loc ? `locations.${loc.id}.areaHectares` : 'no location', 'area', !loc || loc.areaHectares == null),
      input('areaPct', w.areaPct, `eventPaddockWindows.${pw.id}.areaPct`),
      input('totalNKg', totalN, `composed: Σ NPK-1[${data.rows.length}].output.nKg`, 'weight'),
      input('totalPKg', totalP, `composed: Σ NPK-1[${data.rows.length}].output.pKg`, 'weight'),
      input('totalKKg', totalK, `composed: Σ NPK-1[${data.rows.length}].output.kKg`, 'weight'),
    ];
    return {
      label: loc?.name || `Loc ${pw.locationId.slice(0, 8)}`,
      paddockWindowId: pw.id,
      inputs,
      output: outputs[i],
      gateStatus,
      outputMeasure: null, outputSuffix: ' kg NPK',
    };
  });
  return { name: 'NPK-3', applicable: true, instances };
}

/** NPK-4 — event scope. Sums external amendments applied during the event window. */
function resolveNPK4(ctx) {
  const calc = getCalcByName('NPK-4');
  if (!calc) return null;
  const event = getById('events', ctx.eventId);
  if (!event) return { name: 'NPK-4', applicable: false, reason: 'Event not found.' };
  const eventStart = getEventStartDate(ctx.eventId);
  if (!eventStart) {
    return { name: 'NPK-4', applicable: false, reason: 'Event start not derivable.' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = event.dateOut || today;
  // appliedAt is timestamptz — bound the window inclusive on both ends.
  const startTs = `${eventStart}T00:00:00Z`;
  const endTs = `${lastDate}T23:59:59Z`;

  const inWindow = getAll('amendments').filter(a =>
    a.operationId === event.operationId &&
    a.appliedAt && a.appliedAt >= startTs && a.appliedAt <= endTs,
  );
  if (inWindow.length === 0) {
    return { name: 'NPK-4', applicable: false, reason: 'No amendments applied during this event window.' };
  }

  const inputProducts = getAll('inputProducts');
  let totalN = 0, totalP = 0, totalK = 0;
  let totalQty = 0;
  let resolvableCount = 0;
  for (const am of inWindow) {
    const product = am.inputProductId ? inputProducts.find(p => p.id === am.inputProductId) : null;
    const qtyKg = am.totalQty ?? 0;
    const nPct = product?.nPct ?? 0;
    const pPct = product?.pPct ?? 0;
    const kPct = product?.kPct ?? 0;
    if (product == null && am.manureBatchId == null) continue; // unresolvable
    try {
      const r = calc.fn({ qtyKg, nPct, pPct, kPct });
      totalN += r.nKg; totalP += r.pKg; totalK += r.kKg;
      totalQty += qtyKg;
      resolvableCount += 1;
    } catch { /* skip malformed row */ }
  }
  if (resolvableCount === 0) {
    return {
      name: 'NPK-4',
      applicable: false,
      reason: `${inWindow.length} amendment(s) in window but NPK percentages were not resolvable (no inputProduct rows).`,
    };
  }

  const inputs = [
    input('amendmentCount', resolvableCount, `amendments where appliedAt ∈ [${eventStart}, ${lastDate}]`),
    input('totalQty', totalQty, 'sum across resolvable amendments', 'weight'),
  ];
  return {
    name: 'NPK-4',
    applicable: true,
    instances: [{
      label: 'Event total (external amendments)',
      inputs,
      output: { nKg: totalN, pKg: totalP, kKg: totalK },
      gateStatus: 'ok',
      outputMeasure: null, outputSuffix: ' kg NPK',
    }],
  };
}

/** CST-3 — event scope. Same shape as NPK-2 (cost rollup). */
function resolveCST3(ctx) {
  const calc = getCalcByName('CST-3');
  if (!calc) return null;
  const event = getById('events', ctx.eventId);
  if (!event) return { name: 'CST-3', applicable: false, reason: 'Event not found.' };
  const data = computeNpk1PerWindow(ctx);
  if (!data || data.groupWindows.length === 0) {
    return { name: 'CST-3', applicable: false, reason: 'No open group windows on this event.' };
  }
  const eventStart = getEventStartDate(ctx.eventId) || new Date().toISOString().slice(0, 10);
  const prices = pickNpkPrices(event.farmId, eventStart);
  if (!prices) {
    return {
      name: 'CST-3',
      applicable: false,
      reason: 'Set NPK prices in Settings → NPK Prices to enable.',
    };
  }
  const totalN = data.rows.reduce((s, r) => s + (r.output?.nKg || 0), 0);
  const totalP = data.rows.reduce((s, r) => s + (r.output?.pKg || 0), 0);
  const totalK = data.rows.reduce((s, r) => s + (r.output?.kKg || 0), 0);
  const inputs = [
    input('nKg', totalN, `composed: Σ NPK-1[${data.rows.length}].output.nKg`, 'weight'),
    input('pKg', totalP, `composed: Σ NPK-1[${data.rows.length}].output.pKg`, 'weight'),
    input('kKg', totalK, `composed: Σ NPK-1[${data.rows.length}].output.kKg`, 'weight'),
    input('nPricePerKg', prices.nPricePerKg, `npkPriceHistory.${prices.id}.nPricePerKg (effective ${prices.effectiveDate})`),
    input('pPricePerKg', prices.pPricePerKg, `npkPriceHistory.${prices.id}.pPricePerKg (effective ${prices.effectiveDate})`),
    input('kPricePerKg', prices.kPricePerKg, `npkPriceHistory.${prices.id}.kPricePerKg (effective ${prices.effectiveDate})`),
  ];
  let output = null, gateStatus = 'ok';
  try {
    output = calc.fn({
      nKg: totalN, pKg: totalP, kKg: totalK,
      nPricePerKg: prices.nPricePerKg ?? 0,
      pPricePerKg: prices.pPricePerKg ?? 0,
      kPricePerKg: prices.kPricePerKg ?? 0,
    });
  } catch (err) {
    gateStatus = `error: ${err.message}`;
  }
  return {
    name: 'CST-3',
    applicable: true,
    instances: [{
      label: 'Event NPK cost',
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: ' $',
    }],
  };
}

/** REC-1 — per closed paddock window. Recovery dates from the close observation. */
function resolveREC1(ctx) {
  const calc = getCalcByName('REC-1');
  if (!calc) return null;
  const closed = getAll('eventPaddockWindows').filter(pw => pw.eventId === ctx.eventId && pw.dateClosed);
  if (closed.length === 0) {
    return { name: 'REC-1', applicable: false, reason: 'No closed paddock windows on this event.' };
  }
  const observations = getAll('paddockObservations');
  const event = getById('events', ctx.eventId);
  const farmSettings = event?.farmId
    ? getAll('farmSettings').find(fs => fs.farmId === event.farmId)
    : null;

  const instances = [];
  for (const pw of closed) {
    const loc = getById('locations', pw.locationId);
    if (!loc) continue;
    // Pick the close observation tied to this pw (sourceId match), else
    // most-recent type=close / source=event for the location.
    const candidates = observations.filter(o =>
      o.locationId === pw.locationId && o.type === 'close' && o.source === 'event');
    const obs = candidates.find(o => o.sourceId === pw.id)
      || candidates.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      || null;

    const minFromObs = obs?.recoveryMinDays;
    const maxFromObs = obs?.recoveryMaxDays;
    const minFromFarm = farmSettings?.defaultRecoveryMinDays;
    const maxFromFarm = farmSettings?.defaultRecoveryMaxDays;
    const recoveryMinDays = minFromObs ?? minFromFarm ?? null;
    const recoveryMaxDays = maxFromObs ?? maxFromFarm ?? null;
    const minMissing = recoveryMinDays == null;
    const maxMissing = recoveryMaxDays == null;
    const observedAt = pw.dateClosed;

    const inputs = [
      input('observedAt', observedAt, `eventPaddockWindows.${pw.id}.dateClosed`),
      input('recoveryMinDays', recoveryMinDays,
        minFromObs != null ? `paddockObservations.${obs.id}.recoveryMinDays`
        : minFromFarm != null ? `farmSettings.${farmSettings.id}.defaultRecoveryMinDays (fallback)`
        : 'missing — set on observation or farm settings',
        null, minMissing),
      input('recoveryMaxDays', recoveryMaxDays,
        maxFromObs != null ? `paddockObservations.${obs.id}.recoveryMaxDays`
        : maxFromFarm != null ? `farmSettings.${farmSettings.id}.defaultRecoveryMaxDays (fallback)`
        : 'missing — set on observation or farm settings',
        null, maxMissing),
    ];
    let output = null, gateStatus = 'ok';
    if (minMissing || maxMissing) {
      gateStatus = 'gated: missing inputs';
    } else {
      try {
        output = calc.fn({ observedAt, recoveryMinDays, recoveryMaxDays });
      } catch (err) {
        gateStatus = `error: ${err.message}`;
      }
    }
    instances.push({
      label: loc.name || `Loc ${loc.id.slice(0, 8)}`,
      paddockWindowId: pw.id,
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: '',
    });
  }
  return { name: 'REC-1', applicable: true, instances };
}

/** ANI-AU — per group window. headCount × avgWeightKg / 453.6 → AU. */
function resolveANIAU(ctx) {
  const calc = getCalcByName('ANI-AU');
  if (!calc) return null;
  const groupWindows = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId && !gw.dateLeft);
  if (groupWindows.length === 0) {
    return { name: 'ANI-AU', applicable: false, reason: 'No open group windows on this event.' };
  }
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const today = new Date().toISOString().slice(0, 10);

  const instances = [];
  for (const gw of groupWindows) {
    const group = getById('groups', gw.groupId);
    const rawHead = getLiveWindowHeadCount(gw, { memberships, now: today });
    const headCount = rawHead || (gw.headCount ?? 0);
    const rawAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now: today });
    const avgWeightKg = rawAvg || (gw.avgWeightKg ?? 0);
    const inputs = [
      input('headCount', headCount, `eventGroupWindows.${gw.id}.headCount (live)`),
      input('avgWeightKg', avgWeightKg, `eventGroupWindows.${gw.id}.avgWeightKg (live)`, 'weight'),
    ];
    let output = null, gateStatus = 'ok';
    try {
      output = calc.fn({ headCount, avgWeightKg });
    } catch (err) {
      gateStatus = `error: ${err.message}`;
    }
    instances.push({
      label: group?.name ? `Group: ${group.name}` : `Window ${gw.id.slice(0, 8)}`,
      groupWindowId: gw.id,
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: ' AU',
    });
  }
  return { name: 'ANI-AU', applicable: true, instances };
}

/** ANI-AUD — per group window. au × days → AU-days. */
function resolveANIAUD(ctx) {
  const calc = getCalcByName('ANI-AUD');
  if (!calc) return null;
  const auResult = resolveANIAU(ctx);
  if (!auResult || !auResult.applicable) {
    return { name: 'ANI-AUD', applicable: false, reason: 'No ANI-AU instances available.' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const eventStart = getEventStartDate(ctx.eventId) || today;

  const instances = [];
  for (const auInst of auResult.instances) {
    const gw = getById('eventGroupWindows', auInst.groupWindowId);
    const startDate = gw?.dateJoined || eventStart;
    const days = Math.max(daysBetweenInclusive(startDate, today), 0);
    const au = typeof auInst.output === 'number' ? auInst.output : 0;
    const inputs = [
      input('au', au, `composed: ANI-AU instance for groupWindow ${auInst.groupWindowId.slice(0, 8)}`),
      input('days', days, `daysBetweenInclusive(${startDate}, today)`),
    ];
    let output = null, gateStatus = 'ok';
    try {
      output = calc.fn({ au, days });
    } catch (err) {
      gateStatus = `error: ${err.message}`;
    }
    instances.push({
      label: auInst.label,
      groupWindowId: auInst.groupWindowId,
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: ' AU-days',
    });
  }
  return { name: 'ANI-AUD', applicable: true, instances };
}

/** ANI-ADA — per paddock window. Σ ANI-AUD across overlapping group windows / acres. */
function resolveANIADA(ctx) {
  const calc = getCalcByName('ANI-ADA');
  if (!calc) return null;
  const paddockWindows = getAll('eventPaddockWindows').filter(pw => pw.eventId === ctx.eventId && !pw.dateClosed);
  if (paddockWindows.length === 0) {
    return { name: 'ANI-ADA', applicable: false, reason: 'No open paddock windows on this event.' };
  }
  const audResult = resolveANIAUD(ctx);
  if (!audResult || !audResult.applicable) {
    return { name: 'ANI-ADA', applicable: false, reason: 'No ANI-AUD instances available.' };
  }
  const totalAuds = audResult.instances.reduce(
    (s, inst) => s + (typeof inst.output === 'number' ? inst.output : 0), 0);

  const instances = [];
  for (const pw of paddockWindows) {
    const loc = getById('locations', pw.locationId);
    const areaHa = (loc?.areaHectares ?? 0) * (pw.areaPct ?? 100) / 100;
    const areaAcres = areaHa * 2.47105; // hectare → acre conversion before fn().
    const inputs = [
      input('auds', totalAuds, `composed: Σ ANI-AUD[${audResult.instances.length}].output across overlapping group windows`),
      input('areaAcres', areaAcres, loc
        ? `(locations.${loc.id}.areaHectares × eventPaddockWindows.${pw.id}.areaPct/100) × 2.47105`
        : `eventPaddockWindows.${pw.id} × 2.47105 (no location)`,
        null, !loc),
    ];
    let output = null, gateStatus = 'ok';
    try {
      output = calc.fn({ auds: totalAuds, areaAcres });
    } catch (err) {
      gateStatus = `error: ${err.message}`;
    }
    instances.push({
      label: loc?.name || `Loc ${pw.locationId.slice(0, 8)}`,
      paddockWindowId: pw.id,
      inputs, output, gateStatus,
      outputMeasure: null, outputSuffix: ' AU-days/ac',
    });
  }
  return { name: 'ANI-ADA', applicable: true, instances };
}

/** Dispatcher table — `{ fn, scope }` per resolver. */
const RESOLVERS = {
  'DMI-2': { fn: resolveDMI2, scope: 'group-window' },
  'DMI-3': { fn: resolveDMI3, scope: 'event' },
  'DMI-8': { fn: resolveDMI8, scope: 'event' },
  'FOR-1': { fn: resolveFOR1, scope: 'paddock-window' },
  // OI-0157-B2: 9 new resolvers.
  'NPK-1': { fn: resolveNPK1, scope: 'group-window' },
  'NPK-2': { fn: resolveNPK2, scope: 'event' },
  'NPK-3': { fn: resolveNPK3, scope: 'paddock-window' },
  'NPK-4': { fn: resolveNPK4, scope: 'event' },
  'CST-3': { fn: resolveCST3, scope: 'event' },
  'REC-1': { fn: resolveREC1, scope: 'paddock-window' },
  'ANI-AU': { fn: resolveANIAU, scope: 'group-window' },
  'ANI-AUD': { fn: resolveANIAUD, scope: 'group-window' },
  'ANI-ADA': { fn: resolveANIADA, scope: 'paddock-window' },
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
