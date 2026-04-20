/** @file Shared DMI 3-day stacked bar chart — used by event detail sheet and dashboard card.
 *
 * OI-0119 — five statuses + deficit segment + no_pasture_data CTAs.
 * Status branches: actual | estimated | needs_check | no_animals | no_pasture_data.
 * `estimated` with `deficitKg > 0` renders a red segment atop the stored stack.
 * `hint: 'assumed_full_cover'` emits a small "(Fix cover)" chip beneath the bar.
 */

import { el } from './dom.js';
import { convert } from '../utils/units.js';

const COLOR_PASTURE = '#A5C56B';
const COLOR_PASTURE_STRIPED = 'repeating-linear-gradient(45deg, #A5C56B, #A5C56B 4px, #C2DB9B 4px, #C2DB9B 8px)';
const COLOR_STORED = 'var(--color-amber-base)';
const COLOR_STORED_STRIPED = 'repeating-linear-gradient(45deg, var(--color-amber-base), var(--color-amber-base) 4px, #E5C76B 4px, #E5C76B 8px)';
const COLOR_DEFICIT = '#E05656';
const COLOR_DEFICIT_STRIPED = 'repeating-linear-gradient(45deg, #E05656, #E05656 4px, #F0A0A0 4px, #F0A0A0 8px)';
const COLOR_GREY_BAR = 'var(--bg3, #eee)';

/**
 * Render a 3-day DMI stacked bar chart.
 * @param {Array<{ date: string, label: string, result: { status: string, totalDmiKg?: number, storedDmiKg?: number, pastureDmiKg?: number, deficitKg?: number, reason?: string, pwId?: string, locationId?: string, hint?: string } }>} days - 3 entries, oldest first
 * @param {string} unitSys - 'imperial' or 'metric'
 * @param {object} [opts]
 * @param {boolean} [opts.compact]
 * @param {(reason: string, ctx: { pwId?: string, locationId?: string }) => void} [opts.onNoPastureData] - CTA callback for no_pasture_data + assumed_full_cover.
 * @returns {HTMLElement}
 */
export function renderDmiChart(days, unitSys, opts = {}) {
  const compact = opts.compact ?? false;
  const barHeight = compact ? 80 : 120;

  // Find max total for scaling — include deficit so deficit segments sit inside
  // the same scale as pasture + stored rather than overflowing.
  let maxKg = 0;
  for (const d of days) {
    const r = d.result;
    const dayTotal = (r.totalDmiKg || 0) + (r.deficitKg || 0);
    if (dayTotal > maxKg) maxKg = dayTotal;
  }
  if (maxKg <= 0) maxKg = 1;

  // Metric is stored internally, so metric display is identity; imperial converts.
  const toDisplay = (kg) => unitSys === 'imperial' ? convert(kg, 'weight', 'toImperial') : kg;
  const unit = unitSys === 'imperial' ? 'lbs' : 'kg';

  // Right-side today value uses the most recent bar that has a total.
  const todayResult = days[days.length - 1]?.result;
  const todayDmi = todayResult?.totalDmiKg ? toDisplay(todayResult.totalDmiKg).toFixed(0) : '\u2014';

  const anyDeficit = days.some(d => (d.result?.deficitKg || 0) > 0);

  const barsEl = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end', flex: '1' } });

  for (const d of days) {
    const r = d.result || {};

    // no_animals: blank space at bar height, em-dash label, day label only.
    if (r.status === 'no_animals') {
      barsEl.appendChild(el('div', { style: { flex: '1', textAlign: 'center' } }, [
        el('div', { style: { fontSize: '10px', color: 'var(--text3, #999)', marginBottom: '4px' } }, ['\u2014']),
        el('div', { style: { height: `${barHeight}px` } }),
        el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, [d.label]),
      ]));
      continue;
    }

    // no_pasture_data: grey short bar + label + CTA link.
    if (r.status === 'no_pasture_data') {
      const reason = r.reason || 'missing_observation';
      const ctaText = reason === 'missing_forage_type' ? 'Set forage type' : 'Add pre-graze';
      const children = [
        el('div', { style: { fontSize: '10px', color: 'var(--text3, #999)', marginBottom: '4px' } }, ['\u2014']),
        el('div', { style: { height: `${barHeight * 0.3}px`, background: COLOR_GREY_BAR, borderRadius: '4px 4px 0 0' } }),
        el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, [d.label]),
      ];
      if (opts.onNoPastureData) {
        children.push(el('div', {
          style: { fontSize: '9px', color: 'var(--color-teal-base)', cursor: 'pointer', marginTop: '2px' },
          onClick: () => opts.onNoPastureData(reason, { pwId: r.pwId, locationId: r.locationId }),
        }, [ctaText]));
      } else {
        children.push(el('div', { style: { fontSize: '9px', color: 'var(--text2)', marginTop: '2px' } }, [ctaText]));
      }
      barsEl.appendChild(el('div', { style: { flex: '1', textAlign: 'center' } }, children));
      continue;
    }

    // needs_check: legacy fallback. Grey short bar.
    if (r.status === 'needs_check') {
      barsEl.appendChild(el('div', { style: { flex: '1', textAlign: 'center' } }, [
        el('div', { style: { fontSize: '10px', color: 'var(--text3, #999)', marginBottom: '4px' } }, ['\u2014']),
        el('div', { style: { height: `${barHeight * 0.3}px`, background: COLOR_GREY_BAR, borderRadius: '4px 4px 0 0' } }),
        el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, ['Feed check needed']),
        el('div', { style: { fontSize: '10px', color: 'var(--text2)' } }, [d.label]),
      ]));
      continue;
    }

    // actual | estimated: stacked pasture + stored (+ deficit on top when estimated).
    const isEstimated = r.status === 'estimated';
    const pasture = r.pastureDmiKg || 0;
    const stored = r.storedDmiKg || 0;
    const deficit = r.deficitKg || 0;
    const total = r.totalDmiKg || 0;
    const totalDisplay = toDisplay(total).toFixed(0);
    const deficitDisplay = deficit > 0 ? toDisplay(deficit).toFixed(0) : null;

    const pastureH = (pasture / maxKg) * barHeight;
    const storedH = (stored / maxKg) * barHeight;
    const deficitH = (deficit / maxKg) * barHeight;

    const pastureStyle = {
      height: `${pastureH}px`,
      background: isEstimated ? COLOR_PASTURE_STRIPED : COLOR_PASTURE,
      borderRadius: deficit > 0 || stored > 0 ? '0' : '4px 4px 0 0',
    };
    const storedStyle = {
      height: `${storedH}px`,
      background: isEstimated ? COLOR_STORED_STRIPED : COLOR_STORED,
      borderRadius: deficit > 0 ? '0' : (pasture > 0 ? '0' : '4px 4px 0 0'),
    };
    const deficitStyle = {
      height: `${deficitH}px`,
      background: isEstimated ? COLOR_DEFICIT_STRIPED : COLOR_DEFICIT,
      borderRadius: '4px 4px 0 0',
    };

    // Stack top-to-bottom: deficit (top) → pasture → stored (bottom).
    // Column is flex-column with justify-content: flex-end (bottom-anchored).
    const stackChildren = [];
    if (deficitH > 0) stackChildren.push(el('div', { style: deficitStyle }));
    if (pastureH > 0) stackChildren.push(el('div', { style: pastureStyle }));
    if (storedH > 0) stackChildren.push(el('div', { style: storedStyle }));
    // Fallback zero-height container to keep layout consistent.
    if (stackChildren.length === 0) stackChildren.push(el('div', { style: { height: '0px' } }));

    const labelText = d.label + (isEstimated ? ' (est.)' : '');
    const labelChildren = [labelText];
    if (deficitDisplay) {
      labelChildren.push(' ');
      labelChildren.push(el('span', {
        style: { color: COLOR_DEFICIT, fontWeight: '600' },
      }, [`+${deficitDisplay} deficit`]));
    }

    const barContent = [
      el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginBottom: '4px' } }, [totalDisplay]),
      el('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: `${barHeight}px` } }, stackChildren),
      el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, labelChildren),
    ];

    // Hint chip (e.g., "(Fix cover)" when cover was null and defaulted to 100).
    if (r.hint === 'assumed_full_cover') {
      const chipProps = {
        style: {
          fontSize: '9px',
          color: 'var(--color-teal-base)',
          marginTop: '2px',
          cursor: opts.onNoPastureData ? 'pointer' : 'default',
        },
      };
      if (opts.onNoPastureData) {
        chipProps.onClick = () => opts.onNoPastureData('assumed_full_cover', { pwId: r.pwId, locationId: r.locationId });
      }
      barContent.push(el('div', chipProps, ['(Fix cover)']));
    }

    barsEl.appendChild(el('div', { style: { flex: '1', textAlign: 'center' } }, barContent));
  }

  // Legend — always-on swatches + deficit only when present.
  const legendChildren = [
    el('span', {}, [
      el('span', { style: { display: 'inline-block', width: '8px', height: '8px', background: COLOR_PASTURE, borderRadius: '2px', marginRight: '3px' } }),
      'grazing',
    ]),
    el('span', {}, [
      el('span', { style: { display: 'inline-block', width: '8px', height: '8px', background: COLOR_STORED, borderRadius: '2px', marginRight: '3px' } }),
      'stored',
    ]),
  ];
  if (anyDeficit) {
    legendChildren.push(el('span', {}, [
      el('span', { style: { display: 'inline-block', width: '8px', height: '8px', background: COLOR_DEFICIT, borderRadius: '2px', marginRight: '3px' } }),
      'deficit',
    ]));
  }

  const rightLabel = el('div', { style: { textAlign: 'right', minWidth: compact ? '60px' : '80px', paddingLeft: '8px' } }, [
    el('div', { style: { fontSize: compact ? '18px' : '26px', fontWeight: '700', color: 'var(--text1)' } }, [todayDmi]),
    el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${unit} DMI today`]),
    el('div', { style: { display: 'flex', gap: '8px', marginTop: '6px', fontSize: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, legendChildren),
  ]);

  return el('div', { style: { display: 'flex', alignItems: 'flex-end' } }, [barsEl, rightLabel]);
}
