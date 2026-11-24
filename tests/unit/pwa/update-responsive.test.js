/** @file U1 — Update now responds on tap, and falls back to a reload after 3 s. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleUpdateFallback, UPDATE_FALLBACK_MS } from '../../../src/pwa/update.js';
import { showUpdateBanner, hideUpdateBanner } from '../../../src/pwa/banner.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';

describe('scheduleUpdateFallback', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function deps(reloaded = false) {
    const calls = [];
    let done = reloaded;
    return {
      calls,
      hasReloaded: () => done,
      markReloaded: () => { done = true; calls.push('mark'); },
      clearAccepted: () => calls.push('clear'),
      reload: () => calls.push('reload'),
      setDone: () => { done = true; },
    };
  }

  it('waits 3 s by default', () => {
    expect(UPDATE_FALLBACK_MS).toBe(3000);
  });

  it('reloads once after 3 s when controllerchange has not reloaded', () => {
    const d = deps();
    scheduleUpdateFallback(d);
    vi.advanceTimersByTime(2999);
    expect(d.calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(d.calls).toEqual(['mark', 'clear', 'reload']);
  });

  it('clears the session flag before reloading, so the next page cannot loop', () => {
    const d = deps();
    scheduleUpdateFallback(d);
    vi.advanceTimersByTime(UPDATE_FALLBACK_MS);
    expect(d.calls.indexOf('clear')).toBeLessThan(d.calls.indexOf('reload'));
  });

  it('does nothing when controllerchange already reloaded', () => {
    const d = deps();
    scheduleUpdateFallback(d);
    d.setDone();
    vi.advanceTimersByTime(UPDATE_FALLBACK_MS * 2);
    expect(d.calls).toEqual([]);
  });

  it('a second timer after the first reload does not reload again', () => {
    const d = deps();
    scheduleUpdateFallback(d);
    scheduleUpdateFallback(d);
    vi.advanceTimersByTime(UPDATE_FALLBACK_MS);
    expect(d.calls.filter(c => c === 'reload')).toHaveLength(1);
  });
});

describe('Update now button', () => {
  beforeEach(() => {
    setLocale('en', en);
    hideUpdateBanner();
    document.body.innerHTML = '';
  });

  it('disables and reads Updating… on tap, before the apply work runs', () => {
    let seen = null;
    const onNow = vi.fn(() => {
      const b = document.querySelector('[data-testid="pwa-update-now"]');
      seen = { disabled: b.disabled, text: b.textContent };
    });
    showUpdateBanner({ onNow, onLater: () => {} });
    const btn = document.querySelector('[data-testid="pwa-update-now"]');
    expect(btn.textContent).toBe('Update now');
    btn.click();
    expect(onNow).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ disabled: true, text: 'Updating…' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('a second tap does not apply the update twice', () => {
    const onNow = vi.fn();
    showUpdateBanner({ onNow, onLater: () => {} });
    const btn = document.querySelector('[data-testid="pwa-update-now"]');
    btn.click();
    btn.dispatchEvent(new Event('click'));
    expect(onNow).toHaveBeenCalledTimes(1);
  });

  it('keeps Updating… when the bar is shown again while updating', () => {
    showUpdateBanner({ onNow: () => {}, onLater: () => {} });
    document.querySelector('[data-testid="pwa-update-now"]').click();
    showUpdateBanner({ onNow: () => {}, onLater: () => {} });
    const btn = document.querySelector('[data-testid="pwa-update-now"]');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Updating…');
  });

  it('Later still works', () => {
    const onLater = vi.fn();
    showUpdateBanner({ onNow: () => {}, onLater });
    document.querySelector('[data-testid="pwa-update-later"]').click();
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('has the Updating… string in the en locale', () => {
    expect(en.pwa.updating).toBe('Updating…');
  });
});
