/** @file Locations screen — v1 parity rebuild. List + 7 connected sheets. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe, getVisibleLocations, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { formatShortDate } from '../../utils/date-format.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import * as LocationEntity from '../../entities/location.js';
import * as ForageTypeEntity from '../../entities/forage-type.js'; // eslint-disable-line no-unused-vars
import * as PaddockObsEntity from '../../entities/paddock-observation.js';
import * as SoilTestEntity from '../../entities/soil-test.js';
import * as FeedTypeEntity from '../../entities/feed-type.js';
import * as HarvestEventEntity from '../../entities/harvest-event.js';
import * as AmendmentEntity from '../../entities/amendment.js';
import * as AmendmentLocationEntity from '../../entities/amendment-location.js';
import { openHarvestSheet } from '../harvest/index.js';

// ─── State ──────────────────────────────────────────────────────────────
let unsubs = [];
let activeTab = 'locations';
let landUseFilter = 'all';
let farmFilter = 'all';
let sortColumn = 'name';
let sortAsc = true;
let searchQuery = '';

let locationSheet = null;
let soilTestSheet = null;
let surveySheet = null;
let feedTypesSheet = null;
let applyInputSheet = null;

// ─── Helpers ────────────────────────────────────────────────────────────

function ratingColor(rating) {
  if (rating == null) return { color: 'var(--text3)', bg: 'var(--bg2)' };
  if (rating <= 30) return { color: 'var(--red)', bg: 'var(--red-l)' };
  if (rating <= 60) return { color: 'var(--amber-d)', bg: 'var(--amber-l)' };
  return { color: 'var(--green-d)', bg: 'var(--green-l)' };
}

function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }

// ─── Main Entry ─────────────────────────────────────────────────────────

export function renderLocationsScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  const farms = getAll('farms');
  if (!operations.length) { container.appendChild(el('div', { className: 'empty' }, ['No operation found'])); return; }
  const operationId = operations[0].id;
  const farmId = getActiveFarmId() || farms[0]?.id;
  const unitSys = getUnitSystem();
  const isMultiFarm = farms.length > 1;

  // Tab header
  const tabRow = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px' } });
  function renderTabs() {
    clear(tabRow);
    tabRow.appendChild(el('button', { className: `btn ${activeTab === 'locations' ? 'btn-green' : 'btn-outline'} btn-sm`, style: { fontWeight: '600' }, onClick: () => { activeTab = 'locations'; renderAll(); } }, ['Locations']));
    tabRow.appendChild(el('button', { className: `btn ${activeTab === 'surveys' ? 'btn-green' : 'btn-outline'} btn-sm`, onClick: () => { activeTab = 'surveys'; renderAll(); } }, ['Surveys']));
  }
  container.appendChild(tabRow);

  const contentEl = el('div');
  container.appendChild(contentEl);

  function renderAll() {
    renderTabs();
    clear(contentEl);
    if (activeTab === 'surveys') {
      contentEl.appendChild(el('div', { className: 'empty' }, ['Surveys list \u2014 coming soon']));
      return;
    }
    renderLocationsTab(contentEl, operationId, farmId, unitSys, farms, isMultiFarm);
  }

  renderAll();

  const reRender = () => renderAll();
  unsubs.push(subscribe('locations', reRender));
  unsubs.push(subscribe('paddockObservations', reRender));
  unsubs.push(subscribe('soilTests', reRender));
  unsubs.push(subscribe('forageTypes', reRender));
  unsubs.push(subscribe('feedTypes', reRender));
}

function renderLocationsTab(contentEl, operationId, farmId, unitSys, farms, isMultiFarm) {
  // Inputs & Amendments summary
  contentEl.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
    el('div', { style: { fontSize: '15px', fontWeight: '600' } }, ['Inputs & amendments']),
    el('button', { className: 'btn btn-green btn-sm', onClick: () => openApplyInputSheet(operationId) }, ['Apply input']),
  ]));
  const amendments = getAll('amendments').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
  if (!amendments.length) {
    contentEl.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' } }, ['No inputs applied yet']));
  } else {
    const amList = el('div', { style: { marginBottom: '12px' } });
    for (const am of amendments) {
      const locNames = getAll('amendmentLocations').filter(al => al.amendmentId === am.id).map(al => { const l = getById('locations', al.locationId); return l?.name || ''; }).filter(Boolean).join(', ');
      amList.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--border)', fontSize: '13px' } }, [
        el('div', {}, [
          el('span', { style: { fontWeight: '500' } }, [am.productName || 'Amendment']),
          el('span', { style: { color: 'var(--text2)' } }, [` \u00B7 ${formatShortDate(am.date)} \u00B7 ${locNames}`]),
        ]),
      ]));
    }
    contentEl.appendChild(amList);
  }

  // Locations header
  const searchInput = el('input', { type: 'search', placeholder: 'Filter locations\u2026', value: searchQuery, style: { flex: '1', minWidth: '140px', padding: '7px 12px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' } });
  searchInput.addEventListener('input', () => { searchQuery = searchInput.value; renderLocationList(); });

  contentEl.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' } }, [
    el('div', { style: { fontSize: '17px', fontWeight: '600' } }, ['Locations']),
    el('button', { className: 'btn btn-green btn-sm', onClick: () => openLocationSheet(null, operationId, farmId) }, ['+ Add']),
    el('button', { className: 'btn btn-outline btn-sm', onClick: () => openSurveySheet(null, operationId) }, ['\uD83D\uDCCB Survey']),
    el('button', { className: 'btn btn-outline btn-sm', onClick: () => openHarvestSheet(operationId) }, ['\uD83C\uDF3E Harvest']),
    el('button', { className: 'btn btn-outline btn-sm', onClick: () => openFeedTypesSheet(operationId) }, ['\u2699 Feed types']),
    searchInput,
  ]));

  // Filter pills
  const filterRow = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' } });
  function renderFilterPills() {
    clear(filterRow);
    for (const [val, label] of [['all', 'All'], ['pasture', 'Pasture'], ['mixed-use', 'Mixed-Use'], ['crop', 'Crop'], ['confinement', 'Confinement']]) {
      const isActive = landUseFilter === val;
      filterRow.appendChild(el('button', {
        style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isActive ? 'var(--green)' : 'var(--border2)'}`, background: isActive ? 'var(--green)' : 'transparent', color: isActive ? 'white' : 'var(--text2)' },
        onClick: () => { landUseFilter = val; renderFilterPills(); renderLocationList(); },
      }, [label]));
    }
  }
  renderFilterPills();
  contentEl.appendChild(filterRow);

  // Farm filter (multi-farm only)
  if (isMultiFarm) {
    const farmRow = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' } });
    const isAllFarms = farmFilter === 'all';
    farmRow.appendChild(el('button', {
      style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isAllFarms ? 'var(--amber-d)' : 'var(--border2)'}`, background: isAllFarms ? 'var(--amber-d)' : 'transparent', color: isAllFarms ? 'white' : 'var(--text2)' },
      onClick: () => { farmFilter = 'all'; renderLocationList(); },
    }, ['All farms']));
    for (const f of farms) {
      const isActive = farmFilter === f.id;
      farmRow.appendChild(el('button', {
        style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${isActive ? 'var(--amber-d)' : 'var(--border2)'}`, background: isActive ? 'var(--amber-d)' : 'transparent', color: isActive ? 'white' : 'var(--text2)' },
        onClick: () => { farmFilter = f.id; renderLocationList(); },
      }, [f.name]));
    }
    contentEl.appendChild(farmRow);
  }

  // Sort header
  function sortEl(label, col) {
    const isActive = sortColumn === col;
    return el('span', {
      style: { cursor: 'pointer', color: isActive ? 'var(--green)' : 'var(--text2)', fontWeight: isActive ? '600' : '400' },
      onClick: () => { if (sortColumn === col) sortAsc = !sortAsc; else { sortColumn = col; sortAsc = true; } renderLocationList(); },
    }, [label + (isActive ? (sortAsc ? ' \u2191' : ' \u2193') : '')]);
  }

  contentEl.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 6px', borderBottom: '0.5px solid var(--border)', fontSize: '11px', marginBottom: '6px' } }, [
    el('div', { style: { color: 'var(--text2)' } }, [sortEl('Name', 'name'), ' \u00B7 ', sortEl('Acres', 'acres')]),
    el('div', { style: { color: 'var(--text2)' } }, [sortEl('Survey', 'survey')]),
  ]));

  // Location list container
  const listEl = el('div', { 'data-testid': 'locations-list' });
  contentEl.appendChild(listEl);

  function renderLocationList() {
    clear(listEl);
    let locs = getAll('locations').filter(l => !l.archived);

    // Filter by land use
    if (landUseFilter !== 'all') {
      if (landUseFilter === 'confinement') locs = locs.filter(l => l.type === 'confinement');
      else locs = locs.filter(l => l.type === 'land' && l.landUse === landUseFilter);
    }

    // Filter by farm
    if (farmFilter !== 'all') locs = locs.filter(l => l.farmId === farmFilter);

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      locs = locs.filter(l => (l.name || '').toLowerCase().includes(q) || (l.fieldCode || '').toLowerCase().includes(q));
    }

    // Sort
    const observations = getAll('paddockObservations');
    locs.sort((a, b) => {
      let va, vb;
      if (sortColumn === 'name') { va = a.name || ''; vb = b.name || ''; }
      else if (sortColumn === 'acres') { va = a.areaHa || 0; vb = b.areaHa || 0; return sortAsc ? va - vb : vb - va; }
      else if (sortColumn === 'survey') {
        const oa = observations.filter(o => o.locationId === a.id).sort((x, y) => (y.observedAt || '').localeCompare(x.observedAt || ''))[0];
        const ob = observations.filter(o => o.locationId === b.id).sort((x, y) => (y.observedAt || '').localeCompare(x.observedAt || ''))[0];
        va = oa?.forageQuality ?? -1; vb = ob?.forageQuality ?? -1;
        return sortAsc ? va - vb : vb - va;
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    if (!locs.length) {
      listEl.appendChild(el('div', { className: 'empty' }, ['No locations match this filter']));
      return;
    }

    for (const loc of locs) {
      listEl.appendChild(buildLocationCard(loc, operationId, farmId, unitSys));
    }
  }

  renderLocationList();
}

// ─── Location Card ──────────────────────────────────────────────────────

function buildLocationCard(loc, operationId, farmId, unitSys) {
  const areaUnit = unitSys === 'imperial' ? 'ac' : 'ha';
  const areaVal = loc.areaHa ? convert(loc.areaHa, 'area', 'toImperial').toFixed(2) : '';
  const isConfinement = loc.type === 'confinement';
  const landUse = isConfinement ? 'Confinement' : (loc.landUse || 'pasture');

  // Badge class
  const badgeCls = { pasture: 'bg', 'mixed-use': 'bg', crop: 'ba', Confinement: 'bb' }[landUse] || 'bg';

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
    el('span', { className: `badge ${badgeCls}`, style: { fontSize: '10px' } }, [landUse]),
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
  if (!isConfinement && latestObs?.forageHeightCm && forageType && loc.areaHa) {
    const for1 = getCalcByName('FOR-1');
    if (for1) {
      const residual = forageType.minResidualHeightCm ?? 5;
      const dmAvail = for1.fn({ forageHeightCm: latestObs.forageHeightCm, residualHeightCm: residual, areaHectares: loc.areaHa, areaPct: 100, coverPct: latestObs.forageCoverPct ?? 80, dmKgPerCmPerHa: forageType.dmKgPerCmPerHa ?? 110 });
      const dmLbs = fmtNum(convert(dmAvail, 'weight', 'toImperial'));
      const auds = (dmAvail / 11).toFixed(0);
      const heightDisplay = display(latestObs.forageHeightCm, 'length', unitSys, 1);
      leftSide.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--teal)', marginTop: '3px', fontWeight: '500' } }, [
        `\uD83C\uDF3F Est. available: ${dmLbs} lbs DM \u00B7 ~${auds} AUDs`,
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
    rightSide.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSoilTestSheetFn(loc, operationId) }, ['\u270E Soil']));
  }

  card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [leftSide, rightSide]));
  return card;
}

// ─── Location Add/Edit Sheet ────────────────────────────────────────────

function ensureLocationSheetDOM() {
  if (document.getElementById('loc-edit-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'loc-edit-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => locationSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'loc-edit-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

function openLocationSheet(existingLoc, operationId, farmId) {
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
  const areaVal = existingLoc?.areaHa ? (unitSys === 'imperial' ? convert(existingLoc.areaHa, 'area', 'toImperial').toFixed(2) : existingLoc.areaHa.toFixed(2)) : '';
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
    el('option', { value: 'pasture', selected: existingLoc?.landUse === 'pasture' }, ['Pasture']),
    el('option', { value: 'mixed-use', selected: existingLoc?.landUse === 'mixed-use' }, ['Mixed-use']),
    el('option', { value: 'crop', selected: existingLoc?.landUse === 'crop' }, ['Crop']),
    el('option', { value: 'confinement', selected: existingLoc?.type === 'confinement' }, ['Confinement']),
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
    const isConf = inputs.landUse.value === 'confinement';
    typeState.value = isConf ? 'confinement' : 'land';
    pastureFields.style.display = isConf ? 'none' : 'block';
    confinementFields.style.display = isConf ? 'block' : 'none';
  });
  if (existingLoc?.type === 'confinement') {
    typeState.value = 'confinement';
    pastureFields.style.display = 'none';
    confinementFields.style.display = 'block';
  }

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => saveLocation(existingLoc, typeState, inputs, operationId, farmId, unitSys, statusEl) }, [isEdit ? 'Save changes' : 'Add location']),
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

function saveLocation(existingLoc, typeState, inputs, operationId, farmId, unitSys, statusEl) {
  clear(statusEl);
  const type = typeState.value;
  const name = inputs.name.value.trim();
  if (!name) { statusEl.appendChild(el('span', {}, ['Name is required'])); return; }

  let areaHa = null;
  if (type === 'land' && inputs.area.value !== '') {
    const areaVal = parseFloat(inputs.area.value);
    areaHa = unitSys === 'imperial' ? convert(areaVal, 'area', 'toMetric') : areaVal;
  }

  const data = {
    operationId, farmId: inputs.farmId.value || farmId, name, type,
    landUse: type === 'land' ? inputs.landUse.value : null,
    areaHa, fieldCode: inputs.fieldCode.value.trim() || null,
    soilType: type === 'land' ? (inputs.soilType.value || null) : null,
    forageTypeId: type === 'land' ? (inputs.forageTypeId.value || null) : null,
    capturePercent: type === 'confinement' && inputs.capturePercent.value !== '' ? parseFloat(inputs.capturePercent.value) : null,
  };

  try {
    if (existingLoc) update('locations', existingLoc.id, data, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    else { const rec = LocationEntity.create(data); add('locations', rec, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations'); }
    locationSheet.close();
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

function openSoilTestSheetFn(loc, operationId) {
  ensureSoilTestSheetDOM();
  if (!soilTestSheet) soilTestSheet = new Sheet('soil-sheet-wrap');
  const panel = document.getElementById('soil-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);

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

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!inputs.date.value) { statusEl.appendChild(el('span', {}, ['Date is required'])); return; }
      try {
        const rec = SoilTestEntity.create({
          operationId, locationId: loc.id, testedAt: inputs.date.value,
          unit: inputs.unit.value, n: parseFloat(inputs.n.value) || null,
          p: parseFloat(inputs.p.value) || null, k: parseFloat(inputs.k.value) || null,
          ph: parseFloat(inputs.ph.value) || null, organicMatterPct: parseFloat(inputs.om.value) || null,
          lab: inputs.lab.value.trim() || null, notes: inputs.notes.value.trim() || null,
        });
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
    el('div', { className: 'sheet-panel', id: 'survey-sheet-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

export function openSurveySheet(locationId, operationId) {
  ensureSurveySheetDOM();
  if (!surveySheet) surveySheet = new Sheet('survey-sheet-wrap');
  const panel = document.getElementById('survey-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const unitSys = getUnitSystem();
  const isSingle = !!locationId;
  const farms = getAll('farms');
  const isMultiFarm = farms.length > 1;
  const allLocs = getAll('locations').filter(l => !l.archived && l.type === 'land' && l.landUse !== 'crop');
  const locs = isSingle ? allLocs.filter(l => l.id === locationId) : allLocs;

  // Farm settings for bale ring
  const farmSettings = getAll('farmSettings')[0];
  const baleRingDiameterFt = farmSettings?.baleRingResidueDiameterFt ?? 12;

  // State
  const readings = {};
  for (const l of locs) readings[l.id] = { rating: null, heightCm: null, coverPct: null, condition: null, baleRingCount: null, recoveryMin: null, recoveryMax: null, notes: null };
  let farmFilter = 'all';
  let typeFilter = 'all';
  let searchQuery2 = '';
  const expandedCards = new Set(isSingle ? locs.map(l => l.id) : []);

  // Header
  if (isSingle) {
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, [`Survey \u2014 ${locs[0]?.name || ''}`]));
    panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' } }, ['Rate forage availability and set recovery window.']));
  } else {
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Pasture survey']));
    panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' } }, ['Rate each paddock 0\u2013100 for forage availability.']));
  }

  const dateInput = el('input', { type: 'date', value: todayStr, style: { maxWidth: '180px' } });
  panel.appendChild(el('div', { className: 'field', style: { marginBottom: '14px' } }, [el('label', {}, ['Survey date']), dateInput]));

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
      for (const [val, label] of [['all', 'All'], ['pasture', 'Pasture'], ['mixed-use', 'Mixed-Use']]) {
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

  // Paddock list
  const paddockList = el('div');
  panel.appendChild(paddockList);

  function ratingColor(val) {
    if (val == null) return 'var(--text3)';
    if (val <= 30) return 'var(--red)';
    if (val <= 60) return 'var(--amber)';
    return 'var(--green)';
  }

  function renderPaddockList() {
    clear(paddockList);
    let filtered = [...locs];
    if (!isSingle) {
      if (farmFilter !== 'all') filtered = filtered.filter(l => l.farmId === farmFilter);
      if (typeFilter !== 'all') filtered = filtered.filter(l => l.landUse === typeFilter);
      if (searchQuery2) filtered = filtered.filter(l => (l.name || '').toLowerCase().includes(searchQuery2) || (l.fieldCode || '').toLowerCase().includes(searchQuery2));
    }

    for (const loc2 of filtered) {
      const r = readings[loc2.id];
      const areaVal = loc2.areaHa ? convert(loc2.areaHa, 'area', 'toImperial').toFixed(2) : '';
      const areaAcres = loc2.areaHa ? convert(loc2.areaHa, 'area', 'toImperial') : 0;
      const areaUnit2 = unitSys === 'imperial' ? 'ac' : 'ha';
      const isExpanded = expandedCards.has(loc2.id);
      const isComplete = r.rating != null && r.heightCm != null && r.coverPct != null && r.condition != null;

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

        // Rating slider + input
        const ratingSlider = el('input', { type: 'range', min: '0', max: '100', step: '1', value: r.rating ?? 50, style: { flex: '1', accentColor: ratingColor(r.rating ?? 50), cursor: 'pointer' } });
        const ratingInput = el('input', { type: 'number', min: '0', max: '100', step: '1', value: r.rating ?? '', placeholder: '0\u2013100', style: { width: '60px', padding: '5px 6px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', fontWeight: '600', textAlign: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' } });
        const ratingBar = el('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--bg2)', marginTop: '4px', overflow: 'hidden' } }, [
          el('div', { style: { height: '100%', width: `${r.rating ?? 0}%`, background: ratingColor(r.rating ?? 0), borderRadius: '3px', transition: 'width 0.15s, background 0.15s' } }),
        ]);
        function syncRating(val) {
          const v = parseInt(val, 10);
          r.rating = isNaN(v) ? null : Math.max(0, Math.min(100, v));
          ratingSlider.value = r.rating ?? 50;
          ratingInput.value = r.rating ?? '';
          ratingSlider.style.accentColor = ratingColor(r.rating);
          const fill = ratingBar.firstChild;
          if (fill) { fill.style.width = `${r.rating ?? 0}%`; fill.style.background = ratingColor(r.rating); }
        }
        ratingSlider.addEventListener('input', () => syncRating(ratingSlider.value));
        ratingInput.addEventListener('input', () => syncRating(ratingInput.value));

        body.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [ratingSlider, ratingInput]));
        body.appendChild(ratingBar);

        // Height + Cover
        const heightInput = el('input', { type: 'number', min: '0', max: '72', step: '0.5', placeholder: unitSys === 'imperial' ? 'inches' : 'cm', value: r.heightCm != null ? (unitSys === 'imperial' ? convert(r.heightCm, 'length', 'toImperial').toFixed(1) : r.heightCm) : '', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px' } });
        heightInput.addEventListener('change', () => { const val = parseFloat(heightInput.value); r.heightCm = !isNaN(val) ? (unitSys === 'imperial' ? convert(val, 'length', 'toMetric') : val) : null; });
        const coverInput = el('input', { type: 'number', min: '0', max: '100', step: '1', placeholder: '%', value: r.coverPct ?? '', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px' } });
        coverInput.addEventListener('change', () => { r.coverPct = parseInt(coverInput.value, 10) || null; });

        body.appendChild(el('div', { style: { display: 'flex', gap: '12px', marginTop: '14px', flexWrap: 'wrap' } }, [
          el('div', { style: { flex: '1', minWidth: '120px' } }, [
            el('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--text2)', marginBottom: '5px' } }, [`AVG VEG HEIGHT (${unitSys === 'imperial' ? 'in' : 'cm'})`]),
            heightInput,
          ]),
          el('div', { style: { flex: '1', minWidth: '120px' } }, [
            el('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--text2)', marginBottom: '5px' } }, ['AVG FORAGE COVER (%)']),
            coverInput,
          ]),
        ]));

        // Bale-ring residue helper (SP-9)
        const brc1 = getCalcByName('BRC-1');
        if (brc1) {
          const baleCaption = el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '4px' } });
          const baleInput = el('input', { type: 'number', min: '0', max: '999', placeholder: '0', value: r.baleRingCount ?? '', style: { width: '80px', padding: '6px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', textAlign: 'center' } });
          baleInput.addEventListener('input', () => {
            const count = parseInt(baleInput.value, 10) || 0;
            r.baleRingCount = count || null;
            clear(baleCaption);
            if (count > 0) {
              const result = brc1.fn({ ringCount: count, ringDiameterFt: baleRingDiameterFt, paddockAcres: areaAcres });
              baleCaption.appendChild(el('div', {}, [`${count} rings \u00D7 ${Math.round(result.ringAreaSqFt)} sq ft = ${Math.round(result.totalAreaSqFt).toLocaleString()} sq ft`]));
              if (result.computedForageCoverPct != null) {
                baleCaption.appendChild(el('div', {}, [`\u21B3 Sets forage cover to ${result.computedForageCoverPct}% (of ${Math.round(areaAcres * 43560).toLocaleString()} sq ft)`]));
                r.coverPct = result.computedForageCoverPct;
                coverInput.value = result.computedForageCoverPct;
              } else {
                baleCaption.appendChild(el('div', {}, ['\u21B3 Set paddock acreage to estimate cover.']));
              }
            }
          });
          body.appendChild(el('div', { style: { marginTop: '12px' } }, [
            el('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--text2)', marginBottom: '5px' } }, ['BALE-RING RESIDUES (optional)']),
            baleInput,
            baleCaption,
          ]));
        }

        // Condition
        const conditions = ['Poor', 'Fair', 'Good', 'Exc.'];
        const condMap = { 'Poor': 'poor', 'Fair': 'fair', 'Good': 'good', 'Exc.': 'excellent' };
        const condRow = el('div', { style: { display: 'flex', gap: '4px' } });
        function renderCondBtns() {
          clear(condRow);
          for (const c of conditions) {
            const isActive = r.condition === condMap[c];
            condRow.appendChild(el('button', { type: 'button', style: { flex: '1', padding: '6px 0', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', border: `0.5px solid ${isActive ? 'var(--green)' : 'var(--border2)'}`, background: isActive ? 'var(--green-l)' : 'transparent', color: isActive ? 'var(--green-d)' : 'var(--text2)', fontWeight: isActive ? '500' : '400' }, onClick: () => { r.condition = condMap[c]; renderCondBtns(); } }, [c]));
          }
        }
        renderCondBtns();
        body.appendChild(el('div', { style: { marginTop: '12px' } }, [
          el('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--text2)', marginBottom: '5px' } }, ['FORAGE CONDITION']),
          condRow,
        ]));

        // Recovery window (single mode + bulk expanded)
        const recMinInput = el('input', { type: 'number', placeholder: '30', min: '1', max: '365', value: r.recoveryMin ?? '', style: { width: '72px', padding: '6px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px' } });
        recMinInput.addEventListener('change', () => { r.recoveryMin = parseInt(recMinInput.value, 10) || null; });
        const recMaxInput = el('input', { type: 'number', placeholder: '60', min: '1', max: '365', value: r.recoveryMax ?? '', style: { width: '72px', padding: '6px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px' } });
        recMaxInput.addEventListener('change', () => { r.recoveryMax = parseInt(recMaxInput.value, 10) || null; });

        body.appendChild(el('div', { style: { marginTop: '14px' } }, [
          el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Recovery window']),
          el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' } }, [
            el('div', {}, [el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginBottom: '3px' } }, ['MIN days']), recMinInput]),
            el('span', { style: { fontSize: '16px', color: 'var(--text2)', paddingBottom: '6px' } }, ['\u2013']),
            el('div', {}, [el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginBottom: '3px' } }, ['MAX days']), recMaxInput]),
          ]),
        ]));

        cardEl.appendChild(body);
      }

      paddockList.appendChild(cardEl);
    }
  }
  renderPaddockList();

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const surveyDate = dateInput.value || todayStr;
      const rated = Object.entries(readings).filter(([_, r2]) => r2.rating != null || r2.heightCm != null || r2.coverPct != null || r2.condition != null);
      if (!rated.length) { statusEl.appendChild(el('span', {}, ['Rate at least one paddock'])); return; }
      try {
        for (const [locId, r2] of rated) {
          const rec = PaddockObsEntity.create({
            operationId, locationId: locId, observedAt: surveyDate + 'T12:00:00Z',
            type: 'open', source: 'survey',
            forageQuality: r2.rating, forageHeightCm: r2.heightCm, forageCoverPct: r2.coverPct,
            forageCondition: r2.condition, baleRingResidueCount: r2.baleRingCount,
            recoveryMinDays: r2.recoveryMin, recoveryMaxDays: r2.recoveryMax,
            notes: r2.notes,
          });
          add('paddockObservations', rec, PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
        }
        surveySheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save survey']),
    el('button', { className: 'btn btn-outline', onClick: () => surveySheet.close() }, ['Close']),
  ]));

  surveySheet.open();
}

// ─── Feed Types Sheet ───────────────────────────────────────────────────

function ensureFeedTypesSheetDOM() {
  if (document.getElementById('feed-types-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'feed-types-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => feedTypesSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'feed-types-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
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

  const unitSys = getUnitSystem();
  const forageTypes = getAll('forageTypes');
  let editingFt = null;

  const listEl = el('div', { style: { marginBottom: '12px' } });
  const formEl = el('div');

  function renderFtList() {
    clear(listEl);
    const feedTypes = getAll('feedTypes');
    for (const ft of feedTypes) {
      const detailParts = [ft.unit, (ft.dmPct != null && !isNaN(ft.dmPct)) ? `${ft.dmPct}% DM` : null, ft.category].filter(Boolean);
      if (ft.cuttingNumber) detailParts.push(`${ft.cuttingNumber} cut`);
      if (ft.defaultWeightKg) detailParts.push(`${Math.round(convert(ft.defaultWeightKg, 'weight', 'toImperial'))} lbs/unit`);
      listEl.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { style: { fontSize: '13px', fontWeight: '500' } }, [ft.name]),
          el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [detailParts.join(' \u00B7 ')]),
        ]),
        el('button', { className: 'btn btn-outline btn-xs', onClick: () => { editingFt = ft; renderFtForm(); } }, ['Edit']),
      ]));
    }
    if (!feedTypes.length) listEl.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text3)' } }, ['No feed types defined yet']));
  }

  function renderFtForm() {
    clear(formEl);
    const isEdit = !!editingFt;
    formEl.appendChild(el('div', { className: 'div' }));
    formEl.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', margin: '14px 0 8px' } }, [isEdit ? 'Edit feed type' : 'Add feed type']));

    const inputs = {};
    inputs.name = el('input', { type: 'text', placeholder: 'Round bale', value: editingFt?.name || '' });
    inputs.unit = el('select', {}, ['bale', 'sq bale', 'round-bale', 'ton', 'lb', 'bag'].map(u => el('option', { value: u, selected: editingFt?.unit === u }, [u])));
    formEl.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Name']), inputs.name]),
      el('div', { className: 'field' }, [el('label', {}, ['Unit']), inputs.unit]),
    ]));

    inputs.forageTypeId = el('select', {}, [
      el('option', { value: '' }, ['\u2014 Custom / none \u2014']),
      ...forageTypes.map(fgt => el('option', { value: fgt.id, selected: editingFt?.forageTypeId === fgt.id }, [fgt.name])),
    ]);
    inputs.forageTypeId.addEventListener('change', () => {
      const fgt = forageTypes.find(f => f.id === inputs.forageTypeId.value);
      if (fgt) { if (fgt.dmPct) inputs.dm.value = fgt.dmPct; }
    });
    formEl.appendChild(el('div', { className: 'field' }, [
      el('label', {}, ['Forage type ', el('span', { style: { fontWeight: '400', color: 'var(--text2)', fontSize: '11px' } }, ['(auto-fills DM%)'])]),
      inputs.forageTypeId,
    ]));

    inputs.dm = el('input', { type: 'number', placeholder: '85', value: editingFt?.dmPct ?? '' });
    inputs.cat = el('select', {}, [
      el('option', { value: 'hay', selected: (editingFt?.category || 'hay') === 'hay' }, ['Hay/forage']),
      el('option', { value: 'silage', selected: editingFt?.category === 'silage' }, ['Silage']),
      el('option', { value: 'grain', selected: editingFt?.category === 'grain' }, ['Grain/supp']),
    ]);
    formEl.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['DM %']), inputs.dm]),
      el('div', { className: 'field' }, [el('label', {}, ['Category']), inputs.cat]),
    ]));

    inputs.cutting = el('select', {}, [el('option', { value: '' }, ['None']), ...[1, 2, 3, 4].map(n => el('option', { value: String(n), selected: editingFt?.cuttingNumber === n }, [`${n} cut`]))]);
    inputs.defaultWeight = el('input', { type: 'number', placeholder: '850', min: '0', step: '1', value: editingFt?.defaultWeightKg ? Math.round(convert(editingFt.defaultWeightKg, 'weight', 'toImperial')) : '' });
    formEl.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Cutting #']), inputs.cutting]),
      el('div', { className: 'field' }, [el('label', {}, ['Default weight (lbs)']), inputs.defaultWeight]),
    ]));

    const statusEl = el('div', { className: 'auth-error' });
    formEl.appendChild(statusEl);

    formEl.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
      el('button', { className: 'btn btn-green', onClick: () => {
        clear(statusEl);
        const name = inputs.name.value.trim();
        if (!name) { statusEl.appendChild(el('span', {}, ['Name is required'])); return; }
        let defaultWeightKg = parseFloat(inputs.defaultWeight.value) || null;
        if (defaultWeightKg && unitSys === 'imperial') defaultWeightKg = convert(defaultWeightKg, 'weight', 'toMetric');
        const data = {
          operationId, name, unit: inputs.unit.value, category: inputs.cat.value,
          dmPct: parseFloat(inputs.dm.value) || null, cuttingNumber: parseInt(inputs.cutting.value, 10) || null,
          defaultWeightKg, forageTypeId: inputs.forageTypeId.value || null,
          harvestActive: true,
        };
        try {
          if (isEdit) update('feedTypes', editingFt.id, data, FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
          else { const rec = FeedTypeEntity.create(data); add('feedTypes', rec, FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types'); }
          editingFt = null; renderFtList(); renderFtForm();
        } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
      } }, [isEdit ? 'Save changes' : 'Add type']),
      el('button', { className: 'btn btn-outline', onClick: () => { editingFt = null; renderFtForm(); } }, ['Cancel']),
      isEdit ? el('button', { className: 'btn btn-outline', style: { color: 'var(--red)', borderColor: 'var(--red)', marginLeft: 'auto' }, onClick: () => {
        if (window.confirm(`Delete feed type "${editingFt.name}"?`)) { remove('feedTypes', editingFt.id, 'feed_types'); editingFt = null; renderFtList(); renderFtForm(); }
      } }, ['Delete']) : null,
    ].filter(Boolean)));
  }

  renderFtList();
  renderFtForm();
  panel.appendChild(listEl);
  panel.appendChild(formEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => feedTypesSheet.close() }, ['Done']),
  ]));

  feedTypesSheet.open();
}

// ─── Apply Input / Amendment Sheet ──────────────────────────────────────

function ensureApplyInputSheetDOM() {
  if (document.getElementById('apply-input-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'apply-input-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => applyInputSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'apply-input-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

function openApplyInputSheet(operationId) {
  ensureApplyInputSheetDOM();
  if (!applyInputSheet) applyInputSheet = new Sheet('apply-input-wrap');
  const panel = document.getElementById('apply-input-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '14px' } }, ['Apply input / amendment']));

  const todayStr = new Date().toISOString().slice(0, 10);
  let sourceType = 'product';
  const selectedLocations = new Set();

  // Date
  const dateInput = el('input', { type: 'date', value: todayStr });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Date applied']), dateInput]));

  // Source toggle
  const sourceSelect = el('select', {}, [
    el('option', { value: 'product' }, ['Purchased product / input']),
    el('option', { value: 'manure' }, ['Stored manure from inventory']),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Source']), sourceSelect]));

  // Product fields
  const productFields = el('div');
  const products = getAll('inputProducts');
  const productSelect = el('select', {}, [
    el('option', { value: '' }, ['\u2014 select product \u2014']),
    ...products.map(p => el('option', { value: p.id }, [p.name])),
  ]);
  const qtyInput = el('input', { type: 'number', step: '0.01', placeholder: '0' });
  productFields.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Product']), productSelect]));
  productFields.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Quantity']), qtyInput]),
    el('div'),
  ]));
  panel.appendChild(productFields);

  // Manure fields (hidden by default)
  const manureFields = el('div', { style: { display: 'none' } });
  const manureBatches = getAll('manureBatches');
  const manureSelect = el('select', {}, [
    el('option', { value: '' }, ['\u2014 select batch \u2014']),
    ...manureBatches.map(mb => el('option', { value: mb.id }, [mb.sourceName || `Batch ${mb.id.slice(0, 6)}`])),
  ]);
  const manurePctInput = el('input', { type: 'range', min: '1', max: '100', step: '1', value: '25', style: { flex: '1', accentColor: 'var(--green)' } });
  const manurePctLabel = el('span', { style: { fontSize: '14px', fontWeight: '600', minWidth: '40px', textAlign: 'right' } }, ['25%']);
  manurePctInput.addEventListener('input', () => { manurePctLabel.textContent = `${manurePctInput.value}%`; });
  manureFields.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Manure batch']), manureSelect]));
  manureFields.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' } }, [manurePctInput, manurePctLabel]));
  panel.appendChild(manureFields);

  // Source toggle handler
  sourceSelect.addEventListener('change', () => {
    sourceType = sourceSelect.value;
    productFields.style.display = sourceType === 'product' ? 'block' : 'none';
    manureFields.style.display = sourceType === 'manure' ? 'block' : 'none';
  });

  // Location multi-select
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Apply to locations ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['select one or more'])]),
  ]));
  const locListEl = el('div', { style: { maxHeight: '200px', overflowY: 'auto', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', padding: '4px 0', marginBottom: '10px' } });
  const allLocs = getAll('locations').filter(l => !l.archived);

  function renderLocCheckboxes() {
    clear(locListEl);
    for (const loc of allLocs) {
      const isChecked = selectedLocations.has(loc.id);
      const areaVal = loc.areaHa ? convert(loc.areaHa, 'area', 'toImperial').toFixed(2) : '';
      locListEl.appendChild(el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', cursor: 'pointer', background: isChecked ? 'var(--green-l)' : 'transparent' },
        onClick: () => { if (isChecked) selectedLocations.delete(loc.id); else selectedLocations.add(loc.id); renderLocCheckboxes(); },
      }, [
        el('div', { style: { width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${isChecked ? 'var(--green)' : 'var(--border2)'}`, background: isChecked ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' } },
          isChecked ? [el('svg', { width: '10', height: '10', viewBox: '0 0 12 12', fill: 'none' }, [el('polyline', { points: '2,6 5,9 10,3', stroke: 'white', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })])] : []),
        el('div', { style: { flex: '1', fontSize: '13px', fontWeight: '500' } }, [loc.name]),
        areaVal ? el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${areaVal} ac`]) : null,
      ].filter(Boolean)));
    }
  }
  renderLocCheckboxes();
  panel.appendChild(locListEl);

  // Notes
  const notesInput = el('input', { type: 'text', placeholder: 'Application method, conditions, applicator\u2026' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), notesInput]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!selectedLocations.size) { statusEl.appendChild(el('span', {}, ['Select at least one location'])); return; }
      try {
        const productName = sourceType === 'product' ? (products.find(p => p.id === productSelect.value)?.name || 'Unknown') : 'Manure application';
        const amendment = AmendmentEntity.create({
          operationId, date: dateInput.value || todayStr, productName,
          sourceType, notes: notesInput.value.trim() || null,
        });
        add('amendments', amendment, AmendmentEntity.validate, AmendmentEntity.toSupabaseShape, 'amendments');

        for (const locId of selectedLocations) {
          const al = AmendmentLocationEntity.create({ operationId, amendmentId: amendment.id, locationId: locId });
          add('amendmentLocations', al, AmendmentLocationEntity.validate, AmendmentLocationEntity.toSupabaseShape, 'amendment_locations');
        }
        applyInputSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Record application']),
    el('button', { className: 'btn btn-outline', onClick: () => applyInputSheet.close() }, ['Cancel']),
  ]));

  applyInputSheet.open();
}
