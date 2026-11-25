/**
 * @file #451 — winter hay history (045 `historical_feedings` +
 * `historical_animal_basis`) as date-range need, stored feed eaten and pasture.
 *
 * - Need: each basis row adds head_count × avg_weight_kg × dmi_pct_snapshot/100
 *   per day over period_start..period_end INCLUSIVE.
 * - Hay eaten: quantity × weight_per_unit_kg_snapshot × dm_pct_snapshot/100
 *   (snapshots only). History rows have no batch, cost or location and never
 *   touch inventory or batch balances; this module only reads them.
 * - Event windows win: a basis day counts only when there is no event-window
 *   need for it that day (the caller's `isClipped(row, date)`).
 * - Pasture: the 11-18 rule per species and day: max(0, need − hay); hay over
 *   need is reported separately (not netted).
 * - Q-N (Tim, open): how a species' history hay is spread over its days lives
 *   behind `spreadWinterHistoryHay` (one line to swap N1 ↔ N2).
 * Pure: no store access.
 */
// Same buckets as FED-6's pastureSpeciesGroup (feed-run-rate.js), kept local so
// this pure module has no calc-registry side effects.
function pastureSpeciesGroup(species) {
  if (species === 'beef_cattle' || species === 'dairy_cattle') return 'cattle';
  if (species === 'sheep' || species === 'goat' || species === 'other') return species;
  return null;
}

const pos = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** Species bucket used for spreading and the event-window rule (cattle / sheep / goat / other). */
export function historySpeciesKey(species) {
  return pastureSpeciesGroup(species) ?? (species || null);
}

/** Daily need (kg DM) of one basis row. */
export function basisNeedKgPerDay(row) {
  return pos(row?.headCount) * pos(row?.avgWeightKg) * pos(row?.dmiPctSnapshot) / 100;
}

/** Hay eaten (kg DM) of one history feeding, from its snapshots only. */
export function historyFeedingDmKg(row) {
  return pos(row?.quantity) * pos(row?.weightPerUnitKgSnapshot) * pos(row?.dmPctSnapshot) / 100;
}

/** YYYY-MM-DD dates from start to end inclusive (UTC calendar days). */
export function historyDatesInclusive(start, end) {
  const out = [];
  if (!start || !end || end < start) return out;
  const d = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`).getTime();
  while (d.getTime() <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Hay on its delivery dates, as recorded (N2, and the no-basis-days fallback). */
export function historyHayOnDeliveryDates(feedings /* , needByDate */) {
  const out = new Map();
  for (const f of feedings || []) {
    const kg = historyFeedingDmKg(f);
    if (!(kg > 0) || !f.date) continue;
    out.set(f.date, (out.get(f.date) || 0) + kg);
  }
  return out;
}

/**
 * N1 (Design rec): spread a species' history hay evenly across its counted
 * basis days (equal kg per day). With no counted basis days, hay stays on its
 * delivery dates (it is all "hay over need").
 */
export function spreadHistoryHayEvenly(feedings, needByDate) {
  const days = [...(needByDate?.keys() || [])];
  if (!days.length) return historyHayOnDeliveryDates(feedings);
  let total = 0;
  for (const f of feedings || []) total += historyFeedingDmKg(f);
  const out = new Map();
  if (!(total > 0)) return out;
  const perDay = total / days.length;
  for (const date of days) out.set(date, perDay);
  return out;
}

// Q-N swap point. N1 (current): spreadHistoryHayEvenly.
// N2 (delivery dates as-is): replace with historyHayOnDeliveryDates.
export const spreadWinterHistoryHay = spreadHistoryHayEvenly;

/**
 * Window-independent history: per species, counted need by date and hay by date.
 * @param {{ basisRows?: object[], feedingRows?: object[], isClipped?: (row: object, date: string) => boolean, spread?: Function }} input
 * @returns {Map<string, { needByDate: Map<string, number>, hayByDate: Map<string, number>, clippedDays: number }>}
 */
export function computeWinterHistory({ basisRows = [], feedingRows = [], isClipped = () => false, spread = spreadWinterHistoryHay } = {}) {
  const bySpecies = new Map();
  const bucket = key => {
    if (!bySpecies.has(key)) bySpecies.set(key, { needByDate: new Map(), hayByDate: new Map(), clippedDays: 0, feedings: [] });
    return bySpecies.get(key);
  };
  for (const row of basisRows || []) {
    const kg = basisNeedKgPerDay(row);
    if (!(kg > 0)) continue;
    const b = bucket(historySpeciesKey(row.species));
    for (const date of historyDatesInclusive(row.periodStart, row.periodEnd)) {
      if (isClipped(row, date)) { b.clippedDays += 1; continue; }
      b.needByDate.set(date, (b.needByDate.get(date) || 0) + kg);
    }
  }
  for (const f of feedingRows || []) bucket(historySpeciesKey(f.species)).feedings.push(f);
  for (const b of bySpecies.values()) {
    b.hayByDate = spread(b.feedings, b.needByDate);
    delete b.feedings;
  }
  return bySpecies;
}

const emptyFigures = () => ({ needKg: 0, hayKg: 0, pastureKg: 0, hayOverNeedKg: 0, days: 0 });

/**
 * Sum the history over [start, through] inclusive. Per species and day:
 * pasture = max(0, need − hay), hay over need = max(0, hay − need).
 * @returns {{ needKg: number, hayKg: number, pastureKg: number, hayOverNeedKg: number, days: number, bySpecies: Object<string, object> }}
 */
export function sliceWinterHistory(history, start, through) {
  const total = { ...emptyFigures(), bySpecies: {} };
  if (!history || !start || !through || through < start) return total;
  for (const [key, b] of history) {
    const fig = emptyFigures();
    const dates = new Set();
    for (const d of b.needByDate.keys()) if (d >= start && d <= through) dates.add(d);
    for (const d of b.hayByDate.keys()) if (d >= start && d <= through) dates.add(d);
    for (const d of dates) {
      const need = b.needByDate.get(d) || 0;
      const hay = b.hayByDate.get(d) || 0;
      fig.needKg += need;
      fig.hayKg += hay;
      fig.pastureKg += Math.max(0, need - hay);
      fig.hayOverNeedKg += Math.max(0, hay - need);
      if (need > 0) fig.days += 1;
    }
    if (!dates.size) continue;
    total.bySpecies[key] = fig;
    total.needKg += fig.needKg;
    total.hayKg += fig.hayKg;
    total.pastureKg += fig.pastureKg;
    total.hayOverNeedKg += fig.hayOverNeedKg;
    total.days = Math.max(total.days, fig.days);
  }
  return total;
}
