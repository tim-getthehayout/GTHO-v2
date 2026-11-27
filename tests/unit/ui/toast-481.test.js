/** @file #481 — shared toast helper: every former local copy keeps its exact DOM and timers. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { el } from '../../../src/ui/dom.js';
import { showToast, showExportToast } from '../../../src/ui/toast.js';

const INLINE = { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', zIndex: '400', maxWidth: '90%' };
const ROW = { ...INLINE, display: 'flex', alignItems: 'center', gap: '10px' };
const FIELD = { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'var(--green)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', zIndex: '500', opacity: '1', transition: 'opacity 0.5s', pointerEvents: 'none', fontFamily: 'inherit' };

beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('showToast — default inline toast (ui/toast, store window-closed, cull)', () => {
  it('matches the pre-#481 DOM byte for byte', () => {
    const t = showToast('Hello', 'window-closed-toast');
    const legacy = document.createElement('div');
    legacy.setAttribute('data-testid', 'window-closed-toast');
    legacy.textContent = 'Hello';
    legacy.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 14px;border-radius:8px;font-size:13px;z-index:400;max-width:90%;';
    expect(t.outerHTML).toBe(legacy.outerHTML);
    expect(t.outerHTML).toBe(el('div', { 'data-testid': 'window-closed-toast', style: INLINE }, ['Hello']).outerHTML);
    expect(t.parentNode).toBe(document.body);
  });

  it('defaults to data-testid="toast" and removes after 4 s', () => {
    showToast('x');
    expect(document.querySelectorAll('[data-testid="toast"]')).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(document.querySelector('[data-testid="toast"]')).toBeTruthy();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('replaces a toast with the same testid, leaves other testids alone', () => {
    showToast('a', 'one');
    showToast('b', 'two');
    showToast('c', 'one');
    expect([...document.querySelectorAll('[data-testid="one"]')].map(n => n.textContent)).toEqual(['c']);
    expect(document.querySelector('[data-testid="two"]').textContent).toBe('b');
  });

  it('custom duration (cull toasts: 5 s)', () => {
    showToast('culled', 'cull-toast', { duration: 5000 });
    vi.advanceTimersByTime(4999);
    expect(document.querySelector('[data-testid="cull-toast"]')).toBeTruthy();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('[data-testid="cull-toast"]')).toBeNull();
  });
});

describe('showExportToast — .export-toast look (settings, v1 import, members, invite)', () => {
  it('matches the pre-#481 DOM and timer', () => {
    const t = showExportToast('Saved');
    expect(t.outerHTML).toBe(el('div', { className: 'export-toast', 'data-testid': 'export-toast' }, ['Saved']).outerHTML);
    const m = showExportToast('Member', 'member-toast');
    expect(m.outerHTML).toBe(el('div', { className: 'export-toast', 'data-testid': 'member-toast' }, ['Member']).outerHTML);
    vi.advanceTimersByTime(4000);
    expect(document.querySelector('.export-toast')).toBeNull();
  });
});

describe('field-mode toast — custom style, no testid, fade then remove', () => {
  it('matches the pre-#481 DOM, stacks, fades at 2 s and is removed at 2.5 s', () => {
    const a = showToast('Heat recorded', null, { style: FIELD, duration: 2500, fadeAfter: 2000 });
    showToast('Heat recorded', null, { style: FIELD, duration: 2500, fadeAfter: 2000 });
    expect(a.outerHTML).toBe(el('div', { style: FIELD }, ['Heat recorded']).outerHTML);
    expect(a.hasAttribute('data-testid')).toBe(false);
    expect(document.body.children).toHaveLength(2);
    vi.advanceTimersByTime(2000);
    expect(a.style.opacity).toBe('0');
    expect(a.isConnected).toBe(true);
    vi.advanceTimersByTime(500);
    expect(document.body.children).toHaveLength(0);
  });
});

describe('row toasts with an action (edit feed check, cull / split undo)', () => {
  it('edit-feed-check variant matches the pre-#481 DOM; click removes then runs the action', () => {
    const onClick = vi.fn();
    const btnStyle = { background: 'transparent', color: 'var(--bg)', border: '0.5px solid var(--bg)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' };
    const t = showToast('Re-snap', 'edit-fc-toast', { duration: 6000, messageStyle: { flex: '1' }, action: { label: 'Feed check', style: btnStyle, onClick } });
    const legacy = el('div', { 'data-testid': 'edit-fc-toast', style: ROW }, [
      el('span', { style: { flex: '1' } }, ['Re-snap']),
      el('button', { style: btnStyle }, ['Feed check']),
    ]);
    expect(t.outerHTML).toBe(legacy.outerHTML);
    t.querySelector('button').click();
    expect(document.querySelector('[data-testid="edit-fc-toast"]')).toBeNull();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('undo variant matches the pre-#481 DOM and stays 8 s', () => {
    const undoStyle = { color: 'var(--bg)', borderColor: 'var(--bg)', flexShrink: '0' };
    const t = showToast('Split saved.', 'split-toast', { duration: 8000, action: { label: 'Undo', className: 'btn btn-outline btn-xs', testid: 'split-undo-btn', style: undoStyle, onClick: () => {} } });
    const legacy = el('div', { 'data-testid': 'split-toast', style: ROW }, [
      el('span', {}, ['Split saved.']),
      el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'split-undo-btn', style: undoStyle }, ['Undo']),
    ]);
    expect(t.outerHTML).toBe(legacy.outerHTML);
    vi.advanceTimersByTime(7999);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(t.isConnected).toBe(false);
  });
});
