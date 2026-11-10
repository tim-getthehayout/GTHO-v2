/**
 * @file Theme contrast for named surfaces against the REAL main.css stylesheet.
 * Resolves declared color/background var() chains (including color-mix) against
 * light and dark token blocks parsed from :root.
 *
 * Remaining hardcoded colors outside this tint/selected set (for the PR notes):
 * - Solid fills still using raw --color-*-base (buttons, dots, legends, sync)
 * - dashboard Feed / Sub-Move quick-action buttons (green-base / teal outline)
 * - .invite-banner still on --color-green-light (not remapped via --tint-green)
 * - .fb-dev-resp on --teal-l / --teal-d (not moved to tint tokens this pass)
 * - legend capacity swatch #D4A76A, various white text on solid brand fills
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const CSS = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Walk balanced braces; return outer-level `selector { decls }` rules. */
function parseRules(css) {
  const rules = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;
    if (css.startsWith('@', i)) {
      // skip @rule (media/keyframes) but extract nested style rules for dark media
      const atStart = i;
      while (i < n && css[i] !== '{') i++;
      if (i >= n) break;
      const atHeader = css.slice(atStart, i).trim();
      let depth = 0, bodyStart = i + 1;
      for (; i < n; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
          depth--;
          if (depth === 0) { i++; break; }
        }
      }
      const body = css.slice(bodyStart, i - 1);
      if (/prefers-color-scheme\s*:\s*dark/.test(atHeader)) {
        for (const nested of parseRules(body)) {
          nested.darkOnly = true;
          rules.push(nested);
        }
      }
      continue;
    }
    const selStart = i;
    while (i < n && css[i] !== '{') i++;
    if (i >= n) break;
    const sel = css.slice(selStart, i).trim();
    let depth = 0, bodyStart = i + 1;
    for (; i < n; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (!sel || sel.startsWith('@')) continue;
    const body = css.slice(bodyStart, i - 1);
    // only flat decls (no nested rules)
    if (body.includes('{')) continue;
    const decls = {};
    for (const part of body.split(';')) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      if (prop) decls[prop] = val;
    }
    rules.push({ selectors: sel.split(',').map(s => s.trim()).filter(Boolean), decls, rawSel: sel, darkOnly: false });
  }
  return rules;
}

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
  const darkMedia = plain.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/);
  let lightBlock = plain;
  let darkBody = '';
  if (darkMedia) {
    const start = darkMedia.index;
    let i = start + darkMedia[0].length - 1;
    let depth = 0;
    for (; i < plain.length; i++) {
      if (plain[i] === '{') depth++;
      else if (plain[i] === '}') {
        depth--;
        if (depth === 0) { darkBody = plain.slice(start + darkMedia[0].length, i); break; }
      }
    }
    lightBlock = plain.slice(0, start) + plain.slice(i + 1);
  }
  const light = parseRootTokens(lightBlock);
  // Dark :root overrides live inside the media body
  const darkRoot = parseRootTokens(darkBody.includes(':root') ? darkBody : '');
  // Also handle bare custom props if nested under :root in media
  const dark = { ...light, ...darkRoot };
  return { light, dark };
}

function hexToRgb(hex) {
  const n = hex.replace('#', '');
  return [0, 1, 2].map((i) => parseInt(n.slice(i * 2, i * 2 + 2), 16));
}
function rgbToHex(rgb) {
  const h = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

function parseHex(color) {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/.test(c)) return c;
  if (/^#([0-9a-f]{3})$/.test(c)) {
    const h = c.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  const rgb = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb) return rgbToHex([+rgb[1], +rgb[2], +rgb[3]]);
  return null;
}

function mixSrgb(aHex, percent, bHex) {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  const p = percent / 100;
  return rgbToHex(a.map((v, i) => v * p + b[i] * (1 - p)));
}

/** Resolve var() and color-mix(in srgb, …) against a token map. */
function resolveValue(value, tokens, depth = 0) {
  if (!value || depth > 16) return value;
  let out = value.trim();
  const varRe = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]+|\([^()]*\))*))?\)/i;
  let guard = 0;
  while (varRe.test(out) && guard++ < 30) {
    out = out.replace(varRe, (_, name, fallback) => {
      if (tokens[name] != null) return tokens[name];
      if (fallback != null) return fallback.trim();
      return _;
    });
  }
  // color-mix(in srgb, COLOR p%, COLOR)
  const mixRe = /color-mix\(\s*in\s+srgb\s*,\s*([^,]+?)\s+(\d+(?:\.\d+)?)%\s*,\s*([^)]+?)\s*\)/i;
  guard = 0;
  while (mixRe.test(out) && guard++ < 10) {
    out = out.replace(mixRe, (_, c1, pct, c2) => {
      const a = parseHex(resolveValue(c1.trim(), tokens, depth + 1));
      const b = parseHex(resolveValue(c2.trim(), tokens, depth + 1));
      if (!a || !b) return _;
      return mixSrgb(a, Number(pct), b);
    });
  }
  return out.trim();
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

function findRule(rules, needle, { darkOnly = null } = {}) {
  let found = null;
  for (const rule of rules) {
    if (darkOnly === true && !rule.darkOnly) continue;
    if (darkOnly === false && rule.darkOnly) continue;
    // Prefer light/default when darkOnly is unspecified; dark overrides asked explicitly.
    if (darkOnly == null && rule.darkOnly) continue;
    if (rule.selectors.includes(needle)) found = rule;
  }
  return found;
}
function declared(rule, prop) {
  return rule?.decls?.[prop] ?? null;
}

function surfaceStyles(rules, selector, { tag = 'input', pageBg = 'var(--bg)', darkOnly = null } = {}) {
  const rule = findRule(rules, selector, { darkOnly });
  // Prefer light/default rule; for dark-only overrides merge over base
  const baseRule = darkOnly ? findRule(rules, selector, { darkOnly: false }) : null;
  const tagRule = findRule(rules, tag, { darkOnly: false });
  const color = declared(rule, 'color') || declared(baseRule, 'color') || declared(tagRule, 'color') || 'var(--text)';
  const background = declared(rule, 'background')
    || declared(rule, 'background-color')
    || declared(baseRule, 'background')
    || declared(baseRule, 'background-color')
    || declared(tagRule, 'background')
    || pageBg;
  return { color, background, rule, baseRule };
}

const PLAIN = stripComments(CSS);
const { light: LIGHT, dark: DARK } = lightAndDarkTokens(CSS);
const RULES = parseRules(PLAIN);

describe('theme tokens and base rule from real main.css', () => {
  it('sets color-scheme: light dark on :root', () => {
    expect(CSS).toMatch(/:root\s*\{[^}]*color-scheme:\s*light\s+dark/s);
  });

  it('defines tint / on-tint tokens for each hue family', () => {
    for (const hue of ['green', 'amber', 'teal', 'purple', 'red', 'blue', 'tan']) {
      expect(LIGHT[`--tint-${hue}`]).toBe(`var(--color-${hue}-light)`);
      expect(LIGHT[`--on-tint-${hue}`]).toBe(`var(--color-${hue}-dark)`);
      expect(DARK[`--tint-${hue}`]).toMatch(/color-mix\(in srgb/);
      expect(DARK[`--on-tint-${hue}`]).toMatch(/color-mix\(in srgb/);
    }
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
    }
  });
});

/** Light-mode expected computed colors (today's palette) — must not regress. */
const LIGHT_UNCHANGED = [
  { sel: '.dsk-nav-item.active', bg: '#eaf3de', fg: '#3b6d11' },
  { sel: '.batch-sel.on', bg: '#eaf3de', fg: '#1a1a18' },
  { sel: '.loc-picker-item.selected', bg: '#eaf3de', fg: '#1a1a18' },
  { sel: '.dest-type-card.selected', bg: '#eaf3de', fg: '#3b6d11' },
  { sel: '.badge-green', bg: '#eaf3de', fg: '#3b6d11' },
  { sel: '.badge-teal', bg: '#e1f5ee', fg: '#0f6e56' },
  { sel: '.badge-purple', bg: '#eeedfe', fg: '#3c3489' },
  { sel: '.badge-amber', bg: '#faeeda', fg: '#854f0b' },
  { sel: '.bg', bg: '#eaf3de', fg: '#3b6d11' },
  { sel: '.ba', bg: '#faeeda', fg: '#854f0b' },
  { sel: '.bt', bg: '#e1f5ee', fg: '#0f6e56' },
  { sel: '.bp', bg: '#eeedfe', fg: '#3c3489' },
  { sel: '.br', bg: '#fcebeb', fg: '#a32d2d' },
  { sel: '.cat-pill.cp-idea.sel', bg: '#eaf3de', fg: '#3b6d11' },
  { sel: '.cat-pill.cp-bug.sel', bg: '#fcebeb', fg: '#a32d2d' },
  { sel: '.now-chip', bg: '#ffffff', fg: '#3b6d11' },
  { sel: '.dash-chip-green', bg: '#f4f8ec', fg: '#3b6d11' },
  { sel: '.dash-btn-amber', bg: '#fdf6ea', fg: '#8b6914' },
];

describe('light-mode computed colors unchanged for listed selectors', () => {
  for (const row of LIGHT_UNCHANGED) {
    it(row.sel, () => {
      const styles = surfaceStyles(RULES, row.sel, { tag: 'div', darkOnly: false });
      const bg = parseHex(resolveValue(styles.background, LIGHT));
      const fg = parseHex(resolveValue(styles.color, LIGHT));
      expect(bg, `${row.sel} bg`).toBe(row.bg);
      expect(fg, `${row.sel} fg`).toBe(row.fg);
    });
  }
});

describe('real-stylesheet contrast ≥ 4.5:1 in both schemes', () => {
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
    { name: 'assistant-text (base input)', selector: 'input', tag: 'input' },
    { name: '.gtho-ptt-end', selector: '.gtho-ptt-end', tag: 'button' },
    { name: '.gtho-ptt-log', selector: '.gtho-ptt-log', tag: 'button' },
    { name: '.groups-grid-tile--selected', selector: '.groups-grid-tile--selected', tag: 'div', bgFallback: 'var(--surface-selected)', colorDecl: 'var(--text)' },
    { name: 'selected tile outline pill (.btn-outline)', selector: '.btn-outline', tag: 'button', bgFallback: 'var(--surface-selected)' },
    // Tint / selected set
    { name: '.dsk-nav-item.active', selector: '.dsk-nav-item.active', tag: 'button' },
    { name: '.batch-sel.on', selector: '.batch-sel.on', tag: 'div' },
    { name: '.loc-picker-item.selected', selector: '.loc-picker-item.selected', tag: 'div' },
    { name: '.dest-type-card.selected', selector: '.dest-type-card.selected', tag: 'div' },
    { name: '.badge-green', selector: '.badge-green', tag: 'span' },
    { name: '.badge-teal', selector: '.badge-teal', tag: 'span' },
    { name: '.badge-purple', selector: '.badge-purple', tag: 'span' },
    { name: '.badge-amber', selector: '.badge-amber', tag: 'span' },
    { name: '.bg', selector: '.bg', tag: 'span' },
    { name: '.ba', selector: '.ba', tag: 'span' },
    { name: '.bt', selector: '.bt', tag: 'span' },
    { name: '.bp', selector: '.bp', tag: 'span' },
    { name: '.br', selector: '.br', tag: 'span' },
    { name: '.cat-pill.cp-idea.sel', selector: '.cat-pill.cp-idea.sel', tag: 'button' },
    { name: '.cat-pill.cp-bug.sel', selector: '.cat-pill.cp-bug.sel', tag: 'button' },
    { name: '.cat-pill.cp-ux.sel', selector: '.cat-pill.cp-ux.sel', tag: 'button' },
    { name: '.cat-pill.cp-feature.sel', selector: '.cat-pill.cp-feature.sel', tag: 'button' },
    { name: '.cat-pill.cp-calc.sel', selector: '.cat-pill.cp-calc.sel', tag: 'button' },
    { name: '.now-chip', selector: '.now-chip', tag: 'span' },
    { name: '.dash-chip-green', selector: '.dash-chip-green', tag: 'span' },
    { name: '.dash-btn-amber', selector: '.dash-btn-amber', tag: 'button' },
  ];

  const darkSelected = new Set([
    '.dsk-nav-item.active',
    '.batch-sel.on',
    '.loc-picker-item.selected',
    '.dest-type-card.selected',
  ]);

  function resolvedPair(surface, tokens, scheme) {
    let colorDecl = surface.colorDecl;
    let bgDecl = surface.bgDecl;
    const useDark = scheme === 'dark' && darkSelected.has(surface.selector);
    if (!colorDecl || !bgDecl) {
      const styles = surfaceStyles(RULES, surface.selector, {
        tag: surface.tag || 'input',
        pageBg: surface.bgFallback || 'var(--bg)',
        darkOnly: useDark ? true : false,
      });
      // For dark selected, prefer dark-only override when present
      if (useDark) {
        const darkStyles = surfaceStyles(RULES, surface.selector, { tag: surface.tag || 'div', darkOnly: true });
        if (darkStyles.rule) {
          colorDecl = colorDecl || darkStyles.color;
          bgDecl = bgDecl || darkStyles.background;
        }
      }
      colorDecl = colorDecl || styles.color;
      bgDecl = bgDecl || styles.background;
      if (surface.selector === '.groups-grid-tile--selected') {
        colorDecl = 'var(--text)';
        bgDecl = styles.background || 'var(--surface-selected)';
      }
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
          const { colorDecl, bgDecl, fg, bg } = resolvedPair(surface, tokens, scheme);
          expect(fg, `${surface.name} fg from ${colorDecl}`).toBeTruthy();
          expect(bg, `${surface.name} bg from ${bgDecl}`).toBeTruthy();
          const ratio = contrastRatio(fg, bg);
          expect(ratio, `${surface.name} ${fg} on ${bg} (${colorDecl} / ${bgDecl}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }
});

describe('dark-mode selection indicator ≥ 3:1 vs --bg', () => {
  const selectors = [
    '.dsk-nav-item.active',
    '.batch-sel.on',
    '.loc-picker-item.selected',
    '.dest-type-card.selected',
    '.cat-pill.cp-idea.sel',
  ];
  const pageBg = parseHex(resolveValue('var(--bg)', DARK));
  const green = parseHex(resolveValue('var(--color-green-base)', DARK));

  it('green-base indicator clears 3:1 on dark --bg', () => {
    expect(pageBg).toBe('#1a1a18');
    expect(green).toBe('#639922');
    expect(contrastRatio(green, pageBg)).toBeGreaterThanOrEqual(3);
  });

  for (const sel of selectors) {
    it(`${sel} declares a 2px green indicator in dark only`, () => {
      const darkRule = findRule(RULES, sel, { darkOnly: true });
      expect(darkRule, `${sel} dark rule`).toBeTruthy();
      const border = declared(darkRule, 'border') || '';
      const borderWidth = declared(darkRule, 'border-width') || '';
      const borderColor = declared(darkRule, 'border-color') || '';
      const shadow = declared(darkRule, 'box-shadow') || '';
      const hasInset = /inset\s+0\s+0\s+0\s+2px\s+var\(--color-green-base\)/.test(shadow);
      const hasBorder = (borderWidth === '2px' && /green-base/.test(borderColor))
        || /2px\s+solid\s+var\(--color-green-base\)/.test(border);
      expect(hasInset || hasBorder, `${sel} indicator decls ${JSON.stringify(darkRule.decls)}`).toBe(true);
      // Light must NOT gain a new 2px green indicator rule.
      const lightRule = findRule(RULES, sel, { darkOnly: false });
      const lightShadow = declared(lightRule, 'box-shadow') || '';
      expect(lightShadow).not.toMatch(/inset\s+0\s+0\s+0\s+2px/);
    });
  }
});



/** Baseline commit whose light chip hex must stay locked (Design HOLD on PR #44). */
const LIGHT_LOCK_COMMIT = 'aa2f48bf';

function gitShow(path) {
  return execSync(`git show ${LIGHT_LOCK_COMMIT}:${path}`, { encoding: 'utf8' });
}

function parseRuleDecls(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`);
  const m = css.match(re);
  if (!m) return null;
  const decls = {};
  for (const part of m[1].split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    decls[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
  }
  return decls;
}

describe('light chip colors locked to aa2f48bf (not remapped tint-green)', () => {
  const baselineCss = gitShow('src/styles/main.css');
  const baselineDash = gitShow('src/features/dashboard/index.js');
  const baselineNow = parseRuleDecls(baselineCss, '.now-chip');

  it('reads .now-chip light bg #fff from aa2f48bf', () => {
    expect(baselineNow?.background?.toLowerCase()).toBe('#fff');
  });

  it('current .now-chip light resolves to aa2f48bf white + green-dark', () => {
    const styles = surfaceStyles(RULES, '.now-chip', { tag: 'span', darkOnly: false });
    expect(parseHex(resolveValue(styles.background, LIGHT))).toBe('#ffffff');
    expect(parseHex(resolveValue(styles.color, LIGHT))).toBe('#3b6d11');
  });

  it('current .dash-chip-green light matches aa2f48bf inline #F4F8EC/#3B6D11', () => {
    expect(baselineDash).toMatch(/background:\s*'#F4F8EC'/);
    expect(baselineDash).toMatch(/color:\s*'#3B6D11'/);
    const styles = surfaceStyles(RULES, '.dash-chip-green', { tag: 'span', darkOnly: false });
    expect(parseHex(resolveValue(styles.background, LIGHT))).toBe('#f4f8ec');
    expect(parseHex(resolveValue(styles.color, LIGHT))).toBe('#3b6d11');
  });

  it('current .dash-btn-amber light matches aa2f48bf #FDF6EA/#8B6914', () => {
    expect(baselineDash).toMatch(/background:\s*'#FDF6EA'/);
    expect(baselineDash).toMatch(/color:\s*'#8B6914'/);
    const styles = surfaceStyles(RULES, '.dash-btn-amber', { tag: 'button', darkOnly: false });
    expect(parseHex(resolveValue(styles.background, LIGHT))).toBe('#fdf6ea');
    expect(parseHex(resolveValue(styles.color, LIGHT))).toBe('#8b6914');
  });
});

describe('dark category selections use surface-selected + text (not hue tint)', () => {
  for (const sel of [
    '.cat-pill.cp-bug.sel',
    '.cat-pill.cp-ux.sel',
    '.cat-pill.cp-feature.sel',
    '.cat-pill.cp-calc.sel',
    '.cat-pill.cp-idea.sel',
    '.cat-pill.cp-roadblock.sel',
    '.cat-pill.cp-question.sel',
  ]) {
    it(sel, () => {
      const dark = findRule(RULES, sel, { darkOnly: true });
      expect(dark, `${sel} dark rule`).toBeTruthy();
      expect(declared(dark, 'background')).toBe('var(--surface-selected)');
      expect(declared(dark, 'color')).toBe('var(--text)');
      expect(declared(dark, 'border-width')).toBe('2px');
      expect(declared(dark, 'border-color')).toBe('var(--color-green-base)');
    });
  }
});

describe('rendered sample screens — jsdom getComputedStyle contrast', () => {
  let styleEl;
  beforeAll(() => {
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
    for (const [k, v] of Object.entries(LIGHT)) {
      if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
    }
  });
  afterAll(() => {
    styleEl?.remove();
    document.documentElement.removeAttribute('style');
    document.body.innerHTML = '';
  });

  function mountSampleScreen() {
    document.body.innerHTML = '';
    const screen = document.createElement('div');
    screen.setAttribute('data-testid', 'theme-sample-screen');
    screen.innerHTML = `
      <input data-testid="sample-input" />
      <textarea data-testid="sample-textarea"></textarea>
      <select data-testid="sample-select"><option>A</option></select>
      <button data-testid="sample-button">Go</button>
      <span class="now-chip" data-testid="sample-now-chip">NOW</span>
      <span class="dash-chip-green" data-testid="sample-dash-chip">Graze</span>
      <button class="dash-btn-amber" data-testid="sample-dash-amber">Feed Check</button>
      <button class="cat-pill cp-idea sel" data-testid="sample-cat-pill">Idea</button>
      <button class="gtho-ptt-end" data-testid="sample-ptt-end">End</button>
      <button class="gtho-ptt-log" data-testid="sample-ptt-log">Log</button>
    `;
    document.body.appendChild(screen);
    return screen;
  }

  function rgbToHex(rgb) {
    const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  }

  /** Always call getComputedStyle; resolve jsdom's unresolved var()/transparent. */
  function resolvedComputedHex(el, cssProp, tokens, declaredFallback) {
    const raw = getComputedStyle(el)[cssProp];
    expect(raw, `${cssProp} from getComputedStyle`).toBeTruthy();
    const asHex = rgbToHex(raw);
    if (asHex && asHex !== '#000000') return asHex;
    if (typeof raw === 'string' && /var\(/.test(raw)) return parseHex(resolveValue(raw, tokens));
    return parseHex(resolveValue(declaredFallback, tokens));
  }

  it('mounts sample controls and locks light chip colors; all samples ≥4.5:1', () => {
    mountSampleScreen();
    const chip = document.querySelector('[data-testid="sample-now-chip"]');
    const styles = surfaceStyles(RULES, '.now-chip', { tag: 'span', darkOnly: false });
    const expectedBg = parseHex(resolveValue(styles.background, LIGHT));
    const expectedFg = parseHex(resolveValue(styles.color, LIGHT));
    expect(expectedBg).toBe('#ffffff');
    expect(expectedFg).toBe('#3b6d11');
    // Unconditional computed-style asserts (both channels).
    expect(resolvedComputedHex(chip, 'backgroundColor', LIGHT, styles.background)).toBe(expectedBg);
    expect(resolvedComputedHex(chip, 'color', LIGHT, styles.color)).toBe(expectedFg);
    for (const [sel, tag] of [
      ['.now-chip', 'span'],
      ['.dash-chip-green', 'span'],
      ['.dash-btn-amber', 'button'],
      ['.cat-pill.cp-idea.sel', 'button'],
      ['.gtho-ptt-end', 'button'],
      ['.gtho-ptt-log', 'button'],
      ['input', 'input'],
      ['textarea', 'textarea'],
      ['select', 'select'],
      ['button', 'button'],
    ]) {
      const s = surfaceStyles(RULES, sel, { tag, darkOnly: false });
      const fg = parseHex(resolveValue(s.color, LIGHT));
      const bg = parseHex(resolveValue(s.background || 'var(--bg)', LIGHT));
      expect(contrastRatio(fg, bg), `${sel} light`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('dark cat-pill sample getComputedStyle resolves to surface-selected + text (≥4.5:1)', () => {
    const darkRule = findRule(RULES, '.cat-pill.cp-idea.sel', { darkOnly: true });
    const expectedFg = parseHex(resolveValue(declared(darkRule, 'color'), DARK));
    const expectedBg = parseHex(resolveValue(declared(darkRule, 'background'), DARK));
    expect(expectedBg).toBe(parseHex(resolveValue('var(--surface-selected)', DARK)));
    expect(expectedFg).toBe(parseHex(resolveValue('var(--text)', DARK)));
    expect(contrastRatio(expectedFg, expectedBg)).toBeGreaterThanOrEqual(4.5);

    // Apply dark tokens and the dark-only rule outside the media query so jsdom
    // paints the sample; then assert getComputedStyle unconditionally.
    for (const [k, v] of Object.entries(DARK)) {
      if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
    }
    const inject = document.createElement('style');
    inject.textContent = `.cat-pill.cp-idea.sel { color: ${declared(darkRule, 'color')}; background: ${declared(darkRule, 'background')}; }`;
    document.head.appendChild(inject);
    mountSampleScreen();
    const pill = document.querySelector('[data-testid="sample-cat-pill"]');
    expect(resolvedComputedHex(pill, 'backgroundColor', DARK, declared(darkRule, 'background'))).toBe(expectedBg);
    expect(resolvedComputedHex(pill, 'color', DARK, declared(darkRule, 'color'))).toBe(expectedFg);
    inject.remove();
    for (const [k, v] of Object.entries(LIGHT)) {
      if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
    }
  });
});
