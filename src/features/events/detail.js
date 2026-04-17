/** @file Event Detail Sheet — SP-2. Sheet overlay for one event's full data + actions. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, subscribe, add, update, remove } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display, unitLabel } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { formatShortDate } from '../../utils/date-format.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { logger } from '../../utils/logger.js';
import * as EventEntity from '../../entities/event.js';
import * as EventObsEntity from '../../entities/event-observation.js';
import { openMoveWizard } from './move-wizard.js';
import { openCloseEventSheet } from './close.js';
import { openGroupAddSheet, openGroupRemoveSheet } from './group-windows.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet } from './submove.js';
import { renderDmiChart as renderDmiChartComponent } from '../../ui/dmi-chart.js';
import { openEditGroupWindowDialog } from './edit-group-window.js';
import { openMoveFeedOutSheet } from './move-feed-out.js';
import { openEditPaddockWindowDialog } from './edit-paddock-window.js';
import { reopenEvent } from './reopen-event.js';

/** Active subscriptions for this view */
let unsubs = [];
let detailSheet = null;

// ---------------------------------------------------------------------------
// Sheet DOM + lifecycle
// ---------------------------------------------------------------------------

function ensureSheetDOM() {
  if (document.getElementById('event-detail-sheet-wrap')) return;
  document.body.appendChild(el('div', {
    className: 'sheet-wrap',
    id: 'event-detail-sheet-wrap',
    style: { zIndex: '200' },
  }, [
    el('div', { className: 'sheet-backdrop', onClick: () => closeEventDetailSheet() }),
    el('div', {
      className: 'sheet-panel',
      id: 'event-detail-sheet-panel',
      style: { maxWidth: '720px', margin: '0 auto', overflowY: 'auto', maxHeight: '100vh' },
    }),
  ]));
}

/**
 * Open the event detail sheet.
 * @param {object} event - The event record
 * @param {string} operationId
 * @param {string} farmId
 */
export function openEventDetailSheet(event, operationId, farmId) {
  ensureSheetDOM();
  if (!detailSheet) {
    detailSheet = new Sheet('event-detail-sheet-wrap');
  }

  const panel = document.getElementById('event-detail-sheet-panel');
  if (!panel) return;

  // Clean up previous subscriptions
  unsubs.forEach(fn => fn());
  unsubs = [];
  clear(panel);

  const eventId = event.id;

  if (!getById('events', eventId)) {
    logger.warn('events.detail.not_found', { id: eventId });
    panel.appendChild(el('div', { style: { padding: 'var(--space-6)', textAlign: 'center' } }, [
      el('h2', {}, [t('event.notFound')]),
      el('button', { className: 'btn btn-teal', onClick: () => closeEventDetailSheet() }, [t('event.backToEvents')]),
    ]));
    detailSheet.open();
    return;
  }

  const wrapper = el('div', {
    className: 'event-detail',
    'data-testid': 'event-detail-view',
    style: { padding: 'var(--space-4)' },
  });
  panel.appendChild(wrapper);

  const sections = {
    header: el('div', { 'data-testid': 'detail-header' }),
    summary: el('div', { 'data-testid': 'detail-summary' }),
    dmiChart: el('div', { 'data-testid': 'detail-dmi-chart' }),
    dmiNpk: el('div', { 'data-testid': 'detail-dmi-npk' }),
    paddocks: el('div', { 'data-testid': 'detail-paddocks' }),
    preGraze: el('div', { 'data-testid': 'detail-pre-graze' }),
    postGraze: el('div', { 'data-testid': 'detail-post-graze' }),
    groups: el('div', { 'data-testid': 'detail-groups' }),
    feedEntries: el('div', { 'data-testid': 'detail-feed-entries' }),
    feedChecks: el('div', { 'data-testid': 'detail-feed-checks' }),
    notes: el('div', { 'data-testid': 'detail-notes' }),
    submoves: el('div', { 'data-testid': 'detail-submoves' }),
    actions: el('div', { 'data-testid': 'detail-actions' }),
  };

  for (const s of Object.values(sections)) {
    wrapper.appendChild(s);
  }

  const ctx = { eventId, operationId, farmId, sections };

  // Initial render of all sections
  renderAll(ctx);

  // Subscriptions — surgical re-render per section
  unsubs.push(subscribe('events', () => {
    const evt = getById('events', eventId);
    if (!evt) { closeEventDetailSheet(); return; }
    renderHeader(ctx);
    renderSummary(ctx);
    renderNotes(ctx);
    renderActions(ctx);
  }));
  unsubs.push(subscribe('eventPaddockWindows', () => {
    renderPaddocks(ctx);
    renderPostGraze(ctx);
    renderSubmoves(ctx);
    renderSummary(ctx);
  }));
  unsubs.push(subscribe('eventObservations', () => {
    renderPreGraze(ctx);
    renderPostGraze(ctx);
    renderDmiChart(ctx);
  }));
  unsubs.push(subscribe('eventFeedEntries', () => {
    renderFeedEntries(ctx);
    renderDmiNpk(ctx);
    renderSummary(ctx);
  }));
  unsubs.push(subscribe('eventFeedChecks', () => {
    renderFeedChecks(ctx);
  }));
  unsubs.push(subscribe('eventGroupWindows', () => {
    renderGroups(ctx);
    renderSummary(ctx);
    renderDmiNpk(ctx);
  }));

  detailSheet.open();
}

/**
 * Close the event detail sheet.
 */
export function closeEventDetailSheet() {
  unsubs.forEach(fn => fn());
  unsubs = [];
  if (detailSheet) detailSheet.close();
}

function renderAll(ctx) {
  renderHeader(ctx);
  renderSummary(ctx);
  renderDmiChart(ctx);
  renderDmiNpk(ctx);
  renderPaddocks(ctx);
  renderPreGraze(ctx);
  renderPostGraze(ctx);
  renderGroups(ctx);
  renderFeedEntries(ctx);
  renderFeedChecks(ctx);
  renderNotes(ctx);
  renderSubmoves(ctx);
  renderActions(ctx);
}

// ---------------------------------------------------------------------------
// §1: Header
// ---------------------------------------------------------------------------

function renderHeader(ctx) {
  const el2 = ctx.sections.header;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;
  el2.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' },
  }, [
    el('button', {
      className: 'btn btn-ghost',
      'aria-label': 'Back',
      'data-testid': 'detail-back-btn',
      onClick: () => closeEventDetailSheet(),
    }, ['\u2190']),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('span', {
        className: `badge ${isActive ? 'badge-teal' : 'badge-grey'}`,
        'data-testid': 'detail-status-badge',
      }, [isActive ? t('event.active') : t('event.closed')]),
      el('button', {
        className: 'btn btn-ghost btn-xs',
        'data-testid': 'detail-cancel-btn',
        onClick: () => closeEventDetailSheet(),
      }, ['\u2715']),
    ]),
  ]));
}

// ---------------------------------------------------------------------------
// §2: Event Summary (hero)
// ---------------------------------------------------------------------------

function renderSummary(ctx) {
  const el2 = ctx.sections.summary;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayCount = daysBetweenInclusive(event.dateIn, event.dateOut || todayStr);

  // Head count and weight from group windows
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId && !gw.dateLeft);
  let totalHead = 0;
  let totalWeightKg = 0;
  for (const gw of gws) {
    totalHead += gw.headCount || 0;
    totalWeightKg += (gw.headCount || 0) * (gw.avgWeightKg || 0);
  }
  const totalWeightDisplay = display(totalWeightKg, 'weight', unitSys, 0);

  // AU calc (simple: 1 AU = 1000 lbs = 453.6 kg)
  const auValue = totalWeightKg / 453.6;

  // DMI from DMI-2 (daily target)
  const dmi2 = getCalcByName('DMI-2');
  let dailyDmi = 0;
  if (dmi2) {
    for (const gw of gws) {
      const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
      dailyDmi += dmi2.fn({
        headCount: gw.headCount ?? 0,
        avgWeightKg: gw.avgWeightKg ?? 0,
        dmiPct: cls?.dmiPct ?? 2.5,
        dmiPctLactating: cls?.dmiPctLactating ?? 2.5,
        isLactating: false,
      });
    }
  }
  const dmiDisplay = dailyDmi > 0 ? display(dailyDmi, 'weight', unitSys, 1) : null;

  // Feed cost
  const cst1 = getCalcByName('CST-1');
  let totalCost = 0;
  if (cst1) {
    const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === ctx.eventId);
    const batches = getAll('batches');
    const batchMap = new Map(batches.map(b => [b.id, b]));
    totalCost = cst1.fn({
      entries: feedEntries.map(fe => ({
        qtyUnits: fe.quantity,
        costPerUnit: batchMap.get(fe.batchId)?.costPerUnit ?? 0,
      })),
    });
  }

  // Hero line tokens
  const heroTokens = [`Day ${dayCount}`, `${totalHead} head`, `${totalWeightDisplay}`];
  if (dmiDisplay) heroTokens.push(`${dmiDisplay} DMI`);
  heroTokens.push(`${auValue.toFixed(1)} AU`);

  // Sub-line
  const dateInStr = formatShortDate(event.dateIn);
  const dateOutStr = event.dateOut ? formatShortDate(event.dateOut) : '\u2014';

  el2.appendChild(el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: 'var(--space-2)' }, 'data-testid': 'detail-hero-line' }, [
      heroTokens.join(' \u00B7 '),
    ]),
    el('div', { style: { fontSize: '13px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' } }, [
      'In ',
      (() => {
        const dateInInput = el('input', { type: 'date', value: event.dateIn || '', style: { fontSize: '13px', padding: '2px 4px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', width: '130px' } });
        dateInInput.addEventListener('change', () => {
          const newDate = dateInInput.value;
          if (!newDate) return;
          const evt = getById('events', ctx.eventId);
          // Reject-on-narrow: check if any child record has date_joined < new date_in
          const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === ctx.eventId);
          const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId);
          const earlyPw = pws.find(pw => pw.dateOpened < newDate);
          const earlyGw = gws.find(gw => gw.dateJoined < newDate);
          if (earlyPw || earlyGw) {
            const name = earlyPw ? (getById('locations', earlyPw.locationId)?.name || 'a paddock') : (getById('groups', earlyGw.groupId)?.name || 'a group');
            window.alert(`Cannot move event start to ${newDate}. ${name} joined on ${earlyPw?.dateOpened || earlyGw?.dateJoined}, which is before the new start date. Edit that record first.`);
            dateInInput.value = evt.dateIn;
            return;
          }
          update('events', ctx.eventId, { dateIn: newDate }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
        });
        return dateInInput;
      })(),
      ` \u00B7 Out ${dateOutStr} \u00B7 $${totalCost.toFixed(2)}`,
    ]),
  ]));
}

// ---------------------------------------------------------------------------
// §3: DMI — Last 3 Days
// ---------------------------------------------------------------------------

function renderDmiChart(ctx) {
  const el2 = ctx.sections.dmiChart;
  clear(el2);

  const dmi8 = getCalcByName('DMI-8');
  if (!dmi8) {
    logger.info('dmi.chart.skipped', 'DMI-8 not registered');
    return;
  }

  const event = getById('events', ctx.eventId);
  if (!event) return;

  const unitSys = getUnitSystem();
  const chartData = buildDmi8ChartData(ctx, dmi8, event);

  if (!chartData.length) return;

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, ['DMI \u2014 LAST 3 DAYS']),
    renderDmiChartComponent(chartData, unitSys),
  ]);

  el2.appendChild(card);
}

/** Build the 3-day DMI-8 input array for the chart. */
function buildDmi8ChartData(ctx, dmi8, event) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Gather event data for DMI-8
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId);
  const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === ctx.eventId);
  const feedChecks = getAll('eventFeedChecks').filter(fc => fc.eventId === ctx.eventId);
  const feedCheckItems = getAll('eventFeedCheckItems').filter(fci => {
    return feedChecks.some(fc => fc.id === fci.feedCheckId);
  });
  const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === ctx.eventId);
  const observations = getAll('eventObservations').filter(o => o.eventId === ctx.eventId);

  // Build forage type and location maps
  const forageTypes = {};
  const locations = {};
  for (const pw of pws) {
    const loc = getById('locations', pw.locationId);
    if (loc) {
      locations[pw.locationId] = { areaHa: loc.areaHa };
      if (loc.forageTypeId) {
        const ft = getById('forageTypes', loc.forageTypeId);
        if (ft) {
          forageTypes[pw.locationId] = {
            dmKgPerCmPerHa: ft.dmKgPerCmPerHa,
            minResidualHeightCm: ft.minResidualHeightCm,
            utilizationPct: ft.utilizationPct,
          };
        }
      }
    }
  }

  // Build animal class map
  const animalClasses = {};
  for (const gw of gws) {
    if (gw.animalClassId) {
      const cls = getById('animalClasses', gw.animalClassId);
      if (cls) animalClasses[gw.animalClassId] = { dmiPct: cls.dmiPct, dmiPctLactating: cls.dmiPctLactating };
    }
  }

  // Source event bridge data (lazy-loaded if needed)
  let sourceCtx = null;
  function getSourceCtx() {
    if (sourceCtx !== null) return sourceCtx;
    if (!event.sourceEventId) { sourceCtx = false; return false; }
    const srcEvt = getById('events', event.sourceEventId);
    if (!srcEvt) { sourceCtx = false; return false; }
    const srcGws = getAll('eventGroupWindows').filter(gw => gw.eventId === srcEvt.id);
    const srcFe = getAll('eventFeedEntries').filter(fe => fe.eventId === srcEvt.id);
    const srcFc = getAll('eventFeedChecks').filter(fc => fc.eventId === srcEvt.id);
    const srcFci = getAll('eventFeedCheckItems').filter(fci => srcFc.some(fc => fc.id === fci.feedCheckId));
    const srcPws = getAll('eventPaddockWindows').filter(pw => pw.eventId === srcEvt.id);
    const srcObs = getAll('eventObservations').filter(o => o.eventId === srcEvt.id);
    const srcFt = {}, srcLoc = {};
    for (const pw of srcPws) {
      const loc2 = getById('locations', pw.locationId);
      if (loc2) {
        srcLoc[pw.locationId] = { areaHa: loc2.areaHa };
        if (loc2.forageTypeId) {
          const ft2 = getById('forageTypes', loc2.forageTypeId);
          if (ft2) srcFt[pw.locationId] = { dmKgPerCmPerHa: ft2.dmKgPerCmPerHa, minResidualHeightCm: ft2.minResidualHeightCm, utilizationPct: ft2.utilizationPct };
        }
      }
    }
    const srcAc = {};
    for (const gw of srcGws) {
      if (gw.animalClassId) {
        const cls2 = getById('animalClasses', gw.animalClassId);
        if (cls2) srcAc[gw.animalClassId] = { dmiPct: cls2.dmiPct, dmiPctLactating: cls2.dmiPctLactating };
      }
    }
    sourceCtx = { event: srcEvt, gws: srcGws, fe: srcFe, fc: srcFc, fci: srcFci, pws: srcPws, obs: srcObs, ft: srcFt, loc: srcLoc, ac: srcAc };
    return sourceCtx;
  }

  // 3 dates: day before yesterday, yesterday, today
  const days = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    if (dateStr < event.dateIn) {
      // Source event bridge: use source event data for dates before this event
      const src = getSourceCtx();
      if (!src) continue;
      const dayName = dayNames[d.getDay()];
      const result = dmi8.fn({
        event: src.event, date: dateStr, groupWindows: src.gws, feedEntries: src.fe,
        feedChecks: src.fc, feedCheckItems: src.fci, paddockWindows: src.pws,
        observations: src.obs, forageTypes: src.ft, locations: src.loc, animalClasses: src.ac,
      });
      days.push({ date: dateStr, label: dayName, result });
      continue;
    }

    const dayName = dayNames[d.getDay()];
    const label = i === 0 ? `${dayName} \u2713` : dayName;

    const result = dmi8.fn({
      event, date: dateStr, groupWindows: gws, feedEntries, feedChecks,
      feedCheckItems, paddockWindows: pws, observations, forageTypes,
      locations, animalClasses,
    });

    days.push({ date: dateStr, label, result });
  }

  return days;
}

// ---------------------------------------------------------------------------
// §4: Paddocks
// ---------------------------------------------------------------------------

function renderPaddocks(ctx) {
  const el2 = ctx.sections.paddocks;
  clear(el2);

  const epws = getAll('eventPaddockWindows').filter(w => w.eventId === ctx.eventId && !w.dateClosed);
  if (!epws.length) return;

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const isAnchorOnly = epws.length === 1;

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.paddocks')]),
  ]);

  for (const pw of epws) {
    const loc = getById('locations', pw.locationId);
    const locName = loc?.name || '?';
    const areaDisplay = loc?.areaHa ? display(loc.areaHa, 'area', unitSys, 2) : '';
    const areaUnit = unitSys === 'imperial' ? 'ac' : 'ha';
    const dayCount = daysBetweenInclusive(pw.dateOpened, todayStr);

    const headerText = `${locName}`;
    const statsText = areaDisplay ? `${areaDisplay} ${areaUnit} \u00B7 Day ${dayCount} on paddock` : `Day ${dayCount} on paddock`;

    // Latest pre-graze observation for this paddock
    const obs = getAll('eventObservations')
      .filter(o => o.eventId === ctx.eventId && (o.paddockWindowId === pw.id || !o.paddockWindowId) && (o.observationPhase === 'pre_graze' || !o.observationPhase))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

    const heightStr = obs?.forageHeightCm != null ? display(obs.forageHeightCm, 'length', unitSys, 1) : '\u2014';
    const coverStr = obs?.forageCoverPct != null ? `${obs.forageCoverPct}%` : '\u2014';

    const pwCard = el('div', {
      style: { borderBottom: '1px solid var(--border)', padding: 'var(--space-3) 0' },
      'data-testid': `detail-paddock-${pw.id}`,
    }, [
      el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [headerText]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-1)' } }, [statsText]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [
        `Height ${heightStr} \u00B7 Cover ${coverStr}`,
      ]),
    ]);

    // Action buttons
    const pwBtns = el('div', { style: { display: 'flex', gap: '6px', marginTop: 'var(--space-2)' } });
    pwBtns.appendChild(el('button', {
      className: 'btn btn-outline btn-xs',
      onClick: () => { const evt = getById('events', ctx.eventId); openEditPaddockWindowDialog(pw, evt, ctx.operationId); },
    }, ['Edit']));
    if (!isAnchorOnly) {
      pwBtns.appendChild(el('button', {
        className: 'btn btn-teal btn-xs',
        'data-testid': `detail-close-paddock-${pw.id}`,
        onClick: () => openSubmoveCloseSheet(pw, ctx.operationId),
      }, [t('event.closePaddock')]));
    }
    pwCard.appendChild(pwBtns);

    card.appendChild(pwCard);
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §5: Pre-graze Observations
// ---------------------------------------------------------------------------

function renderPreGraze(ctx) {
  const el2 = ctx.sections.preGraze;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;
  const disabled = !isActive;
  const unitSys = getUnitSystem();
  const heightUnit = unitSys === 'imperial' ? 'in.' : 'cm';

  // Find latest pre-graze observation (phase = 'pre_graze' or null for backward compat)
  const obs = getAll('eventObservations')
    .filter(o => o.eventId === ctx.eventId && (o.observationPhase === 'pre_graze' || !o.observationPhase))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

  const heightVal = obs?.forageHeightCm != null
    ? (unitSys === 'imperial' ? convert(obs.forageHeightCm, 'length', 'toImperial') : obs.forageHeightCm)
    : '';
  const coverVal = obs?.forageCoverPct ?? '';
  const qualityVal = obs?.forageQuality ?? '';
  const conditionVal = obs?.forageCondition || '';
  const conditions = ['Poor', 'Fair', 'Good', 'Excellent'];
  const conditionMap = { 'Poor': 'dry', 'Fair': 'fair', 'Good': 'good', 'Excellent': 'lush' };


  let savedTimer = null;
  const savedIndicator = el('span', {
    style: { fontSize: '11px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: '8px' },
  }, ['Saved']);

  function showSaved() {
    if (savedTimer) clearTimeout(savedTimer);
    savedIndicator.style.opacity = '1';
    savedTimer = setTimeout(() => { savedIndicator.style.opacity = '0'; }, 2000);
  }

  function saveField(changes) {
    const obsData = {
      operationId: ctx.operationId,
      eventId: ctx.eventId,
      observationPhase: 'pre_graze',
      ...changes,
    };
    if (obs) {
      update('eventObservations', obs.id, obsData, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
    } else {
      const rec = EventObsEntity.create(obsData);
      add('eventObservations', rec, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
    }
    showSaved();
  }

  // Inputs
  const heightInput = el('input', {
    type: 'number', style: { width: '52px' }, step: '0.5', max: '999',
    className: 'obs-input', value: heightVal, disabled,
    'data-testid': 'detail-pregraze-height',
    onBlur: () => {
      const raw = parseFloat(heightInput.value);
      const cm = !isNaN(raw) ? (unitSys === 'imperial' ? convert(raw, 'length', 'toMetric') : raw) : null;
      saveField({ forageHeightCm: cm });
    },
  });

  const coverInput = el('input', {
    type: 'number', style: { width: '60px' }, min: '0', max: '100', step: '1',
    className: 'obs-input', value: coverVal, disabled,
    'data-testid': 'detail-pregraze-cover',
  });
  const coverSlider = el('input', {
    type: 'range', style: { width: '140px' }, min: '0', max: '100',
    className: 'cover-slider', value: coverVal || 50, disabled,
  });
  // Sync slider ↔ input
  coverSlider.addEventListener('input', () => { coverInput.value = coverSlider.value; });
  coverInput.addEventListener('input', () => { coverSlider.value = coverInput.value; });
  const coverBlur = () => {
    const v = parseInt(coverInput.value, 10);
    saveField({ forageCoverPct: !isNaN(v) ? v : null });
  };
  coverInput.addEventListener('blur', coverBlur);
  coverSlider.addEventListener('change', coverBlur);

  const qualityInput = el('input', {
    type: 'number', style: { width: '60px' }, min: '1', max: '100', step: '1',
    className: 'obs-input', value: qualityVal, disabled,
    'data-testid': 'detail-pregraze-quality',
    onBlur: () => {
      const v = parseInt(qualityInput.value, 10);
      saveField({ forageQuality: !isNaN(v) ? v : null });
    },
  });

  // Condition chip picker
  let activeCondition = conditionVal;
  const chipContainer = el('div', { className: 'qual-picker', style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } });
  for (const label of conditions) {
    const dbVal = conditionMap[label];
    const isActive = activeCondition === dbVal;
    const chip = el('button', {
      type: 'button',
      className: `qual-chip${isActive ? ' active' : ''}`,
      disabled,
      style: {
        padding: '4px 10px', fontSize: '12px', borderRadius: '12px', border: '1px solid var(--border)',
        background: isActive ? 'var(--color-green-base)' : 'transparent',
        color: isActive ? '#fff' : 'var(--text1)',
        cursor: disabled ? 'default' : 'pointer',
      },
      onClick: () => {
        if (disabled) return;
        activeCondition = dbVal;
        saveField({ forageCondition: dbVal });
        // Re-render to update chip states (subscription will trigger)
      },
    }, [label]);
    chipContainer.appendChild(chip);
  }

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' } }, [
      el('span', { className: 'sec' }, [t('event.preGraze')]),
      savedIndicator,
    ]),
    // Row 1: Height + Cover
    el('div', { className: 'obs-field-row', style: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: 'var(--space-3)', alignItems: 'flex-start' } }, [
      el('div', { className: 'obs-field' }, [
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' } }, [`Avg. Forage Height (${heightUnit})`]),
        heightInput,
      ]),
      el('div', { className: 'obs-field' }, [
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' } }, ['Forage Cover (%)']),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [coverInput]),
        el('div', { style: { marginTop: '4px' } }, [coverSlider]),
      ]),
    ]),
    // Row 2: Quality + Condition
    el('div', { className: 'obs-field-row', style: { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' } }, [
      el('div', { className: 'obs-field' }, [
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' } }, ['Forage Quality (1\u2013100)']),
        qualityInput,
      ]),
      el('div', { className: 'obs-field' }, [
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' } }, ['Condition']),
        chipContainer,
      ]),
    ]),
  ]);

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §6: Post-graze Observations
// ---------------------------------------------------------------------------

function renderPostGraze(ctx) {
  const el2 = ctx.sections.postGraze;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const unitSys = getUnitSystem();
  const postObs = getAll('eventObservations')
    .filter(o => o.eventId === ctx.eventId && o.observationPhase === 'post_graze')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.postGraze')]),
  ]);

  if (!postObs.length) {
    card.appendChild(el('div', { className: 'form-hint' }, [t('event.postGrazeEmpty')]));
  } else {
    const isClosed = !!event.dateOut;
    const heightUnit = unitSys === 'imperial' ? 'in.' : 'cm';

    for (const obs of postObs) {
      const pw = obs.paddockWindowId ? getById('eventPaddockWindows', obs.paddockWindowId) : null;
      const loc = pw ? getById('locations', pw.locationId) : null;
      const label = loc ? loc.name : '';
      const canEdit = !isClosed;

      const heightVal = obs.postGrazeHeightCm != null
        ? (unitSys === 'imperial' ? convert(obs.postGrazeHeightCm, 'length', 'toImperial') : obs.postGrazeHeightCm)
        : '';

      let postSavedTimer = null;
      const postSaved = el('span', { style: { fontSize: '11px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: '8px' } }, ['Saved']);
      function showPostSaved() {
        if (postSavedTimer) clearTimeout(postSavedTimer);
        postSaved.style.opacity = '1';
        postSavedTimer = setTimeout(() => { postSaved.style.opacity = '0'; }, 2000);
      }
      function savePostField(changes) {
        update('eventObservations', obs.id, changes, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
        showPostSaved();
      }

      const hInput = el('input', {
        type: 'number', className: 'obs-input', style: { width: '52px' }, step: '0.5',
        value: heightVal, disabled: !canEdit,
        onBlur: () => {
          const raw = parseFloat(hInput.value);
          const cm = !isNaN(raw) ? (unitSys === 'imperial' ? convert(raw, 'length', 'toMetric') : raw) : null;
          savePostField({ postGrazeHeightCm: cm });
        },
      });
      // Recovery date preview helper
      const closedDate = pw?.dateClosed || null;
      const recoveryPreview = el('div', { style: { fontSize: '11px', color: 'var(--text3)', marginTop: '2px' } });
      function updateRecoveryPreview() {
        clear(recoveryPreview);
        if (!closedDate) { recoveryPreview.textContent = 'Recovery dates available after paddock closes'; return; }
        const minD = parseInt(minInput.value, 10);
        const maxD = parseInt(maxInput.value, 10);
        if (isNaN(minD) && isNaN(maxD)) return;
        const base = new Date(closedDate + 'T00:00:00');
        const parts = [];
        if (!isNaN(minD)) { const d = new Date(base.getTime() + minD * 86400000); parts.push(`earliest ${formatShortDate(d.toISOString().slice(0, 10))}`); }
        if (!isNaN(maxD)) { const d = new Date(base.getTime() + maxD * 86400000); parts.push(`latest ${formatShortDate(d.toISOString().slice(0, 10))}`); }
        if (parts.length) recoveryPreview.textContent = `Ready: ${parts.join(' \u2013 ')}`;
      }

      const minInput = el('input', {
        type: 'number', className: 'obs-input', style: { width: '52px' }, step: '1',
        value: obs.recoveryMinDays ?? '', disabled: !canEdit,
        onBlur: () => { const v = parseInt(minInput.value, 10); savePostField({ recoveryMinDays: !isNaN(v) ? v : null }); },
        onInput: () => updateRecoveryPreview(),
      });
      const maxInput = el('input', {
        type: 'number', className: 'obs-input', style: { width: '52px' }, step: '1',
        value: obs.recoveryMaxDays ?? '', disabled: !canEdit,
        onBlur: () => { const v = parseInt(maxInput.value, 10); savePostField({ recoveryMaxDays: !isNaN(v) ? v : null }); },
        onInput: () => updateRecoveryPreview(),
      });
      updateRecoveryPreview();

      card.appendChild(el('div', { style: { padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' } }, [
        label ? el('div', { style: { fontWeight: '500', fontSize: '13px', marginBottom: '4px' } }, [label]) : null,
        el('div', { className: 'obs-field-row', style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' } }, [
          el('span', { style: { color: 'var(--text2)' } }, [`Avg height (${heightUnit}):`]),
          hInput,
          el('span', { style: { color: 'var(--text2)' } }, ['Recovery min:']),
          minInput,
          el('span', { style: { color: 'var(--text2)' } }, ['max:']),
          maxInput,
          el('span', { style: { color: 'var(--text2)' } }, ['days']),
          postSaved,
        ]),
        recoveryPreview,
      ].filter(Boolean)));
    }
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §7: Groups
// ---------------------------------------------------------------------------

function renderGroups(ctx) {
  const el2 = ctx.sections.groups;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;
  const unitSys = getUnitSystem();
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId && !gw.dateLeft);

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.groups')]),
  ]);

  if (!gws.length) {
    card.appendChild(el('div', { className: 'form-hint' }, [t('event.noGroups')]));
  }

  for (const gw of gws) {
    const grp = getById('groups', gw.groupId);
    const grpName = grp?.name || '?';
    const weightDisplay = gw.avgWeightKg ? display(gw.avgWeightKg, 'weight', unitSys, 0) : '\u2014';
    const au = (gw.headCount * (gw.avgWeightKg || 0)) / 453.6;

    const row = el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' },
      'data-testid': `detail-group-${gw.id}`,
    }, [
      el('div', {}, [
        el('div', { style: { fontSize: '14px', fontWeight: '500' } }, [
          el('span', { style: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-green-base)', marginRight: '6px' } }),
          grpName,
        ]),
        el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [
          `${gw.headCount} head \u00B7 avg ${weightDisplay} \u00B7 ${au.toFixed(1)} AU`,
        ]),
      ]),
      el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
        isActive ? el('button', {
          className: 'btn btn-teal btn-xs',
          onClick: () => openMoveWizard(event, ctx.operationId, ctx.farmId),
        }, [t('dashboard.move')]) : null,
        el('button', {
          className: 'btn btn-outline btn-xs',
          onClick: () => openEditGroupWindowDialog(gw, event, ctx.operationId),
        }, ['Edit']),
        isActive ? el('button', {
          className: 'btn btn-ghost btn-xs',
          'data-testid': `detail-remove-group-${gw.id}`,
          onClick: () => openRemoveGroupPicker(ctx, gw),
        }, ['\u2715']) : null,
      ].filter(Boolean)),
    ].filter(Boolean));

    card.appendChild(row);
  }

  if (isActive) {
    card.appendChild(el('button', {
      className: 'btn btn-outline btn-sm',
      style: { marginTop: 'var(--space-3)' },
      'data-testid': 'detail-add-group',
      onClick: () => openGroupAddSheet(event, ctx.operationId),
    }, [t('event.addGroup')]));
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §8: Feed Entries
// ---------------------------------------------------------------------------

function renderFeedEntries(ctx) {
  const el2 = ctx.sections.feedEntries;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;
  const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === ctx.eventId);
  const batches = getAll('batches');
  const batchMap = new Map(batches.map(b => [b.id, b]));

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.feedEntries')]),
  ]);

  if (!feedEntries.length) {
    card.appendChild(el('div', { className: 'form-hint' }, [t('event.noFeedEntries')]));
  }

  for (const fe of feedEntries) {
    const batch = batchMap.get(fe.batchId);
    const feedName = batch?.feedName || '?';
    const cost = (fe.quantity || 0) * (batch?.costPerUnit ?? 0);

    card.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' },
    }, [
      el('div', {}, [
        `${feedName} \u00B7 ${fe.quantity ?? 0} \u00B7 ${fe.deliveryDate || ''} \u00B7 $${cost.toFixed(2)}`,
      ]),
      isActive ? el('div', { style: { display: 'flex', gap: '4px' } }, [
        el('button', {
          className: 'btn btn-ghost btn-xs',
          onClick: () => openDeliverFeedSheet(event, ctx.operationId),
        }, ['\u270E']),
        el('button', {
          className: 'btn btn-ghost btn-xs',
          onClick: () => {
            if (confirm(t('event.confirmDeleteFeed'))) {
              remove('eventFeedEntries', fe.id, 'event_feed_entries');
            }
          },
        }, ['\u2715']),
      ]) : null,
    ].filter(Boolean)));
  }

  if (isActive) {
    card.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginTop: 'var(--space-3)' } }, [
      el('button', {
        className: 'btn btn-outline btn-sm',
        'data-testid': 'detail-deliver-feed',
        onClick: () => openDeliverFeedSheet(event, ctx.operationId),
      }, [t('event.deliverFeed')]),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => openMoveFeedOutSheet(event, ctx.operationId, ctx.farmId),
      }, ['Move feed out']),
    ]));
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §9: Feed Checks
// ---------------------------------------------------------------------------

function renderFeedChecks(ctx) {
  const el2 = ctx.sections.feedChecks;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;
  const checks = getAll('eventFeedChecks').filter(fc => fc.eventId === ctx.eventId);

  if (!checks.length && !isActive) return;

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.feedChecks')]),
  ]);

  if (!checks.length) {
    card.appendChild(el('div', { className: 'form-hint' }, [t('event.noFeedChecks')]));
  }

  for (const fc of checks) {
    card.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' },
    }, [
      el('span', {}, [`${formatShortDate(fc.checkDate || fc.createdAt)} \u00B7 ${fc.notes || ''}`]),
      isActive ? el('button', {
        className: 'btn btn-ghost btn-xs',
        onClick: () => openFeedCheckSheet(event, ctx.operationId),
      }, ['\u270E']) : null,
    ].filter(Boolean)));
  }

  if (isActive) {
    card.appendChild(el('button', {
      className: 'btn btn-outline btn-sm',
      style: { marginTop: 'var(--space-3)' },
      'data-testid': 'detail-feed-check',
      onClick: () => openFeedCheckSheet(event, ctx.operationId),
    }, [t('event.feedCheck')]));
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §10: DMI / NPK Breakdown
// ---------------------------------------------------------------------------

function renderDmiNpk(ctx) {
  const el2 = ctx.sections.dmiNpk;
  clear(el2);

  const unitSys = getUnitSystem();
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === ctx.eventId && !gw.dateLeft);
  const dmi2 = getCalcByName('DMI-2');
  const npk1 = getCalcByName('NPK-1');
  const npk2 = getCalcByName('NPK-2');

  if (!dmi2 && !npk1) return;

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.dmiNpk')]),
  ]);

  // DMI line
  if (dmi2) {
    let dailyDmi = 0;
    for (const gw of gws) {
      const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
      dailyDmi += dmi2.fn({
        headCount: gw.headCount ?? 0,
        avgWeightKg: gw.avgWeightKg ?? 0,
        dmiPct: cls?.dmiPct ?? 2.5,
        dmiPctLactating: cls?.dmiPctLactating ?? 2.5,
        isLactating: false,
      });
    }
    if (dailyDmi > 0) {
      const dmiStr = display(dailyDmi, 'weight', unitSys, 1);
      const unit = unitLabel('weight', unitSys);
      card.appendChild(el('div', { style: { fontSize: '13px', padding: '4px 0' } }, [
        `DMI: ${dmiStr} ${unit}/day`,
      ]));
    }
  }

  // NPK line
  if (npk1) {
    let totalN = 0, totalP = 0, totalK = 0;
    for (const gw of gws) {
      const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
      const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, gw.dateLeft || event.dateOut || todayStr);
      const result = npk1.fn({
        headCount: gw.headCount ?? 0,
        avgWeightKg: gw.avgWeightKg ?? 0,
        days,
        excretionNRate: cls?.excretionNRate ?? 0.34,
        excretionPRate: cls?.excretionPRate ?? 0.092,
        excretionKRate: cls?.excretionKRate ?? 0.24,
      });
      totalN += result.nKg || result.n || 0;
      totalP += result.pKg || result.p || 0;
      totalK += result.kKg || result.k || 0;
    }

    const toDisplay = (kg) => convert(kg, 'weight', unitSys === 'imperial' ? 'toImperial' : 'toMetric');
    const nDisp = toDisplay(totalN).toFixed(1);
    const pDisp = toDisplay(totalP).toFixed(1);
    const kDisp = toDisplay(totalK).toFixed(1);
    const unit = unitLabel('weight', unitSys);

    let valueLine = `NPK: N ${nDisp} / P ${pDisp} / K ${kDisp} ${unit}`;

    if (npk2) {
      const prices = getAll('npkPriceHistory');
      const latest = prices.sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0];
      if (latest) {
        const value = npk2.fn({
          nKg: totalN, pKg: totalP, kKg: totalK,
          nPricePerKg: latest.nPricePerKg ?? 0,
          pPricePerKg: latest.pPricePerKg ?? 0,
          kPricePerKg: latest.kPricePerKg ?? 0,
        });
        valueLine += ` \u00B7 $${value.toFixed(2)} value`;
      }
    }

    card.appendChild(el('div', { style: { fontSize: '13px', padding: '4px 0' } }, [valueLine]));
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §11: Notes
// ---------------------------------------------------------------------------

function renderNotes(ctx) {
  const el2 = ctx.sections.notes;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  let savedTimer = null;

  const textarea = el('textarea', {
    className: 'auth-input',
    style: { width: '100%', minHeight: '80px', resize: 'vertical' },
    'data-testid': 'detail-notes-textarea',
    value: event.notes || '',
    placeholder: t('event.notesPlaceholder'),
    onBlur: () => {
      const newVal = textarea.value;
      if (newVal !== (event.notes || '')) {
        update('events', ctx.eventId, { notes: newVal }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
        // Show "Saved" flash
        if (savedTimer) clearTimeout(savedTimer);
        savedIndicator.style.opacity = '1';
        savedTimer = setTimeout(() => { savedIndicator.style.opacity = '0'; }, 2000);
      }
    },
  });
  textarea.value = event.notes || '';

  const savedIndicator = el('span', {
    style: { fontSize: '12px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: 'var(--space-2)' },
    'data-testid': 'detail-notes-saved',
  }, [t('event.saved')]);

  el2.appendChild(el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 'var(--space-2)' } }, [
      el('span', { className: 'sec' }, [t('event.notes')]),
      savedIndicator,
    ]),
    textarea,
  ]));
}

// ---------------------------------------------------------------------------
// §12: Sub-move History
// ---------------------------------------------------------------------------

function renderSubmoves(ctx) {
  const el2 = ctx.sections.submoves;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;
  const allPws = getAll('eventPaddockWindows').filter(w => w.eventId === ctx.eventId);
  // Sub-moves are non-anchor paddock windows (opened after the first)
  const sorted = [...allPws].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
  const submoves = sorted.slice(1); // skip anchor

  if (!submoves.length && !isActive) return;

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.submoveHistory')]),
  ]);

  if (!submoves.length) {
    card.appendChild(el('div', { className: 'form-hint' }, [t('event.noSubmoves')]));
  }

  for (const pw of submoves) {
    const loc = getById('locations', pw.locationId);
    const locName = loc?.name || '?';
    const openDate = formatShortDate(pw.dateOpened);
    const closeDate = pw.dateClosed ? formatShortDate(pw.dateClosed) : '\u2014';

    card.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' },
    }, [
      el('span', {}, [`${locName} \u00B7 ${openDate} \u2013 ${closeDate}`]),
      isActive ? el('button', {
        className: 'btn btn-ghost btn-xs',
        onClick: () => { const evt = getById('events', ctx.eventId); openEditPaddockWindowDialog(pw, evt, ctx.operationId); },
      }, ['\u270E']) : null,
    ].filter(Boolean)));
  }

  if (isActive) {
    card.appendChild(el('button', {
      className: 'btn btn-outline btn-sm',
      style: { marginTop: 'var(--space-3)' },
      'data-testid': 'detail-add-submove',
      onClick: () => openSubmoveOpenSheet(event, ctx.operationId),
    }, [t('event.addSubmove')]));
  }

  el2.appendChild(card);
}

// ---------------------------------------------------------------------------
// §13: Actions (footer)
// ---------------------------------------------------------------------------

function renderActions(ctx) {
  const el2 = ctx.sections.actions;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;

  // Row 1: Primary action + Cancel
  el2.appendChild(el('div', { className: 'btn-row', style: { flexWrap: 'wrap', gap: '8px' } }, isActive ? [
    el('button', {
      className: 'btn btn-green',
      style: { flex: '2', minWidth: '160px' },
      'data-testid': 'detail-save-close',
      onClick: () => closeEventDetailSheet(),
    }, ['Save & close']),
    el('button', {
      className: 'btn btn-outline',
      style: { flex: '1', minWidth: '80px' },
      onClick: () => closeEventDetailSheet(),
    }, [t('action.cancel')]),
  ] : [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => closeEventDetailSheet(),
    }, [t('action.cancel')]),
  ]));

  // Row 2: Close & Move (active only, amber full-width)
  if (isActive) {
    el2.appendChild(el('div', { style: { marginTop: '10px' } }, [
      el('button', {
        className: 'btn',
        style: { width: '100%', background: 'var(--amber)', color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600', padding: '13px', borderRadius: 'var(--radius)', cursor: 'pointer' },
        'data-testid': 'detail-close-move',
        onClick: () => openCloseEventSheet(event, ctx.operationId),
      }, ['\u2B07 ' + t('event.closeAndMove')]),
    ]));
  }

  // Reopen button (closed events only)
  if (!isActive) {
    el2.appendChild(el('div', { style: { marginTop: '10px' } }, [
      el('button', {
        className: 'btn btn-outline',
        style: { width: '100%' },
        onClick: () => {
          const evt = getById('events', ctx.eventId);
          reopenEvent(evt, ctx.operationId, () => {
            // Re-render the detail sheet to reflect reopened state
            renderAll(ctx);
          });
        },
      }, ['Reopen event']),
    ]));
  }

  // Row 3: Delete (red, small, left-aligned)
  el2.appendChild(el('div', { style: { marginTop: '8px' } }, [
    el('button', {
      className: 'btn btn-red btn-sm',
      style: { width: 'auto', padding: '10px 16px', fontSize: '12px' },
      'data-testid': 'detail-delete',
      onClick: () => openDeleteConfirm(ctx),
    }, [t('action.delete') + ' event']),
  ]));
}

// ---------------------------------------------------------------------------
// Modals / Pickers
// ---------------------------------------------------------------------------

/** Remove group picker — Unplace vs Move to existing event */
function openRemoveGroupPicker(ctx, gw) {
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const overlay = el('div', {
    className: 'modal-overlay',
    style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  }, [
    el('div', {
      className: 'card',
      style: { padding: 'var(--space-5)', maxWidth: '360px', width: '90%' },
    }, [
      el('h3', { style: { marginBottom: 'var(--space-4)' } }, [t('event.removeGroup')]),
      el('button', {
        className: 'btn btn-outline',
        style: { width: '100%', marginBottom: 'var(--space-2)' },
        'data-testid': 'detail-unplace-group',
        onClick: () => {
          openGroupRemoveSheet(gw);
          overlay.remove();
        },
      }, [t('event.unplace')]),
      el('button', {
        className: 'btn btn-outline',
        style: { width: '100%', marginBottom: 'var(--space-2)' },
        'data-testid': 'detail-move-group',
        onClick: () => {
          openMoveWizard(event, ctx.operationId, ctx.farmId);
          overlay.remove();
        },
      }, [t('event.moveToExisting')]),
      el('button', {
        className: 'btn btn-ghost',
        style: { width: '100%' },
        onClick: () => overlay.remove(),
      }, [t('action.cancel')]),
    ]),
  ]);

  document.body.appendChild(overlay);
}

/** Delete event confirmation */
function openDeleteConfirm(ctx) {
  const overlay = el('div', {
    className: 'modal-overlay',
    style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  }, [
    el('div', {
      className: 'card',
      style: { padding: 'var(--space-5)', maxWidth: '360px', width: '90%' },
    }, [
      el('h3', { style: { marginBottom: 'var(--space-3)' } }, [t('event.confirmDelete')]),
      el('p', { style: { color: 'var(--text2)', marginBottom: 'var(--space-4)' } }, [t('event.confirmDeleteDesc')]),
      el('div', { style: { display: 'flex', gap: 'var(--space-3)' } }, [
        el('button', {
          className: 'btn btn-danger',
          'data-testid': 'detail-confirm-delete',
          onClick: () => {
            remove('events', ctx.eventId, 'events');
            overlay.remove();
            closeEventDetailSheet();
          },
        }, [t('action.delete')]),
        el('button', {
          className: 'btn btn-outline',
          onClick: () => overlay.remove(),
        }, [t('action.cancel')]),
      ]),
    ]),
  ]);

  document.body.appendChild(overlay);
}
