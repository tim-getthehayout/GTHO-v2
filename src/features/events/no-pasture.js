/** @file OI-0256 — 100% Stored Feed / event_paddock_windows.no_pasture helpers. */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';

/** True when this paddock window is flagged 100% stored feed (Lv1). */
export function isNoPasturePw(pw) {
  return !!pw?.noPasture;
}

/**
 * Sk1: skip open+close pasture residual when the window is no_pasture.
 * Callers still gate confinement separately via isConfinementLocation.
 */
export function skipsPastureResidual(pw) {
  return isNoPasturePw(pw);
}

/**
 * Lv1 checkbox wired to no_pasture. Reuses i18n observations.storedFeedOnly.
 * @returns {{ container: HTMLElement, input: HTMLInputElement, isChecked: () => boolean }}
 */
export function renderStoredFeedOnlyCheckbox({ checked = false, testId = 'no-pasture-checkbox', onChange } = {}) {
  const input = el('input', {
    type: 'checkbox',
    style: { width: '18px', height: '18px', accentColor: 'var(--color-tan-base, #D4A76A)' },
    'data-testid': testId,
  });
  input.checked = !!checked;
  if (typeof onChange === 'function') {
    input.addEventListener('change', () => onChange(input.checked));
  }
  const container = el('div', {
    className: 'field',
    'data-testid': `${testId}-wrap`,
    style: { marginTop: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  }, [
    el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
    }, [input, (() => { const label = t('observations.storedFeedOnly'); return label === 'observations.storedFeedOnly' ? '100% Stored Feed' : label; })()]),
  ]);
  return {
    container,
    input,
    isChecked: () => !!input.checked,
  };
}
