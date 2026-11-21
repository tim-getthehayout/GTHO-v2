/** @file Bull exposure → preg-check / due bands (compute-on-read).
 * Locked: A0+B0+C0+C3+D0+D4+E0+F0+Fg1+Gh0+Gs0+Gg0+Gd0(35/45)+Gc0+Ux1.
 * No exposure-row writes. Does not redefine assessOpenAnimal.
 */
import { assessOpenAnimal } from '../features/assistant/farm-reads.js';
import { getLocalTodayStr, parseDate } from '../utils/date-utils.js';

/** SCHEMA §9.7 prose — cattle gestation days (C3). Sheep/goat ~150 deferred (E0). */
export const CATTLE_GESTATION_DAYS = 283;
export const SHEEP_GESTATION_DAYS = 150;
export const GOAT_GESTATION_DAYS = 150;

/** Gd0 compiled defaults when farm_settings columns missing / not released. */
export const DEFAULT_PREG_CHECK_MIN_DAYS_SINCE_EXPOSURE = 35;
export const DEFAULT_PREG_CHECK_MIN_DAYS_POST_CALVING = 45;

export const CATTLE_SPECIES = Object.freeze(new Set(['beef_cattle', 'dairy_cattle']));

/**
 * @param {object|null|undefined} farmSettings
 * @returns {{ minDaysSinceExposure: number, minDaysPostCalving: number, combine: 'AND' }}
 */
export function resolvePregCheckProtocol(farmSettings) {
  const minDaysSinceExposure = Number.isFinite(farmSettings?.pregCheckMinDaysSinceExposure)
    ? Number(farmSettings.pregCheckMinDaysSinceExposure)
    : DEFAULT_PREG_CHECK_MIN_DAYS_SINCE_EXPOSURE;
  const minDaysPostCalving = Number.isFinite(farmSettings?.pregCheckMinDaysPostCalving)
    ? Number(farmSettings.pregCheckMinDaysPostCalving)
    : DEFAULT_PREG_CHECK_MIN_DAYS_POST_CALVING;
  return { minDaysSinceExposure, minDaysPostCalving, combine: 'AND' };
}

/** Compact Ux1 summary, e.g. `Protocol: ≥35d since exposure AND ≥45d post-calving`. */
export function formatPregCheckProtocolSummary(protocol = resolvePregCheckProtocol(null)) {
  const p = protocol?.combine === 'OR' ? 'OR' : 'AND';
  return `Protocol: ≥${protocol.minDaysSinceExposure}d since exposure ${p} ≥${protocol.minDaysPostCalving}d post-calving`;
}

export function gestationDaysForSpecies(species) {
  if (species === 'sheep') return SHEEP_GESTATION_DAYS;
  if (species === 'goat') return GOAT_GESTATION_DAYS;
  if (CATTLE_SPECIES.has(species)) return CATTLE_GESTATION_DAYS;
  return null;
}

export function isCattleSpecies(species) {
  return CATTLE_SPECIES.has(species);
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
 * Derive female↔bull exposure intervals (A0, F0, Fg1). Cattle-only when cattleOnly.
 *
 * @param {object} input
 * @param {object[]} input.animals
 * @param {object[]} input.animalClasses
 * @param {object[]} input.memberships  animal_group_memberships (all history)
 * @param {object[]} input.eventGroupWindows
 * @param {boolean} [input.cattleOnly=true]
 * @param {Set<string>|string[]} [input.migrationFallbackDates]
 * @returns {ExposureInterval[]}
 */
export function deriveBullExposureIntervals({
  animals,
  animalClasses,
  memberships,
  eventGroupWindows,
  cattleOnly = true,
  migrationFallbackDates,
} = {}) {
  const classById = new Map((animalClasses || []).map(c => [c.id, c]));
  const animalById = new Map((animals || []).map(a => [a.id, a]));
  const ambOpts = { migrationFallbackDates };

  const isActiveBull = (animal) => {
    if (!animal || animal.active === false || animal.sex === 'female') return false;
    const cls = classById.get(animal.classId);
    if (!cls || cls.role !== 'bull') return false;
    if (cattleOnly && !isCattleSpecies(cls.species)) return false;
    return true;
  };

  const isCattleFemaleCowOrHeifer = (animal) => {
    if (!animal || animal.active === false || animal.sex !== 'female') return false;
    const cls = classById.get(animal.classId);
    if (!cls || !['cow', 'heifer'].includes(cls.role)) return false;
    if (cattleOnly && !isCattleSpecies(cls.species)) return false;
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
      if (isCattleFemaleCowOrHeifer(animal)) females.push(m);
      else if (isActiveBull(animal)) bulls.push(m);
    }
    for (const fm of females) {
      for (const bm of bulls) {
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
          if (!isCattleFemaleCowOrHeifer(animal)) continue;
          for (const bm of bullMems) {
            const bull = animalById.get(bm.animalId);
            if (!isActiveBull(bull)) continue;
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
  asOfDate,
}) {
  const open = assessOpenAnimal(animal, animalClass);
  if (open.state !== 'known' || open.value !== true) return false;
  if (cattleGate(animalClass) === false) return false;
  const mine = includedIntervalsForFemale(intervals, animal.id);
  if (!mine.length) return false;
  const union = unionExposureWindow(mine);
  if (!union) return false;
  const lastCalving = latestCalvingDate(calvingRecords, animal.id);
  return passesPregCheckProtocol({
    exposureStart: union.exposureStart,
    lastCalvingDate: lastCalving,
    asOfDate,
    protocol,
  });
}

function cattleGate(animalClass) {
  if (!animalClass) return false;
  return isCattleSpecies(animalClass.species);
}

/**
 * C0 due band from exposure ± gestation; confirmation date is status only.
 * Prefer breeding-record expected_calving as point beside band when present.
 *
 * @returns {{ earliestDue: string|null, latestDue: string|null, expectedCalving: string|null, confirmedOn: string|null, gestationDays: number|null }}
 */
export function dueBandForFemale({
  animal,
  animalClass,
  intervals,
  breedingRecords,
  gestationDays,
}) {
  const g = gestationDays ?? gestationDaysForSpecies(animalClass?.species) ?? CATTLE_GESTATION_DAYS;
  const mine = includedIntervalsForFemale(intervals, animal?.id);
  const union = unionExposureWindow(mine);
  let earliestDue = null;
  let latestDue = null;
  if (union) {
    earliestDue = addDaysToDateOnly(union.exposureStart, g);
    latestDue = union.exposureEnd != null ? addDaysToDateOnly(union.exposureEnd, g) : null;
  }
  const expectedCalving = pickExpectedCalving(breedingRecords, animal?.id);
  const confirmedOn = animal?.confirmedBred ? (animal.confirmedBredDate || null) : null;
  return { earliestDue, latestDue, expectedCalving, confirmedOn, gestationDays: g };
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
      asOfDate,
    })) ids.add(animal.id);
  }
  return ids;
}
