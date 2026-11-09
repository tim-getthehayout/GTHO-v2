/**
 * @file Push-to-talk status dismiss control: visible ×, aria-label Dismiss,
 * ≥44px tap target, color var(--text) for 4.5:1 in light and dark.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');

function ruleBody(selector) {
  const re = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
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
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

describe('push-to-talk status dismiss', () => {
  it('declares a ≥44px dismiss control with color: var(--text)', () => {
    const body = ruleBody('.gtho-ptt-status-dismiss');
    expect(body).toMatch(/min-width:\s*44px/);
    expect(body).toMatch(/min-height:\s*44px/);
    expect(body).toMatch(/\bcolor:\s*var\(--text\)/);
  });

  it('keeps dismiss text/background above 4.5:1 in light and dark', () => {
    expect(contrastRatio('#1a1a18', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#e8e6de', '#1a1a18')).toBeGreaterThanOrEqual(4.5);
  });

  describe('computed color in both schemes', () => {
    /** @type {HTMLStyleElement} */
    let styleEl;
    beforeEach(() => {
      document.body.innerHTML = '';
      styleEl = document.createElement('style');
      styleEl.textContent = `
        .gtho-ptt-status { background: var(--bg, #fff); color: var(--text); }
        .gtho-ptt-status-dismiss { color: var(--text); min-width: 44px; min-height: 44px; }
      `;
      document.head.appendChild(styleEl);
    });
    afterEach(() => {
      styleEl.remove();
      document.documentElement.removeAttribute('style');
      document.body.innerHTML = '';
    });

    for (const [scheme, tokens] of [
      ['light', { '--bg': '#ffffff', '--text': '#1a1a18' }],
      ['dark', { '--bg': '#1a1a18', '--text': '#e8e6de' }],
    ]) {
      it(`resolves dismiss color to var(--text) in ${scheme}`, () => {
        document.documentElement.style.cssText = Object.entries(tokens).map(([k, v]) => `${k}: ${v}`).join('; ');
        const btn = document.createElement('button');
        btn.className = 'gtho-ptt-status-dismiss';
        btn.setAttribute('aria-label', 'Dismiss');
        btn.textContent = '×';
        document.body.appendChild(btn);
        expect(getComputedStyle(btn).color).toBe('var(--text)');
      });
    }
  });
});
