/** @file Login/signup overlay shows the same build stamp as the header. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { renderAuthOverlay } from '../../../src/features/auth/index.js';
import { buildStampLabel } from '../../../src/ui/build-stamp.js';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  document.body.innerHTML = '';
});

function mountOverlay() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderAuthOverlay(container, () => {});
  return container;
}

describe('login overlay build stamp', () => {
  it('shows the header stamp on the login card before authentication', () => {
    const container = mountOverlay();
    const stamps = container.querySelectorAll('[data-testid="header-build-stamp"]');
    expect(stamps).toHaveLength(1);

    const stamp = stamps[0];
    expect(stamp.classList.contains('header-build-stamp')).toBe(true);
    expect(stamp.textContent).toBe(buildStampLabel());
    expect(stamp.textContent).toMatch(/^b\d{4}-\d{2}-\d{2}\.\d{4}-[0-9a-f]+$/);
    expect(stamp.closest('[data-testid="auth-overlay"]')).toBeTruthy();
    expect(stamp.closest('.auth-card')).toBeTruthy();
    expect(container.querySelector('[data-testid="app-header"]')).toBeNull();
  });

  it('keeps the same stamp after switching to signup', () => {
    const container = mountOverlay();
    const before = container.querySelector('[data-testid="header-build-stamp"]').textContent;

    container.querySelector('[data-testid="auth-toggle"]').click();

    expect(container.querySelector('[data-testid="auth-mode"]').textContent).toBe('Sign Up');
    const stamp = container.querySelector('[data-testid="header-build-stamp"]');
    expect(stamp).toBeTruthy();
    expect(stamp.classList.contains('header-build-stamp')).toBe(true);
    expect(stamp.textContent).toBe(before);
    expect(stamp.textContent).toBe(buildStampLabel());
  });
});
