/**
 * @file Feed screen — Feed Day Goal banner (CP-26) and its farm-wide DMI math.
 * #486: moved verbatim out of feed/index.js (behavior-preserving split).
 */
import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display } from '../../utils/units.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import '../../calcs/feed-forage.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { renderRunRatePanel } from './run-rate-panel.js';

export function refreshFeedDayGoalBanner(container) {
  const old = container.querySelector('[data-testid="feed-day-goal-banner"]');
  if (!old) return;
  old.replaceWith(renderFeedDayGoalBanner());
}

/** Most recent weight on or before `today` (YYYY-MM-DD). Null when none qualify. */
export function latestWeightKgOnOrBefore(animalId, weightRecords, today) {
  let bestStamp = '';
  let bestKg = null;
  for (const w of weightRecords) {
    if (w.animalId !== animalId) continue;
    if (typeof w.weightKg !== 'number' || !Number.isFinite(w.weightKg)) continue;
    const stamp = w.recordedAt || w.date || '';
    const day = String(stamp).slice(0, 10);
    if (!day || day > today) continue;
    if (bestKg == null || stamp > bestStamp) {
      bestStamp = stamp;
      bestKg = w.weightKg;
    }
  }
  return bestKg;
}

/**
 * One animal's daily DMI via DMI-2. Lactation is ignored (isLactating false),
 * matching the dashboard group calls this banner follows.
 */
export function dailyDmiForAnimal(weightKg, animalClass) {
  const dmiPct = typeof animalClass?.dmiPct === 'number' ? animalClass.dmiPct : 2.5;
  const dmiPctLactating = typeof animalClass?.dmiPctLactating === 'number'
    ? animalClass.dmiPctLactating
    : 2.5;
  const dmi2 = getCalcByName('DMI-2');
  if (dmi2) {
    return dmi2.fn({
      headCount: 1,
      avgWeightKg: weightKg,
      dmiPct,
      dmiPctLactating,
      isLactating: false,
    });
  }
  return weightKg * (dmiPct / 100);
}

/** Sum of DMI for every animal with active !== false. Not limited to open events. */
export function farmWideActiveDmiKg() {
  const today = getLocalTodayStr();
  const classes = new Map(getAll('animalClasses').map(c => [c.id, c]));
  const weights = getAll('animalWeightRecords');
  let total = 0;
  for (const animal of getAll('animals')) {
    if (animal.active === false) continue;
    const cls = animal.classId ? classes.get(animal.classId) : null;
    const weighed = latestWeightKgOnOrBefore(animal.id, weights, today);
    const perHeadDefault = typeof cls?.defaultWeightKg === 'number' ? cls.defaultWeightKg : 0;
    // A recorded composite weight is the lot total. The class default is per head.
    const heads = animal.isBulk === true ? Math.max(0, Math.floor(Number(animal.bulkHeadCount) || 0)) : 1;
    const weightKg = weighed != null
      ? weighed
      : perHeadDefault * heads;
    total += dailyDmiForAnimal(weightKg, cls);
  }
  return total;
}

export function renderFeedDayGoalBanner() {
  const farmSettings = getAll('farmSettings')[0];
  const goal = farmSettings?.feedDayGoal ?? 90;
  const unitSys = getUnitSystem();

  // DM on hand: remaining × kg per unit × dm% for non-archived batches.
  // Weight falls back batch → feed-type default → 1 kg per unit.
  const batches = getAll('batches').filter(b => !b.archived);
  const feedTypes = getAll('feedTypes');
  const ftMap = new Map(feedTypes.map(ft => [ft.id, ft]));
  let totalDmKg = 0;
  for (const b of batches) {
    const dm = b.dmPct ?? ftMap.get(b.feedTypeId)?.dmPct ?? 100;
    const weightKg = b.weightPerUnitKg ?? ftMap.get(b.feedTypeId)?.defaultWeightKg ?? 1;
    totalDmKg += (b.remaining ?? 0) * weightKg * (dm / 100);
  }

  // Days on hand = total DM ÷ farm-wide active-animal DMI (V2_UX_FLOWS.md §13.2).
  const dailyDmiKg = farmWideActiveDmiKg();
  const daysOnHand = dailyDmiKg > 0 ? Math.round(totalDmKg / dailyDmiKg) : null;

  // Progress bar: green ≥ goal, amber 33–99%, red < 33%
  let pct = 0;
  let progressClass = 'progress-green';
  if (daysOnHand != null && goal > 0) {
    pct = Math.min((daysOnHand / goal) * 100, 100);
    if (pct < 33) progressClass = 'progress-red';
    else if (pct < 100) progressClass = 'progress-amber';
  }

  // Format DM on hand and run rate in user's unit system
  const dmOnHandDisplay = display(totalDmKg, 'weight', unitSys, 0);
  const runRateDisplay = dailyDmiKg > 0
    ? `${display(dailyDmiKg, 'weight', unitSys, 0)}/day`
    : '—';

  return el('div', {
    className: 'card',
    style: { marginBottom: 'var(--space-5)' },
    'data-testid': 'feed-day-goal-banner',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('div', {}, [
        el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text2)' } }, [
          t('feed.feedDayGoalLabel'),
        ]),
        el('div', { style: { fontSize: '20px', fontWeight: '600', marginTop: '2px' } }, [
          daysOnHand != null
            ? `${daysOnHand} / ${goal} days`
            : t('feed.daysOnHandValue', { goal }),
        ]),
      ]),
      el('div', { className: 'form-hint' }, [t('feed.feedDayGoalHint')]),
    ]),
    // Three stat cells: DM on Hand, Daily need (DMI), Days on Hand
    el('div', { style: { display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)' } }, [
      el('div', { 'data-testid': 'feed-dm-on-hand' }, [
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.dmOnHand')]),
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [dmOnHandDisplay]),
      ]),
      el('div', { 'data-testid': 'feed-run-rate' }, [
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.runRate')]),
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [runRateDisplay]),
      ]),
      el('div', { 'data-testid': 'feed-days-on-hand' }, [
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.daysOnHand')]),
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [daysOnHand != null ? `${daysOnHand}` : '—']),
      ]),
    ]),
    el('div', { className: 'progress-bar', style: { marginTop: 'var(--space-3)' } }, [
      el('div', {
        className: `progress-fill ${progressClass}`,
        style: { width: `${pct}%` },
      }),
    ]),
    renderRunRatePanel({ unitSys }),
  ]);
}
