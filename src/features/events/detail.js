/** @file Event Detail View — SP-2. Full-screen single-column view for one event. */

import { el, clear, text } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, subscribe, add, update, remove } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display, unitLabel } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { formatShortDate } from '../../utils/date-format.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { navigate } from '../../ui/router.js';
import { logger } from '../../utils/logger.js';
import * as EventEntity from '../../entities/event.js';
import * as EventObsEntity from '../../entities/event-observation.js';
import { openMoveWizard } from './move-wizard.js';
import { openCloseEventSheet } from './close.js';
import { openGroupAddSheet, openGroupRemoveSheet } from './group-windows.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet } from './submove.js';

/** Active subscriptions for this view */
let unsubs = [];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Render the Event Detail View.
 * @param {HTMLElement} container
 * @param {string} eventId
 * @param {string} operationId
 * @param {string} farmId
 */
export function renderEventDetail(container, eventId, operationId, farmId) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const event = getById('events', eventId);
  if (!event) {
    logger.warn('events.detail.not_found', { id: eventId });
    container.appendChild(el('div', { className: 'detail-empty', style: { padding: 'var(--space-6)', textAlign: 'center' } }, [
      el('h2', {}, [t('event.notFound')]),
      el('button', { className: 'btn btn-teal', onClick: () => navigate('#/events') }, [t('event.backToEvents')]),
    ]));
    return;
  }

  const wrapper = el('div', {
    className: 'event-detail',
    'data-testid': 'event-detail-view',
    style: { maxWidth: '720px', margin: '0 auto', padding: 'var(--space-4)' },
  });
  container.appendChild(wrapper);

  const sections = {
    header: el('div', { 'data-testid': 'detail-header' }),
    summary: el('div', { 'data-testid': 'detail-summary' }),
    dmiChart: el('div', { 'data-testid': 'detail-dmi-chart' }),
    paddocks: el('div', { 'data-testid': 'detail-paddocks' }),
    preGraze: el('div', { 'data-testid': 'detail-pre-graze' }),
    postGraze: el('div', { 'data-testid': 'detail-post-graze' }),
    groups: el('div', { 'data-testid': 'detail-groups' }),
    feedEntries: el('div', { 'data-testid': 'detail-feed-entries' }),
    feedChecks: el('div', { 'data-testid': 'detail-feed-checks' }),
    dmiNpk: el('div', { 'data-testid': 'detail-dmi-npk' }),
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
    if (!evt) { clear(container); renderEventDetail(container, eventId, operationId, farmId); return; }
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
}

function renderAll(ctx) {
  renderHeader(ctx);
  renderSummary(ctx);
  renderDmiChart(ctx);
  renderPaddocks(ctx);
  renderPreGraze(ctx);
  renderPostGraze(ctx);
  renderGroups(ctx);
  renderFeedEntries(ctx);
  renderFeedChecks(ctx);
  renderDmiNpk(ctx);
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
      onClick: () => { window.history.length > 1 ? window.history.back() : navigate('#/dashboard'); },
    }, ['\u2190']),
    el('span', {
      className: `badge ${isActive ? 'badge-teal' : 'badge-grey'}`,
      'data-testid': 'detail-status-badge',
    }, [isActive ? t('event.active') : t('event.closed')]),
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
    el('div', { style: { fontSize: '13px', color: 'var(--text2)' } }, [
      `In ${dateInStr} \u00B7 Out ${dateOutStr} \u00B7 $${totalCost.toFixed(2)}`,
    ]),
  ]));
}

// ---------------------------------------------------------------------------
// §3: DMI — Last 3 Days
// ---------------------------------------------------------------------------

function renderDmiChart(ctx) {
  const el2 = ctx.sections.dmiChart;
  clear(el2);

  // DMI chart requires DMI-1 with daily breakdown — currently not available with source split
  // Hide entire card when calc missing per spec
  const dmi1 = getCalcByName('DMI-1');
  if (!dmi1) {
    logger.info('dmi.chart.skipped', 'DMI-1 not registered');
    return;
  }

  // Placeholder — chart implementation deferred until DMI-1 produces daily split with source
  logger.info('dmi.chart.skipped', 'DMI-1 does not produce daily source split');
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

    // Close button only for sub-paddocks (anchor-no-close rule)
    if (!isAnchorOnly) {
      pwCard.appendChild(el('button', {
        className: 'btn btn-teal btn-xs',
        style: { marginTop: 'var(--space-2)' },
        'data-testid': `detail-close-paddock-${pw.id}`,
        onClick: () => openSubmoveCloseSheet(pw, ctx.operationId),
      }, [t('event.closePaddock')]));
    }

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
  const unitSys = getUnitSystem();

  // Find latest pre-graze observation (phase = 'pre_graze' or null for backward compat)
  const obs = getAll('eventObservations')
    .filter(o => o.eventId === ctx.eventId && (o.observationPhase === 'pre_graze' || !o.observationPhase))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.preGraze')]),
  ]);

  if (!obs) {
    if (isActive) {
      card.appendChild(el('button', {
        className: 'btn btn-teal btn-sm',
        'data-testid': 'detail-add-pre-graze',
        onClick: () => openPreGrazeModal(ctx, null),
      }, [t('event.addPreGraze')]));
    } else {
      card.appendChild(el('div', { className: 'form-hint' }, [t('event.noObservations')]));
    }
  } else {
    const heightStr = obs.forageHeightCm != null ? display(obs.forageHeightCm, 'length', unitSys, 1) : '\u2014';
    const coverStr = obs.forageCoverPct != null ? `${obs.forageCoverPct}%` : '\u2014';
    const qualityStr = obs.forageQuality != null ? `${obs.forageQuality}` : '\u2014';
    const conditionStr = obs.forageCondition || '\u2014';
    const storedStr = obs.storedFeedOnly ? t('event.yes') : t('event.no');

    const rows = [
      [`${t('event.forageHeight')}:`, heightStr],
      [`${t('event.forageCover')}:`, coverStr],
      [`${t('event.forageQuality')}:`, qualityStr],
      [`${t('event.forageCondition')}:`, conditionStr],
      [`${t('event.storedFeedOnly')}:`, storedStr],
    ];
    if (obs.notes) rows.push([`${t('event.notes')}:`, obs.notes]);

    for (const [label, val] of rows) {
      card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' } }, [
        el('span', { style: { color: 'var(--text2)' } }, [label]),
        el('span', {}, [val]),
      ]));
    }

    if (isActive) {
      card.appendChild(el('button', {
        className: 'btn btn-outline btn-xs',
        style: { marginTop: 'var(--space-2)' },
        'data-testid': 'detail-edit-pre-graze',
        onClick: () => openPreGrazeModal(ctx, obs),
      }, [t('action.edit')]));
    }
  }

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

  // Only show when event is closed or any sub-paddock closed
  const closedPws = getAll('eventPaddockWindows').filter(w => w.eventId === ctx.eventId && w.dateClosed);
  const isClosed = !!event.dateOut;
  if (!isClosed && !closedPws.length) return;

  const unitSys = getUnitSystem();
  const postObs = getAll('eventObservations')
    .filter(o => o.eventId === ctx.eventId && o.observationPhase === 'post_graze')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const card = el('div', { className: 'card', style: { marginBottom: 'var(--space-5)' } }, [
    el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('event.postGraze')]),
  ]);

  if (!postObs.length) {
    card.appendChild(el('div', { className: 'form-hint' }, [t('event.noObservations')]));
    if (!isClosed) {
      card.appendChild(el('button', {
        className: 'btn btn-teal btn-sm',
        style: { marginTop: 'var(--space-2)' },
        'data-testid': 'detail-add-post-graze',
        onClick: () => openPostGrazeModal(ctx, null),
      }, [t('event.addPostGraze')]));
    }
  } else {
    for (const obs of postObs) {
      const pw = obs.paddockWindowId ? getById('eventPaddockWindows', obs.paddockWindowId) : null;
      const loc = pw ? getById('locations', pw.locationId) : null;
      const label = loc ? loc.name : '';
      const heightStr = obs.postGrazeHeightCm != null ? display(obs.postGrazeHeightCm, 'length', unitSys, 1) : '\u2014';
      const minDays = obs.recoveryMinDays ?? '\u2014';
      const maxDays = obs.recoveryMaxDays ?? '\u2014';

      card.appendChild(el('div', { style: { fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' } }, [
        label ? el('span', { style: { fontWeight: '500' } }, [`${label}: `]) : null,
        text(`Avg height ${heightStr} \u00B7 Recovery window: Min ${minDays} days \u00B7 Max ${maxDays} days`),
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
      isActive ? el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
        el('button', {
          className: 'btn btn-teal btn-xs',
          onClick: () => openMoveWizard(event, ctx.operationId, ctx.farmId),
        }, [t('dashboard.move')]),
        el('button', {
          className: 'btn btn-ghost btn-xs',
          'data-testid': `detail-remove-group-${gw.id}`,
          onClick: () => openRemoveGroupPicker(ctx, gw),
        }, ['\u2715']),
      ]) : null,
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
    card.appendChild(el('button', {
      className: 'btn btn-outline btn-sm',
      style: { marginTop: 'var(--space-3)' },
      'data-testid': 'detail-deliver-feed',
      onClick: () => openDeliverFeedSheet(event, ctx.operationId),
    }, [t('event.deliverFeed')]));
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
      style: { fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' },
    }, [
      `${formatShortDate(fc.checkDate || fc.createdAt)} \u00B7 ${fc.notes || ''}`,
    ]));
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

  const isExpanded = submoves.length > 0;
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
      style: { fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' },
    }, [
      `${locName} \u00B7 ${openDate} \u2013 ${closeDate}`,
    ]));
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

  const buttons = [];

  if (isActive) {
    buttons.push(el('button', {
      className: 'btn btn-teal',
      'data-testid': 'detail-move-all',
      onClick: () => openMoveWizard(event, ctx.operationId, ctx.farmId),
    }, [t('event.moveAll')]));
    buttons.push(el('button', {
      className: 'btn btn-olive',
      'data-testid': 'detail-close-move',
      onClick: () => openCloseEventSheet(event, ctx.operationId),
    }, [t('event.closeAndMove')]));
  }

  buttons.push(el('button', {
    className: 'btn btn-danger',
    'data-testid': 'detail-delete',
    onClick: () => openDeleteConfirm(ctx),
  }, [t('action.delete')]));

  el2.appendChild(el('div', {
    style: { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', padding: 'var(--space-4) 0' },
  }, buttons));
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
            navigate('#/events');
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

/** Pre-graze observation modal */
function openPreGrazeModal(ctx, existingObs) {
  const event = getById('events', ctx.eventId);
  if (!event) return;
  const unitSys = getUnitSystem();

  const state = {
    forageHeightCm: existingObs?.forageHeightCm ?? null,
    forageCoverPct: existingObs?.forageCoverPct ?? null,
    forageQuality: existingObs?.forageQuality ?? null,
    forageCondition: existingObs?.forageCondition || null,
    storedFeedOnly: existingObs?.storedFeedOnly ?? false,
    notes: existingObs?.notes || '',
  };

  const heightVal = state.forageHeightCm != null ? (unitSys === 'imperial' ? convert(state.forageHeightCm, 'length', 'toImperial') : state.forageHeightCm) : '';
  const conditions = ['dry', 'fair', 'good', 'lush'];

  const inputs = {};

  const overlay = el('div', {
    className: 'modal-overlay',
    style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  }, [
    el('div', {
      className: 'card',
      style: { padding: 'var(--space-5)', maxWidth: '420px', width: '90%', maxHeight: '90vh', overflowY: 'auto' },
    }, [
      el('h3', { style: { marginBottom: 'var(--space-4)' } }, [t('event.preGraze')]),

      el('label', { className: 'form-label' }, [t('event.forageHeight')]),
      inputs.height = el('input', { type: 'number', className: 'auth-input', value: heightVal, step: '0.1', max: '999' }),

      el('label', { className: 'form-label' }, [t('event.forageCover')]),
      inputs.cover = el('input', { type: 'range', style: { maxWidth: '240px' }, min: '0', max: '100', value: state.forageCoverPct ?? 50 }),
      inputs.coverReadout = el('span', { style: { fontSize: '12px', marginLeft: '8px' } }, [`${state.forageCoverPct ?? 50}%`]),

      el('label', { className: 'form-label' }, [t('event.forageQuality')]),
      inputs.quality = el('input', { type: 'number', className: 'auth-input', value: state.forageQuality ?? '', min: '1', max: '100' }),

      el('label', { className: 'form-label' }, [t('event.forageCondition')]),
      inputs.condition = el('select', { className: 'auth-input' }, [
        el('option', { value: '' }, ['\u2014']),
        ...conditions.map(c => el('option', { value: c, selected: state.forageCondition === c }, [c])),
      ]),

      el('label', { className: 'form-label' }, [t('event.storedFeedOnly')]),
      inputs.stored = el('input', { type: 'checkbox', checked: state.storedFeedOnly }),

      el('label', { className: 'form-label' }, [t('event.notes')]),
      inputs.notes = el('input', { type: 'text', className: 'auth-input', value: state.notes }),

      el('div', { style: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' } }, [
        el('button', {
          className: 'btn btn-teal',
          onClick: () => {
            const heightRaw = parseFloat(inputs.height.value);
            const heightCm = !isNaN(heightRaw) ? (unitSys === 'imperial' ? convert(heightRaw, 'length', 'toMetric') : heightRaw) : null;
            const coverPct = parseFloat(inputs.cover.value);
            const quality = parseInt(inputs.quality.value, 10);

            const obsData = {
              operationId: ctx.operationId,
              eventId: ctx.eventId,
              observationPhase: 'pre_graze',
              forageHeightCm: heightCm,
              forageCoverPct: !isNaN(coverPct) ? coverPct : null,
              forageQuality: !isNaN(quality) ? quality : null,
              forageCondition: inputs.condition.value || null,
              storedFeedOnly: inputs.stored.checked,
              notes: inputs.notes.value || null,
            };

            if (existingObs) {
              update('eventObservations', existingObs.id, obsData, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
            } else {
              const rec = EventObsEntity.create(obsData);
              add('eventObservations', rec, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
            }
            overlay.remove();
          },
        }, [t('action.save')]),
        el('button', { className: 'btn btn-outline', onClick: () => overlay.remove() }, [t('action.cancel')]),
      ]),
    ]),
  ]);

  // Wire cover slider readout
  inputs.cover.addEventListener('input', () => {
    inputs.coverReadout.textContent = `${inputs.cover.value}%`;
  });

  document.body.appendChild(overlay);
}

/** Post-graze observation modal */
function openPostGrazeModal(ctx, existingObs) {
  const unitSys = getUnitSystem();

  const state = {
    postGrazeHeightCm: existingObs?.postGrazeHeightCm ?? null,
    recoveryMinDays: existingObs?.recoveryMinDays ?? null,
    recoveryMaxDays: existingObs?.recoveryMaxDays ?? null,
  };

  const heightVal = state.postGrazeHeightCm != null ? (unitSys === 'imperial' ? convert(state.postGrazeHeightCm, 'length', 'toImperial') : state.postGrazeHeightCm) : '';

  const inputs = {};

  const overlay = el('div', {
    className: 'modal-overlay',
    style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  }, [
    el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '420px', width: '90%' } }, [
      el('h3', { style: { marginBottom: 'var(--space-4)' } }, [t('event.postGraze')]),

      el('label', { className: 'form-label' }, [t('event.avgHeight')]),
      inputs.height = el('input', { type: 'number', className: 'auth-input', value: heightVal, step: '0.1' }),

      el('label', { className: 'form-label' }, [t('event.recoveryMinDays')]),
      inputs.minDays = el('input', { type: 'number', className: 'auth-input', value: state.recoveryMinDays ?? '' }),

      el('label', { className: 'form-label' }, [t('event.recoveryMaxDays')]),
      inputs.maxDays = el('input', { type: 'number', className: 'auth-input', value: state.recoveryMaxDays ?? '' }),

      el('div', { style: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' } }, [
        el('button', {
          className: 'btn btn-teal',
          onClick: () => {
            const heightRaw = parseFloat(inputs.height.value);
            const heightCm = !isNaN(heightRaw) ? (unitSys === 'imperial' ? convert(heightRaw, 'length', 'toMetric') : heightRaw) : null;
            const minDays = parseInt(inputs.minDays.value, 10);
            const maxDays = parseInt(inputs.maxDays.value, 10);

            const obsData = {
              operationId: ctx.operationId,
              eventId: ctx.eventId,
              observationPhase: 'post_graze',
              postGrazeHeightCm: heightCm,
              recoveryMinDays: !isNaN(minDays) ? minDays : null,
              recoveryMaxDays: !isNaN(maxDays) ? maxDays : null,
            };

            if (existingObs) {
              update('eventObservations', existingObs.id, obsData, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
            } else {
              const rec = EventObsEntity.create(obsData);
              add('eventObservations', rec, EventObsEntity.validate, EventObsEntity.toSupabaseShape, 'event_observations');
            }
            overlay.remove();
          },
        }, [t('action.save')]),
        el('button', { className: 'btn btn-outline', onClick: () => overlay.remove() }, [t('action.cancel')]),
      ]),
    ]),
  ]);

  document.body.appendChild(overlay);
}
