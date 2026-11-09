/**
 * @file Push-to-talk End / log / status must set an explicit text color.
 * Native <button> elements do not inherit color, so against dark-mode
 * --bg (#1a1a18) the browser default black text is unreadable. The three
 * side controls use color: var(--text); End and log also border with
 * var(--border2). The green mic button already sets color: #fff.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');

function ruleBody(selector) {
  const re = new RegExp(String.raw`(?:^|\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\{([^}]*)\}`);
  const m = CSS.match(re);
  if (!m) throw new Error(`missing rule for ${selector}`);
  return m[1].replace(/\s+/g, ' ').trim();
}

function relativeLuminance(hex) {
  const n = hex.replace('#', '');
  const rgb = [0, 1, 2].map((i) => {
    const c = parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('push-to-talk dark-mode contrast', () => {
  const side = ['.gtho-ptt-end', '.gtho-ptt-log', '.gtho-ptt-status'];

  it('sets color: var(--text) on End, log, and status', () => {
    for (const sel of side) {
      expect(ruleBody(sel)).toMatch(/\bcolor:\s*var\(--text\)/);
    }
  });

  it('uses var(--border2) on End and log borders; leaves the mic button alone', () => {
    expect(ruleBody('.gtho-ptt-end')).toMatch(/border:\s*1px\s+solid\s+var\(--border2/);
    expect(ruleBody('.gtho-ptt-log')).toMatch(/border:\s*1px\s+solid\s+var\(--border2/);
    expect(ruleBody('.gtho-ptt-end')).not.toMatch(/var\(--border,/);
    expect(ruleBody('.gtho-ptt-log')).not.toMatch(/var\(--border,/);
    const mic = ruleBody('.gtho-ptt-button');
    expect(mic).toMatch(/color:\s*#fff/);
    expect(mic).not.toMatch(/var\(--text\)/);
  });

  it('keeps text/background token pairs above 4.5:1 in light and dark', () => {
    // Token values from src/styles/main.css :root and prefers-color-scheme: dark.
    expect(contrastRatio('#1a1a18', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#e8e6de', '#1a1a18')).toBeGreaterThanOrEqual(4.5);
  });

  describe('computed style in both schemes', () => {
    /** @type {HTMLStyleElement} */
    let styleEl;

    beforeEach(() => {
      document.body.innerHTML = '';
      styleEl = document.createElement('style');
      // Mirror the three rules; jsdom returns unresolved var() for color.
      styleEl.textContent = `
        .gtho-ptt-end, .gtho-ptt-log, .gtho-ptt-status {
          background: var(--bg, #fff);
          color: var(--text);
        }
        .gtho-ptt-end, .gtho-ptt-log {
          border: 1px solid var(--border2, #ccc);
        }
      `;
      document.head.appendChild(styleEl);
    });

    afterEach(() => {
      styleEl.remove();
      document.documentElement.removeAttribute('style');
      document.body.innerHTML = '';
    });

    for (const [scheme, tokens] of [
      ['light', { '--bg': '#ffffff', '--text': '#1a1a18', '--border2': 'rgba(0, 0, 0, 0.2)' }],
      ['dark', { '--bg': '#1a1a18', '--text': '#e8e6de', '--border2': 'rgba(255, 255, 255, 0.18)' }],
    ]) {
      it(`resolves color to var(--text) for all three classes in ${scheme}`, () => {
        document.documentElement.style.cssText = Object.entries(tokens)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        for (const cls of ['gtho-ptt-end', 'gtho-ptt-log', 'gtho-ptt-status']) {
          const el = document.createElement(cls === 'gtho-ptt-status' ? 'div' : 'button');
          el.className = cls;
          el.textContent = cls === 'gtho-ptt-end' ? '×' : 'log';
          document.body.appendChild(el);
          // jsdom reports the declared var() rather than a resolved rgb().
          expect(getComputedStyle(el).color).toBe('var(--text)');
        }
      });
    }
  });
});
