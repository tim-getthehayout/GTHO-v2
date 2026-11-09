/**
 * @file Theme contrast for named surfaces against the REAL main.css stylesheet.
 * Resolves declared color/background var() chains against light and dark token
 * blocks parsed from :root, and asserts ≥4.5:1 in both schemes.
 *
 * Hardcoded light-mode backgrounds left alone (for the PR):
 * - .now-chip { background: #fff; color: var(--color-green-dark) }
 *   Not switched to var(--bg): --color-green-dark (#3B6D11) on dark --bg
 *   (#1a1a18) is only ~2.8:1; fixing it needs a new color or a design choice.
 * - dashboard inline chips in src/features/dashboard/index.js:
 *   #F4F8EC / #3B6D11 (event-type chip) and #FDF6EA / #8B6914 (button)
 * - light tint tokens used as surfaces without a dark remap: --green-l /
 *   --*-light on .dsk-nav-item.active, .batch-sel.on, .cat-pill.cp-*.sel,
 *   .bt/.ba/.bp/.br, .badge-*, .loc-picker-item.selected,
 *   .dest-type-card.selected, etc.
 * Animals selected group uses --surface-selected (this commit).
 * .obs-compact-input / .obs-input / .active-rotation-banner__chip use var(--bg).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');

/** Strip comments for simpler parsing. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Parse simple `selector { decls }` rules (no nested @media bodies as selectors). */
function parseRules(css) {
  const rules = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@')) continue;
    const decls = {};
    for (const part of m[2].split(';')) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      if (prop) decls[prop] = val;
    }
    rules.push({ selectors: sel.split(',').map(s => s.trim()).filter(Boolean), decls, rawSel: sel });
  }
  return rules;
}

/** Extract :root custom properties from a block of CSS text. */
function parseRootTokens(block) {
  const tokens = {};
  const root = block.match(/:root\s*\{([^{}]*)\}/);
  if (!root) return tokens;
  for (const part of root[1].split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (prop.startsWith('--')) tokens[prop] = val;
  }
  return tokens;
}

function lightAndDarkTokens(css) {
  const plain = stripComments(css);
  // Light: first :root outside the dark media query.
  const darkMedia = plain.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]*?)\n\}/);
  const withoutDark = darkMedia ? plain.replace(darkMedia[0], '') : plain;
  const light = parseRootTokens(withoutDark);
  const dark = { ...light, ...parseRootTokens(darkMedia ? darkMedia[1] : '') };
  return { light, dark };
}

/** Resolve var(--x, fallback) / var(--x) against a token map; hex/rgb pass through. */
function resolveValue(value, tokens, depth = 0) {
  if (!value || depth > 12) return value;
  let out = value.trim();
  // var(--name) or var(--name, fallback)
  const varRe = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/i;
  let guard = 0;
  while (varRe.test(out) && guard++ < 20) {
    out = out.replace(varRe, (_, name, fallback) => {
      if (tokens[name] != null) return tokens[name];
      if (fallback != null) return fallback.trim();
      return _;
    });
  }
  return out.trim();
}

function parseHex(color) {
  const c = color.trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/.test(c)) return c;
  if (/^#([0-9a-f]{3})$/.test(c)) {
    const h = c.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  const rgb = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb) {
    const hex = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${hex(+rgb[1])}${hex(+rgb[2])}${hex(+rgb[3])}`;
  }
  return null;
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

/**
 * Find the most specific simple rule whose selector list contains `needle`
 * exactly as one comma-separated selector (trimmed). Later rules win on ties.
 */
function findRule(rules, needle) {
  let found = null;
  for (const rule of rules) {
    if (rule.selectors.includes(needle)) found = rule;
  }
  return found;
}

function declared(rule, prop) {
  return rule?.decls?.[prop] ?? null;
}

/**
 * Effective color/background for a control selector.
 * Falls back to the base `input`/`textarea`/`select`/`button` rule for color,
 * and to page `--bg` for background when the surface does not set one.
 */
function surfaceStyles(rules, selector, { tag = 'input', pageBg = 'var(--bg)' } = {}) {
  const rule = findRule(rules, selector);
  const base = findRule(rules, tag);
  const color = declared(rule, 'color') || declared(base, 'color') || 'var(--text)';
  const background = declared(rule, 'background')
    || declared(rule, 'background-color')
    || declared(base, 'background')
    || declared(base, 'background-color')
    || pageBg;
  return { color, background, rule, base };
}

function placeholderColor(rules) {
  const rule = findRule(rules, 'input::placeholder') || findRule(rules, 'textarea::placeholder');
  return declared(rule, 'color') || 'var(--text2)';
}

const { light: LIGHT, dark: DARK } = lightAndDarkTokens(CSS);
const RULES = parseRules(stripComments(CSS));

describe('theme tokens and base rule from real main.css', () => {
  it('sets color-scheme: light dark on :root', () => {
    expect(CSS).toMatch(/:root\s*\{[^}]*color-scheme:\s*light\s+dark/s);
  });

  it('parses light and dark --text / --bg / --surface-selected', () => {
    expect(parseHex(resolveValue(LIGHT['--text'], LIGHT))).toBe('#1a1a18');
    expect(parseHex(resolveValue(LIGHT['--bg'], LIGHT))).toBe('#ffffff');
    expect(parseHex(resolveValue(LIGHT['--surface-selected'], LIGHT))).toBe('#eaf3de');
    expect(parseHex(resolveValue(DARK['--text'], DARK))).toBe('#e8e6de');
    expect(parseHex(resolveValue(DARK['--bg'], DARK))).toBe('#1a1a18');
    expect(parseHex(resolveValue(DARK['--surface-selected'], DARK))).toBe('#2c2c28');
  });

  it('themes input, textarea, select, button and placeholders once', () => {
    for (const tag of ['input', 'textarea', 'select', 'button']) {
      const rule = findRule(RULES, tag);
      expect(rule, tag).toBeTruthy();
      expect(declared(rule, 'color')).toBe('var(--text)');
      expect(declared(rule, 'font')).toBe('inherit');
    }
    expect(placeholderColor(RULES)).toBe('var(--text2)');
  });
});

describe('real-stylesheet contrast ≥ 4.5:1 in both schemes', () => {
  /** @type {Array<{ name: string, selector: string, tag?: string, colorDecl?: string, bgDecl?: string, bgFallback?: string }>} */
  const surfaces = [
    { name: 'input', selector: 'input', tag: 'input' },
    { name: 'textarea', selector: 'textarea', tag: 'textarea' },
    { name: 'select', selector: 'select', tag: 'select' },
    { name: 'button', selector: 'button', tag: 'button' },
    { name: 'placeholder', selector: 'input::placeholder', tag: 'input', colorDecl: 'var(--text2)', bgDecl: 'var(--bg)' },
    { name: '.field input', selector: '.field input', tag: 'input' },
    { name: '.obs-compact-input', selector: '.obs-compact-input', tag: 'input' },
    { name: '.obs-input', selector: '.obs-input', tag: 'input' },
    { name: '.events-log__filter select', selector: '.events-log__filter select', tag: 'select' },
    // Assistant sheet text box is a bare <input data-testid="assistant-text"> — base input rule.
    { name: 'assistant-text (base input)', selector: 'input', tag: 'input' },
    { name: '.gtho-ptt-end', selector: '.gtho-ptt-end', tag: 'button' },
    { name: '.gtho-ptt-log', selector: '.gtho-ptt-log', tag: 'button' },
    { name: '.groups-grid-tile--selected', selector: '.groups-grid-tile--selected', tag: 'div', bgFallback: 'var(--surface-selected)' },
    { name: 'selected tile outline pill (.btn-outline)', selector: '.btn-outline', tag: 'button', bgFallback: 'var(--surface-selected)' },
  ];

  function resolvedPair(surface, tokens) {
    let colorDecl = surface.colorDecl;
    let bgDecl = surface.bgDecl;
    if (!colorDecl || !bgDecl) {
      const styles = surfaceStyles(RULES, surface.selector, {
        tag: surface.tag || 'input',
        pageBg: surface.bgFallback || 'var(--bg)',
      });
      colorDecl = colorDecl || styles.color;
      bgDecl = bgDecl || styles.background;
      // Selected tile sets only background; text inherits page --text.
      if (surface.selector === '.groups-grid-tile--selected') {
        colorDecl = 'var(--text)';
        bgDecl = styles.background || 'var(--surface-selected)';
      }
      // Outline pill on selected tile: button color on the tile's selected bg.
      if (surface.selector === '.btn-outline') {
        colorDecl = styles.color || 'var(--text)';
        bgDecl = 'var(--surface-selected)';
      }
    }
    const fg = parseHex(resolveValue(colorDecl, tokens));
    const bg = parseHex(resolveValue(bgDecl, tokens));
    return { colorDecl, bgDecl, fg, bg };
  }

  for (const [scheme, tokens] of [['light', LIGHT], ['dark', DARK]]) {
    describe(scheme, () => {
      for (const surface of surfaces) {
        it(`${surface.name} contrast`, () => {
          const { colorDecl, bgDecl, fg, bg } = resolvedPair(surface, tokens);
          expect(fg, `${surface.name} fg from ${colorDecl}`).toBeTruthy();
          expect(bg, `${surface.name} bg from ${bgDecl}`).toBeTruthy();
          const ratio = contrastRatio(fg, bg);
          expect(ratio, `${surface.name} ${fg} on ${bg} (${colorDecl} / ${bgDecl}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }
});
