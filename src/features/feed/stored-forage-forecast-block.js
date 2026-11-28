/**
 * @file #377 slice 1 — the season forecast block on the Feed screen's
 * stored-feed plan card (FED-8). Headline surplus/deficit, ≈ bales of the main
 * batch, "Hay covers through", the amber staleness note, and the hidden state
 * with a "Count your hay" button that opens the batch Adjust sheet (its default
 * reason is Reconcile / physical count). The days-on-hand banner is untouched.
 */
import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById } from '../../data/store.js';
import { formatMeasure } from '../../utils/units.js';
import { normalizeFeedUnit, FEED_UNIT_LABEL_KEYS } from '../../utils/feed-units.js';
import { computeStoredForageForecast } from '../../calcs/stored-forage-forecast.js';
import { openBatchAdjustSheet } from './batch-sheets.js';

/** Forecast for one plan from the live store. `demandOpts` are the #436 need(d) inputs. */
export function computeFarmForecast({ plan, rows, today, demandOpts }) {
  return computeStoredForageForecast({
    plan,
    rows,
    today,
    batches: getAll('batches'),
    feedTypes: getAll('feedTypes'),
    adjustments: getAll('batchAdjustments'),
    balances: getAll('batchLocationBalances'),
    needForDate: { today, demandOpts },
  });
}

function dateText(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function batchNames(ids) {
  return ids.map(id => getById('batches', id)?.name || '?').join(', ');
}

/** "≈ 40 round bales of Alfalfa (main batch)"; null for mass units (kg / lb) where a count adds nothing. */
function balesLine(forecast) {
  const main = forecast.mainBatch;
  const batch = main ? getById('batches', main.batchId) : null;
  if (!batch || main.equivalentUnits == null) return null;
  const unit = normalizeFeedUnit(batch.unit);
  if (unit === 'kg' || unit === 'lb') return null;
  const n = Math.round(main.equivalentUnits);
  const label = (FEED_UNIT_LABEL_KEYS[unit] ? t(FEED_UNIT_LABEL_KEYS[unit]) : batch.unit).toLowerCase();
  return t('feed.forecastBales', {
    count: n === 0 ? '<1' : n.toLocaleString('en-US'),
    unit: n === 1 ? label : `${label}s`,
    batch: batch.name,
  });
}

function coversLine(forecast) {
  const base = t('feed.forecastCovers', { date: dateText(forecast.coversThrough) });
  const days = forecast.reachesPeriodEnd ? forecast.carryOverDays : null;
  if (!days) return base;
  return `${base} (${t(days === 1 ? 'feed.forecastCarryOverOne' : 'feed.forecastCarryOver', { days })})`;
}

function blockerText(forecast, blocker) {
  switch (blocker) {
    case 'no_batches': return t('feed.forecastNoBatches');
    case 'never_counted': return t('feed.forecastNeverCounted');
    case 'stale': return t('feed.forecastTooOld', { days: forecast.count.daysAgo });
    case 'unknown_weight_dm': return t('feed.forecastUnknownWeightDm', { names: batchNames(forecast.unknownBatchIds) });
    case 'location_mismatch': return t('feed.forecastLocationMismatch', { names: batchNames(forecast.mismatchedBatchIds) });
    default: return '';
  }
}

/**
 * The forecast block, or null when there is nothing to show (no plan, which the
 * card handles with its own prompt, or a plan whose period is already over).
 */
export function renderForecastBlock(forecast, unitSys, operationId) {
  if (!forecast || forecast.status === 'no_plan' || forecast.status === 'period_over') return null;
  const box = el('div', { className: 'feed-forecast', 'data-testid': 'feed-forecast' });

  if (forecast.status === 'hidden') {
    box.appendChild(el('div', { className: 'feed-forecast-headline', 'data-testid': 'feed-forecast-hidden' }, [
      t('feed.forecastHidden'),
    ]));
    for (const blocker of forecast.blockers) {
      box.appendChild(el('div', { className: 'form-hint', 'data-testid': `feed-forecast-reason-${blocker}` }, [
        blockerText(forecast, blocker),
      ]));
    }
    const batch = forecast.countBatchId ? getById('batches', forecast.countBatchId) : null;
    if (batch) {
      box.appendChild(el('button', {
        className: 'btn btn-outline btn-sm',
        style: { marginTop: 'var(--space-2)' },
        'data-testid': 'feed-forecast-count-hay',
        onClick: () => openBatchAdjustSheet(batch, batch.operationId || operationId),
      }, [t('feed.forecastCountHay')]));
    }
    return box;
  }

  const surplus = forecast.forecastKg >= 0;
  const amount = formatMeasure(Math.abs(forecast.forecastKg), 'weight', { unitSystem: unitSys });
  box.appendChild(el('div', {
    className: `feed-forecast-headline feed-forecast-headline--${forecast.tone}`,
    style: { color: surplus ? 'var(--green)' : 'var(--red)' },
    'data-testid': 'feed-forecast-headline',
  }, [t(surplus ? 'feed.forecastSurplus' : 'feed.forecastDeficit', { amount })]));
  const bales = balesLine(forecast);
  if (bales) box.appendChild(el('div', { className: 'form-hint', 'data-testid': 'feed-forecast-bales' }, [bales]));
  box.appendChild(el('div', { className: 'feed-forecast-covers', 'data-testid': 'feed-forecast-covers' }, [coversLine(forecast)]));
  if (forecast.stale) {
    box.appendChild(el('div', {
      className: 'feed-forecast-stale',
      style: { color: 'var(--amber)' },
      'data-testid': 'feed-forecast-stale',
    }, [t('feed.forecastLastCounted', { days: forecast.count.daysAgo })]));
  }
  return box;
}
