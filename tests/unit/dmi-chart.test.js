/** @file OI-0119 — DMI chart renderer unit tests.
 *
 * Covers the five status branches + deficit segment + legend + hint chip +
 * onNoPastureData callback wiring.
 */
import { describe, it, expect } from 'vitest';
import { renderDmiChart } from '../../src/ui/dmi-chart.js';

function mkDay(date, label, result) {
  return { date, label, result };
}

function dayEl(chart, index) {
  // The chart is [barsEl, rightLabel]. barsEl.children[index] is day index.
  const barsEl = chart.children[0];
  return barsEl.children[index];
}

describe('renderDmiChart — 5 status branches', () => {
  it('no_animals renders blank space and em-dash label (no bar body)', () => {
    const days = [
      mkDay('2026-04-10', 'Fri', { status: 'no_animals' }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ];
    const chart = renderDmiChart(days, 'metric');
    const bar = dayEl(chart, 0);
    const emDash = [...bar.children].find(c => c.textContent?.includes('\u2014'));
    expect(emDash).toBeTruthy();
    // No grey short bar, no stored/pasture divs — just the em-dash + spacer + label.
    const greyBar = [...bar.querySelectorAll('div')].find(d => (d.style?.background || '').includes('var(--bg3'));
    expect(greyBar).toBeUndefined();
  });

  it('no_pasture_data / missing_observation renders "Add pre-graze" CTA + fires callback', () => {
    let fired = null;
    const days = [
      mkDay('2026-04-10', 'Fri', { status: 'no_pasture_data', reason: 'missing_observation', pwId: 'pw-1', locationId: 'loc-1' }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ];
    const chart = renderDmiChart(days, 'metric', {
      onNoPastureData: (reason, ctx) => { fired = { reason, ...ctx }; },
    });
    const bar = dayEl(chart, 0);
    const cta = [...bar.querySelectorAll('div')].find(d => d.textContent === 'Add pre-graze');
    expect(cta).toBeTruthy();
    cta.click();
    expect(fired).toEqual({ reason: 'missing_observation', pwId: 'pw-1', locationId: 'loc-1' });
  });

  it('no_pasture_data / missing_forage_type renders "Set forage type" CTA + fires callback', () => {
    let fired = null;
    const days = [
      mkDay('2026-04-10', 'Fri', { status: 'no_pasture_data', reason: 'missing_forage_type', pwId: 'pw-2', locationId: 'loc-2' }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ];
    const chart = renderDmiChart(days, 'metric', {
      onNoPastureData: (reason, ctx) => { fired = { reason, ...ctx }; },
    });
    const bar = dayEl(chart, 0);
    const cta = [...bar.querySelectorAll('div')].find(d => d.textContent === 'Set forage type');
    expect(cta).toBeTruthy();
    cta.click();
    expect(fired).toEqual({ reason: 'missing_forage_type', pwId: 'pw-2', locationId: 'loc-2' });
  });

  it('estimated with deficitKg > 0 renders red segment + "+X deficit" label', () => {
    const days = [
      mkDay('2026-04-10', 'Fri', { status: 'estimated', totalDmiKg: 200, pastureDmiKg: 50, storedDmiKg: 100, deficitKg: 50 }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ];
    const chart = renderDmiChart(days, 'metric');
    const bar = dayEl(chart, 0);
    // Label is built as [text, ' ', span]; find the span whose textContent contains "deficit".
    const deficitSpan = [...bar.querySelectorAll('span')].find(s => s.textContent?.includes('deficit'));
    expect(deficitSpan).toBeTruthy();
    expect(deficitSpan.textContent).toContain('+50');
    // Red segment exists among the stack's inner divs.
    const redSegment = [...bar.querySelectorAll('div')].find(d => (d.style?.background || '').includes('#E05656') || (d.style?.background || '').includes('224'));
    expect(redSegment).toBeTruthy();
  });

  it('legend includes the red deficit swatch only when at least one day has deficitKg > 0', () => {
    const withoutDeficit = renderDmiChart([
      mkDay('2026-04-10', 'Fri', { status: 'estimated', totalDmiKg: 200, pastureDmiKg: 200, storedDmiKg: 0, deficitKg: 0 }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ], 'metric');
    const withDeficit = renderDmiChart([
      mkDay('2026-04-10', 'Fri', { status: 'estimated', totalDmiKg: 200, pastureDmiKg: 50, storedDmiKg: 100, deficitKg: 50 }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ], 'metric');
    const legendOf = (chart) => chart.children[1]; // rightLabel
    const withoutText = legendOf(withoutDeficit).textContent;
    const withText = legendOf(withDeficit).textContent;
    expect(withoutText).not.toContain('deficit');
    expect(withText).toContain('deficit');
  });

  it('hint=assumed_full_cover renders a "(Fix cover)" chip that fires the callback', () => {
    let fired = null;
    const days = [
      mkDay('2026-04-10', 'Fri', { status: 'estimated', totalDmiKg: 200, pastureDmiKg: 200, storedDmiKg: 0, deficitKg: 0, hint: 'assumed_full_cover', pwId: 'pw-9', locationId: 'loc-9' }),
      mkDay('2026-04-11', 'Sat', { status: 'no_animals' }),
      mkDay('2026-04-12', 'Sun', { status: 'no_animals' }),
    ];
    const chart = renderDmiChart(days, 'metric', {
      onNoPastureData: (reason, ctx) => { fired = { reason, ...ctx }; },
    });
    const bar = dayEl(chart, 0);
    const chip = [...bar.querySelectorAll('div')].find(d => d.textContent === '(Fix cover)');
    expect(chip).toBeTruthy();
    chip.click();
    expect(fired).toEqual({ reason: 'assumed_full_cover', pwId: 'pw-9', locationId: 'loc-9' });
  });
});
