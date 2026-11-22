/** @file OI-0261 Ml1 month tick · OI-0262 Ra1+Bd1+Pb1+Dz1+Gc1 readiness anchor · OI-0263 Ex1+Lf-B+Tb1 Map view. */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import { monthTickLabel } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import {
  computeReadiness,
  closeRecoveryAnchor,
  latestSurveyAnchor,
  selectReadinessAnchor,
  readinessBandRange,
  localDateOf,
} from '../../src/features/events/rotation-calendar/readiness.js';
import { renderLegend } from '../../src/features/events/rotation-calendar/legend.js';
import { renderEstimatedFutureBlock } from '../../src/features/events/rotation-calendar/future-block.js';
import {
  getCalendarState, resetCalendarState, readStateFromUrl, setView,
  MAP_VIEW_HASH, isMapViewHash, calendarHashFor,
} from '../../src/features/events/calendar-state.js';
import { renderHeaderStrip } from '../../src/features/events/rotation-calendar/header-strip.js';
import { mapBackTarget, redirectLegacyMapRoute, MAP_BACK_FALLBACK_HASH } from '../../src/features/map/map-view.js';
import { mapIntent, setMapIntent, startDrawLocation, startDropTodoPin, openFarmMap } from '../../src/features/map/intent.js';
import { _setPreviousHash, getPreviousHash, initRouter, route } from '../../src/ui/router.js';

const css = readFileSync('src/styles/main.css', 'utf8');
const ORIG_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => { if (ORIG_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIG_TZ; });

// ── OI-0261 Ml1 ────────────────────────────────────────────────────
describe('OI-0261 Ml1 — month tick label', () => {
  it('Dec 1 2026 month tick reads "Dec", never "Dec 26"', () => {
    const label = monthTickLabel(new Date(2026, 11, 1));
    expect(label).toBe('Dec');
    expect(label).not.toBe('Dec 26');
  });

  it('January carries the year ("Jan 2027")', () => {
    expect(monthTickLabel(new Date(2027, 0, 1))).toBe('Jan 2027');
  });

  it('no month label ends in a 1–2 digit number (never looks like a day)', () => {
    for (let m = 0; m < 12; m++) {
      expect(monthTickLabel(new Date(2026, m, 1))).not.toMatch(/(^|\D)\d{1,2}$/);
    }
  });

  it('buildAxis uses monthTickLabel; Saturday labels unchanged', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/\? monthTickLabel\(tick\.date\)/);
    expect(src).toMatch(/toLocaleDateString\(undefined, \{ month: 'short', day: 'numeric' \}\)/);
    expect(src).not.toMatch(/year: '2-digit'/);
  });
});

// ── OI-0262 ────────────────────────────────────────────────────────
const LOC = 'loc-j2';
function j2({ observations = [], windows = null, defaults = {} } = {}) {
  const paddockWindows = windows || [
    { id: 'pw-old', locationId: LOC, eventId: 'e0', dateOpened: '2026-06-01', dateClosed: '2026-06-10' },
    { id: 'pw-j2', locationId: LOC, eventId: 'e1', dateOpened: '2026-08-10', dateClosed: '2026-08-21' },
  ];
  return computeReadiness({ id: LOC }, {
    today: '2026-11-22',
    paddockWindows,
    events: [{ id: 'e0', dateOut: '2026-06-10' }, { id: 'e1', dateOut: '2026-08-21' }],
    observations,
    defaultRecoveryMinDays: defaults.min ?? 21,
    defaultRecoveryMaxDays: defaults.max ?? 35,
  });
}
const closeObs = (over = {}) => ({
  id: 'obs-close', locationId: LOC, type: 'close', source: 'event', sourceId: 'pw-j2',
  observedAt: '2026-11-03T18:48:00Z', recoveryMinDays: 30, recoveryMaxDays: 60, ...over,
});

describe('OI-0262 Ra1+Bd1+Pb1 — readiness anchored on the close date', () => {
  it('retroactive close (entered Nov 3, closed Aug 21, 30/60) → Sep 20 – Oct 20', () => {
    const r = j2({ observations: [closeObs()] });
    expect(r.mode).toBe('survey');
    expect(r.earliestReturn).toBe('2026-09-20');
    expect(r.windowCloses).toBe('2026-10-20');
    expect(readinessBandRange(r)).toEqual({ start: '2026-09-20', end: '2026-10-20' });
    expect(r.label).toBe('Estimated ready Sep 20');
  });

  it('UTC-evening close obs (Aug 21 23:30 ET = Aug 22 UTC) does not move the anchor', () => {
    const r = j2({ observations: [closeObs({ observedAt: '2026-08-21T23:30:00-04:00' })] });
    expect(r.earliestReturn).toBe('2026-09-20');
    expect(localDateOf('2026-08-22T03:30:00Z')).toBe('2026-08-21');
  });

  it('no matching close obs → farm defaults (other-window / open obs ignored)', () => {
    const r = j2({
      observations: [
        closeObs({ id: 'o-other', sourceId: 'pw-old', recoveryMinDays: 5, recoveryMaxDays: 6 }),
        closeObs({ id: 'o-open', type: 'open', recoveryMinDays: 7, recoveryMaxDays: 8 }),
      ],
      defaults: { min: 30, max: 45 },
    });
    expect(r.earliestReturn).toBe('2026-09-20');
    expect(r.windowCloses).toBe('2026-10-05');
    expect(r.anchor.dateSource).toBe('close');
  });

  it('close obs with only min falls back to farm default for max', () => {
    const r = j2({ observations: [closeObs({ recoveryMaxDays: null })], defaults: { max: 50 } });
    expect(r.earliestReturn).toBe('2026-09-20');
    expect(r.windowCloses).toBe('2026-10-10');
  });

  it('Sv2: a survey dated after the close carries the window (survey date + survey min..max)', () => {
    const survey = {
      id: 's1', locationId: LOC, type: 'open', source: 'survey', sourceId: 'survey-1',
      observedAt: '2026-10-01T12:00:00Z', recoveryMinDays: 10, recoveryMaxDays: 20,
    };
    const r = j2({ observations: [closeObs(), survey] });
    expect(r.earliestReturn).toBe('2026-10-11');
    expect(r.windowCloses).toBe('2026-10-21');
    expect(r.anchor.dateSource).toBe('survey');
    expect(r.label).toBe('Surveyed on Oct 1, estimated ready Oct 11');
  });

  it('Sv2: a later survey without recovery days → survey date + close obs min/max', () => {
    const survey = { id: 's3', locationId: LOC, type: 'open', source: 'survey', observedAt: '2026-10-01T12:00:00Z' };
    const r = j2({ observations: [closeObs(), survey] });
    expect(r.earliestReturn).toBe('2026-10-31');
    expect(r.windowCloses).toBe('2026-11-30');
    expect(r.label).toBe('Surveyed on Oct 1, estimated ready Oct 31');
  });

  it('Sv2: a later survey without recovery days and no close obs → survey date + farm defaults', () => {
    const survey = { id: 's4', locationId: LOC, type: 'open', source: 'survey', observedAt: '2026-10-01T12:00:00Z' };
    const r = j2({ observations: [survey], defaults: { min: 21, max: 35 } });
    expect(r.earliestReturn).toBe('2026-10-22');
    expect(r.windowCloses).toBe('2026-11-05');
  });

  it('Sv2: a close after a survey re-anchors on the close (Estimated label)', () => {
    const survey = {
      id: 's5', locationId: LOC, type: 'open', source: 'survey',
      observedAt: '2026-08-01T12:00:00Z', recoveryMinDays: 10, recoveryMaxDays: 20,
    };
    const r = j2({ observations: [closeObs(), survey] });
    expect(r.earliestReturn).toBe('2026-09-20');
    expect(r.windowCloses).toBe('2026-10-20');
    expect(r.anchor.dateSource).toBe('close');
    expect(r.label).toBe('Estimated ready Sep 20');
  });

  it('a survey before the close never anchors the window (Ra1 stops survey rows anchoring)', () => {
    const survey = {
      id: 's0', locationId: LOC, type: 'open', source: 'survey',
      observedAt: '2026-04-09T12:00:00Z', recoveryMinDays: 5, recoveryMaxDays: 9,
    };
    const r = j2({ observations: [survey] });
    expect(r.earliestReturn).toBe('2026-09-11'); // Aug 21 + farm default 21
    expect(r.label).toBe('Estimated ready Sep 11');
  });

  it('a same-day survey does not count as later — close wins, Estimated label', () => {
    const survey = { id: 's2', locationId: LOC, type: 'open', source: 'survey', observedAt: '2026-08-21T12:00:00Z' };
    const r = j2({ observations: [closeObs(), survey] });
    expect(r.label).toBe('Estimated ready Sep 20');
  });

  it('past bands still paint at their true dates', () => {
    const r = j2({ observations: [closeObs()] });
    expect(r.confidence).toBe('past_max');
    expect(readinessBandRange(r)).not.toBeNull();
  });

  it('strip grazing: whole paddock ready only when every strip is past its min', () => {
    const windows = [
      { id: 'st1', locationId: LOC, eventId: 'e1', dateOpened: '2026-08-01', dateClosed: '2026-08-15', isStripGraze: true, stripGroupId: 'g' },
      { id: 'st2', locationId: LOC, eventId: 'e1', dateOpened: '2026-08-15', dateClosed: '2026-08-21', isStripGraze: true, stripGroupId: 'g' },
    ];
    const r = j2({
      windows,
      observations: [
        { id: 'o1', locationId: LOC, type: 'close', source: 'event', sourceId: 'st1', observedAt: '2026-08-15', recoveryMinDays: 40, recoveryMaxDays: 60 },
        { id: 'o2', locationId: LOC, type: 'close', source: 'event', sourceId: 'st2', observedAt: '2026-08-21', recoveryMinDays: 20, recoveryMaxDays: 50 },
      ],
    });
    // st1: Aug 15 + 40 = Sep 24 > st2: Aug 21 + 20 = Sep 10
    expect(r.earliestReturn).toBe('2026-09-24');
    expect(r.windowCloses).toBe('2026-10-10');
  });

  it('no closed window → no REC-1 band (relative mode)', () => {
    const r = j2({ windows: [{ id: 'p', locationId: LOC, eventId: 'e1', dateOpened: '2026-08-01', dateClosed: null }] });
    expect(r.mode).toBe('relative');
    expect(readinessBandRange(r)).toBeNull();
  });
});

describe('OI-0262 anchor seam — selectReadinessAnchor(close, survey)', () => {
  const close = { source: 'close', date: '2026-08-21', minDays: 30, maxDays: 60, strips: [] };
  it('null close anchor → null', () => {
    expect(selectReadinessAnchor(null, { date: '2026-09-01' })).toBeNull();
  });
  it('no survey → close dates, estimated label', () => {
    expect(selectReadinessAnchor(close, null)).toMatchObject({
      date: '2026-08-21', minDays: 30, maxDays: 60, dateSource: 'close', labelKind: 'estimated', surveyDate: null,
    });
  });
  it('same-day survey → close wins', () => {
    expect(selectReadinessAnchor(close, { date: '2026-08-21', minDays: 5, maxDays: 9 })).toMatchObject({
      date: '2026-08-21', minDays: 30, maxDays: 60, dateSource: 'close', labelKind: 'estimated',
    });
  });
  it('Sv2 later survey wins; missing survey days fall back per field to the close anchor', () => {
    expect(selectReadinessAnchor(close, { date: '2026-09-01', minDays: 5, maxDays: 9 })).toMatchObject({
      date: '2026-09-01', minDays: 5, maxDays: 9, dateSource: 'survey', labelKind: 'surveyed', surveyDate: '2026-09-01',
    });
    expect(selectReadinessAnchor(close, { date: '2026-09-01', minDays: 5, maxDays: null })).toMatchObject({
      minDays: 5, maxDays: 60,
    });
    expect(selectReadinessAnchor(close, { date: '2026-09-01', minDays: null, maxDays: null })).toMatchObject({
      date: '2026-09-01', minDays: 30, maxDays: 60,
    });
  });
  it('closeRecoveryAnchor / latestSurveyAnchor read by sourceId and local date', () => {
    const a = closeRecoveryAnchor(LOC, {
      paddockWindows: [{ id: 'pw-j2', locationId: LOC, dateClosed: '2026-08-21' }],
      observations: [closeObs()],
    });
    expect(a).toMatchObject({ date: '2026-08-21', minDays: 30, maxDays: 60, paddockWindowId: 'pw-j2', observationId: 'obs-close' });
    const s = latestSurveyAnchor(LOC, [
      { locationId: LOC, source: 'survey', observedAt: '2026-04-09T12:00:00Z', recoveryMinDays: 1 },
      { locationId: LOC, source: 'survey', observedAt: '2026-10-02T02:00:00Z' }, // Oct 1 ET evening
    ]);
    expect(s).toMatchObject({ date: '2026-10-01', minDays: null, maxDays: null });
  });
});

describe('OI-0262 Dz1 — REC-1 DST-safe addDays', () => {
  const rec1 = getCalcByName('REC-1');
  it('spring DST: 2026-03-01 + 30 → 2026-03-31', () => {
    expect(rec1.fn({ observedAt: '2026-03-01', recoveryMinDays: 30, recoveryMaxDays: 60 }))
      .toEqual({ earliestReturn: '2026-03-31', windowCloses: '2026-04-30' });
  });
  it('fall DST and the spec example unchanged', () => {
    expect(rec1.fn({ observedAt: '2026-10-20', recoveryMinDays: 21, recoveryMaxDays: 35 }))
      .toEqual({ earliestReturn: '2026-11-10', windowCloses: '2026-11-24' });
    expect(rec1.fn({ observedAt: '2024-06-01', recoveryMinDays: 21, recoveryMaxDays: 35 }))
      .toEqual({ earliestReturn: '2024-06-22', windowCloses: '2024-07-06' });
  });
});

describe('OI-0262 Gc1 — band colour + legend', () => {
  it('every readiness band uses 35% green-base fill + 1px dashed green-dark border', () => {
    const rule = css.match(/\.future-block--min,\s*\.future-block--mid,\s*\.future-block--max,\s*\.future-block--past_max\s*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/background:\s*color-mix\(in srgb, var\(--color-green-base\) 35%, transparent\)/);
    expect(rule[1]).toMatch(/border:\s*1px dashed var\(--color-green-dark\)/);
    expect(css).not.toMatch(/\.future-block--max\s*\{[^}]*opacity/);
    expect(css).not.toMatch(/\.future-block--past_max\s*\{[^}]*opacity/);
  });

  it('legend swatch reads "Ready window (estimated)" with the same fill + dashed border', () => {
    const legend = renderLegend('estimated');
    expect(legend.textContent).toContain('Ready window (estimated)');
    expect(legend.textContent).not.toContain('DM recovery gradient');
    expect(legend.querySelector('.legend__swatch--ready-window')).toBeTruthy();
    const sw = css.match(/\.legend__swatch--ready-window\s*\{([^}]*)\}/);
    expect(sw[1]).toMatch(/color-mix\(in srgb, var\(--color-green-base\) 35%, transparent\)/);
    expect(sw[1]).toMatch(/1px dashed var\(--color-green-dark\)/);
  });

  it('band aria-label carries the Pb1 label', () => {
    const block = renderEstimatedFutureBlock({
      leftPx: 0, widthPx: 40, minDate: 'Sep 20', maxDate: 'Oct 20', confidence: 'past_max',
      isNeverGrazed: false, isGrazingInProgress: false, locationId: LOC, onClickBlock: () => {},
      label: 'Estimated ready Sep 20',
    });
    expect(block.getAttribute('aria-label')).toBe('Estimated ready Sep 20');
    expect(block.className).toContain('future-block--past_max');
  });
});

// ── OI-0263 ────────────────────────────────────────────────────────
describe('OI-0263 Lf-B+Tb1 — Map as the third Locations & Rotation view', () => {
  beforeEach(() => {
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    _setPreviousHash(null);
    setMapIntent({ mode: 'view' });
    document.body.innerHTML = '';
  });

  it('calendar-state accepts view=map and reads it from the URL', () => {
    setView('map');
    expect(getCalendarState().view).toBe('map');
    expect(window.location.hash).toBe(MAP_VIEW_HASH);
    resetCalendarState();
    window.history.replaceState(null, '', '#/events?zoom=month&view=map');
    readStateFromUrl();
    expect(getCalendarState().view).toBe('map');
    expect(getCalendarState().zoom).toBe('month');
  });

  it('isMapViewHash / calendarHashFor', () => {
    expect(MAP_VIEW_HASH).toBe('#/events?view=map');
    expect(isMapViewHash('#/map')).toBe(true);
    expect(isMapViewHash('#/map?x=1')).toBe(true);
    expect(isMapViewHash('#/events?zoom=month&view=map')).toBe(true);
    expect(isMapViewHash('#/events?view=list')).toBe(false);
    expect(isMapViewHash('#/events')).toBe(false);
    expect(isMapViewHash(null)).toBe(false);
    expect(calendarHashFor({ view: 'map' })).toBe('#/events?view=map');
  });

  it('View toggle shows Calendar | List | Map, Map to the right of List', () => {
    const strip = renderHeaderStrip({ selectedGroups: [], period: null, onUpdate: () => {} });
    const ids = [...strip.querySelectorAll('.header-strip__toggle')].map(b => b.dataset.testid);
    expect(ids).toEqual(['view-toggle-calendar', 'view-toggle-list', 'view-toggle-map']);
  });

  it('Map toggle pushes a history entry (hash change) instead of an in-place replace', () => {
    const onViewChange = vi.fn();
    const strip = renderHeaderStrip({ selectedGroups: [], period: null, onUpdate: () => {}, onViewChange });
    document.body.appendChild(strip);
    strip.querySelector('[data-testid="view-toggle-map"]').click();
    expect(window.location.hash).toBe('#/events?view=map');
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('leaving Map via the toggle also changes the hash; Calendar↔List stays in place', () => {
    window.history.replaceState(null, '', '#/events?view=map');
    readStateFromUrl();
    const strip = renderHeaderStrip({ selectedGroups: [], period: null, onUpdate: () => {} });
    expect(strip.querySelector('[data-testid="view-toggle-map"]').getAttribute('aria-pressed')).toBe('true');
    strip.querySelector('[data-testid="view-toggle-list"]').click();
    expect(window.location.hash).toBe('#/events?view=list');
  });

  it('both Map launch buttons are gone; header links point at the Map view', () => {
    const grid = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    const locs = readFileSync('src/features/locations/index.js', 'utf8');
    const header = readFileSync('src/ui/header.js', 'utf8');
    expect(grid).not.toMatch(/loc-mgmt-open-map/);
    expect(locs).not.toMatch(/locations-open-map/);
    for (const src of [grid, locs, header]) expect(src).not.toMatch(/['"]#\/map['"]/);
    expect(header).toMatch(/sidebarNavItem\(MAP_VIEW_HASH, 'Map'/);
    expect(header).toMatch(/navLink\(MAP_VIEW_HASH, 'Map'/);
  });

  it('draw / pin / view intents open the Map view and keep the intent', () => {
    startDrawLocation('loc-x');
    expect(window.location.hash).toBe(MAP_VIEW_HASH);
    expect(mapIntent).toEqual({ mode: 'draw', locationId: 'loc-x' });
    window.history.replaceState(null, '', '#/todos');
    startDropTodoPin('todo-1');
    expect(window.location.hash).toBe(MAP_VIEW_HASH);
    expect(mapIntent).toEqual({ mode: 'pin', todoId: 'todo-1' });
    openFarmMap();
    expect(mapIntent).toEqual({ mode: 'view' });
  });

  it('legacy #/map redirects by replacing the entry and keeps the intent', () => {
    setMapIntent({ mode: 'pin', todoId: 't9' });
    window.history.replaceState(null, '', '#/map');
    const lenBefore = window.history.length;
    const render = vi.fn();
    const c = document.createElement('div');
    redirectLegacyMapRoute(c, render);
    expect(window.location.hash).toBe(MAP_VIEW_HASH);
    expect(window.history.length).toBe(lenBefore);
    expect(render).toHaveBeenCalledWith(c);
    expect(mapIntent).toEqual({ mode: 'pin', todoId: 't9' });
  });
});

describe('OI-0263 Ex1 — Back/Close + stacking context', () => {
  it('Back goes to the opener; cold launch or a map hash falls back to Locations & Rotation', () => {
    expect(mapBackTarget('#/todos')).toBe('#/todos');
    expect(mapBackTarget('#/events?view=list')).toBe('#/events?view=list');
    expect(mapBackTarget(null)).toBe(MAP_BACK_FALLBACK_HASH);
    expect(mapBackTarget('#/map')).toBe('#/events');
    expect(mapBackTarget('#/events?view=map')).toBe('#/events');
  });

  it('router remembers the previous hash from hashchange.oldURL', () => {
    _setPreviousHash(null);
    const c = document.createElement('div');
    route('#/', () => {});
    initRouter(c);
    expect(getPreviousHash()).toBeNull();
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      oldURL: 'http://localhost/#/todos', newURL: 'http://localhost/#/events?view=map',
    }));
    expect(getPreviousHash()).toBe('#/todos');
  });

  it('Map view renders under the View toggle with an always-visible Back that returns to the opener', async () => {
    resetCalendarState();
    window.history.replaceState(null, '', '#/events?view=map');
    readStateFromUrl();
    _setPreviousHash('#/feed');
    const { renderCalendarGrid } = await import('../../src/features/events/rotation-calendar/calendar-grid.js');
    const { _reset, add } = await import('../../src/data/store.js');
    const LocationEntity = await import('../../src/entities/location.js');
    _reset();
    add('locations', LocationEntity.create({
      id: '00000000-0000-4000-8000-0000000000c1', operationId: '00000000-0000-4000-8000-0000000000aa',
      farmId: '00000000-0000-4000-8000-0000000000bb', name: 'North', type: 'land', landUse: 'pasture',
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCalendarGrid(container);
    expect(container.querySelector('[data-testid="calendar-header-strip"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="loc-mgmt-map-view"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="calendar-grid"]')).toBeFalsy();
    const back = container.querySelector('[data-testid="farm-map-back"]');
    expect(back).toBeTruthy();
    back.click();
    expect(window.location.hash).toBe('#/feed');
  });

  it('.farm-map-canvas is its own stacking context sized to the viewport (dvh + safe-area)', () => {
    const rule = css.match(/\.farm-map-canvas\s*\{([^}]*)\}/);
    expect(rule[1]).toMatch(/position:\s*relative/);
    expect(rule[1]).toMatch(/z-index:\s*0/);
    expect(rule[1]).toMatch(/isolation:\s*isolate/);
    expect(rule[1]).toMatch(/100dvh/);
    expect(rule[1]).toMatch(/var\(--safe-bottom\)/);
    expect(rule[1]).not.toMatch(/70vh/);
  });
});
