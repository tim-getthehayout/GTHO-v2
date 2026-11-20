/** @file Sheet page-scroll lock: open locks body/html; last close restores. */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Sheet, resetSheetScrollLock } from '../../src/ui/sheet.js';

function mountWrap(id) {
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'sheet-wrap';
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.dataset.testid = `${id}-backdrop`;
  const panel = document.createElement('div');
  panel.className = 'sheet-panel';
  panel.dataset.testid = `${id}-panel`;
  wrap.append(backdrop, panel);
  document.body.appendChild(wrap);
  return wrap;
}

afterEach(() => {
  resetSheetScrollLock();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

describe('Sheet page-scroll lock', () => {
  it('locks body and html overflow on open and restores the prior values on close', () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'scroll';
    mountWrap('lock-sheet-wrap');
    const sheet = new Sheet('lock-sheet-wrap');

    sheet.open();
    expect(sheet.isOpen()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    sheet.close();
    expect(sheet.isOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('scroll');
  });

  it('save() also restores overflow (close path)', () => {
    document.body.style.overflow = 'visible';
    mountWrap('save-sheet-wrap');
    const sheet = new Sheet('save-sheet-wrap');
    let saved = false;
    sheet.onSave = () => { saved = true; };

    sheet.open();
    expect(document.body.style.overflow).toBe('hidden');
    sheet.save();
    expect(saved).toBe(true);
    expect(document.body.style.overflow).toBe('visible');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('keeps the lock while a second sheet is open and restores only on the last close', () => {
    document.body.style.overflow = 'auto';
    mountWrap('sheet-a-wrap');
    mountWrap('sheet-b-wrap');
    const a = new Sheet('sheet-a-wrap');
    const b = new Sheet('sheet-b-wrap');

    a.open();
    b.open();
    expect(document.body.style.overflow).toBe('hidden');

    a.close();
    expect(b.isOpen()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    b.close();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('prevents touchmove on the backdrop but not on the open panel', () => {
    mountWrap('touch-sheet-wrap');
    const sheet = new Sheet('touch-sheet-wrap');
    sheet.open();

    const backdrop = document.querySelector('[data-testid="touch-sheet-wrap-backdrop"]');
    const panel = document.querySelector('[data-testid="touch-sheet-wrap-panel"]');

    const backdropMove = new Event('touchmove', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(backdropMove);
    expect(backdropMove.defaultPrevented).toBe(true);

    const panelMove = new Event('touchmove', { bubbles: true, cancelable: true });
    panel.dispatchEvent(panelMove);
    expect(panelMove.defaultPrevented).toBe(false);

    sheet.close();
    const afterClose = new Event('touchmove', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(afterClose);
    expect(afterClose.defaultPrevented).toBe(false);
  });
});

describe('sheet panel CSS scrollport', () => {
  it('uses dvh max-height, touch scrolling, contained overscroll, and min-height 0', () => {
    const css = readFileSync(resolve('src/styles/main.css'), 'utf8');
    expect(css).toMatch(/\.sheet-panel\s*\{[^}]*max-height:\s*min\(90dvh,\s*90vh\)/s);
    expect(css).toMatch(/\.sheet-panel\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.sheet-panel\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s);
    expect(css).toMatch(/\.sheet-panel\s*\{[^}]*overscroll-behavior:\s*contain/s);
    expect(css).toMatch(/body\.field-mode \.sheet-panel\s*\{[^}]*max-height:\s*min\(100dvh,\s*100vh\)/s);
  });
});
