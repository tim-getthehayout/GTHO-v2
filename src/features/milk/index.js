/**
 * @file #449 dairy milk — the #/milk page and the Record Milk Pickup / Feed
 * Calves forms (brief session_briefs/DAIRY_MILK_2026-11-24.md, LOCKED
 * t1519s5955 + t1645s6488). Metric storage; display in the farm unit system.
 * Hidden unless `isDairyVisibleNow()` (ceiling ≥ 51 and the farm's dairy mode).
 */
import { el, clear } from '../../ui/dom.js';
import { Sheet } from '../../ui/sheet.js';
import { navigate } from '../../ui/router.js';
import { getAll, add, update, remove, subscribe, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { formatMeasure, shortUnit } from '../../utils/units.js';
import { formatShortDate } from '../../utils/date-format.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { toDisplayValue, toStoredValue } from '../settings/unit-descriptor.js';
import * as MilkPickupEntity from '../../entities/milk-pickup.js';
import * as CalfMilkEntity from '../../entities/calf-milk-feeding.js';
import { resolveDairySettings, validate as validateFarmSetting, toSupabaseShape as fsToSb } from '../../entities/farm-setting.js';
import {
  NO_MILKING_GROUP_HINT, perPickupTotals, spreadDailyTotals, milkingGrazingOn, milkingGroupIds,
  recentDrivers, localDateOf, shiftDate, summarizeGrazingBlocks,
} from './milk-calcs.js';
import { dairyCtxFromStore, isDairyVisibleNow } from './visibility.js';

const WEIGHT_FIELD = { measureType: 'weight' };
const VOLUME_FIELD = { measureType: 'volume' };
export { NO_MILKING_GROUP_HINT };

export { dairyCtxFromStore, isDairyVisibleNow };

function farmSettingsFor(farmId) {
  return getAll('farmSettings').find(s => s.farmId === farmId) || null;
}

/** Resolved dairy settings for a farm (null-safe defaults). */
export function dairySettingsFor(farmId) {
  return resolveDairySettings(farmSettingsFor(farmId));
}

const pad = n => String(n).padStart(2, '0');
function localInputValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function timeText(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
const whenText = iso => `${formatShortDate(localDateOf(iso))} ${timeText(iso)}`;
/**
 * Brief D-T span: "Nov 9 6:10 AM → Nov 11 6:05 AM, 2 days". The year is shown
 * (on both ends) only when the span crosses a year boundary or falls outside
 * the current year (Design ruling 5).
 * @param {string} fromIso @param {string} toIso @param {number} spanDays
 * @param {Date} [now]
 */
export function formatPickupSpan(fromIso, toIso, spanDays, now = new Date()) {
  const a = new Date(fromIso), b = new Date(toIso);
  const withYear = a.getFullYear() !== b.getFullYear() || b.getFullYear() !== now.getFullYear();
  const opts = withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' };
  const end = d => `${d.toLocaleDateString('en-US', opts)} ${timeText(d.toISOString())}`;
  return `${end(a)} → ${end(b)}, ${spanDays} ${spanDays === 1 ? 'day' : 'days'}`;
}

function defaultFarmId(existing) {
  return existing?.farmId || getActiveFarmId() || getAll('farms')[0]?.id || null;
}
function operationId() {
  return getAll('operations')[0]?.id || null;
}

/** "10 gal → 86.0 lb" style preview of the derived calf milk weight. */
export function calfMilkPreview(volumeL, kgPerL, unitSystem = getUnitSystem()) {
  if (!(volumeL > 0)) return '—';
  return formatMeasure(volumeL * kgPerL, 'weight', { unitSystem, decimals: 1 });
}

// ─── Sheets ─────────────────────────────────────────────────────────────

let milkSheet = null;
function ensureMilkSheet() {
  if (!document.getElementById('milk-sheet-wrap')) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'milk-sheet-wrap', style: { zIndex: '215' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => milkSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'milk-sheet-panel', 'data-testid': 'milk-sheet' }),
    ]));
    milkSheet = null;
  }
  if (!milkSheet) milkSheet = new Sheet('milk-sheet-wrap');
  const panel = document.getElementById('milk-sheet-panel');
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  return panel;
}

function field(label, input, testid) {
  return el('div', { className: 'field', 'data-testid': testid }, [el('label', {}, [label]), input]);
}

function farmPicker(selected) {
  const farms = getAll('farms');
  if (farms.length < 2) return { el: null, value: () => selected };
  const select = el('select', { 'data-testid': 'milk-farm' }, farms.map(f => el('option', { value: f.id, selected: f.id === selected ? 'selected' : undefined }, [f.name || f.id])));
  return { el: field('Farm', select, 'milk-farm-field'), value: () => select.value };
}

function footer(existing, { onSave, onDelete, statusEl }) {
  return el('div', { className: 'btn-row', style: { marginTop: '12px' } }, [
    el('button', { className: 'btn btn-outline', 'data-testid': 'milk-cancel', onClick: () => milkSheet.close() }, ['Cancel']),
    el('button', {
      className: 'btn btn-green', 'data-testid': 'milk-save',
      onClick: () => {
        clear(statusEl);
        try { onSave(); milkSheet.close(); } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
      },
    }, ['Save']),
    existing ? el('button', {
      className: 'btn btn-red', 'data-testid': 'milk-delete',
      onClick: () => {
        if (!window.confirm('Delete this record? This cannot be undone.')) return;
        try { onDelete(); milkSheet.close(); } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
      },
    }, ['Delete']) : null,
  ].filter(Boolean));
}

/**
 * Record Milk Pickup (also the edit form).
 * @param {object|null} existing
 */
export function openMilkPickupSheet(existing = null) {
  const panel = ensureMilkSheet();
  const us = getUnitSystem();
  const farmSel = farmPicker(defaultFarmId(existing));
  const whenInput = el('input', { type: 'datetime-local', value: localInputValue(existing?.pickedUpAt), 'data-testid': 'milk-pickup-when' });
  const shown = existing ? toDisplayValue(existing.weightKg, WEIGHT_FIELD, us) : null;
  const weightInput = el('input', { type: 'number', step: '0.1', min: '0', inputmode: 'decimal', value: shown != null ? String(Math.round(shown * 10) / 10) : '', 'data-testid': 'milk-pickup-weight' });
  const drivers = recentDrivers(getAll('milkPickups'));
  const driverInput = el('input', { type: 'text', list: 'milk-driver-list', value: existing?.driver || '', 'data-testid': 'milk-pickup-driver' });
  const driverList = el('datalist', { id: 'milk-driver-list' }, drivers.map(d => el('option', { value: d })));
  const notesInput = el('input', { type: 'text', value: existing?.notes || '', 'data-testid': 'milk-pickup-notes' });
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'milk-status' });
  panel.append(
    el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, [existing ? 'Edit milk pickup' : 'Record Milk Pickup']),
    ...(farmSel.el ? [farmSel.el] : []),
    field('Date and time', whenInput, 'milk-pickup-when-field'),
    field(`Weight (${shortUnit('weight', us)})`, weightInput, 'milk-pickup-weight-field'),
    field('Driver', el('div', {}, [driverInput, driverList]), 'milk-pickup-driver-field'),
    field('Notes', notesInput, 'milk-pickup-notes-field'),
    statusEl,
    footer(existing, {
      statusEl,
      onSave: () => {
        const weightKg = toStoredValue(parseFloat(weightInput.value), WEIGHT_FIELD, us);
        const pickedUpAt = whenInput.value ? new Date(whenInput.value).toISOString() : '';
        const changes = { farmId: farmSel.value(), pickedUpAt, weightKg, driver: driverInput.value.trim() || null, notes: notesInput.value.trim() || null };
        if (existing) update('milkPickups', existing.id, changes, MilkPickupEntity.validate, MilkPickupEntity.toSupabaseShape, 'milk_pickups');
        else add('milkPickups', MilkPickupEntity.create({ operationId: operationId(), ...changes }), MilkPickupEntity.validate, MilkPickupEntity.toSupabaseShape, 'milk_pickups');
      },
      onDelete: () => remove('milkPickups', existing.id, 'milk_pickups'),
    }),
  );
  milkSheet.open();
}

/**
 * Feed Calves (also the edit form). Gallons (L in metric), live weight preview,
 * optional calf group (non-archived groups). The farm factor is snapshotted.
 * @param {object|null} existing
 */
export function openCalfFeedingSheet(existing = null) {
  const panel = ensureMilkSheet();
  const us = getUnitSystem();
  const farmSel = farmPicker(defaultFarmId(existing));
  const whenInput = el('input', { type: 'datetime-local', value: localInputValue(existing?.fedAt), 'data-testid': 'calf-fed-when' });
  const shown = existing ? toDisplayValue(existing.volumeL, VOLUME_FIELD, us) : null;
  const volInput = el('input', { type: 'number', step: '0.1', min: '0', inputmode: 'decimal', value: shown != null ? String(Math.round(shown * 100) / 100) : '', 'data-testid': 'calf-volume' });
  const factor = () => existing?.kgPerLSnapshot ?? dairySettingsFor(farmSel.value()).milkKgPerL;
  const preview = el('div', { className: 'form-hint', 'data-testid': 'calf-preview' });
  const refresh = () => { preview.textContent = calfMilkPreview(toStoredValue(parseFloat(volInput.value), VOLUME_FIELD, us), factor(), us); };
  volInput.addEventListener('input', refresh);
  const groups = getAll('groups').filter(g => !g.archivedAt || g.id === existing?.groupId);
  const groupSelect = el('select', { 'data-testid': 'calf-group' }, [
    el('option', { value: '' }, ['No group']),
    ...groups.map(g => el('option', { value: g.id, selected: g.id === existing?.groupId ? 'selected' : undefined }, [g.name])),
  ]);
  const notesInput = el('input', { type: 'text', value: existing?.notes || '', 'data-testid': 'calf-notes' });
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'milk-status' });
  panel.append(
    el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, [existing ? 'Edit calf feeding' : 'Feed Calves']),
    ...(farmSel.el ? [farmSel.el] : []),
    field('Date and time', whenInput, 'calf-fed-when-field'),
    field(`Milk (${shortUnit('volume', us)})`, el('div', {}, [volInput, preview]), 'calf-volume-field'),
    field('Calf group (optional)', groupSelect, 'calf-group-field'),
    field('Notes', notesInput, 'calf-notes-field'),
    statusEl,
    footer(existing, {
      statusEl,
      onSave: () => {
        const volumeL = toStoredValue(parseFloat(volInput.value), VOLUME_FIELD, us);
        const fedAt = whenInput.value ? new Date(whenInput.value).toISOString() : '';
        const changes = { farmId: farmSel.value(), fedAt, volumeL, groupId: groupSelect.value || null, notes: notesInput.value.trim() || null };
        if (existing) update('calfMilkFeedings', existing.id, changes, CalfMilkEntity.validate, CalfMilkEntity.toSupabaseShape, 'calf_milk_feedings');
        else add('calfMilkFeedings', CalfMilkEntity.create({ operationId: operationId(), kgPerLSnapshot: factor(), ...changes }), CalfMilkEntity.validate, CalfMilkEntity.toSupabaseShape, 'calf_milk_feedings');
      },
      onDelete: () => remove('calfMilkFeedings', existing.id, 'calf_milk_feedings'),
    }),
  );
  refresh();
  milkSheet.open();
}

// ─── #/milk page ────────────────────────────────────────────────────────

let unsubs = [];
const pageState = { view: 'all', from: null, to: null, groupIds: null };

/** Reset page filters (tests). */
export function _resetMilkPage() {
  pageState.view = 'all'; pageState.from = null; pageState.to = null; pageState.groupIds = null;
}

function inRange(iso, from, to) {
  const d = localDateOf(iso);
  return d && d >= from && d <= to;
}

/** #494: an entry shows this many paddock chips before "+N more". */
export const MILK_PADDOCK_CHIP_LIMIT = 6;

/** Chips for one paddock-set entry, capped with a "+N more" / "Show less" toggle (#494). */
function paddockChips(entry) {
  const groupAttr = entry.groupIds.join(',');
  const chips = entry.paddocks.map((p, i) => el('span', {
    className: `milk-paddock__block${i >= MILK_PADDOCK_CHIP_LIMIT ? ' milk-paddock__block--overflow' : ''}`,
    'data-testid': 'milk-paddock-block', 'data-group-id': groupAttr, 'data-location-id': p.locationId,
    hidden: i >= MILK_PADDOCK_CHIP_LIMIT ? '' : undefined, // el() would set hidden="false" (still hidden)
  }, [p.locationName]));
  const hiddenCount = entry.paddocks.length - MILK_PADDOCK_CHIP_LIMIT;
  const items = [...chips];
  if (hiddenCount > 0) {
    const more = `+${hiddenCount} more`;
    const toggle = el('button', {
      type: 'button', className: 'milk-paddock__more', 'data-testid': 'milk-paddock-more', 'aria-expanded': 'false',
      onClick: (e) => {
        e.stopPropagation(); // never opens the row's edit sheet
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Show less' : more;
        chips.slice(MILK_PADDOCK_CHIP_LIMIT).forEach(c => { c.hidden = !open; });
      },
    }, [more]);
    items.push(toggle);
  }
  return el('div', { className: 'milk-paddock__chips' }, items);
}

/**
 * Grazing cell: the grazing date once, then one entry per distinct paddock set
 * (#494; groups sharing the same paddocks are listed together).
 * Hooks: milk-paddock (data-grazing-date), milk-paddock-group (data-group-ids),
 * milk-paddock-block (data-group-id = the entry's group ids, comma-joined;
 * data-location-id), milk-paddock-more.
 */
function paddockCell(milkDate, farmId, ctx) {
  const offsetDays = dairySettingsFor(farmId).milkGrazingOffsetDays;
  // Per-farm offset (R1) and only this farm's paddocks (R3).
  const { grazingDate, blocks } = milkingGrazingOn(milkDate, { ...ctx, offsetDays, farmId });
  const entries = summarizeGrazingBlocks(blocks);
  return el('div', { className: 'milk-paddock', 'data-testid': 'milk-paddock', 'data-grazing-date': grazingDate }, entries.length
    ? [
      el('div', { className: 'milk-paddock__header', 'data-testid': 'milk-paddock-date' }, [`Grazed ${formatShortDate(grazingDate)}`]),
      ...entries.map(entry => el('div', { className: 'milk-paddock__group', 'data-testid': 'milk-paddock-group', 'data-group-ids': entry.groupIds.join(',') }, [
        el('div', { className: 'milk-paddock__groups' }, [entry.groupNames.join(', ')]),
        paddockChips(entry),
      ])),
    ]
    : ['—']);
}

function row(kind, cells, { testid, onClick, extraClass = '' } = {}) {
  return el('div', {
    className: `milk-row milk-row--${kind} ${extraClass}${onClick ? ' milk-row--clickable' : ''}`.trim(),
    'data-testid': testid || `milk-row-${kind}`,
    onClick: onClick || undefined,
    style: onClick ? { cursor: 'pointer' } : undefined,
  }, cells);
}

const w = (kg, us) => formatMeasure(kg, 'weight', { unitSystem: us });

/** #494: nested under a total row (All view) the child row omits the grazing cell. */
function pickupRow(p, ctx, us, { showPaddock = true } = {}) {
  return row('pickup', [
    el('div', { className: 'milk-row__when' }, [whenText(p.pickedUpAt)]),
    el('div', { className: 'milk-row__what' }, [`Pickup ${w(p.weightKg, us)}${p.driver ? ` · ${p.driver}` : ''}`]),
    showPaddock ? paddockCell(localDateOf(p.pickedUpAt), p.farmId, ctx) : null,
  ], { onClick: () => openMilkPickupSheet(p), extraClass: showPaddock ? '' : 'milk-row--child' });
}

function calfRow(f, ctx, us, { showPaddock = true } = {}) {
  const g = f.groupId ? getAll('groups').find(x => x.id === f.groupId) : null;
  return row('calves', [
    el('div', { className: 'milk-row__when' }, [whenText(f.fedAt)]),
    el('div', { className: 'milk-row__what' }, [
      `Calves ${formatMeasure(f.volumeL, 'volume', { unitSystem: us })} (${w(CalfMilkEntity.calfMilkKg(f), us)})${g ? ` · ${g.name}` : ''}`,
    ]),
    showPaddock ? paddockCell(localDateOf(f.fedAt), f.farmId, ctx) : null,
  ], { onClick: () => openCalfFeedingSheet(f), extraClass: showPaddock ? '' : 'milk-row--child' });
}

/** Rows for the current view (exported for tests). */
export function buildMilkRows({ view, from, to, farmId, groupIds, unitSystem }) {
  const us = unitSystem || getUnitSystem();
  const scope = r => !farmId || r.farmId === farmId;
  const allPickups = getAll('milkPickups').filter(scope);
  const allFeedings = getAll('calfMilkFeedings').filter(scope);
  const ctx = {
    groupIds, groups: getAll('groups'), groupWindows: getAll('eventGroupWindows'),
    paddockWindows: getAll('eventPaddockWindows'), locations: getAll('locations'), today: getLocalTodayStr(),
  };
  const pickups = allPickups.filter(p => inRange(p.pickedUpAt, from, to)).sort((a, b) => (a.pickedUpAt < b.pickedUpAt ? 1 : -1));
  const feedings = allFeedings.filter(f => inRange(f.fedAt, from, to)).sort((a, b) => (a.fedAt < b.fedAt ? 1 : -1));
  if (view === 'pickups') return pickups.map(p => pickupRow(p, ctx, us));
  if (view === 'calves') return feedings.map(f => calfRow(f, ctx, us));
  // Design ruling 2: each farm's records are totalled with that farm's own
  // milk_totals_mode. All farms = one section per farm (farm order).
  if (farmId) return totalsRowsForFarm(farmId, { allPickups, allFeedings, pickups, feedings, from, to, ctx, us });
  const farmIds = [...new Set([
    ...getAll('farms').map(f => f.id),
    ...allPickups.map(p => p.farmId), ...allFeedings.map(f => f.farmId),
  ])].filter(id => allPickups.some(p => p.farmId === id) || allFeedings.some(f => f.farmId === id));
  const farmName = id => getAll('farms').find(f => f.id === id)?.name || 'Farm';
  const out = [];
  for (const id of farmIds) {
    const mine = r => r.farmId === id;
    const section = totalsRowsForFarm(id, {
      allPickups: allPickups.filter(mine), allFeedings: allFeedings.filter(mine),
      pickups: pickups.filter(mine), feedings: feedings.filter(mine), from, to, ctx, us,
      farmLabel: farmIds.length > 1 ? farmName(id) : null, // R1: label totals when > 1 farm shown
    });
    out.push(...section);
  }
  return out;
}

const CHILD = Object.freeze({ showPaddock: false });

/** Totals rows for one farm, using that farm's milk_totals_mode. */
function totalsRowsForFarm(farmForTotals, { allPickups, allFeedings, pickups, feedings, from, to, ctx, us, farmLabel = null }) {
  const mode = dairySettingsFor(farmForTotals).milkTotalsMode;
  const out = [];
  const label = () => (farmLabel ? el('span', { className: 'milk-row__farm', 'data-testid': 'milk-row-farm', 'data-farm-id': farmForTotals }, [`${farmLabel} · `]) : null);
  if (mode === 'spread_daily') {
    const days = [...spreadDailyTotals(allPickups, allFeedings).values()]
      .filter(d => d.date >= from && d.date <= to)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const d of days) {
      out.push(row('total', [
        el('div', { className: 'milk-row__when' }, [formatShortDate(d.date)]),
        el('div', { className: 'milk-row__what' }, [
          label(),
          `Day total ${w(d.totalKg, us)} · pickup ${w(d.pickupKg, us)}${d.estimated ? ' est.' : ''} · calves ${w(d.calfKg, us)}`,
        ]),
        paddockCell(d.date, farmForTotals, ctx),
      ], { testid: 'milk-row-day', extraClass: d.estimated ? 'milk-row--est' : '' }));
      // #494: the day total carries the grazing cell; its child rows don't repeat it.
      for (const p of pickups.filter(x => localDateOf(x.pickedUpAt) === d.date)) out.push(pickupRow(p, ctx, us, CHILD));
      for (const f of feedings.filter(x => localDateOf(x.fedAt) === d.date)) out.push(calfRow(f, ctx, us, CHILD));
    }
    return out;
  }
  const { rows, sinceLast } = perPickupTotals(allPickups, allFeedings);
  for (const s of sinceLast) {
    const mine = s.feedings.filter(f => inRange(f.fedAt, from, to));
    if (!mine.length) continue;
    out.push(row('total', [
      el('div', { className: 'milk-row__when' }, ['Now']),
      el('div', { className: 'milk-row__what' }, [label(), `Since last pickup · calves ${w(s.calfKg, us)}`]),
      el('div', { className: 'milk-paddock' }),
    ], { testid: 'milk-row-since-last' }));
    for (const f of [...mine].reverse()) out.push(calfRow(f, ctx, us, CHILD));
  }
  for (const r of rows) {
    if (!inRange(r.pickup.pickedUpAt, from, to)) continue;
    const span = r.prevPickedUpAt
      ? formatPickupSpan(r.prevPickedUpAt, r.pickup.pickedUpAt, r.spanDays)
      : `First pickup · ${whenText(r.pickup.pickedUpAt)}`;
    const perDay = r.kgPerDay != null ? ` · ${w(r.kgPerDay, us)}/day` : '';
    out.push(row('total', [
      el('div', { className: 'milk-row__when' }, [formatShortDate(localDateOf(r.pickup.pickedUpAt))]),
      el('div', { className: 'milk-row__what' }, [
        label(),
        `Total ${w(r.totalKg, us)} · pickup ${w(r.pickupKg, us)} + calves ${w(r.calfKg, us)}${perDay}`,
        el('div', { className: 'form-hint', 'data-testid': 'milk-total-span' }, [span]),
      ]),
      paddockCell(localDateOf(r.pickup.pickedUpAt), r.farmId, ctx),
    ], { testid: 'milk-row-pickup-total' }));
    out.push(pickupRow(r.pickup, ctx, us, CHILD));
    for (const f of [...r.feedings].reverse()) out.push(calfRow(f, ctx, us, CHILD));
  }
  return out;
}

function offsetStepper(farmId, onChange) {
  if (!farmId) return el('div', { className: 'form-hint', 'data-testid': 'milk-offset-pick-farm' }, ['Pick a farm to change the grazing offset']);
  const fs = farmSettingsFor(farmId);
  const value = dairySettingsFor(farmId).milkGrazingOffsetDays;
  const set = (v) => {
    if (!fs || v < 0 || v > 14) return;
    update('farmSettings', fs.id, { milkGrazingOffsetDays: v }, validateFarmSetting, fsToSb, 'farm_settings');
    onChange();
  };
  return el('div', { className: 'milk-offset', 'data-testid': 'milk-offset' }, [
    el('span', {}, ['Grazing offset ']),
    el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'milk-offset-minus', onClick: () => set(value - 1), disabled: value <= 0 ? 'disabled' : undefined }, ['−']),
    el('strong', { 'data-testid': 'milk-offset-value' }, [` ${value} ${value === 1 ? 'day' : 'days'} `]),
    el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'milk-offset-plus', onClick: () => set(value + 1), disabled: value >= 14 ? 'disabled' : undefined }, ['+']),
  ]);
}

/** Render the #/milk page. */
export function renderMilkScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];
  const root = el('div', { className: 'milk-screen', 'data-testid': 'milk-screen', style: { padding: 'var(--space-4)' } });
  container.appendChild(root);
  const draw = () => {
    clear(root);
    root.appendChild(el('h1', { className: 'screen-heading' }, ['Milk']));
    if (!isDairyVisibleNow()) {
      root.appendChild(el('p', { 'data-testid': 'milk-hidden' }, ['Milk tracking is off for this farm. Turn on Dairy features in Settings.']));
      return;
    }
    const today = getLocalTodayStr();
    pageState.from ??= shiftDate(today, -13);
    pageState.to ??= today;
    const groups = getAll('groups').filter(g => !g.archivedAt);
    const flagged = milkingGroupIds(groups);
    pageState.groupIds ??= flagged;
    const farmId = getActiveFarmId();
    const viewBtn = (key, label) => el('button', {
      className: `btn btn-xs ${pageState.view === key ? 'btn-green' : 'btn-outline'}`,
      'data-testid': `milk-view-${key}`,
      onClick: () => { pageState.view = key; draw(); },
    }, [label]);
    const fromInput = el('input', { type: 'date', value: pageState.from, 'data-testid': 'milk-from', onChange: (e) => { pageState.from = e.target.value || pageState.from; draw(); } });
    const toInput = el('input', { type: 'date', value: pageState.to, 'data-testid': 'milk-to', onChange: (e) => { pageState.to = e.target.value || pageState.to; draw(); } });
    root.appendChild(el('div', { className: 'milk-toolbar', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' } }, [
      el('button', { className: 'btn btn-green btn-sm', 'data-testid': 'milk-add-pickup', onClick: () => openMilkPickupSheet() }, ['+ Pickup']),
      el('button', { className: 'btn btn-green btn-sm', 'data-testid': 'milk-add-calves', onClick: () => openCalfFeedingSheet() }, ['+ Feed calves']),
      viewBtn('pickups', 'Pickups'), viewBtn('calves', 'Calves'), viewBtn('all', 'All'),
      fromInput, toInput,
      offsetStepper(farmId, draw),
    ]));
    root.appendChild(el('div', { className: 'milk-groups', 'data-testid': 'milk-group-filter', style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } }, groups.map(g => {
      const on = pageState.groupIds.includes(g.id);
      return el('button', {
        className: `btn btn-xs ${on ? 'btn-green' : 'btn-outline'}`,
        'data-testid': 'milk-group-chip', 'data-group-id': g.id,
        onClick: () => { pageState.groupIds = on ? pageState.groupIds.filter(x => x !== g.id) : [...pageState.groupIds, g.id]; draw(); },
      }, [`${g.name}${g.isMilking ? ' (milking)' : ''}`]);
    })));
    if (!flagged.length) {
      root.appendChild(el('div', { className: 'form-hint', 'data-testid': 'milk-no-group-hint' }, [
        NO_MILKING_GROUP_HINT, ' ',
        el('a', { href: '#/animals', onClick: (e) => { e.preventDefault(); navigate('#/animals'); } }, ['Go to Animals']),
      ]));
    }
    const rows = buildMilkRows({ view: pageState.view, from: pageState.from, to: pageState.to, farmId, groupIds: pageState.groupIds });
    root.appendChild(el('div', { className: 'milk-list', 'data-testid': 'milk-list' }, rows.length ? rows : [el('p', { className: 'form-hint' }, ['No milk records in this range.'])]));
  };
  draw();
  for (const type of ['milkPickups', 'calfMilkFeedings', 'farmSettings', 'groups', 'animals', 'userPreferences']) {
    unsubs.push(subscribe(type, draw));
  }
}
