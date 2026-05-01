/** @file OI-0138 Phase 5 — Audit-card sidecar resolvers.
 *
 * Per Q6 lock (Option 1) and OI-0144 architectural update on 2026-05-01:
 *   - Resolvers live OUTSIDE calc files. They pull inputs from the store,
 *     annotate each input with a source string, and call
 *     `getCalcByName(name).fn(...)` for the output. They MUST NOT
 *     re-implement formula logic — the audit must show what the calc
 *     actually returns, never a re-implementation.
 *   - The audit iterates `getAllCalcs()`. For each registered calc, the
 *     audit calls `resolveCalcForCalcCard(calcName, ctx)`. If a resolver
 *     exists and the calc applies to the audited event, it returns
 *     `{ inputs, output, gateStatus }`. If no resolver exists, the audit
 *     skips that calc — additional calcs surface automatically once their
 *     resolver lands here (no audit-code change needed).
 *
 * MVP set: DMI-2, DMI-3, FOR-1. DMI-8 is high-fan-out and deferred to a
 * follow-on commit; the audit will surface it automatically once the
 * resolver lands here. Three more calcs (`days-on-pasture`, cost,
 * NPK residual) are tracked under OI-0144 — they need to land in the
 * registry first before resolvers can surface them.
 */

import { getAll, getById } from '../../data/store.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';

/**
 * Helper: build an `{ name, value, source, missing }` annotation. `source`
 * is a human-readable trace so the audit can show *where* each input came
 * from (e.g. `eventGroupWindows.<id>.headCount (live)`).
 */
function input(name, value, source, missing = false) {
  return { name, value, source, missing };
}

/**
 * DMI-2 resolver — for each open group window on the event, resolve inputs
 * and call DMI-2's `fn`. Returns one card per group window (multi-card array).
 *
 * @param {{ eventId: string }} ctx
 * @returns {{ name: string, applicable: boolean, instances: Array<{ inputs, output, gateStatus, label }> } | null}
 */
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

    // Mirror the DMI-8 fallback pattern in feed-forage.js:580 — when memberships
    // aren't populated for this group, the live recompute returns 0; fall back
    // to the window's stored headCount/avgWeightKg so the audit reflects the
    // same value calc consumers see in the dashboard / reports.
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
    const isLactating = false; // OI-0144 note: lactation derivation needs a registered calc; placeholder for MVP.

    const inputs = [
      input('headCount', liveHead, headSource),
      input('avgWeightKg', liveAvg, avgSource),
      input('dmiPct', dmiPct, cls ? `animalClasses.${cls.id}.dmiPct` : 'fallback (2.5%)', !cls),
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
      inputs, output, gateStatus,
    });
  }

  return { name: 'DMI-2', applicable: true, instances };
}

/**
 * DMI-3 resolver — sum of group DMI targets across all open windows.
 *
 * @param {{ eventId: string }} ctx
 */
function resolveDMI3(ctx) {
  const calc = getCalcByName('DMI-3');
  if (!calc) return null;

  // Build groupDmiTargets via DMI-2 resolver (so the audit shows that DMI-3
  // composes DMI-2 outputs — single source of truth for the per-group math).
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
    instances: [{ label: 'Event total', inputs, output, gateStatus }],
  };
}

/**
 * FOR-1 resolver — for each open paddock window, resolve standing forage DM.
 * Inputs come from the most recent paddock_observation (type='open',
 * source='event') for the window's location.
 *
 * @param {{ eventId: string }} ctx
 */
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

    // Pick the most recent type=open / source=event observation for this loc.
    const obs = observations
      .filter(o => o.locationId === pw.locationId && o.type === 'open' && o.source === 'event')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];

    const ft = loc.forageTypeId ? forageTypes.find(f => f.id === loc.forageTypeId) : null;

    const inputs = [
      input('forageHeightCm', obs?.forageHeightCm ?? null, obs ? `paddockObservations.${obs.id}.forageHeightCm` : 'no observation', !obs),
      input('residualHeightCm', ft?.minResidualHeightCm ?? null, ft ? `forageTypes.${ft.id}.minResidualHeightCm` : 'no forage type', !ft),
      input('areaHectares', loc.areaHectares ?? null, `locations.${loc.id}.areaHectares`, loc.areaHectares == null),
      input('areaPct', pw.areaPct ?? 100, `eventPaddockWindows.${pw.id}.areaPct`),
      input('coverPct', obs?.forageCoverPct ?? null, obs ? `paddockObservations.${obs.id}.forageCoverPct` : 'no observation', !obs),
      input('dmKgPerCmPerHa', ft?.dmKgPerCmPerHa ?? null, ft ? `forageTypes.${ft.id}.dmKgPerCmPerHa` : 'no forage type', !ft),
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

    instances.push({ label: loc.name || `Loc ${loc.id.slice(0, 8)}`, inputs, output, gateStatus });
  }

  return { name: 'FOR-1', applicable: true, instances };
}

/** Dispatcher table — calc name → resolver. Add new entries as resolvers land. */
const RESOLVERS = {
  'DMI-2': resolveDMI2,
  'DMI-3': resolveDMI3,
  'FOR-1': resolveFOR1,
};

/**
 * Resolve a calc card for a given calc name + audit context. Returns null when
 * no resolver exists for the calc — the audit caller skips it.
 *
 * @param {string} calcName
 * @param {{ eventId: string }} ctx
 */
export function resolveCalcForCalcCard(calcName, ctx) {
  const resolver = RESOLVERS[calcName];
  if (!resolver) return null;
  return resolver(ctx);
}

/** Test seam — list of resolver-backed calc names. */
export function getResolverNames() {
  return Object.keys(RESOLVERS);
}
