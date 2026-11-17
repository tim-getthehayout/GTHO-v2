/** Shared inline warning for implausible pool-check intake. No browser confirm. */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { convert } from '../../utils/units.js';
import { getUnitSystem } from '../../utils/preferences.js';

export function formatIntervalClock(date, time) {
  const d = new Date(`${date}T${((time || '00:00:00').split('.')[0]).padEnd(8, ':00')}`);
  if (Number.isNaN(d.getTime())) return date || '';
  const month = d.toLocaleString('en-US', { month: 'short' });
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const hour24 = d.getHours();
  const hour = hour24 % 12 || 12;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${month} ${d.getDate()} ${hour}:${minutes} ${ampm}`;
}

export function formatDmPerDay(kg, { unitSystem = getUnitSystem() } = {}) {
  const imperial = unitSystem === 'imperial';
  const value = Math.round(imperial ? convert(kg, 'weight', 'toImperial') : kg);
  const unit = imperial ? 'lb' : 'kg';
  return `${value} ${unit} DM/day`;
}

function appendMessage(node, text, implied, expected) {
  for (const part of text.split(/(%%I%%|%%E%%)/)) {
    if (part === '%%I%%') node.appendChild(el('strong', {}, [implied]));
    else if (part === '%%E%%') node.appendChild(el('strong', {}, [expected]));
    else if (part) node.appendChild(document.createTextNode(part));
  }
}

/** Render one line per interval plus Fix / Save anyway. `container` sits above the form buttons. */
export function renderPlausibilityWarnings(container, warnings, { unitSystem = getUnitSystem(), onFix, onSaveAnyway } = {}) {
  clear(container);
  if (!warnings?.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  for (const warning of warnings) {
    const from = formatIntervalClock(warning.interval.from.date, warning.interval.from.time);
    const to = formatIntervalClock(warning.interval.to.date, warning.interval.to.time);
    const implied = formatDmPerDay(warning.impliedDmKgPerDay, { unitSystem });
    const expected = formatDmPerDay(warning.expectedDmKgPerDay, { unitSystem });
    const pct = String(Math.round(warning.pct));
    const line = el('p', { className: 'form-hint', 'data-testid': 'pool-plausibility-warning' });
    appendMessage(line, t('pool.plausibility', { from, to, implied: '%%I%%', expected: '%%E%%', pct }), implied, expected);
    container.appendChild(line);
  }
  container.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { type: 'button', className: 'btn btn-outline', 'data-testid': 'pool-plausibility-fix', onClick: onFix }, [t('pool.fix')]),
    el('button', { type: 'button', className: 'btn btn-green', 'data-testid': 'pool-plausibility-save-anyway', onClick: onSaveAnyway }, [t('pool.saveAnyway')]),
  ]));
}

export function clearPlausibilityWarnings(container) {
  if (!container) return;
  clear(container);
  container.hidden = true;
}
