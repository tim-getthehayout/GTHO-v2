/** @file Location, soil-test, survey and feed-type sheets, plus the location card
 * reused by the Locations & Rotation List view. The standalone Locations screen
 * (#/locations) was retired by OI-0265 and its renderer removed in #480. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, formatMeasure } from '../../utils/units.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { formatShortDate } from '../../utils/date-format.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import * as LocationEntity from '../../entities/location.js';
import * as PaddockObsEntity from '../../entities/paddock-observation.js';
import { soilTestFormValues } from '../amendments/soil-test-values.js';
import * as SoilTestEntity from '../../entities/soil-test.js';
import * as SurveyEntity from '../../entities/survey.js';
import * as SurveyDraftEntryEntity from '../../entities/survey-draft-entry.js';
import { renderSurveyCard } from '../observations/survey-card.js';
import { openFeedTypeSheet, buildFeedTypeRow } from '../feed/index.js';
import { LAND_USE_LABELS, landUseLabel } from './land-use-label.js';

// ─── State ──────────────────────────────────────────────────────────────
let locationSheet = null;
let soilTestSheet = null;
let surveySheet = null;
let feedTypesSheet = null;

// ─── Helpers ────────────────────────────────────────────────────────────

function ratingColor(rating) {
  if (rating == null) return { color: 'var(--text3)', bg: 'var(--bg2)' };
  if (rating <= 30) return { color: 'var(--red)', bg: 'var(--red-l)' };
  if (rating <= 60) return { color: 'var(--amber-d)', bg: 'var(--amber-l)' };
  return { color: 'var(--green-d)', bg: 'var(--green-l)' };
}


// ─── Main Entry ─────────────────────────────────────────────────────────

/** Location entities store area as `areaHectares`; `areaHa` is read only as a
 * legacy fallback for records written before this fix. */
function locationAreaHa(loc) {
  return loc?.areaHectares ?? loc?.areaHa ?? null;
}

// ─── Location Card ──────────────────────────────────────────────────────

/** Legacy location card; OI-0265 Lg1 reuses it on the Locations & Rotation List view. */
export function buildLocationCard(loc, operationId, farmId, unitSys) {
  const areaUnit = unitSys === 'imperial' ? 'ac' : 'ha';
  const locHa = locationAreaHa(loc);
  const areaVal = locHa ? (unitSys === 'imperial' ? convert(locHa, 'area', 'toImperial') : locHa).toFixed(2) : '';
  const isConfinement = loc.type === 'confinement';
  const landUse = loc.type === 'storage'
    ? t('location.type.storage')
    : (isConfinement ? 'Confinement' : (loc.landUse || 'pasture'));
  // OI-0271: badge shows the visible label, never the raw stored value.
  const landUseText = (loc.type === 'storage' || isConfinement) ? landUse : landUseLabel(loc.landUse);

  // Badge class
  const badgeCls = { pasture: 'bg', mixed_use: 'bg', crop: 'ba', Confinement: 'bb' }[landUse] || 'bg';

  // Latest survey observation
  const observations = getAll('paddockObservations').filter(o => o.locationId === loc.id).sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || ''));
  const latestObs = observations[0];
  const rating = latestObs?.forageQuality;
  const rc = ratingColor(rating);

  // Soil test
  const soilTests = getAll('soilTests').filter(st => st.locationId === loc.id).sort((a, b) => (b.testedAt || '').localeCompare(a.testedAt || ''));
  const latestSoil = soilTests[0];

  // Active event check
  const epws = getAll('eventPaddockWindows').filter(pw => pw.locationId === loc.id && !pw.dateClosed);
  const hasActiveEvent = epws.some(pw => { const evt = getById('events', pw.eventId); return evt && !evt.dateOut; });

  // Forage type
  const forageType = loc.forageTypeId ? getById('forageTypes', loc.forageTypeId) : null;

  // Card
  const card = el('div', { className: 'card', style: { marginBottom: '8px' } });

  const leftSide = el('div', { style: { flex: '1', minWidth: '0' } });
  const rightSide = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexShrink: '0' } });

  // Title row
  const titleChildren = [
    el('span', { style: { fontSize: '14px', fontWeight: '600' } }, [loc.name]),
    el('span', { className: `badge ${badgeCls}`, style: { fontSize: '10px' } }, [landUseText]),
    el('span', { style: { fontSize: '11px', color: 'var(--text3)' } }, [loc.fieldCode || 'no code']),
  ];
  if (hasActiveEvent) titleChildren.push(el('span', { className: 'badge ba', style: { fontSize: '10px' } }, ['active']));
  leftSide.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, titleChildren));

  // Detail line
  if (isConfinement) {
    leftSide.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [`Confinement${loc.capturePercent ? ` \u00B7 ${loc.capturePercent}% capture` : ''}`]));
  } else {
    const detailParts = [];
    if (areaVal) detailParts.push(`${areaVal} ${areaUnit}`);
    if (loc.soilType) detailParts.push(loc.soilType);
    if (forageType) detailParts.push(forageType.name);
    leftSide.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [detailParts.join(' \u00B7 ')]));
  }

  // Soil test line
  if (!isConfinement) {
    if (latestSoil) {
      leftSide.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '3px' } }, [
        el('span', { style: { color: 'var(--green)' } }, ['\u2713']),
        ` Soil tested ${formatShortDate(latestSoil.testedAt)} \u00B7 N:${latestSoil.n ?? '\u2014'} P:${latestSoil.p ?? '\u2014'} K:${latestSoil.k ?? '\u2014'} ${latestSoil.unit || ''}`,
      ]));
    } else {
      leftSide.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '3px' } }, [
        el('span', { style: { color: 'var(--text3)' } }, ['\u2713']),
        ' No soil test yet',
      ]));
    }
  }

  // Est. available DM (pasture/mixed-use only)
  if (!isConfinement && latestObs?.forageHeightCm && forageType && locHa) {
    const for1 = getCalcByName('FOR-1');
    if (for1) {
      const residual = forageType.minResidualHeightCm ?? 5;
      // OI-0095: prefer the areaPct of the currently-open PW on this location (if any) over a literal 100.
      const openPwForArea = epws.find(pw => { const evt = getById('events', pw.eventId); return evt && !evt.dateOut; });
      const areaPctForCalc = openPwForArea?.areaPct ?? 100;
      const dmAvail = for1.fn({ forageHeightCm: latestObs.forageHeightCm, residualHeightCm: residual, areaHectares: locHa, areaPct: areaPctForCalc, coverPct: latestObs.forageCoverPct ?? 80, dmKgPerCmPerHa: forageType.dmKgPerCmPerHa ?? 110 });
      // OI-0278 S3 row 30: farm unit via the shared helper.
      const dmText = formatMeasure(dmAvail, 'weight', { unitSystem: unitSys });
      const auds = (dmAvail / 11).toFixed(0);
      const heightDisplay = display(latestObs.forageHeightCm, 'length', unitSys, 1);
      leftSide.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--teal)', marginTop: '3px', fontWeight: '500' } }, [
        `\uD83C\uDF3F Est. available: ${dmText} DM \u00B7 ~${auds} AUDs`,
      ]));
      leftSide.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--text3)', marginTop: '1px' } }, [
        `Survey ${rating ?? '\u2014'} \u00B7 ${heightDisplay}`,
      ]));
    }
  }

  // Right side: rating badge + buttons
  if (rating != null) {
    rightSide.appendChild(el('span', { style: { fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px', color: rc.color, background: rc.bg } }, [String(rating)]));
  }
  rightSide.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openLocationSheet(loc, operationId, farmId) }, ['Edit']));
  if (!isConfinement) {
    rightSide.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSurveySheet(loc.id, operationId) }, ['\uD83D\uDCCB Survey']));
    rightSide.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSoilTestSheet(loc, operationId) }, ['\u270E Soil']));
  }

  card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [leftSide, rightSide]));
  return card;
}

// ─── Location Add/Edit Sheet ────────────────────────────────────────────

function ensureLocationSheetDOM() {
  if (document.getElementById('loc-edit-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'loc-edit-wrap', style: { zIndex: '240' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => locationSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'loc-edit-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
  ]));
}

export function openLocationSheet(existingLoc, operationId, farmId, opts = {}) {
  ensureLocationSheetDOM();
  if (!locationSheet) locationSheet = new Sheet('loc-edit-wrap');
  const panel = document.getElementById('loc-edit-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const isEdit = !!existingLoc;
  const unitSys = getUnitSystem();
  const farms = getAll('farms');
  const forageTypes = getAll('forageTypes');

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '14px' } }, [isEdit ? 'Edit location' : 'Add location']));

  const inputs = {};
  const typeState = { value: existingLoc?.type || 'land' };

  // Name + Acres
  inputs.name = el('input', { type: 'text', placeholder: 'North paddock', value: existingLoc?.name || '' });
  const existingHa = locationAreaHa(existingLoc);
  const areaVal = existingHa ? (unitSys === 'imperial' ? convert(existingHa, 'area', 'toImperial').toFixed(2) : existingHa.toFixed(2)) : '';
  inputs.area = el('input', { type: 'number', step: '0.5', placeholder: '20', value: areaVal });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Name']), inputs.name]),
    el('div', { className: 'field' }, [el('label', {}, [`Area (${unitSys === 'imperial' ? 'acres' : 'ha'})`]), inputs.area]),
  ]));

  // Field code
  inputs.fieldCode = el('input', { type: 'text', placeholder: 'e.g. 07, B2', maxlength: '8', value: existingLoc?.fieldCode || '' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Field code ', el('span', { style: { fontWeight: '400', color: 'var(--text2)', fontSize: '11px' } }, ['(optional)'])]), inputs.fieldCode]),
    el('div'),
  ]));

  // Farm + Land use
  inputs.farmId = el('select', {}, [
    el('option', { value: '' }, ['\u2014 none \u2014']),
    ...farms.map(f => el('option', { value: f.id, selected: (existingLoc?.farmId || farmId) === f.id }, [f.name])),
  ]);
  inputs.landUse = el('select', {}, [
    el('option', { value: 'pasture', selected: existingLoc?.landUse === 'pasture' }, [LAND_USE_LABELS.pasture]),
    el('option', { value: 'mixed_use', selected: existingLoc?.landUse === 'mixed_use' }, [LAND_USE_LABELS.mixed_use]),
    el('option', { value: 'crop', selected: existingLoc?.landUse === 'crop' }, [LAND_USE_LABELS.crop]),
    el('option', { value: 'confinement', selected: existingLoc?.type === 'confinement' }, ['Confinement']),
    ...(existingLoc?.type === 'storage'
      ? [el('option', { value: 'storage', selected: true }, [t('location.type.storage')])]
      : []),
  ]);
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Farm']), inputs.farmId]),
    el('div', { className: 'field' }, [el('label', {}, ['Land use']), inputs.landUse]),
  ]));

  // Pasture fields
  const pastureFields = el('div');
  inputs.soilType = el('select', {}, [
    el('option', { value: '' }, ['\u2014 select \u2014']),
    ...['Loam', 'Sandy loam', 'Clay loam', 'Clay', 'Sand', 'Silt', 'Peat'].map(s => el('option', { value: s, selected: existingLoc?.soilType === s }, [s])),
  ]);
  inputs.forageTypeId = el('select', {}, [
    el('option', { value: '' }, ['\u2014 none \u2014']),
    ...forageTypes.map(ft => el('option', { value: ft.id, selected: existingLoc?.forageTypeId === ft.id }, [ft.name])),
  ]);
  pastureFields.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Soil type']), inputs.soilType]),
    el('div', { className: 'field' }, [el('label', {}, ['Forage type']), inputs.forageTypeId]),
  ]));
  panel.appendChild(pastureFields);

  // Confinement fields
  const confinementFields = el('div', { style: { display: 'none' } });
  inputs.capturePercent = el('input', { type: 'number', min: '0', max: '100', step: '5', placeholder: '80', value: existingLoc?.capturePercent ?? '' });
  confinementFields.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Capture %']), inputs.capturePercent]));
  panel.appendChild(confinementFields);

  // Toggle pasture/confinement fields
  inputs.landUse.addEventListener('change', () => {
    const choice = inputs.landUse.value;
    if (choice === 'storage') {
      typeState.value = 'storage';
      pastureFields.style.display = 'none';
      confinementFields.style.display = 'none';
      return;
    }
    const isConf = choice === 'confinement';
    typeState.value = isConf ? 'confinement' : 'land';
    pastureFields.style.display = isConf ? 'none' : 'block';
    confinementFields.style.display = isConf ? 'block' : 'none';
  });
  if (existingLoc?.type === 'storage') {
    typeState.value = 'storage';
    pastureFields.style.display = 'none';
    confinementFields.style.display = 'none';
    inputs.landUse.value = 'storage';
  }
  if (existingLoc?.type === 'confinement') {
    typeState.value = 'confinement';
    pastureFields.style.display = 'none';
    confinementFields.style.display = 'block';
  }

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => saveLocation(existingLoc, typeState, inputs, operationId, farmId, unitSys, statusEl, opts.onSaved) }, [isEdit ? 'Save changes' : 'Add location']),
    el('button', { className: 'btn btn-outline', onClick: () => locationSheet.close() }, ['Cancel']),
  ]));

  if (isEdit) {
    const activeEvents = getAll('eventPaddockWindows').filter(pw => pw.locationId === existingLoc.id && !pw.dateClosed);
    panel.appendChild(el('div', { style: { marginTop: '8px' } }, [
      el('button', { className: 'btn btn-red btn-sm', style: { width: 'auto' }, onClick: () => {
        if (activeEvents.length) { window.alert(`This location has ${activeEvents.length} active event(s). Close them before deleting.`); return; }
        if (window.confirm(`Delete location "${existingLoc.name}"?`)) { remove('locations', existingLoc.id, 'locations'); locationSheet.close(); }
      } }, ['Delete location']),
    ]));
  }

  locationSheet.open();
}

function saveLocation(existingLoc, typeState, inputs, operationId, farmId, unitSys, statusEl, onSaved) {
  clear(statusEl);
  const type = typeState.value;
  const name = inputs.name.value.trim();
  if (!name) { statusEl.appendChild(el('span', {}, ['Name is required'])); return; }

  let areaHectares = null;
  if (type === 'land' && inputs.area.value !== '') {
    const areaVal = parseFloat(inputs.area.value);
    areaHectares = unitSys === 'imperial' ? convert(areaVal, 'area', 'toMetric') : areaVal;
  }

  const data = {
    operationId, farmId: inputs.farmId.value || farmId, name, type,
    landUse: type === 'land' ? inputs.landUse.value : null,
    areaHectares, fieldCode: inputs.fieldCode.value.trim() || null,
    soilType: type === 'land' ? (inputs.soilType.value || null) : null,
    forageTypeId: type === 'land' ? (inputs.forageTypeId.value || null) : null,
    capturePercent: type === 'confinement' && inputs.capturePercent.value !== '' ? parseFloat(inputs.capturePercent.value) : null,
  };

  try {
    let saved = existingLoc;
    if (existingLoc) update('locations', existingLoc.id, data, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    else {
      const rec = LocationEntity.create(data);
      add('locations', rec, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
      saved = rec;
    }
    locationSheet.close();
    if (onSaved) onSaved(saved);
  } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
}

// ─── Soil Test Sheet ────────────────────────────────────────────────────

function ensureSoilTestSheetDOM() {
  if (document.getElementById('soil-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'soil-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => soilTestSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'soil-sheet-panel' }),
  ]));
}

export function openSoilTestSheet(loc, operationId) {
  ensureSoilTestSheetDOM();
  if (!soilTestSheet) soilTestSheet = new Sheet('soil-sheet-wrap');
  const panel = document.getElementById('soil-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = getLocalTodayStr();

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Soil test']));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, [loc.name]));

  const inputs = {};
  inputs.date = el('input', { type: 'date', value: todayStr });
  inputs.unit = el('select', {}, [el('option', { value: 'lbs/acre' }, ['lbs/acre']), el('option', { value: 'kg/ha' }, ['kg/ha']), el('option', { value: 'ppm' }, ['ppm'])]);
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Test date *']), inputs.date]),
    el('div', { className: 'field' }, [el('label', {}, ['Unit']), inputs.unit]),
  ]));

  inputs.n = el('input', { type: 'number', step: '0.1' });
  inputs.p = el('input', { type: 'number', step: '0.1' });
  inputs.k = el('input', { type: 'number', step: '0.1' });
  panel.appendChild(el('div', { className: 'three' }, [
    el('div', { className: 'field' }, [el('label', {}, ['N']), inputs.n]),
    el('div', { className: 'field' }, [el('label', {}, ['P']), inputs.p]),
    el('div', { className: 'field' }, [el('label', {}, ['K']), inputs.k]),
  ]));

  inputs.ph = el('input', { type: 'number', step: '0.1', min: '0', max: '14' });
  inputs.om = el('input', { type: 'number', step: '0.1', min: '0', max: '100' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['pH ', el('span', { style: { fontWeight: '400', color: 'var(--text2)', fontSize: '11px' } }, ['(optional)'])]), inputs.ph]),
    el('div', { className: 'field' }, [el('label', {}, ['Organic matter % ', el('span', { style: { fontWeight: '400', color: 'var(--text2)', fontSize: '11px' } }, ['(optional)'])]), inputs.om]),
  ]));

  inputs.lab = el('input', { type: 'text', placeholder: 'Lab name' });
  inputs.notes = el('input', { type: 'text', placeholder: 'Sample depth, conditions\u2026' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Lab ', el('span', { style: { fontWeight: '400', color: 'var(--text2)', fontSize: '11px' } }, ['(optional)'])]), inputs.lab]));
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes ', el('span', { style: { fontWeight: '400', color: 'var(--text2)', fontSize: '11px' } }, ['(optional)'])]), inputs.notes]));

  for (const [key, input] of Object.entries(inputs)) input.dataset.testid = `location-soil-${key}`;
  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!inputs.date.value) { statusEl.appendChild(el('span', {}, ['Date is required'])); return; }
      try {
        const rec = SoilTestEntity.create(soilTestFormValues(operationId, {
          locationId: loc.id, testedAt: inputs.date.value, unit: inputs.unit.value,
          n: inputs.n.value, p: inputs.p.value, k: inputs.k.value, ph: inputs.ph.value, organicMatter: inputs.om.value,
          lab: inputs.lab.value, notes: inputs.notes.value,
        }));
        add('soilTests', rec, SoilTestEntity.validate, SoilTestEntity.toSupabaseShape, 'soil_tests');
        soilTestSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save test']),
    el('button', { className: 'btn btn-outline', onClick: () => soilTestSheet.close() }, ['Cancel']),
  ]));

  soilTestSheet.open();
}

// ─── Survey Sheet (Bulk & Single) ───────────────────────────────────────

function ensureSurveySheetDOM() {
  if (document.getElementById('survey-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'survey-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => surveySheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'survey-sheet-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
  ]));
}

/**
 * Open the survey sheet.
 * @param {string|null} locationId — single mode if set, bulk mode if null
 * @param {string} operationId
 * @param {object} [opts] — { editSurveyId: string } for bulk-edit mode
 */
export function openSurveySheet(locationId, operationId, opts = {}) {
  ensureSurveySheetDOM();
  if (!surveySheet) surveySheet = new Sheet('survey-sheet-wrap');
  const panel = document.getElementById('survey-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = getLocalTodayStr();
  const unitSys = getUnitSystem();
  const isSingle = !!locationId;
  const isBulkEdit = !!opts.editSurveyId;
  const farms = getAll('farms');
  const isMultiFarm = farms.length > 1;
  const allLocs = getAll('locations').filter(l => !l.archived && l.type === 'land' && l.landUse !== 'crop');
  const locs = isSingle ? allLocs.filter(l => l.id === locationId) : allLocs;

  // Farm settings (bale-ring diameter etc.) for the survey card.
  const farmSettings = getAll('farmSettings')[0];

  // Draft management (bulk mode only)
  let surveyId = null;
  let draftTimer = null;
  if (!isSingle) {
    if (isBulkEdit) {
      surveyId = opts.editSurveyId;
    } else {
      // Find existing draft or create new one
      const existingDraft = getAll('surveys').find(s => s.operationId === operationId && s.status === 'draft');
      if (existingDraft) {
        surveyId = existingDraft.id;
      } else {
        const newSurvey = SurveyEntity.create({ operationId, surveyDate: todayStr, type: 'bulk', status: 'draft' });
        add('surveys', newSurvey, SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
        surveyId = newSurvey.id;
      }
    }
  }

  // State — OI-0126: fields use canonical entity names so renderSurveyCard
  // ({initialValues}) and card.getValues() round-trip without a rename shim.
  const readings = {};
  for (const l of locs) readings[l.id] = {
    forageQuality: null, forageHeightCm: null, forageCoverPct: null,
    forageCondition: null, baleRingResidueCount: null,
    recoveryMinDays: null, recoveryMaxDays: null, notes: null,
  };

  // Hydrate from draft entries or committed observations. Field names on the
  // source rows (paddock_observations, survey_draft_entries) already match
  // the readings keys, so a simple spread suffices.
  if (surveyId) {
    if (isBulkEdit) {
      const obs = getAll('paddockObservations').filter(o => o.sourceId === surveyId);
      for (const o of obs) {
        if (readings[o.locationId]) {
          Object.assign(readings[o.locationId], {
            forageQuality: o.forageQuality,
            forageHeightCm: o.forageHeightCm,
            forageCoverPct: o.forageCoverPct,
            forageCondition: o.forageCondition,
            baleRingResidueCount: o.baleRingResidueCount,
            recoveryMinDays: o.recoveryMinDays,
            recoveryMaxDays: o.recoveryMaxDays,
            notes: o.notes,
          });
        }
      }
    } else {
      const draftEntries = getAll('surveyDraftEntries').filter(d => d.surveyId === surveyId);
      for (const d of draftEntries) {
        if (readings[d.locationId]) {
          Object.assign(readings[d.locationId], {
            forageQuality: d.forageQuality,
            forageHeightCm: d.forageHeightCm,
            forageCoverPct: d.forageCoverPct,
            forageCondition: d.forageCondition,
            baleRingResidueCount: d.baleRingResidueCount,
            recoveryMinDays: d.recoveryMinDays,
            recoveryMaxDays: d.recoveryMaxDays,
            notes: d.notes,
          });
        }
      }
    }
  }

  // Draft auto-save (debounced)
  function triggerDraftSave() {
    if (!surveyId || isSingle || isBulkEdit) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(), 1000);
  }

  function saveDraft() {
    if (!surveyId) return;
    // OI-0126: flush in-progress card input state back to readings before we
    // walk the map to write draft entries. Without this, values typed into
    // the renderSurveyCard inputs that haven't blurred yet are lost.
    commitReadingsFromCards();
    const oldEntries = getAll('surveyDraftEntries').filter(d => d.surveyId === surveyId);
    for (const d of oldEntries) remove('surveyDraftEntries', d.id, 'survey_draft_entries');
    for (const [locId, r] of Object.entries(readings)) {
      if (r.forageQuality == null && r.forageHeightCm == null && r.forageCoverPct == null && !r.forageCondition) continue;
      const entry = SurveyDraftEntryEntity.create({
        operationId, surveyId, locationId: locId, ...r,
      });
      add('surveyDraftEntries', entry, SurveyDraftEntryEntity.validate, SurveyDraftEntryEntity.toSupabaseShape, 'survey_draft_entries');
    }
    const dateVal = panel.querySelector('input[type="date"]')?.value || todayStr;
    update('surveys', surveyId, { surveyDate: dateVal }, SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
  }

  // OI-0126: card instances per-location. renderPaddockList() rebuilds these
  // on every re-render; commitReadingsFromCards() flushes current input state
  // from each card back into `readings` before the teardown.
  const cards = new Map();
  function commitReadingsFromCards() {
    for (const [locId, card] of cards) {
      if (readings[locId]) Object.assign(readings[locId], card.getValues());
    }
  }

  let farmFilter = 'all';
  let typeFilter = 'all';
  let searchQuery2 = '';
  const expandedCards = new Set(isSingle ? locs.map(l => l.id) : []);

  // Header
  // Expand-all state
  let expandAll = false;

  // Confirm bar element (for "Finish anyway?" flow)
  const confirmBar = el('div', { style: { display: 'none', padding: '8px 0 6px', borderTop: '0.5px solid var(--border2)' } });

  if (isSingle) {
    // Single mode: classic header
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, [`Survey \u2014 ${locs[0]?.name || ''}`]));
    panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' } }, ['Rate forage availability and set recovery window.']));
  } else {
    // Bulk mode: Row 1 action buttons (v1 §6.1)
    const bulkRow1 = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 6px' } });

    // Left: Cancel (red text)
    bulkRow1.appendChild(el('button', {
      type: 'button',
      style: { background: 'none', border: 'none', color: 'var(--red)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' },
      onClick: () => { if (window.confirm('Discard changes from this session?')) surveySheet.close(); },
    }, ['Cancel']));

    // Center: DRAFT pill + Expand/Collapse all
    const expandLabel = el('span');
    function updateExpandLabel() { expandLabel.textContent = expandAll ? 'Collapse all' : 'Expand all'; }
    updateExpandLabel();

    bulkRow1.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('span', { style: { fontSize: '10px', fontWeight: '600', color: 'var(--amber-d)', background: 'var(--amber-l)', border: '1px solid var(--amber)', padding: '2px 8px', borderRadius: '10px' } }, ['DRAFT']),
      el('button', {
        type: 'button',
        style: { background: 'none', border: '0.5px solid var(--border2)', color: 'var(--text2)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 10px', borderRadius: '6px' },
        onClick: () => {
          expandAll = !expandAll;
          updateExpandLabel();
          if (expandAll) { for (const l of locs) expandedCards.add(l.id); }
          else { expandedCards.clear(); }
          renderPaddockList();
        },
      }, [expandLabel]),
    ]));

    // Right: Save Draft + Finish & Save + ✕
    bulkRow1.appendChild(el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
      el('button', { type: 'button', className: 'btn btn-outline btn-sm', onClick: () => { saveDraft(); } }, ['Save Draft']),
      el('button', { type: 'button', className: 'btn btn-green btn-sm', onClick: () => {
        // Check for unrated paddocks. commitReadingsFromCards() pulls current
        // input state so the "have you rated anything yet?" count is honest.
        commitReadingsFromCards();
        const rated = Object.entries(readings).filter(([_k, r2]) => r2.forageQuality != null);
        const total = locs.length;
        if (rated.length < total) {
          // Show confirm bar
          clear(confirmBar);
          confirmBar.style.display = 'block';
          confirmBar.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '8px', textAlign: 'center' } }, [`${total - rated.length} of ${total} paddocks have no data \u2014 finish anyway?`]));
          confirmBar.appendChild(el('div', { style: { display: 'flex', gap: '10px' } }, [
            el('button', { type: 'button', style: { flex: '1', padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: 'none', background: 'var(--teal)', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }, onClick: () => { confirmBar.style.display = 'none'; commitSurvey(); } }, ['Finish Anyway']),
            el('button', { type: 'button', style: { flex: '1', padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: '0.5px solid var(--border2)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }, onClick: () => { confirmBar.style.display = 'none'; } }, ['Go Back']),
          ]));
        } else {
          commitSurvey();
        }
      } }, ['Finish & Save']),
      el('button', { type: 'button', style: { background: 'none', border: 'none', color: 'var(--text2)', fontSize: '18px', lineHeight: '1', cursor: 'pointer', padding: '2px 4px', marginLeft: '2px' }, title: 'Close (saves draft)', onClick: () => surveySheet.close() }, ['\u2715']),
    ]));

    panel.appendChild(bulkRow1);
    panel.appendChild(confirmBar);
  }

  // Date row
  const existingSurvey = surveyId ? getAll('surveys').find(s => s.id === surveyId) : null;
  const dateInput = el('input', { type: 'date', value: existingSurvey?.surveyDate || todayStr, style: { maxWidth: '180px' } });
  panel.appendChild(el('div', { className: 'field', style: { marginBottom: '14px' } }, [
    isSingle ? el('label', {}, ['Survey date']) : el('span', { style: { fontSize: '13px', fontWeight: '600' } }, ['Survey date:']),
    dateInput,
  ]));

  // Bulk chrome: filter pills (only in bulk mode)
  const filterArea = el('div');
  if (!isSingle) {
    function renderFilters() {
      clear(filterArea);
      // Farm pills
      if (isMultiFarm) {
        const farmRow = el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 0' } });
        for (const [val, label] of [['all', 'All farms'], ...farms.map(f => [f.id, f.name])]) {
          const isActive = farmFilter === val;
          farmRow.appendChild(el('button', { type: 'button', style: { padding: '4px 10px', fontSize: '11px', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', border: `0.5px solid ${isActive ? 'var(--amber)' : 'var(--border2)'}`, background: isActive ? 'var(--amber-l)' : 'transparent', color: isActive ? 'var(--amber-d)' : 'var(--text2)', fontWeight: isActive ? '600' : '400' }, onClick: () => { farmFilter = val; renderFilters(); renderPaddockList(); } }, [label]));
        }
        filterArea.appendChild(farmRow);
      }
      // Type pills
      const typeRow = el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px 0' } });
      for (const [val, label] of [['all', 'All'], ['pasture', 'Pasture'], ['mixed_use', 'Mixed-Use']]) {
        const isActive = typeFilter === val;
        typeRow.appendChild(el('button', { type: 'button', style: { padding: '4px 10px', fontSize: '11px', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', border: `0.5px solid ${isActive ? 'var(--green)' : 'var(--border2)'}`, background: isActive ? 'var(--green-l)' : 'transparent', color: isActive ? 'var(--green-d)' : 'var(--text2)', fontWeight: isActive ? '600' : '400' }, onClick: () => { typeFilter = val; renderFilters(); renderPaddockList(); } }, [label]));
      }
      filterArea.appendChild(typeRow);
      // Search
      const searchInput2 = el('input', { type: 'text', placeholder: 'Search by name or field code...', value: searchQuery2, style: { width: '100%', padding: '6px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' } });
      searchInput2.addEventListener('input', () => { searchQuery2 = searchInput2.value.trim().toLowerCase(); renderPaddockList(); });
      filterArea.appendChild(el('div', { style: { padding: '4px 0' } }, [searchInput2]));
    }
    renderFilters();
    panel.appendChild(filterArea);
  }

  // Scrollable body (paddock list + buttons scroll, header stays anchored)
  const scrollBody = el('div', { style: !isSingle ? { flex: '1', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } : {} });
  if (!isSingle) {
    // Make panel a flex column so header stays fixed and body scrolls
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.overflow = 'hidden';
  }

  const paddockList = el('div');
  scrollBody.appendChild(paddockList);

  function renderPaddockList() {
    // OI-0126: flush any in-progress card input state back into `readings`
    // before teardown, then drop the old card handles — they're about to be
    // garbage-collected along with the paddockList subtree.
    commitReadingsFromCards();
    cards.clear();
    clear(paddockList);
    let filtered = [...locs];
    if (!isSingle) {
      if (farmFilter !== 'all') filtered = filtered.filter(l => l.farmId === farmFilter);
      if (typeFilter !== 'all') filtered = filtered.filter(l => l.landUse === typeFilter);
      if (searchQuery2) filtered = filtered.filter(l => (l.name || '').toLowerCase().includes(searchQuery2) || (l.fieldCode || '').toLowerCase().includes(searchQuery2));
    }

    for (const loc2 of filtered) {
      const r = readings[loc2.id];
      const loc2Ha = locationAreaHa(loc2);
      const areaVal = loc2Ha ? (unitSys === 'imperial' ? convert(loc2Ha, 'area', 'toImperial') : loc2Ha).toFixed(2) : '';
      const areaUnit2 = unitSys === 'imperial' ? 'ac' : 'ha';
      const isExpanded = expandedCards.has(loc2.id);
      const isComplete = r.forageQuality != null && r.forageHeightCm != null && r.forageCoverPct != null && r.forageCondition != null;

      // Card header (clickable in bulk mode)
      const headerChildren = [
        el('span', { style: { fontSize: '14px', fontWeight: '600' } }, [loc2.name]),
        areaVal ? el('span', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${areaVal} ${areaUnit2}`]) : null,
        isComplete ? el('span', { style: { fontSize: '10px', color: 'var(--green)', fontWeight: '600' } }, ['\u2713']) : null,
      ].filter(Boolean);

      const cardEl = el('div', { style: { marginBottom: '6px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' } });

      if (!isSingle) {
        // Collapsible header
        const header = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', cursor: 'pointer' }, onClick: () => { if (expandedCards.has(loc2.id)) expandedCards.delete(loc2.id); else expandedCards.add(loc2.id); renderPaddockList(); } }, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: '0' } }, headerChildren),
          el('div', { style: { fontSize: '16px', color: 'var(--text2)', transform: `rotate(${isExpanded ? '180' : '0'}deg)`, transition: 'transform 0.2s', flexShrink: '0', marginLeft: '8px' } }, ['\u2303']),
        ]);
        cardEl.appendChild(header);
      }

      if (isExpanded || isSingle) {
        const body = el('div', { style: { padding: '12px', background: 'var(--bg2)' } });

        // OI-0124 Phase 1 parity: read areaHectares with areaHa fallback so
        // the BRC auto-fill restored by fa04656 still works here.
        const areaHectaresVal = loc2.areaHectares ?? loc2.areaHa ?? null;
        const paddockAcres = areaHectaresVal
          ? convert(areaHectaresVal, 'area', 'toImperial')
          : null;

        // OI-0126: delegate the per-paddock observation fields to the
        // unified card (3-up Height/Cover/Rings top row, 1–100 quality
        // slider, condition chips, recovery min–max, Notes textarea — same
        // layout the other four observation surfaces use).
        const card = renderSurveyCard({
          farmSettings,
          paddockAcres,
          initialValues: readings[loc2.id],
        });
        body.appendChild(card.container);
        cards.set(loc2.id, card);

        cardEl.appendChild(body);
      }

      paddockList.appendChild(cardEl);
    }
  }
  renderPaddockList();

  // OI-0131: drive autosave via event delegation on the stable paddockList
  // container. `input` covers every native field inside renderSurveyCard
  // (quality slider, height, cover, rings, min/max, notes). Condition chips
  // fire onClick but not `input`, so a guarded click listener picks those up.
  // The underlying 1s debounce absorbs rapid keystrokes / slider drags.
  paddockList.addEventListener('input', triggerDraftSave);
  paddockList.addEventListener('click', (e) => {
    if (e.target.closest('.obs-condition-chip')) triggerDraftSave();
  });

  const statusEl = el('div', { className: 'auth-error' });
  scrollBody.appendChild(statusEl);

  // Append scrollable body to panel
  panel.appendChild(scrollBody);

  // Commit function (creates paddockObservations, marks survey committed)
  function commitSurvey() {
    clear(statusEl);
    // OI-0126: flush current card inputs into readings so an unfocused value
    // doesn't get dropped on commit.
    commitReadingsFromCards();
    const surveyDate = dateInput.value || todayStr;
    const rated = Object.entries(readings).filter(([_k, r2]) =>
      r2.forageQuality != null || r2.forageHeightCm != null ||
      r2.forageCoverPct != null || r2.forageCondition != null,
    );
    if (!rated.length) { statusEl.appendChild(el('span', {}, ['Rate at least one paddock'])); return; }
    try {
      // Bulk-edit: remove prior observations for this survey before re-creating
      if (isBulkEdit && surveyId) {
        const priorObs = getAll('paddockObservations').filter(o => o.sourceId === surveyId);
        for (const o of priorObs) remove('paddockObservations', o.id, 'paddock_observations');
      }
      for (const [locId, r2] of rated) {
        const rec = PaddockObsEntity.create({
          operationId, locationId: locId, observedAt: surveyDate + 'T12:00:00Z',
          type: 'open', source: 'survey', sourceId: surveyId || null,
          ...r2,
        });
        add('paddockObservations', rec, PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
      }
      // Mark survey committed + clean up draft entries
      if (surveyId) {
        update('surveys', surveyId, { status: 'committed', surveyDate }, SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
        const draftEntries = getAll('surveyDraftEntries').filter(d => d.surveyId === surveyId);
        for (const d of draftEntries) remove('surveyDraftEntries', d.id, 'survey_draft_entries');
      }
      surveySheet.close();
    } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
  }

  // Buttons — differ by mode
  if (!isSingle && !isBulkEdit) {
    // Bulk mode: Row 1 has Save Draft + Finish & Save + ✕ — only Discard link at bottom
    scrollBody.appendChild(el('div', { style: { marginTop: '16px', textAlign: 'center' } }, [
      el('button', { style: { background: 'none', border: 'none', color: 'var(--red)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }, onClick: () => {
        if (!window.confirm('Discard this survey draft?')) return;
        if (surveyId) {
          const draftEntries = getAll('surveyDraftEntries').filter(d => d.surveyId === surveyId);
          for (const d of draftEntries) remove('surveyDraftEntries', d.id, 'survey_draft_entries');
          remove('surveys', surveyId, 'surveys');
        }
        surveySheet.close();
      } }, ['Discard survey']),
    ]));
  } else {
    // Single mode or bulk-edit: simple Save
    scrollBody.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
      el('button', { className: 'btn btn-green', onClick: commitSurvey }, [isBulkEdit ? 'Save survey' : 'Save survey']),
      el('button', { className: 'btn btn-outline', onClick: () => surveySheet.close() }, ['Close']),
    ]));
  }

  // Auto-save draft on close (bulk mode)
  if (!isSingle && !isBulkEdit) {
    const origClose = surveySheet.close.bind(surveySheet);
    surveySheet.close = () => { saveDraft(); origClose(); };
  }

  surveySheet.open();
}

// ─── Feed Types Sheet ───────────────────────────────────────────────────
// OI-0265 Ft1 (t1288u / t1289u): this dialog stays the list/manager; Edit and
// "+ Add feed type" open the Feeds-screen dialog (one feed-type form app-wide).

let feedTypesUnsub = null;

function ensureFeedTypesSheetDOM() {
  if (document.getElementById('feed-types-wrap')) return;
  // z 220: above the harvest sheet (210) it can open over; Feeds dialog is 230.
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'feed-types-wrap', style: { zIndex: '220' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => feedTypesSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'feed-types-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
  ]));
}

export function openFeedTypesSheet(operationId) {
  ensureFeedTypesSheetDOM();
  if (!feedTypesSheet) feedTypesSheet = new Sheet('feed-types-wrap');
  const panel = document.getElementById('feed-types-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Feed types']));

  const listEl = el('div', { style: { marginBottom: '12px' }, 'data-testid': 'feed-types-dialog-list' });

  function renderFtList() {
    clear(listEl);
    const unitSys = getUnitSystem();
    const feedTypes = getAll('feedTypes').filter(ft => !ft.archived);
    if (!feedTypes.length) {
      listEl.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text3)' } }, ['No feed types defined yet']));
      return;
    }
    const list = el('div', { className: 'ft-list' });
    for (const ft of feedTypes) list.appendChild(buildFeedTypeRow(ft, operationId, unitSys));
    listEl.appendChild(list);
  }

  renderFtList();
  feedTypesUnsub?.();
  feedTypesUnsub = subscribe('feedTypes', renderFtList);
  feedTypesSheet.onClose = () => { feedTypesUnsub?.(); feedTypesUnsub = null; };

  panel.appendChild(el('button', {
    className: 'btn btn-green btn-sm',
    style: { marginBottom: '12px' },
    'data-testid': 'feed-types-dialog-add',
    onClick: () => openFeedTypeSheet(null, operationId),
  }, ['+ Add feed type']));
  panel.appendChild(listEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => feedTypesSheet.close() }, ['Done']),
  ]));

  feedTypesSheet.open();
}
