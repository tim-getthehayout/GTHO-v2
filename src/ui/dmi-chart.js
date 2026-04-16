/** @file Shared DMI 3-day stacked bar chart — used by event detail sheet and dashboard card. */

import { el } from './dom.js';
import { convert } from '../utils/units.js';
import { t } from '../i18n/i18n.js';

/**
 * Render a 3-day DMI stacked bar chart.
 * @param {Array<{ date: string, label: string, result: { status: string, totalDmiKg?: number, storedDmiKg?: number, pastureDmiKg?: number } }>} days - 3 entries, oldest first
 * @param {string} unitSys - 'imperial' or 'metric'
 * @param {object} [opts] - { compact: boolean } for dashboard card sizing
 * @returns {HTMLElement}
 */
export function renderDmiChart(days, unitSys, opts = {}) {
  const compact = opts.compact ?? false;
  const barHeight = compact ? 80 : 120;

  // Find max total for scaling
  let maxKg = 0;
  for (const d of days) {
    if (d.result.totalDmiKg && d.result.totalDmiKg > maxKg) maxKg = d.result.totalDmiKg;
  }
  if (maxKg <= 0) maxKg = 1;

  const toDisplay = (kg) => convert(kg, 'weight', unitSys === 'imperial' ? 'toImperial' : 'toMetric');
  const unit = unitSys === 'imperial' ? 'lbs' : 'kg';

  // Today's value for the right-side label
  const todayResult = days[days.length - 1]?.result;
  const todayDmi = todayResult?.totalDmiKg ? toDisplay(todayResult.totalDmiKg).toFixed(0) : '—';

  const barsEl = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end', flex: '1' } });

  for (const d of days) {
    const r = d.result;

    if (r.status === 'needs_check') {
      // Grey bar
      barsEl.appendChild(el('div', { style: { flex: '1', textAlign: 'center' } }, [
        el('div', { style: { fontSize: '10px', color: 'var(--text3, #999)', marginBottom: '4px' } }, ['—']),
        el('div', {
          style: { height: `${barHeight * 0.3}px`, background: 'var(--bg3, #eee)', borderRadius: '4px 4px 0 0' },
        }),
        el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, [d.label]),
      ]));
      continue;
    }

    const totalDisplay = toDisplay(r.totalDmiKg).toFixed(0);
    const pastureH = maxKg > 0 ? (r.pastureDmiKg / maxKg) * barHeight : 0;
    const storedH = maxKg > 0 ? (r.storedDmiKg / maxKg) * barHeight : 0;
    const isEstimated = r.status === 'estimated';

    const pastureStyle = {
      height: `${pastureH}px`,
      background: isEstimated
        ? 'repeating-linear-gradient(45deg, #A5C56B, #A5C56B 4px, #C2DB9B 4px, #C2DB9B 8px)'
        : '#A5C56B',
      borderRadius: `4px 4px 0 0`,
    };

    const storedStyle = {
      height: `${storedH}px`,
      background: isEstimated
        ? 'repeating-linear-gradient(45deg, var(--color-amber-base), var(--color-amber-base) 4px, #E5C76B 4px, #E5C76B 8px)'
        : 'var(--color-amber-base)',
    };

    barsEl.appendChild(el('div', { style: { flex: '1', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginBottom: '4px' } }, [`${totalDisplay}`]),
      el('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' } }, [
        el('div', { style: pastureStyle }),
        storedH > 0 ? el('div', { style: storedStyle }) : null,
      ].filter(Boolean)),
      el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, [
        d.label + (isEstimated ? ' (est.)' : ''),
      ]),
    ]));
  }

  // Right-side today value
  const rightLabel = el('div', { style: { textAlign: 'right', minWidth: compact ? '60px' : '80px', paddingLeft: '8px' } }, [
    el('div', { style: { fontSize: compact ? '18px' : '26px', fontWeight: '700', color: 'var(--text1)' } }, [todayDmi]),
    el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${unit} DMI today`]),
    el('div', { style: { display: 'flex', gap: '8px', marginTop: '6px', fontSize: '10px' } }, [
      el('span', {}, [
        el('span', { style: { display: 'inline-block', width: '8px', height: '8px', background: '#A5C56B', borderRadius: '2px', marginRight: '3px' } }),
        'grazing',
      ]),
      el('span', {}, [
        el('span', { style: { display: 'inline-block', width: '8px', height: '8px', background: 'var(--color-amber-base)', borderRadius: '2px', marginRight: '3px' } }),
        'stored',
      ]),
    ]),
  ]);

  return el('div', { style: { display: 'flex', alignItems: 'flex-end' } }, [barsEl, rightLabel]);
}
