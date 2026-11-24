/** @file #456 iPhone safe-area insets + landscape Map (Design lock, comment 1559). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/main.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

function ruleBody(selector) {
  // Match a rule whose prelude is exactly the selector (not a suffix like
  // "body.field-mode .bottom-nav").
  const re = new RegExp(`(?:^|[}\\n])\\s*${selector}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  expect(m, `missing rule ${selector}`).toBeTruthy();
  return m[1];
}

describe('#456 viewport and safe-area tokens', () => {
  it('index.html adds viewport-fit=cover and keeps status-bar-style default', () => {
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"\s*\/?>/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="default"\s*\/?>/);
    expect(html).not.toMatch(/black-translucent/);
  });

  it('defines --safe-top/bottom/left/right from env() with 0px fallback', () => {
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top,\s*0px\)/);
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/);
    expect(css).toMatch(/--safe-left:\s*env\(safe-area-inset-left,\s*0px\)/);
    expect(css).toMatch(/--safe-right:\s*env\(safe-area-inset-right,\s*0px\)/);
  });
});

describe('#456 chrome insets', () => {
  it('header gets safe-top plus left/right', () => {
    const body = ruleBody('\\.app-header');
    expect(body).toMatch(/padding-top:\s*calc\(var\(--space-4\) \+ var\(--safe-top\)\)/);
    expect(body).toMatch(/padding-right:\s*calc\(var\(--space-5\) \+ var\(--safe-right\)\)/);
    expect(body).toMatch(/padding-left:\s*calc\(var\(--space-5\) \+ var\(--safe-left\)\)/);
    expect(body).toMatch(/padding-bottom:\s*var\(--space-4\)/);
  });

  it('bottom-nav keeps existing safe-bottom and gains left/right', () => {
    const body = ruleBody('\\.bottom-nav');
    expect(body).toMatch(/padding:\s*var\(--space-2\) var\(--safe-right\) calc\(var\(--space-2\) \+ var\(--safe-bottom\)\) var\(--safe-left\)/);
  });

  it('sheets: last region gets safe-bottom; sticky actions take it when present', () => {
    const panel = ruleBody('\\.sheet-panel');
    expect(panel).toMatch(/padding-left:\s*calc\(16px \+ var\(--safe-left\)\)/);
    expect(panel).toMatch(/padding-right:\s*calc\(16px \+ var\(--safe-right\)\)/);
    const bodyOnly = ruleBody('\\.sheet-panel:not\\(:has\\(\\.sheet-actions-sticky\\)\\)');
    expect(bodyOnly).toMatch(/padding-bottom:\s*calc\(24px \+ var\(--safe-bottom\)\)/);
    const sticky = ruleBody('\\.sheet-actions-sticky');
    expect(sticky).toMatch(/var\(--safe-bottom\)/);
    expect(sticky).toMatch(/var\(--safe-left\)/);
    expect(sticky).toMatch(/var\(--safe-right\)/);
  });

  it('full-screen field-mode sheets also get safe-top on the header', () => {
    const body = ruleBody('body\\.field-mode \\.sheet-panel');
    expect(body).toMatch(/padding-top:\s*calc\(16px \+ var\(--safe-top\)\)/);
  });

  it('PWA banner keeps the raised bottom offset and drops inner safe-bottom padding', () => {
    const body = ruleBody('\\.pwa-update-banner');
    expect(body).toMatch(/padding:\s*var\(--space-3\) var\(--space-4\)/);
    expect(body).not.toMatch(/safe-area-inset-bottom/);
    expect(body).not.toMatch(/--safe-bottom/);
    expect(css).toMatch(/body:has\(\.bottom-nav\) \.pwa-update-banner\s*\{[^}]*bottom:\s*calc\(28px \+ var\(--safe-bottom\)\)/);
  });

  it('calendar rail keeps the JS nav offset and adds left/right only', () => {
    const body = ruleBody('\\.loc-mgmt__rail');
    expect(body).toMatch(/bottom:\s*var\(--loc-mgmt-rail-bottom, 0px\)/);
    expect(body).toMatch(/padding:\s*3px calc\(4px \+ var\(--safe-right\)\) 3px calc\(4px \+ var\(--safe-left\)\)/);
    expect(body).not.toMatch(/--safe-top/);
    expect(body).not.toMatch(/--safe-bottom/);
    const phone = ruleBody('\\.loc-mgmt__rail--phone');
    expect(phone).toMatch(/var\(--safe-right\)/);
    expect(phone).toMatch(/var\(--safe-left\)/);
  });

  it('FAB keeps fixed-px safe-bottom and gains safe-right', () => {
    const body = ruleBody('\\.fab-wrap');
    expect(body).toMatch(/bottom:\s*calc\(20px \+ var\(--safe-bottom\)\)/);
    expect(body).toMatch(/right:\s*calc\(20px \+ var\(--safe-right\)\)/);
  });

  it('auth overlay pads all four insets', () => {
    const body = ruleBody('\\.auth-overlay');
    expect(body).toMatch(/padding:\s*var\(--safe-top\) var\(--safe-right\) var\(--safe-bottom\) var\(--safe-left\)/);
  });

  it('map-picker-overlay is treated as a full-screen sheet (all four insets on the overlay)', () => {
    const body = ruleBody('\\.map-picker-overlay');
    expect(body).toMatch(/padding:\s*calc\(12px \+ var\(--safe-top\)\) calc\(12px \+ var\(--safe-right\)\) calc\(12px \+ var\(--safe-bottom\)\) calc\(12px \+ var\(--safe-left\)\)/);
  });
});

describe('#456 Map canvas and overlay controls', () => {
  it('Map canvas stays edge to edge (no side insets on the canvas itself)', () => {
    const body = ruleBody('\\.farm-map-canvas');
    expect(body).not.toMatch(/--safe-left/);
    expect(body).not.toMatch(/--safe-right/);
    expect(body).toMatch(/min-height:\s*260px/);
  });

  it('phone Map view keeps the existing safe-bottom column padding', () => {
    expect(css).toMatch(/\.app-content:has\(\.loc-mgmt-map\)\s*\{[^}]*padding-bottom:\s*calc\(72px \+ var\(--safe-bottom\)\)/);
  });

  it('Map overlay controls get left/right insets; Leaflet corners use safe-left/right', () => {
    expect(css).toMatch(/\.farm-map-screen \.farm-map-header,[\s\S]*?\.farm-map-screen \.farm-map-actions\s*\{[^}]*padding-left:\s*var\(--safe-left\)/);
    expect(css).toMatch(/\.farm-map-screen \.farm-map-header,[\s\S]*?\.farm-map-screen \.farm-map-actions\s*\{[^}]*padding-right:\s*var\(--safe-right\)/);
    expect(css).toMatch(/\.farm-map-screen \.farm-map-canvas \.leaflet-left\s*\{[^}]*left:\s*var\(--safe-left\)/);
    expect(css).toMatch(/\.farm-map-screen \.farm-map-canvas \.leaflet-right\s*\{[^}]*right:\s*var\(--safe-right\)/);
  });

  it('phone landscape drops the canvas min-height to 0 so flex can shrink it above the tab bar', () => {
    const re = /@media \(orientation: landscape\) and \(max-height: 500px\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/;
    const m = css.match(re);
    expect(m, 'missing landscape min-height media query').toBeTruthy();
    expect(m[0]).toMatch(/\.app-content:has\(\.loc-mgmt-map\) \.farm-map-canvas/);
    expect(m[0]).toMatch(/min-height:\s*0/);
    const phoneCanvas = css.match(/\.app-content:has\(\.loc-mgmt-map\) \.farm-map-canvas\s*\{([^}]*)\}/);
    expect(phoneCanvas[1]).toMatch(/min-height:\s*260px/);
  });
});
