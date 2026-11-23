/**
 * @file Past-event detail sheet on Rotation (OI-0255 Ui1+Dt1).
 *
 * Click a past block → modal/sheet over the calendar (Ui1). Shows opening +
 * closing pasture readings and key event/PW fields already on the record
 * (dates, groups, location) — Dt1. Read-only; no SQL (D0).
 *
 * OI-0283 (Scope A): open windows show "Current event" and no Post-Graze
 * section; observations match this window strictly (sourceId === pwId); a
 * DMI & Grazing section shows this paddock window's calendar metrics
 * (computePaddockWindowMetrics — same calc as the bar and List), through today
 * when open, in the farm unit (OI-0278 helper).
 */

import { el, clear } from '../../../ui/dom.js';
import { Sheet, resetSheetScrollLock } from '../../../ui/sheet.js';
import { t } from '../../../i18n/i18n.js';
import { getAll, getById } from '../../../data/store.js';
import { display, formatMeasure, formatPerArea } from '../../../utils/units.js';
import { getLocalTodayStr } from '../../../utils/date-utils.js';
import { getEventStartDate } from '../event-start.js';
import { pastWindowSpan, computePaddockWindowMetrics } from './past-window.js';

const SHEET_WRAP_ID = 'past-event-detail-sheet-wrap';
const CONTENT_ID = 'past-event-detail-sheet-content';

let sheet = null;

/**
 * Open/close observation for this paddock window. OI-0283: strict
 * `sourceId === pwId` — no fallback to another event's reading on the same
 * paddock (that bled a prior event's post-graze into an active window).
 * Mirrors edit-paddock-window's lookup.
 * @param {string} locationId
 * @param {string} pwId
 * @param {'open'|'close'} type
 * @returns {object|null}
 */
export function findPwObservation(locationId, pwId, type) {
  if (!pwId) return null;
  return getAll('paddockObservations')
    .find(o => o.locationId === locationId && o.type === type && o.source === 'event'
      && o.sourceId === pwId) || null;
}

/** Store rows for the calendar metric context (same sets calendar-grid passes). */
function metricCtxFromStore(today) {
  return {
    today,
    events: getAll('events'),
    paddockWindows: getAll('eventPaddockWindows'),
    groupWindows: getAll('eventGroupWindows'),
    memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
    animalWeightRecords: getAll('animalWeightRecords'),
    locations: getAll('locations'),
    observations: getAll('paddockObservations'),
    feedEntries: getAll('eventFeedEntries'),
    feedChecks: getAll('eventFeedChecks'),
    feedCheckItems: getAll('eventFeedCheckItems'),
    batches: getAll('batches'),
    feedTypes: getAll('feedTypes'),
    batchNutritionalProfiles: getAll('batchNutritionalProfiles'),
  };
}

/**
 * OI-0283 B: DMI & Grazing figures for this paddock window only (Scope A),
 * from `computePaddockWindowMetrics` over the bar's span (through today when
 * open). Canonical metric values; the render formats them.
 * @returns {object|null}
 */
export function buildPwDmiStats(pw, loc, event, { today = getLocalTodayStr() } = {}) {
  if (!pw || !event) return null;
  const span = pastWindowSpan(pw, event, { today, fallbackStart: getEventStartDate(event.id) });
  if (!span || !loc) return { days: span?.days ?? null, unknown: true };
  const wm = computePaddockWindowMetrics(pw, loc, event, span, metricCtxFromStore(today));
  const raw = wm.raw || {};
  const storedKg = wm.storedFeedOnly
    ? (Number(raw.storedFeedDmiKg) || 0)
    : (raw.storedFeedDmiKg != null ? Number(raw.storedFeedDmiKg) || 0 : null);
  const pastureKg = wm.dmi; // null = unknown (OI-0253); 0 on stored-feed-only (OI-0256)
  const totalKg = pastureKg != null && storedKg != null ? pastureKg + storedKg : null;
  let pasturePct = wm.pasturePct;
  let feedPct = wm.feedPct;
  if (wm.storedFeedOnly) { pasturePct = 0; feedPct = 100; }
  return {
    days: span.days,
    totalKg,
    pastureKg,
    pastureKgPerHa: wm.storedFeedOnly ? (raw.hasArea ? 0 : null) : (raw.dmiPerHa ?? null),
    storedKg,
    pasturePct,
    feedPct,
    auds: wm.auds,
    audsPerHa: wm.auds != null && raw.hasArea ? (raw.audsPerHa ?? null) : null,
    hasArea: !!raw.hasArea,
    storedFeedOnly: !!wm.storedFeedOnly,
    dmiPartial: !!raw.dmiPartial,
    dmiBasisNote: raw.dmiBasisNote || null,
  };
}

/**
 * Build the read-only detail model for tests and render.
 * @param {{ eventId: string, paddockWindowId: string }} opts
 * @returns {object|null}
 */
export function buildPastEventDetailModel({ eventId, paddockWindowId, today = getLocalTodayStr() }) {
  const event = getById('events', eventId);
  const pw = getById('eventPaddockWindows', paddockWindowId);
  if (!event || !pw || pw.eventId !== eventId) return null;

  const loc = getById('locations', pw.locationId);
  const unitSys = getAll('operations').find(o => o.id === event.operationId)?.unitSystem
    || getAll('operations')[0]?.unitSystem
    || 'imperial';

  const groupWindows = getAll('eventGroupWindows').filter(gw => gw.eventId === eventId);
  const groups = [];
  const seen = new Set();
  for (const gw of groupWindows) {
    if (seen.has(gw.groupId)) continue;
    seen.add(gw.groupId);
    const g = getById('groups', gw.groupId);
    if (g) groups.push({ id: g.id, name: g.name });
  }

  const isOpen = !(pw.dateClosed || event.dateOut);
  const openObs = findPwObservation(pw.locationId, pw.id, 'open');
  // OI-0283 A2: an open window has no post-graze yet — don't resolve one.
  const closeObs = isOpen ? null : findPwObservation(pw.locationId, pw.id, 'close');
  const startDate = getEventStartDate(eventId);
  const eventPaddockWindowCount = getAll('eventPaddockWindows').filter(w => w.eventId === eventId).length;

  return {
    eventId,
    paddockWindowId,
    locationId: pw.locationId,
    locationName: loc?.name || '—',
    groups,
    groupNames: groups.map(g => g.name).join(', ') || '—',
    dateOpened: pw.dateOpened || startDate || '—',
    timeOpened: pw.timeOpened || null,
    dateClosed: pw.dateClosed || event.dateOut || null,
    timeClosed: pw.timeClosed || event.timeOut || null,
    isOpen,
    unitSys,
    eventPaddockWindowCount,
    dmiStats: buildPwDmiStats(pw, loc, event, { today }),
    opening: openObs ? {
      forageHeightCm: openObs.forageHeightCm ?? null,
      forageCoverPct: openObs.forageCoverPct ?? null,
      forageQuality: openObs.forageQuality ?? null,
      forageCondition: openObs.forageCondition ?? null,
      baleRingResidueCount: openObs.baleRingResidueCount ?? null,
      notes: openObs.notes ?? null,
    } : null,
    closing: closeObs ? {
      residualHeightCm: closeObs.residualHeightCm ?? null,
      recoveryMinDays: closeObs.recoveryMinDays ?? null,
      recoveryMaxDays: closeObs.recoveryMaxDays ?? null,
      notes: closeObs.notes ?? null,
    } : null,
  };
}

function dash(v) {
  return v == null || v === '' ? '—' : String(v);
}

function formatHeight(cm, unitSys) {
  if (cm == null) return '—';
  return display(cm, 'length', unitSys, 1);
}

function formatCondition(cond) {
  if (!cond) return '—';
  const key = `event.condition${cond.charAt(0).toUpperCase()}${cond.slice(1)}`;
  const label = t(key);
  return label === key ? cond : label;
}

function formatDateTime(date, time) {
  if (!date || date === '—') return '—';
  return time ? `${date} ${time}` : date;
}

function row(label, value, testid) {
  return el('div', {
    className: 'past-event-detail__row',
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '6px 0',
      borderBottom: '1px solid var(--border)',
      fontSize: '14px',
    },
    'data-testid': testid,
  }, [
    el('span', { style: { color: 'var(--text2)' } }, [label]),
    el('span', {
      style: { fontWeight: '500', textAlign: 'right' },
      'data-testid': `${testid}-value`,
    }, [value]),
  ]);
}

function sectionTitle(text, testid) {
  return el('h3', {
    style: {
      fontSize: '14px',
      fontWeight: '600',
      margin: '16px 0 8px',
      color: 'var(--text)',
    },
    'data-testid': testid,
  }, [text]);
}

function ensureSheetDOM() {
  if (document.getElementById(SHEET_WRAP_ID)) return;
  const wrap = el('div', {
    className: 'sheet-wrap',
    id: SHEET_WRAP_ID,
    'data-testid': 'past-event-detail-sheet',
  }, [
    el('div', {
      className: 'sheet-backdrop',
      'data-testid': 'past-event-detail-backdrop',
      onClick: () => closePastEventDetailSheet(),
    }),
    el('div', {
      className: 'sheet-panel',
      'data-testid': 'past-event-detail-panel',
    }, [
      el('div', { className: 'sheet-handle' }),
      el('div', { id: CONTENT_ID }),
    ]),
  ]);
  document.body.appendChild(wrap);
}

function renderContent(model) {
  const contentEl = document.getElementById(CONTENT_ID);
  if (!contentEl) return;
  clear(contentEl);

  contentEl.appendChild(el('h2', {
    style: { fontSize: '18px', fontWeight: '600', marginBottom: 'var(--space-4)' },
    'data-testid': 'past-event-detail-title',
  }, [t(model.isOpen ? 'event.currentEventDetail' : 'event.pastEventDetail')]));

  // Key event / PW fields (Dt1): location, groups, dates
  contentEl.appendChild(sectionTitle(t('event.pastEventFields'), 'past-event-detail-fields-heading'));
  contentEl.appendChild(row(t('event.location'), model.locationName, 'past-event-detail-location'));
  contentEl.appendChild(row(t('event.groups'), model.groupNames, 'past-event-detail-groups'));
  contentEl.appendChild(row(
    t('event.dateOpened'),
    formatDateTime(model.dateOpened, model.timeOpened),
    'past-event-detail-opened',
  ));
  contentEl.appendChild(row(
    t('event.dateClosed'),
    model.isOpen ? t('event.active') : formatDateTime(model.dateClosed, model.timeClosed),
    'past-event-detail-closed',
  ));

  // Opening (pre-graze) readings
  contentEl.appendChild(sectionTitle(t('event.preGrazeObs'), 'past-event-detail-opening-heading'));
  if (!model.opening) {
    contentEl.appendChild(el('div', {
      style: { fontSize: '13px', color: 'var(--text2)', padding: '4px 0' },
      'data-testid': 'past-event-detail-opening-empty',
    }, [t('event.noObservations')]));
  } else {
    const o = model.opening;
    contentEl.appendChild(row(
      t('event.forageHeight'),
      formatHeight(o.forageHeightCm, model.unitSys),
      'past-event-detail-opening-height',
    ));
    contentEl.appendChild(row(
      t('event.forageCover'),
      o.forageCoverPct != null ? `${o.forageCoverPct}%` : '—',
      'past-event-detail-opening-cover',
    ));
    contentEl.appendChild(row(
      t('event.forageQuality'),
      dash(o.forageQuality),
      'past-event-detail-opening-quality',
    ));
    contentEl.appendChild(row(
      t('event.forageCondition'),
      formatCondition(o.forageCondition),
      'past-event-detail-opening-condition',
    ));
    contentEl.appendChild(row(
      t('event.residualBaleRings'),
      dash(o.baleRingResidueCount),
      'past-event-detail-opening-bale-rings',
    ));
    contentEl.appendChild(row(
      t('event.notes'),
      dash(o.notes),
      'past-event-detail-opening-notes',
    ));
  }

  // Closing (post-graze) readings — OI-0283 A2: hidden while the window is open.
  if (!model.isOpen) {
    contentEl.appendChild(sectionTitle(t('event.postGrazeObs'), 'past-event-detail-closing-heading'));
  }
  if (model.isOpen) {
    // Current event: no Post-Graze section.
  } else if (!model.closing) {
    contentEl.appendChild(el('div', {
      style: { fontSize: '13px', color: 'var(--text2)', padding: '4px 0' },
      'data-testid': 'past-event-detail-closing-empty',
    }, [t('event.postGrazeEmpty')]));
  } else {
    const c = model.closing;
    contentEl.appendChild(row(
      t('event.residualHeight'),
      formatHeight(c.residualHeightCm, model.unitSys),
      'past-event-detail-closing-residual',
    ));
    contentEl.appendChild(row(
      t('event.recoveryMinDays'),
      dash(c.recoveryMinDays),
      'past-event-detail-closing-recovery-min',
    ));
    contentEl.appendChild(row(
      t('event.recoveryMaxDays'),
      dash(c.recoveryMaxDays),
      'past-event-detail-closing-recovery-max',
    ));
    contentEl.appendChild(row(
      t('event.notes'),
      dash(c.notes),
      'past-event-detail-closing-notes',
    ));
  }

  renderDmiSection(contentEl, model);

  contentEl.appendChild(el('div', {
    style: { marginTop: '20px', display: 'flex', justifyContent: 'flex-end' },
  }, [
    el('button', {
      type: 'button',
      className: 'btn btn-outline',
      'data-testid': 'past-event-detail-close',
      onClick: () => closePastEventDetailSheet(),
    }, [t('action.close')]),
  ]));
}

function noteLine(text, testid) {
  return el('div', {
    style: { fontSize: '12px', color: 'var(--text2)', padding: '4px 0' },
    'data-testid': testid,
  }, [text]);
}

/** OI-0283 B: DMI & Grazing section (this paddock window only). */
function renderDmiSection(contentEl, model) {
  const s = model.dmiStats;
  if (!s) return;
  const us = model.unitSys;
  const title = el('h3', {
    style: { fontSize: '14px', fontWeight: '600', margin: '16px 0 8px', color: 'var(--text)' },
    'data-testid': 'past-event-detail-dmi-heading',
  }, [
    t('event.dmiGrazing'),
    model.isOpen ? el('span', {
      style: { fontSize: '12px', fontWeight: '400', color: 'var(--text2)', marginLeft: '6px' },
      'data-testid': 'past-event-detail-dmi-through-today',
    }, [`· ${t('event.throughToday')}`]) : null,
  ].filter(Boolean));
  contentEl.appendChild(title);

  if (model.eventPaddockWindowCount > 1) {
    contentEl.appendChild(noteLine(
      t('event.thisPaddockOnly', { n: model.eventPaddockWindowCount }),
      'past-event-detail-dmi-scope-note',
    ));
  }

  const partial = s.dmiPartial ? '~' : '';
  const dm = (kg) => (kg == null ? '—' : `${partial}${formatMeasure(kg, 'weight', { unitSystem: us })} DM`);
  const pct = (v) => (v == null ? '—%' : `${Math.round(v)}%`);
  const storedDm = (kg) => (kg == null ? '—' : `${formatMeasure(kg, 'weight', { unitSystem: us })} DM`);

  contentEl.appendChild(row(t('event.detailTotalDmi'), dm(s.totalKg), 'past-event-detail-dmi-total'));
  contentEl.appendChild(row(
    t('event.detailPastureDmi'),
    `${dm(s.pastureKg)} · ${pct(s.pasturePct)}`,
    'past-event-detail-dmi-pasture',
  ));
  if (s.hasArea) {
    contentEl.appendChild(row(
      t('event.detailPastureDmiPerArea'),
      s.pastureKgPerHa == null ? '—' : `${partial}${formatPerArea(s.pastureKgPerHa, 'weight', { unitSystem: us })}`,
      'past-event-detail-dmi-pasture-per-area',
    ));
  }
  contentEl.appendChild(row(
    t('event.detailStoredFeedDmi'),
    `${storedDm(s.storedKg)} · ${pct(s.feedPct)}`,
    'past-event-detail-dmi-stored',
  ));
  contentEl.appendChild(row(
    t('event.detailAuds'),
    s.auds == null ? '—' : formatMeasure(s.auds, 'count', { unitSystem: us, decimals: 0 }),
    'past-event-detail-dmi-auds',
  ));
  if (s.hasArea) {
    contentEl.appendChild(row(
      t('event.detailAudsPerArea'),
      s.audsPerHa == null ? '—' : formatPerArea(s.audsPerHa, 'count', { unitSystem: us }),
      'past-event-detail-dmi-auds-per-area',
    ));
  }
  contentEl.appendChild(row(t('event.detailDays'), s.days == null ? '—' : String(s.days), 'past-event-detail-dmi-days'));
  if (s.dmiPartial) contentEl.appendChild(noteLine(t('event.detailDmiPartial'), 'past-event-detail-dmi-partial'));
  if (s.dmiBasisNote) contentEl.appendChild(noteLine(s.dmiBasisNote, 'past-event-detail-dmi-basis'));
}

/**
 * Open the past-event detail sheet (Ui1).
 * @param {{ eventId: string, paddockWindowId: string }} opts
 */
export function openPastEventDetailSheet({ eventId, paddockWindowId }) {
  const model = buildPastEventDetailModel({ eventId, paddockWindowId });
  if (!model) return;
  ensureSheetDOM();
  if (!sheet) sheet = new Sheet(SHEET_WRAP_ID);
  renderContent(model);
  sheet.open(model);
}

/** Close the past-event detail sheet. */
export function closePastEventDetailSheet() {
  if (sheet) sheet.close();
}

/** @returns {boolean} */
export function isPastEventDetailSheetOpen() {
  return sheet ? sheet.isOpen() : false;
}

/** Test helper: tear down sheet DOM + scroll lock. */
export function resetPastEventDetailSheet() {
  if (sheet && sheet.isOpen()) sheet.close();
  sheet = null;
  const wrap = document.getElementById(SHEET_WRAP_ID);
  if (wrap) wrap.remove();
  resetSheetScrollLock();
}
