/** @file Greyed, inactive confinement forage UI (OI-0209). Visible, not hidden. */

import { el } from '../../ui/dom.js';
import { isConfinementLocation, isPureConfinementOnDate } from '../../calcs/location-type.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { buildDmi8ChartContext } from './dmi-chart-context.js';
import {
  projectEventFeedDays,
  formatFeedRemainingLabel,
  FEED_REMAINING_ESTIMATE_CAPTION,
} from '../../calcs/event-feed-days.js';

export { isConfinementLocation, isPureConfinementOnDate };

export function disableForageControls(root) {
  if (!root) return root;
  root.querySelectorAll('button, input, select, textarea, a').forEach((node) => {
    if ('disabled' in node) node.disabled = true;
    node.setAttribute('tabindex', '-1');
    node.setAttribute('aria-disabled', 'true');
    if (node.tagName === 'A') node.removeAttribute('href');
  });
  return root;
}

/** Wrap an existing forage/graze/recovery node so it stays visible but inactive. */
export function wrapInactiveForage(node, testId) {
  const wrap = el('div', {
    className: 'confinement-forage-inactive',
    'aria-disabled': 'true',
    ...(testId ? { 'data-testid': testId } : {}),
  }, [node]);
  disableForageControls(wrap);
  return wrap;
}

export function projectEventFeedRemaining(eventId, today) {
  const dmi8 = getCalcByName('DMI-8');
  const for4 = getCalcByName('FOR-4');
  const ctx = buildDmi8ChartContext(eventId);
  return projectEventFeedDays({
    dmi8Fn: dmi8?.fn,
    for4Fn: for4?.fn,
    ctx,
    today: today || getLocalTodayStr(),
  });
}

/**
 * Shared dashboard + Event Detail feed-days line for pure confinement.
 * Returns null when the estimate must be hidden (invalid/zero demand).
 */
export function renderEventFeedRemainingLine(eventId, { today, testId } = {}) {
  const projection = projectEventFeedRemaining(eventId, today);
  if (!projection.isPureConfinement || !projection.visible) {
    return { projection, element: null };
  }
  const element = el('div', {
    className: 'event-feed-remaining',
    'data-testid': testId || `event-feed-remaining-${eventId}`,
  }, [
    el('div', { className: 'event-feed-remaining-line' }, [formatFeedRemainingLabel(projection.days)]),
    el('div', { className: 'event-feed-remaining-caption' }, [FEED_REMAINING_ESTIMATE_CAPTION]),
  ]);
  return { projection, element };
}

export function renderInactiveForageSummary({ forageTypeName, heightDisplay, testId } = {}) {
  const typeText = forageTypeName || '\u2014';
  const heightText = heightDisplay || '\u2014';
  return el('div', {
    className: 'confinement-forage-inactive',
    'aria-disabled': 'true',
    ...(testId ? { 'data-testid': testId } : {}),
  }, [`Forage: ${typeText} \u00B7 Height ${heightText}`]);
}
