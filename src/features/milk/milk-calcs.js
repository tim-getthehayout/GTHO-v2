/**
 * @file #449 dairy milk — pure, store-free calcs (brief
 * session_briefs/DAIRY_MILK_2026-11-24.md, LOCKED t1519s5955 + t1645s6488).
 * - Visibility (`isDairyVisible`): dairy_mode on/off, or auto = any active
 *   animal whose class species is dairy_cattle. Hidden while the ceiling < 51.
 * - D-T totals: `perPickupTotals` (pickup + calf milk since the previous
 *   pickup) and `spreadDailyTotals` (pickup split evenly over the days since
 *   the previous pickup's date; first pickup on its own date). Per farm.
 * - D-G grazing: `milkingGrazingOn` — flagged, non-archived groups' paddocks
 *   on (milk date − offset), labelled with the real grazing date.
 * Calf milk always stays on its feeding date. No effect on DMI, feed or NPK.
 */
import { resolveDairySettings } from '../../entities/farm-setting.js';
import { calfMilkKg } from '../../entities/calf-milk-feeding.js';
import { isDairySchemaReleased, RELEASED_SCHEMA_VERSION } from '../../data/schema-release.js';

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function localDateOf(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDate(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days between two YYYY-MM-DD dates (b − a). */
export function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Is dairy shown for a farm? farmId null = "All farms": shown if any farm resolves shown.
 * @param {{ farmId?: string|null, farms?: object[], farmSettings?: object[], animals?: object[], animalClasses?: object[], ceiling?: number }} ctx
 */
export function isDairyVisible({ farmId = null, farms = [], farmSettings = [], animals = [], animalClasses = [], ceiling } = {}) {
  if (!isDairySchemaReleased(ceiling ?? RELEASED_SCHEMA_VERSION)) return false;
  const dairyClassIds = new Set(animalClasses.filter(c => c.species === 'dairy_cattle').map(c => c.id));
  const hasDairy = animals.some(a => a.active !== false && !a.cullDate && dairyClassIds.has(a.classId));
  const shownFor = (id) => {
    const fs = farmSettings.find(s => s.farmId === id) || null;
    const { dairyMode } = resolveDairySettings(fs);
    if (dairyMode === 'on') return true;
    if (dairyMode === 'off') return false;
    return hasDairy;
  };
  if (farmId) return shownFor(farmId);
  const ids = farms.length ? farms.map(f => f.id) : farmSettings.map(s => s.farmId);
  if (!ids.length) return hasDairy;
  return ids.some(shownFor);
}

const byTime = key => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const groupByFarm = rows => {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.farmId)) m.set(r.farmId, []);
    m.get(r.farmId).push(r);
  }
  return m;
};

/**
 * D-T per_pickup: one total per pickup = the pickup + every calf feeding after
 * the previous pickup (same farm) up to and including this pickup's time.
 * Calf milk after the latest pickup is "since last pickup".
 * @returns {{ rows: Array<{ farmId, pickup, prevPickedUpAt: string|null, spanDays: number|null, feedings: object[], pickupKg: number, calfKg: number, totalKg: number, kgPerDay: number|null }>, sinceLast: Array<{ farmId, feedings: object[], calfKg: number }> }}
 */
export function perPickupTotals(pickups = [], feedings = []) {
  const rows = [];
  const sinceLast = [];
  const farmIds = new Set([...pickups.map(p => p.farmId), ...feedings.map(f => f.farmId)]);
  const pByFarm = groupByFarm(pickups);
  const fByFarm = groupByFarm(feedings);
  for (const farmId of farmIds) {
    const ps = [...(pByFarm.get(farmId) || [])].sort(byTime('pickedUpAt'));
    const fs = [...(fByFarm.get(farmId) || [])].sort(byTime('fedAt'));
    let prev = null;
    for (const p of ps) {
      const pt = Date.parse(p.pickedUpAt);
      const prevT = prev ? Date.parse(prev.pickedUpAt) : -Infinity;
      const mine = fs.filter(f => { const t = Date.parse(f.fedAt); return t > prevT && t <= pt; });
      const calfKg = mine.reduce((s, f) => s + calfMilkKg(f), 0);
      const pickupKg = Number(p.weightKg) || 0;
      const spanDays = prev ? dayDiff(localDateOf(prev.pickedUpAt), localDateOf(p.pickedUpAt)) : null;
      const totalKg = pickupKg + calfKg;
      rows.push({
        farmId, pickup: p, prevPickedUpAt: prev?.pickedUpAt ?? null, spanDays, feedings: mine,
        pickupKg, calfKg, totalKg, kgPerDay: spanDays > 0 ? totalKg / spanDays : null,
      });
      prev = p;
    }
    const lastT = prev ? Date.parse(prev.pickedUpAt) : -Infinity;
    const after = fs.filter(f => Date.parse(f.fedAt) > lastT);
    if (after.length) sinceLast.push({ farmId, feedings: after, calfKg: after.reduce((s, f) => s + calfMilkKg(f), 0) });
  }
  rows.sort((a, b) => (a.pickup.pickedUpAt < b.pickup.pickedUpAt ? 1 : -1));
  return { rows, sinceLast };
}

/**
 * D-T spread_daily: each pickup split evenly over the calendar days from the
 * day after the previous pickup's date through its own date (same farm). The
 * first pickup counts on its own date; a second pickup on the same date spans
 * 0 extra days (counts on that date). Spread portions over > 1 day are "est.".
 * Day total = pickup milk on that day + that day's calf milk.
 * @returns {Map<string, { date: string, pickupKg: number, estimated: boolean, calfKg: number, totalKg: number }>}
 */
export function spreadDailyTotals(pickups = [], feedings = []) {
  const days = new Map();
  const day = d => {
    if (!days.has(d)) days.set(d, { date: d, pickupKg: 0, estimated: false, calfKg: 0, totalKg: 0 });
    return days.get(d);
  };
  for (const [, ps] of groupByFarm(pickups)) {
    const sorted = [...ps].sort(byTime('pickedUpAt'));
    let prevDate = null;
    for (const p of sorted) {
      const own = localDateOf(p.pickedUpAt);
      const kg = Number(p.weightKg) || 0;
      const span = prevDate ? Math.max(0, dayDiff(prevDate, own)) : 0;
      if (span <= 1) {
        day(own).pickupKg += kg;
      } else {
        for (let i = span - 1; i >= 0; i--) {
          const d = day(shiftDate(own, -i));
          d.pickupKg += kg / span;
          d.estimated = true;
        }
      }
      prevDate = own;
    }
  }
  for (const f of feedings) {
    const d = localDateOf(f.fedAt);
    if (d) day(d).calfKg += calfMilkKg(f);
  }
  for (const d of days.values()) d.totalKg = d.pickupKg + d.calfKg;
  return days;
}

/**
 * D-G: grazing beside a milk date. Grazing on day D sits beside milk on
 * D + offset, so for milk date M this returns the flagged, non-archived
 * groups' paddocks on M − offset (labelled with that real date). With
 * `farmId`, only paddocks on that farm count (Design R3: a milking group
 * grazing another farm is not drawn beside this farm's milk).
 * @returns {{ grazingDate: string, blocks: Array<{ groupId, groupName, locationId, locationName }> }}
 */
export function milkingGrazingOn(milkDate, {
  offsetDays = 1, groupIds = null, groups = [], groupWindows = [], paddockWindows = [], locations = [], today = null, farmId = null,
} = {}) {
  const grazingDate = shiftDate(milkDate, -offsetDays);
  const ids = groupIds ? new Set(groupIds) : new Set(groups.filter(g => g.isMilking && !g.archivedAt).map(g => g.id));
  const blocks = [];
  const end = today || '9999-12-31';
  const inRange = (start, stop, d) => !!start && String(start).slice(0, 10) <= d && d <= (stop ? String(stop).slice(0, 10) : end);
  for (const g of groups) {
    if (!ids.has(g.id)) continue;
    for (const gw of groupWindows) {
      if (gw.groupId !== g.id || !inRange(gw.dateJoined, gw.dateLeft, grazingDate)) continue;
      for (const pw of paddockWindows) {
        if (pw.eventId !== gw.eventId || !inRange(pw.dateOpened, pw.dateClosed, grazingDate)) continue;
        if (blocks.some(b => b.groupId === g.id && b.locationId === pw.locationId)) continue;
        const loc = locations.find(l => l.id === pw.locationId);
        if (farmId && loc?.farmId !== farmId) continue;
        blocks.push({ groupId: g.id, groupName: g.name, locationId: pw.locationId, locationName: loc?.name || '?' });
      }
    }
  }
  return { grazingDate, blocks };
}

/** Empty-state hint (#/milk page and Settings Dairy card) naming where the switch lives. */
export const NO_MILKING_GROUP_HINT = "No milking group set. Open a group, turn on 'Active milking group'.";

/** Flagged, non-archived milking group ids (the page filter default). */
export function milkingGroupIds(groups = []) {
  return groups.filter(g => g.isMilking && !g.archivedAt).map(g => g.id);
}

/** The 5 most recent distinct drivers (newest first). */
export function recentDrivers(pickups = [], n = 5) {
  const out = [];
  for (const p of [...pickups].sort((a, b) => (a.pickedUpAt < b.pickedUpAt ? 1 : -1))) {
    const d = (p.driver || '').trim();
    if (d && !out.some(x => x.toLowerCase() === d.toLowerCase())) out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * #494: collapse milkingGrazingOn() blocks into one entry per distinct paddock
 * set. Milking groups sharing the exact same paddocks on the grazing date (e.g.
 * 3 groups on one 11-paddock event) become ONE entry — group names once, each
 * paddock once — instead of groups × paddocks blocks. Distinct sets stay
 * separate. Order follows first appearance. Pure.
 * @param {Array<{groupId: string, groupName: string, locationId: string, locationName: string}>} blocks
 * @returns {Array<{ groupIds: string[], groupNames: string[], paddocks: Array<{locationId: string, locationName: string}> }>}
 */
export function summarizeGrazingBlocks(blocks = []) {
  const byGroup = new Map();
  for (const b of blocks) {
    if (!byGroup.has(b.groupId)) byGroup.set(b.groupId, { groupId: b.groupId, groupName: b.groupName, paddocks: [] });
    const g = byGroup.get(b.groupId);
    if (!g.paddocks.some(p => p.locationId === b.locationId)) g.paddocks.push({ locationId: b.locationId, locationName: b.locationName });
  }
  const entries = new Map();
  for (const g of byGroup.values()) {
    const key = g.paddocks.map(p => p.locationId).sort().join('\u0000');
    if (!entries.has(key)) entries.set(key, { groupIds: [], groupNames: [], paddocks: g.paddocks });
    const e = entries.get(key);
    e.groupIds.push(g.groupId);
    e.groupNames.push(g.groupName);
  }
  return [...entries.values()];
}
