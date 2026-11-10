/** @file OI-0209 — inactive forage wrap, shared feed-days line, calendar type. */
import { describe, it, expect } from 'vitest';
import { el } from '../../src/ui/dom.js';
import { wrapInactiveForage, renderInactiveForageSummary } from '../../src/features/events/confinement-forage-ui.js';
import { renderEstimatedFutureBlock } from '../../src/features/events/rotation-calendar/future-block.js';
import { formatFeedRemainingLabel, FEED_REMAINING_ESTIMATE_CAPTION } from '../../src/calcs/event-feed-days.js';

describe('confinement forage UI (OI-0209)', () => {
  it('keeps forage information visible, greyed out, and inactive', () => {
    const button = el('button', { type: 'button' }, ['Set forage type']);
    const input = el('input', { type: 'text', value: '12' });
    const card = el('div', {}, [button, input]);
    const wrapped = wrapInactiveForage(card, 'forage-inactive');
    document.body.appendChild(wrapped);
    expect(wrapped.className).toContain('confinement-forage-inactive');
    expect(wrapped.getAttribute('aria-disabled')).toBe('true');
    expect(wrapped.textContent).toContain('Set forage type');
    expect(wrapped.querySelector('button').disabled).toBe(true);
    expect(wrapped.querySelector('input').disabled).toBe(true);
    wrapped.remove();
  });

  it('renders a visible greyed forage summary without a CTA', () => {
    const node = renderInactiveForageSummary({
      forageTypeName: null,
      heightDisplay: '',
      testId: 'forage-summary',
    });
    expect(node.className).toContain('confinement-forage-inactive');
    expect(node.textContent).toMatch(/Forage:/);
    expect(node.textContent).not.toContain('Set forage type');
    expect(node.textContent).not.toContain('Capacity: add');
  });

  it('formats the shared feed-days label with 2 decimal places', () => {
    expect(formatFeedRemainingLabel(5.42)).toBe('Est. feed remaining: ~5.42 days');
    expect(formatFeedRemainingLabel(0)).toBe('Est. feed remaining: ~0.00 days');
    expect(FEED_REMAINING_ESTIMATE_CAPTION).toBe('end-of-today daily-model estimate');
  });

  it('calendar confinement future blocks are greyed out and do not request a survey', () => {
    const node = renderEstimatedFutureBlock({
      leftPx: 0, widthPx: 40, minDate: '', maxDate: '', confidence: 'min',
      isNeverGrazed: true, isGrazingInProgress: false, hayEstimateLbs: '12',
      locationId: 'loc-corral', onClickBlock: () => { throw new Error('survey should not run'); },
      forageInactive: true,
    });
    expect(node.className).toContain('confinement-forage-inactive');
    expect(node.getAttribute('aria-disabled')).toBe('true');
    expect(node.textContent).not.toContain('survey to confirm');
    expect(node.getAttribute('role')).not.toBe('button');
    node.click();
  });
});
