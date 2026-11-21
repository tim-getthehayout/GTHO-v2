/** @file Bull/ram/buck exposure → preg-check / due bands (compute-on-read).
 * Locked: A0+E1+B0-extend+C3-keep+D0+D4+F0+Fg1+Gh0+Gs1+Gg0+Gd+Gc0+UxA0+Ux-copy1
 * + dueBand R1/E1/L1/P-a (return-to-cycle + confirm cap).
 * No exposure-row writes. Does not redefine assessOpenAnimal.
 */
import { assessOpenAnimal } from '../features/assistant/farm-reads.js';
import { getLocalTodayStr, parseDate } from '../utils/date-utils.js';

/** SCHEMA §9.7 — gestation days (C3-keep). */
export const CATTLE_GESTATION_DAYS = 283;
export const SHEEP_GESTATION_DAYS = 150;
export const GOAT_GESTATION_DAYS = 150;

/** Gd compiled defaults when farm_settings columns missing / not released. */
export const DEFAULT_PREG_CHECK_MIN_DAYS_SINCE_EXPOSURE = 35; // cattle (compat alias)
export const DEFAULT_PREG_CHECK_MIN_DAYS_POST_CALVING = 45; // cattle (compat alias)
export const DEFAULT_PREG_CHECK_BY_FAMILY = Object.freeze({
  cattle: { minDaysSinceExposure: 35, minDaysPostCalving: 45 },
  sheep: { minDaysSinceExposure: 25, minDaysPostCalving: 30 },
  goat: { minDaysSinceExposure: 25, minDaysPostCalving: 30 },
});

/** P-a compiled defaults for due-band earliest (distinct from preg-check post-partum). */
export const DEFAULT_RETURN_TO_CYCLE_BY_FAMILY = Object.freeze({
  cattle: 45,
  sheep: 25,
  goat: 25,
});

export const CATTLE_SPECIES = Object.freeze(new Set(['beef_cattle', 'dairy_cattle']));
export const BREEDING_SPECIES_FAMILIES = Object.freeze(['cattle', 'sheep', 'goat']);

/** Male role → breeding family. */
export const MALE_ROLE_FAMILY = Object.freeze({ bull: 'cattle', ram: 'sheep', buck: 'goat' });
/** Female open/exposure role → breeding family. */
export const FEMALE_ROLE_FAMILY = Object.freeze({
  cow: 'cattle', heifer: 'cattle', ewe: 'sheep', doe: 'goat',
});

export function isCattleSpecies(species) {
  return CATTLE_SPECIES.has(species);
}

/** Map animal class species → cattle|sheep|goat|null. */
export function speciesFamily(species) {
  if (CATTLE_SPECIES.has(species)) return 'cattle';
  if (species === 'sheep') return 'sheep';
  if (species === 'goat') return 'goat';
  return null;
}

export function isBreedingSpecies(species) {
  return speciesFamily(species) != null;
}

/**
 * Resolve protocol for one breeding family (Gs1).
 * @param {object|null|undefined} farmSettings
 * @param {string|null|undefined} speciesOrFamily animal class species or 'cattle'|'sheep'|'goat'
 * @returns {{ minDaysSinceExposure: number, minDaysPostCalving: number, combine: 'AND', family: string }}
 */
export function resolvePregCheckProtocol(farmSettings, speciesOrFamily = 'cattle') {
  const family = (speciesOrFamily === 'cattle' || speciesOrFamily === 'sheep' || speciesOrFamily === 'goat')
    ? speciesOrFamily
    : (speciesFamily(speciesOrFamily) || 'cattle');
  const defaults = DEFAULT_PREG_CHECK_BY_FAMILY[family];
  const expKey = family === 'cattle'
    ? 'pregCheckMinDaysSinceExposureCattle'
    : family === 'sheep'
      ? 'pregCheckMinDaysSinceExposureSheep'
      : 'pregCheckMinDaysSinceExposureGoat';
  const postKey = family === 'cattle'
    ? 'pregCheckMinDaysPostCalvingCattle'
    : family === 'sheep'
      ? 'pregCheckMinDaysPostCalvingSheep'
      : 'pregCheckMinDaysPostCalvingGoat';
  const minDaysSinceExposure = Number.isFinite(farmSettings?.[expKey])
    ? Number(farmSettings[expKey])
    : defaults.minDaysSinceExposure;
  const minDaysPostCalving = Number.isFinite(farmSettings?.[postKey])
    ? Number(farmSettings[postKey])
    : defaults.minDaysPostCalving;
  return { minDaysSinceExposure, minDaysPostCalving, combine: 'AND', family };
}

/**
 * Resolve return-to-cycle days for one breeding family (P-a / S1).
 * Distinct from resolvePregCheckProtocol minDaysPostCalving.
 * @param {object|null|undefined} farmSettings
 * @param {string|null|undefined} speciesOrFamily
 * @returns {number}
 */
export function resolveReturnToCycleDays(farmSettings, speciesOrFamily = 'cattle') {
  const family = (speciesOrFamily === 'cattle' || speciesOrFamily === 'sheep' || speciesOrFamily === 'goat')
    ? speciesOrFamily
    : (speciesFamily(speciesOrFamily) || 'cattle');
  const key = family === 'cattle'
    ? 'returnToCycleDaysCattle'
    : family === 'sheep'
      ? 'returnToCycleDaysSheep'
      : 'returnToCycleDaysGoat';
  const n = farmSettings?.[key];
  if (Number.isFinite(n)) return Number(n);
  return DEFAULT_RETURN_TO_CYCLE_BY_FAMILY[family];
}

/** All three species protocols (UxA All-species). */
export function resolveAllPregCheckProtocols(farmSettings) {
  return {
    cattle: resolvePregCheckProtocol(farmSettings, 'cattle'),
    sheep: resolvePregCheckProtocol(farmSettings, 'sheep'),
    goat: resolvePregCheckProtocol(farmSettings, 'goat'),
  };
}

/** Compact one-species line (Ux-copy1: post-partum). */
export function formatPregCheckProtocolSummary(protocol = resolvePregCheckProtocol(null)) {
  const p = protocol?.combine === 'OR' ? 'OR' : 'AND';
  const label = protocol?.family && protocol.family !== 'cattle'
    ? `${protocol.family[0].toUpperCase()}${protocol.family.slice(1)}: `
    : '';
  return `${label ? label : 'Protocol: '}≥${protocol.minDaysSinceExposure}d since exposure ${p} ≥${protocol.minDaysPostCalving}d post-partum`;
}

/**
 * UxA0: protocol summary follows Species filter.
 * @param {object|null|undefined} farmSettings
 * @param {Set<string>|string[]|null|undefined} selectedSpecies empty/null = All
 */
export function formatPregCheckProtocolSummaryForFilter(farmSettings, selectedSpecies) {
  const set = selectedSpecies instanceof Set
    ? selectedSpecies
    : new Set(selectedSpecies || []);
  if (set.size === 0) {
    const all = resolveAllPregCheckProtocols(farmSettings);
    return [
      `Cattle: ≥${all.cattle.minDaysSinceExposure}d exposure AND ≥${all.cattle.minDaysPostCalving}d post-partum`,
      `Sheep: ≥${all.sheep.minDaysSinceExposure}d exposure AND ≥${all.sheep.minDaysPostCalving}d post-partum`,
      `Goat: ≥${all.goat.minDaysSinceExposure}d exposure AND ≥${all.goat.minDaysPostCalving}d post-partum`,
    ].join('\n');
  }
  const families = new Set();
  for (const sp of set) {
    const f = speciesFamily(sp);
    if (f) families.add(f);
  }
  if (families.size === 0) {
    return formatPregCheckProtocolSummary(resolvePregCheckProtocol(farmSettings, 'cattle'));
  }
  if (families.size === 1) {
    const family = [...families][0];
    const p = resolvePregCheckProtocol(farmSettings, family);
    return `Protocol: ≥${p.minDaysSinceExposure}d since exposure AND ≥${p.minDaysPostCalving}d post-partum`;
  }
  const lines = [];
  for (const family of BREEDING_SPECIES_FAMILIES) {
    if (!families.has(family)) continue;
    const p = resolvePregCheckProtocol(farmSettings, family);
    const label = family[0].toUpperCase() + family.slice(1);
    lines.push(`${label}: ≥${p.minDaysSinceExposure}d exposure AND ≥${p.minDaysPostCalving}d post-partum`);
  }
  return lines.join('\n');
}

export function gestationDaysForSpecies(species) {
  if (species === 'sheep') return SHEEP_GESTATION_DAYS;
  if (species === 'goat') return GOAT_GESTATION_DAYS;
  if (CATTLE_SPECIES.has(species)) return CATTLE_GESTATION_DAYS;
  return null;
}

/** Elapsed whole calendar days from start (YYYY-MM-DD or ISO) to end (exclusive of end→start+0). */
export function daysSince(start, end) {
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  if (!s || !e) return null;
  const ms = parseDate(e).getTime() - parseDate(s).getTime();
  return Math.round(ms / 86_400_000);
}

export function toDateOnly(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

export function addDaysToDateOnly(dateOnly, days) {
  const d = parseDate(dateOnly);
  if (!d) return null;
  // UTC calendar arithmetic — avoid local-TZ setDate drift vs parseDate(YYYY-MM-DD).
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Overlap of two half-open-or-closed date intervals. `end: null` = still open.
 * @returns {{ start: string, end: string|null }|null}
 */
export function overlapIntervals(a, b) {
  if (!a?.start || !b?.start) return null;
  const start = a.start > b.start ? a.start : b.start;
  const aOpen = a.end == null;
  const bOpen = b.end == null;
  let end;
  if (aOpen && bOpen) end = null;
  else if (aOpen) end = b.end;
  else if (bOpen) end = a.end;
  else end = a.end < b.end ? a.end : b.end;
  if (end != null && end < start) return null;
  return { start, end };
}

/** Merge overlapping/adjacent intervals; preserves open end. */
export function mergeIntervals(intervals) {
  if (!intervals?.length) return [];
  const sorted = [...intervals].sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));
  const out = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = out[out.length - 1];
    const next = sorted[i];
    if (cur.end == null) {
      // already open-ended — absorb
      continue;
    }
    // adjacent or overlapping: next.start <= cur.end + 1 day
    const curEndNext = addDaysToDateOnly(cur.end, 1);
    if (next.start <= cur.end || (curEndNext && next.start <= curEndNext)) {
      if (next.end == null) cur.end = null;
      else if (next.end > cur.end) cur.end = next.end;
    } else {
      out.push({ ...next });
    }
  }
  return out;
}

/**
 * Classify membership/EGW date quality (Fg1).
 * @param {{ dateJoined?: string|null, dateLeft?: string|null, id?: string }} row
 * @param {{ migrationFallbackDates?: Set<string>|string[] }} [opts]
 */
export function classifyDateAmbiguity(row, opts = {}) {
  const joined = toDateOnly(row?.dateJoined);
  if (!joined) {
    return { ambiguity_flag: 'missing_join_date', ambiguity_note: 'Missing date_joined' };
  }
  const fallbacks = opts.migrationFallbackDates
    ? (opts.migrationFallbackDates instanceof Set
      ? opts.migrationFallbackDates
      : new Set(opts.migrationFallbackDates))
    : null;
  if (fallbacks?.has(joined)) {
    return {
      ambiguity_flag: 'migration_date_fallback',
      ambiguity_note: `date_joined equals migration/fallback date ${joined}`,
    };
  }
  return { ambiguity_flag: 'ok', ambiguity_note: null };
}

/**
 * @typedef {object} ExposureInterval
 * @property {string} femaleId
 * @property {string} bullId
 * @property {string} exposureStart
 * @property {string|null} exposureEnd
 * @property {'same_group_membership'|'shared_event_group_windows'} source
 * @property {string} sourceEvidence
 * @property {string} ambiguity_flag
 * @property {string|null} ambiguity_note
 * @property {boolean} includeInView
 */

/**
 * Derive female↔breeding-male exposure intervals (A0, E1, F0, Fg1). Matching-species only; cattleOnly narrows to cattle.
 *
 * @param {object} input
 * @param {object[]} input.animals
 * @param {object[]} input.animalClasses
 * @param {object[]} input.memberships  animal_group_memberships (all history)
 * @param {object[]} input.eventGroupWindows
 * @param {boolean} [input.cattleOnly=false]
 * @param {Set<string>|string[]} [input.migrationFallbackDates]
 * @returns {ExposureInterval[]}
 */
export function deriveBullExposureIntervals({
  animals,
  animalClasses,
  memberships,
  eventGroupWindows,
  cattleOnly = false,
  migrationFallbackDates,
} = {}) {
  const classById = new Map((animalClasses || []).map(c => [c.id, c]));
  const animalById = new Map((animals || []).map(a => [a.id, a]));
  const ambOpts = { migrationFallbackDates };

  const familyOf = (animal) => {
    const cls = animal ? classById.get(animal.classId) : null;
    if (!cls) return null;
    return speciesFamily(cls.species);
  };

  /** Breeding male (bull/ram/buck) matching its species family. */
  const isActiveBreedingMale = (animal) => {
    if (!animal || animal.active === false || animal.sex === 'female') return false;
    const cls = classById.get(animal.classId);
    if (!cls) return false;
    const roleFamily = MALE_ROLE_FAMILY[cls.role];
    if (!roleFamily) return false;
    const spFamily = speciesFamily(cls.species);
    if (spFamily !== roleFamily) return false;
    if (cattleOnly && roleFamily !== 'cattle') return false;
    return true;
  };

  /** Breeding female (cow/heifer/ewe/doe) matching its species family. */
  const isBreedingFemale = (animal) => {
    if (!animal || animal.active === false || animal.sex !== 'female') return false;
    const cls = classById.get(animal.classId);
    if (!cls) return false;
    const roleFamily = FEMALE_ROLE_FAMILY[cls.role];
    if (!roleFamily) return false;
    const spFamily = speciesFamily(cls.species);
    if (spFamily !== roleFamily) return false;
    if (cattleOnly && roleFamily !== 'cattle') return false;
    return true;
  };

  const memsByAnimal = new Map();
  for (const m of memberships || []) {
    if (!m?.animalId || !m?.groupId) continue;
    if (!memsByAnimal.has(m.animalId)) memsByAnimal.set(m.animalId, []);
    memsByAnimal.get(m.animalId).push(m);
  }

  const raw = [];

  // (1) Same-group membership overlap
  const byGroup = new Map();
  for (const m of memberships || []) {
    if (!m?.groupId) continue;
    if (!byGroup.has(m.groupId)) byGroup.set(m.groupId, []);
    byGroup.get(m.groupId).push(m);
  }
  for (const [groupId, groupMems] of byGroup) {
    const females = [];
    const bulls = [];
    for (const m of groupMems) {
      const animal = animalById.get(m.animalId);
      if (isBreedingFemale(animal)) females.push(m);
      else if (isActiveBreedingMale(animal)) bulls.push(m);
    }
    for (const fm of females) {
      for (const bm of bulls) {
        if (familyOf(animalById.get(fm.animalId)) !== familyOf(animalById.get(bm.animalId))) continue;
        const fAmb = classifyDateAmbiguity(fm, ambOpts);
        const bAmb = classifyDateAmbiguity(bm, ambOpts);
        const amb = fAmb.ambiguity_flag !== 'ok' ? fAmb : bAmb;
        const ov = overlapIntervals(
          { start: toDateOnly(fm.dateJoined), end: toDateOnly(fm.dateLeft) },
          { start: toDateOnly(bm.dateJoined), end: toDateOnly(bm.dateLeft) },
        );
        if (!ov) continue;
        raw.push({
          femaleId: fm.animalId,
          bullId: bm.animalId,
          exposureStart: ov.start,
          exposureEnd: ov.end,
          source: 'same_group_membership',
          sourceEvidence: `membership:${fm.id}+${bm.id};group:${groupId}`,
          ambiguity_flag: amb.ambiguity_flag,
          ambiguity_note: amb.ambiguity_note,
          includeInView: amb.ambiguity_flag === 'ok',
        });
      }
    }
  }

  // (2) Shared-event EGW overlap across different groups
  const egwsByEvent = new Map();
  for (const w of eventGroupWindows || []) {
    if (!w?.eventId || !w?.groupId) continue;
    if (!egwsByEvent.has(w.eventId)) egwsByEvent.set(w.eventId, []);
    egwsByEvent.get(w.eventId).push(w);
  }
  for (const [eventId, egws] of egwsByEvent) {
    for (let i = 0; i < egws.length; i++) {
      for (let j = 0; j < egws.length; j++) {
        if (i === j) continue;
        const femaleEgw = egws[i];
        const bullEgw = egws[j];
        if (femaleEgw.groupId === bullEgw.groupId) continue;
        const egwOv = overlapIntervals(
          { start: toDateOnly(femaleEgw.dateJoined), end: toDateOnly(femaleEgw.dateLeft) },
          { start: toDateOnly(bullEgw.dateJoined), end: toDateOnly(bullEgw.dateLeft) },
        );
        if (!egwOv) continue;

        const fAmbE = classifyDateAmbiguity(femaleEgw, ambOpts);
        const bAmbE = classifyDateAmbiguity(bullEgw, ambOpts);
        const egwAmb = fAmbE.ambiguity_flag !== 'ok' ? fAmbE : bAmbE;

        const femaleMems = (memberships || []).filter(m => m.groupId === femaleEgw.groupId);
        const bullMems = (memberships || []).filter(m => m.groupId === bullEgw.groupId);

        for (const fm of femaleMems) {
          const animal = animalById.get(fm.animalId);
          if (!isBreedingFemale(animal)) continue;
          for (const bm of bullMems) {
            const bull = animalById.get(bm.animalId);
            if (!isActiveBreedingMale(bull)) continue;
            if (familyOf(animal) !== familyOf(bull)) continue;
            const fAmb = classifyDateAmbiguity(fm, ambOpts);
            const bAmb = classifyDateAmbiguity(bm, ambOpts);
            const memAmb = fAmb.ambiguity_flag !== 'ok' ? fAmb : (bAmb.ambiguity_flag !== 'ok' ? bAmb : egwAmb);
            const memOv = overlapIntervals(
              { start: toDateOnly(fm.dateJoined), end: toDateOnly(fm.dateLeft) },
              { start: toDateOnly(bm.dateJoined), end: toDateOnly(bm.dateLeft) },
            );
            if (!memOv) continue;
            const ov = overlapIntervals(memOv, egwOv);
            if (!ov) continue;
            raw.push({
              femaleId: fm.animalId,
              bullId: bm.animalId,
              exposureStart: ov.start,
              exposureEnd: ov.end,
              source: 'shared_event_group_windows',
              sourceEvidence: `egw:${femaleEgw.id}+${bullEgw.id};event:${eventId};membership:${fm.id}+${bm.id}`,
              ambiguity_flag: memAmb.ambiguity_flag,
              ambiguity_note: memAmb.ambiguity_note,
              includeInView: memAmb.ambiguity_flag === 'ok',
            });
          }
        }
      }
    }
  }

  // Merge per female↔bull (same source kept as separate evidence rows before merge of dates)
  return mergeExposureRows(raw);
}

/** Merge overlapping intervals per femaleId+bullId; worst ambiguity wins; sources joined. */
export function mergeExposureRows(rows) {
  const byPair = new Map();
  for (const row of rows) {
    const key = `${row.femaleId}::${row.bullId}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(row);
  }
  const out = [];
  for (const group of byPair.values()) {
    // Merge only ok intervals into view intervals; keep ambiguous as separate flagged rows
    const ok = group.filter(r => r.includeInView);
    const bad = group.filter(r => !r.includeInView);
    if (ok.length) {
      const merged = mergeIntervals(ok.map(r => ({ start: r.exposureStart, end: r.exposureEnd })));
      const sources = [...new Set(ok.map(r => r.source))];
      const evidence = ok.map(r => r.sourceEvidence).join('|');
      for (const iv of merged) {
        out.push({
          femaleId: ok[0].femaleId,
          bullId: ok[0].bullId,
          exposureStart: iv.start,
          exposureEnd: iv.end,
          source: sources.length === 1 ? sources[0] : sources.join('+'),
          sourceEvidence: evidence,
          ambiguity_flag: 'ok',
          ambiguity_note: null,
          includeInView: true,
        });
      }
    }
    for (const b of bad) out.push(b);
  }
  return out;
}

/** Non-ambiguous intervals for one female (Fg1 includeInView). */
export function includedIntervalsForFemale(intervals, femaleId) {
  return (intervals || []).filter(r => r.femaleId === femaleId && r.includeInView);
}

/** Union exposure window across included intervals for a female. */
export function unionExposureWindow(intervals) {
  const ok = (intervals || []).filter(r => r.includeInView);
  if (!ok.length) return null;
  let start = ok[0].exposureStart;
  let end = ok[0].exposureEnd;
  let anyOpen = end == null;
  for (const r of ok) {
    if (r.exposureStart < start) start = r.exposureStart;
    if (r.exposureEnd == null) anyOpen = true;
    else if (!anyOpen && (end == null || r.exposureEnd > end)) end = r.exposureEnd;
  }
  return { exposureStart: start, exposureEnd: anyOpen ? null : end };
}

/**
 * Latest calving calendar date for a dam (YYYY-MM-DD), or null.
 * @param {object[]} calvingRecords
 * @param {string} damId
 */
export function latestCalvingDate(calvingRecords, damId) {
  let best = null;
  for (const r of calvingRecords || []) {
    if (r.damId !== damId) continue;
    const d = toDateOnly(r.calvedAt);
    if (!d) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/**
 * Gc0 AND protocol gate.
 * Heifers with no calving: post-calving N/A (satisfied).
 */
export function passesPregCheckProtocol({
  exposureStart,
  lastCalvingDate,
  asOfDate,
  protocol,
}) {
  const p = protocol || resolvePregCheckProtocol(null);
  const asOf = toDateOnly(asOfDate) || getLocalTodayStr();
  const start = toDateOnly(exposureStart);
  if (!start) return false;
  const sinceExp = daysSince(start, asOf);
  if (sinceExp == null || sinceExp < p.minDaysSinceExposure) return false;
  if (!lastCalvingDate) return true;
  const sinceCalving = daysSince(toDateOnly(lastCalvingDate), asOf);
  if (sinceCalving == null) return false;
  return sinceCalving >= p.minDaysPostCalving;
}

/**
 * D0: open + non-ambiguous exposure + protocol G + active + not confirmed bred.
 * D4: confirmed with null date is NOT in this set (caller may badge separately).
 */
export function isPregnancyCheckMember({
  animal,
  animalClass,
  intervals,
  calvingRecords,
  protocol,
  farmSettings,
  asOfDate,
}) {
  const open = assessOpenAnimal(animal, animalClass);
  if (open.state !== 'known' || open.value !== true) return false;
  if (!isBreedingSpecies(animalClass?.species)) return false;
  const mine = includedIntervalsForFemale(intervals, animal.id);
  if (!mine.length) return false;
  const union = unionExposureWindow(mine);
  if (!union) return false;
  const lastCalving = latestCalvingDate(calvingRecords, animal.id);
  const p = protocol || resolvePregCheckProtocol(farmSettings, animalClass?.species);
  return passesPregCheckProtocol({
    exposureStart: union.exposureStart,
    lastCalvingDate: lastCalving,
    asOfDate,
    protocol: p,
  });
}

/**
 * Shared due band (R1): refine C0 with postpartum return-to-cycle earliest (E1)
 * and confirmed_bred_date conception-end cap (L1). Confirmation date remains
 * status (confirmedOn); do not swap start/end (B0). D0 membership unchanged.
 * Prefer breeding-record expected_calving as point beside band when present.
 *
 * @returns {{
 *   earliestDue: string|null,
 *   latestDue: string|null,
 *   expectedCalving: string|null,
 *   confirmedOn: string|null,
 *   gestationDays: number|null,
 *   missingCalving: boolean,
 *   missingExposure: boolean,
 *   ambiguousExposure: boolean,
 *   usedCalvingForEarliest: boolean,
 * }}
 */
export function dueBandForFemale({
  animal,
  animalClass,
  intervals,
  breedingRecords,
  calvingRecords,
  farmSettings,
  gestationDays,
  returnToCycleDays,
}) {
  const g = gestationDays ?? gestationDaysForSpecies(animalClass?.species) ?? CATTLE_GESTATION_DAYS;
  const allForFemale = (intervals || []).filter(r => r.femaleId === animal?.id);
  const mine = includedIntervalsForFemale(intervals, animal?.id);
  const ambiguousExposure = allForFemale.some(r => !r.includeInView);
  const union = unionExposureWindow(mine);
  const missingExposure = !union;
  let earliestDue = null;
  let latestDue = null;
  let missingCalving = false;
  let usedCalvingForEarliest = false;
  if (union) {
    const P = Number.isFinite(returnToCycleDays)
      ? Number(returnToCycleDays)
      : resolveReturnToCycleDays(farmSettings, animalClass?.species);
    const lastCalving = latestCalvingDate(calvingRecords, animal?.id);
    let conceptionStart = union.exposureStart;
    if (lastCalving) {
      const fertileFrom = addDaysToDateOnly(lastCalving, P);
      if (fertileFrom && fertileFrom > conceptionStart) {
        conceptionStart = fertileFrom;
        usedCalvingForEarliest = true;
      }
    } else {
      missingCalving = true;
    }
    earliestDue = addDaysToDateOnly(conceptionStart, g);

    // L1: when confirmed_bred_date is set, cap conception-end at min(exposureEnd, confirm).
    // Open exposure → confirm is the cap. D4 NULL date / not confirmed → L0 (no invented cap).
    let conceptionEnd = union.exposureEnd;
    const confirmDate = (animal?.confirmedBred && animal.confirmedBredDate)
      ? toDateOnly(animal.confirmedBredDate)
      : null;
    if (confirmDate) {
      if (conceptionEnd == null || confirmDate < conceptionEnd) {
        conceptionEnd = confirmDate;
      }
    }
    latestDue = conceptionEnd != null ? addDaysToDateOnly(conceptionEnd, g) : null;
  }
  const expectedCalving = pickExpectedCalving(breedingRecords, animal?.id);
  const confirmedOn = animal?.confirmedBred ? (animal.confirmedBredDate || null) : null;
  return {
    earliestDue,
    latestDue,
    expectedCalving,
    confirmedOn,
    gestationDays: g,
    missingCalving,
    missingExposure,
    ambiguousExposure,
    usedCalvingForEarliest,
  };
}

function pickExpectedCalving(breedingRecords, animalId) {
  let best = null;
  for (const r of breedingRecords || []) {
    if (r.animalId !== animalId) continue;
    const d = toDateOnly(r.expectedCalving);
    if (!d) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/** D4: confirmed bred with null confirmed_bred_date. */
export function hasConfirmedBredDateMissing(animal) {
  return animal?.confirmedBred === true && (animal.confirmedBredDate == null || animal.confirmedBredDate === '');
}

/**
 * Build D0 id set for Animals Pregnancy Check filter.
 */
export function pregnancyCheckAnimalIds(ctx) {
  const {
    animals,
    animalClasses,
    intervals,
    calvingRecords,
    protocol,
    farmSettings,
    asOfDate,
  } = ctx;
  const classById = new Map((animalClasses || []).map(c => [c.id, c]));
  const ids = new Set();
  for (const animal of animals || []) {
    if (isPregnancyCheckMember({
      animal,
      animalClass: classById.get(animal.classId),
      intervals,
      calvingRecords,
      protocol,
      farmSettings,
      asOfDate,
    })) ids.add(animal.id);
  }
  return ids;
}
