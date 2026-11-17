/** @file Shared run-rate panel (feed checks): pills 7/14/30/60, implied
 * pasture DMI (DMI-9) as the headline, then run rate, consumed, residual at
 * close, DMI actual vs forecast. Used by the Feed Day
 * Goal card and reused by the stored-forage scorecard; all math lives in the
 * shared calc `src/calcs/feed-run-rate.js`.
 */
import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll } from '../../data/store.js';
import { display } from '../../utils/units.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { formatShortDate } from '../../utils/date-format.js';
import { computeFeedRunRate, RUN_RATE_WINDOWS, DEFAULT_RUN_RATE_DAYS } from '../../calcs/feed-run-rate.js';
import { periodContaining } from '../../calcs/budget-period.js';
import { getEventStartDate } from '../events/event-start.js';

// ---------------------------------------------------------------------------

const RUN_RATE_DAYS_KEY = 'gtho_v2_feed_run_rate_days';

/** Window choice remembered on this device; falls back to 30 days. */
export function getRunRateDays() {
  try {
    const saved = Number(globalThis.localStorage?.getItem(RUN_RATE_DAYS_KEY));
    return RUN_RATE_WINDOWS.includes(saved) ? saved : DEFAULT_RUN_RATE_DAYS;
  } catch { return DEFAULT_RUN_RATE_DAYS; }
}
function setRunRateDays(days) {
  try { globalThis.localStorage?.setItem(RUN_RATE_DAYS_KEY, String(days)); } catch { /* device storage unavailable */ }
}

/** Gather store rows for the shared run-rate calc. Event start is derived (dateIn).
 * Pills are clipped to the start of the default budget period containing today (D10). */
export function feedRunRateInput(days, today = getLocalTodayStr()) {
  const classes = {};
  for (const cls of getAll('animalClasses')) classes[cls.id] = cls;
  const locations = {};
  for (const loc of getAll('locations')) locations[loc.id] = loc;
  return {
    today, days, periodStart: periodContaining(today).start,
    events: getAll('events').map(event => ({ id: event.id, dateIn: getEventStartDate(event.id), dateOut: event.dateOut ?? null })),
    entries: getAll('eventFeedEntries'), checks: getAll('eventFeedChecks'), items: getAll('eventFeedCheckItems'),
    batches: getAll('batches'), feedTypes: getAll('feedTypes'),
    groupWindows: getAll('eventGroupWindows'), memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'), animalWeightRecords: getAll('animalWeightRecords'), animalClasses: classes,
    paddockWindows: getAll('eventPaddockWindows'), locations,
  };
}

const RUN_RATE_UNIT_KEYS = { bale: 'feed.runRateUnitBale', 'sq bale': 'feed.runRateUnitSqBale', bag: 'feed.runRateUnitBag', ton: 'feed.runRateUnitTon', kg: 'feed.runRateUnitKg', lb: 'feed.runRateUnitLb' };
const unitOrder = unit => { const i = Object.keys(RUN_RATE_UNIT_KEYS).indexOf(unit); return i < 0 ? 99 : i; };
const fmtCount = value => (Math.round(value * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
const fmtMoney = value => `$${Math.round(value).toLocaleString('en-US')}`;
function unitParts(units, suffix = '') {
  return Object.entries(units).filter(([, value]) => value > 1e-9).sort((a, b) => unitOrder(a[0]) - unitOrder(b[0]))
    .map(([unit, value]) => `${fmtCount(value)} ${RUN_RATE_UNIT_KEYS[unit] ? t(RUN_RATE_UNIT_KEYS[unit]) : unit}${suffix}`);
}
const dmText = (kg, unitSys) => t('feed.runRateDm', { amount: display(kg, 'weight', unitSys, 0) });

function amountColumn(testId, title, total, unitSys, extra = []) {
  const lines = total.unknown
    ? [t('feed.runRateUnknownDm'), t('feed.runRateUnknownCost')]
    : [...unitParts(total.units), dmText(total.dmKg, unitSys), total.cost == null ? t('feed.runRateNoCost') : fmtMoney(total.cost)];
  if (total.cost != null && total.unpricedDmKg > 1e-9) lines.push(t('feed.runRatePartlyUnpriced', { amount: display(total.unpricedDmKg, 'weight', unitSys, 0) }));
  return el('div', { 'data-testid': testId, style: { flex: '1', minWidth: '0' } }, [
    el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [title]),
    ...lines.map(line => el('div', { style: { fontSize: '13px' } }, [line])),
    ...extra,
  ]);
}

const PASTURE_SPECIES = [['cattle', 'feed.pastureSpeciesCattle'], ['sheep', 'feed.pastureSpeciesSheep'], ['goat', 'feed.pastureSpeciesGoat'], ['other', 'feed.pastureSpeciesOther']];
const fmtPct = value => Math.round(value);
const perDay = (kg, unitSys) => `${dmText(kg, unitSys)}${t('feed.runRatePerDay')}`;

/** DMI-9 headline: green when above 0, muted at 0; Unknown or No animals, never a made-up 0. */
function impliedPastureBlock(p, unitSys) {
  const headline = (text, color) => el('div', { 'data-testid': 'feed-implied-pasture', style: { fontSize: '18px', fontWeight: '700', color, marginTop: 'var(--space-2)' } }, [text]);
  const hint = (testId, text) => el('div', { className: 'form-hint', 'data-testid': testId }, [text]);
  const droppedText = () => {
    const parts = [];
    if (p.dropped.noWeight) parts.push(t('feed.pastureDroppedNoWeight', { count: p.dropped.noWeight }));
    if (p.dropped.confinement) parts.push(t('feed.pastureDroppedConfinement', { count: p.dropped.confinement }));
    if (p.dropped.storedWithoutDemand) parts.push(t('feed.pastureDroppedNoDemand', { count: p.dropped.storedWithoutDemand }));
    return parts.length ? hint('feed-implied-pasture-dropped', t('feed.pastureDropped', { parts: parts.join(' · ') })) : null;
  };
  if (p.status === 'unknown') {
    return [headline(t('feed.pastureUnknown'), 'var(--text2)'),
      p.reason === 'no_counted_days' ? hint('feed-implied-pasture-reason', t('feed.pastureNeedsDays')) : droppedText()].filter(Boolean);
  }
  if (p.status === 'no_animals') return [headline(t('feed.pastureNoAnimals'), 'var(--text2)')];
  const positive = p.pastureDmKgPerDay > 1e-9;
  const out = [
    headline(t('feed.pastureHeadline', { amount: perDay(p.pastureDmKgPerDay, unitSys), pct: fmtPct(p.pasturePct) }), positive ? 'var(--green)' : 'var(--text3)'),
    hint('feed-implied-pasture-detail', t('feed.pastureDetail', { demand: perDay(p.demandDmKgPerDay, unitSys), stored: perDay(p.storedDmKgPerDay, unitSys), counted: p.countedDays, days: p.windowDays })),
  ];
  if (p.signedDmKg < 0) {
    out.push(el('div', { 'data-testid': 'feed-implied-pasture-over', style: { fontSize: '13px' } }, [t('feed.pastureOverDemand', { amount: perDay(p.overDemandDmKgPerDay, unitSys), pct: fmtPct(p.overDemandPct) })]));
    out.push(hint('feed-implied-pasture-over-hint', t('feed.pastureOverDemandHint')));
  }
  const dropped = droppedText(); if (dropped) out.push(dropped);
  const rows = PASTURE_SPECIES.filter(([key]) => p.bySpecies[key]).map(([key, label]) => {
    const sp = p.bySpecies[key];
    const perHead = sp.pasturePerHeadKg == null ? t('feed.pastureUnknownShort') : `${t('feed.runRateDm', { amount: display(sp.pasturePerHeadKg, 'weight', unitSys, 1) })}${t('feed.pasturePerHead')}`;
    return el('div', { 'data-testid': `feed-implied-pasture-${key}`, style: { fontSize: '13px', color: sp.pastureDmKgPerDay > 1e-9 ? 'var(--green)' : 'var(--text3)' } },
      [t('feed.pastureSpeciesRow', { species: t(label), perHead, pct: fmtPct(sp.pasturePct) })]);
  });
  if (rows.length) out.push(el('details', { 'data-testid': 'feed-implied-pasture-species' }, [el('summary', { style: { fontSize: '12px', color: 'var(--text2)' } }, [t('feed.pastureBySpecies')]), ...rows]));
  return out;
}

/**
 * The run-rate panel: pills, rate line, consumed / residual columns and DMI.
 * One shared component for the Feed Day Goal card and the stored-forage
 * scorecard. `today` defaults to the device-local date.
 */
export function renderRunRatePanel({ unitSys, today } = {}) {
  const days = getRunRateDays();
  const result = computeFeedRunRate(feedRunRateInput(days, today));
  const section = el('div', { 'data-testid': 'feed-run-rate-section', style: { marginTop: 'var(--space-4)' } });
  const pills = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
    RUN_RATE_WINDOWS.map(n => el('button', {
      type: 'button',
      className: `btn btn-xs ${n === days ? 'btn-green' : 'btn-outline'}`,
      'data-testid': `feed-run-rate-pill-${n}`,
      'aria-pressed': n === days ? 'true' : 'false',
      onClick: () => { setRunRateDays(n); section.replaceWith(renderRunRatePanel({ unitSys, today })); },
    }, [t('feed.runRatePill', { days: n })])));
  const body = [...impliedPastureBlock(result.impliedPasture, unitSys)];
  if (!result.measuredDays) {
    body.push(el('div', { className: 'form-hint', 'data-testid': 'feed-run-rate-empty' }, [t('feed.runRateEmpty', { days })]));
  } else {
    const parts = [...unitParts(result.rate.unitsPerDay, t('feed.runRatePerDay')), `${dmText(result.rate.dmKgPerDay, unitSys)}${t('feed.runRatePerDay')}`];
    body.push(el('div', { 'data-testid': 'feed-run-rate-line', style: { fontSize: '14px', fontWeight: '600' } }, [t('feed.runRateLine', { parts: parts.join(' · ') })]));
    body.push(el('div', { className: 'form-hint', 'data-testid': 'feed-run-rate-measured' }, [t('feed.runRateMeasured', { measured: result.measuredDays, days: result.windowDays, date: formatShortDate(result.lastMeasuredDate) })]));
  }
  const residual = result.residual;
  const residualExtra = [];
  if (residual.eventsClosed) residualExtra.push(el('div', { className: 'form-hint' }, [t('feed.runRateClosedEvents', { count: residual.eventsClosed })]));
  if (residual.closesWithoutReading) residualExtra.push(el('div', { className: 'form-hint', 'data-testid': 'feed-run-rate-missing-close' }, [t('feed.runRateClosesWithoutReading', { count: residual.closesWithoutReading })]));
  const columns = [];
  if (result.measuredDays) {
    const hint = result.consumed.includesPartialDays
      ? [el('div', { className: 'form-hint', 'data-testid': 'feed-run-rate-partial' }, [t('feed.runRatePartialDays')])]
      : [];
    columns.push(amountColumn('feed-run-rate-consumed', t('feed.runRateConsumed'), result.consumed, unitSys, hint));
  }
  columns.push(residual.eventsClosed
    ? amountColumn('feed-run-rate-residual', t('feed.runRateResidual'), residual, unitSys, residualExtra)
    : el('div', { 'data-testid': 'feed-run-rate-residual', style: { flex: '1' } }, [
      el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.runRateResidual')]),
      el('div', { className: 'form-hint' }, [t('feed.runRateNoCloses', { days })]),
    ]));
  body.push(el('div', { style: { display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' } }, columns));
  if (result.measuredDays && result.rate.forecastDmKgPerDay != null) {
    const actual = display(result.rate.dmKgPerDay, 'weight', unitSys, 0);
    const forecast = display(result.rate.forecastDmKgPerDay, 'weight', unitSys, 0);
    body.push(el('div', { 'data-testid': 'feed-run-rate-dmi', style: { fontSize: '13px', marginTop: 'var(--space-2)' } }, [
      result.rate.pctOfForecast == null
        ? t('feed.runRateDmiNoForecast', { actual })
        : t('feed.runRateDmi', { actual, forecast, pct: Math.round(result.rate.pctOfForecast) }),
    ]));
  }
  section.append(
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
      el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text2)' } }, [t('feed.runRateTitle')]),
      pills,
    ]),
    ...body,
  );
  return section;
}
