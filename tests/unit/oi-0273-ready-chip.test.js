/** @file OI-0273 (Rg0+Ro0+Rp1) Ready / “Ready?” chip just right of the pasture name. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState, setView } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import {
  computeReadiness, readyChipKind, READY_CHIP_TEXT,
} from '../../src/features/events/rotation-calendar/readiness.js';

beforeAll(() => setLocale('en', enLocale));

const iso = (offset) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TODAY = iso(0);

/** One closed window (survey mode via farm defaults 21..35). */
const closedAt = (locId, closeOffset, extra = {}) => ({
  paddockWindows: [{ id: `pw-${locId}`, locationId: locId, eventId: `ev-${locId}`, dateOpened: iso(closeOffset - 5), dateClosed: iso(closeOffset), ...extra }],
  events: [{ id: `ev-${locId}`, dateOut: iso(closeOffset) }],
});
/** Grazed, no close date on the window → relative mode. */
const relativeAt = (locId, outOffset) => ({
  paddockWindows: [{ id: `pw-${locId}`, locationId: locId, eventId: `ev-${locId}`, dateOpened: iso(outOffset - 5), dateClosed: null }],
  events: [{ id: `ev-${locId}`, dateOut: iso(outOffset) }],
});
const readiness = (locId, data, extra = {}) => computeReadiness({ id: locId }, {
  today: TODAY, observations: [], defaultRecoveryMinDays: 21, defaultRecoveryMaxDays: 35, ...data, ...extra,
});

describe('OI-0273 readyChipKind (unit)', () => {
  it('survey: before earliestReturn → no chip', () => {
    const r = readiness('S', closedAt('S', -10));
    expect(r.mode).toBe('survey');
    expect(r.earliestReturn > TODAY).toBe(true);
    expect(readyChipKind(r, { today: TODAY })).toBeNull();
  });

  it('survey: on earliestReturn → Ready', () => {
    const r = readiness('S', closedAt('S', -21));
    expect(r.earliestReturn).toBe(TODAY);
    expect(readyChipKind(r, { today: TODAY })).toBe('ready');
  });

  it('survey: after earliestReturn → Ready', () => {
    const r = readiness('S', closedAt('S', -25));
    expect(r.confidence).not.toBe('past_max');
    expect(readyChipKind(r, { today: TODAY })).toBe('ready');
  });

  it('Ro0: past windowCloses (past_max) still plain Ready', () => {
    const r = readiness('S', closedAt('S', -60));
    expect(r.confidence).toBe('past_max');
    expect(readyChipKind(r, { today: TODAY })).toBe('ready');
    expect(READY_CHIP_TEXT.ready).toBe('Ready');
  });

  it('strip paddock: one strip still under its min → no chip', () => {
    const data = {
      paddockWindows: [
        { id: 'pwA', locationId: 'P', eventId: 'ev', dateOpened: iso(-33), dateClosed: iso(-30), isStripGraze: true, stripGroupId: 'sg' },
        { id: 'pwB', locationId: 'P', eventId: 'ev', dateOpened: iso(-36), dateClosed: iso(-35), isStripGraze: true, stripGroupId: 'sg' },
      ],
      events: [{ id: 'ev', dateOut: iso(-30) }],
      // Strip B's close obs needs 40 days → not past min until day +5.
      observations: [{ id: 'oB', type: 'close', source: 'event', sourceId: 'pwB', locationId: 'P', observedAt: iso(-35), recoveryMinDays: 40, recoveryMaxDays: 50 }],
    };
    const r = readiness('P', data);
    expect(r.mode).toBe('survey');
    expect(r.earliestReturn > TODAY).toBe(true);
    expect(readyChipKind(r, { today: TODAY })).toBeNull();
    // Every strip past its min → Ready.
    const r2 = readiness('P', { ...data, observations: [] });
    expect(readyChipKind(r2, { today: TODAY })).toBe('ready');
  });

  it('relative: under 21 days → no chip; at 21 and over → Ready?', () => {
    const r20 = readiness('R', relativeAt('R', -20));
    expect(r20.mode).toBe('relative');
    expect(r20.daysSinceLastGraze).toBe(20);
    expect(readyChipKind(r20, { today: TODAY, minRestDays: 21 })).toBeNull();
    const r21 = readiness('R', relativeAt('R', -21));
    expect(r21.daysSinceLastGraze).toBe(21);
    expect(readyChipKind(r21, { today: TODAY, minRestDays: 21 })).toBe('maybe');
    const r40 = readiness('R', relativeAt('R', -40));
    expect(readyChipKind(r40, { today: TODAY, minRestDays: 21 })).toBe('maybe');
    expect(READY_CHIP_TEXT.maybe).toBe('Ready?');
  });

  it('relative uses the farm default minimum rest (e.g. 30)', () => {
    const r25 = readiness('R', relativeAt('R', -25));
    expect(readyChipKind(r25, { today: TODAY, minRestDays: 30 })).toBeNull();
    expect(readyChipKind(r25, { today: TODAY })).toBe('maybe'); // default 21
  });

  it('Rg0: never grazed → no chip', () => {
    const r = readiness('N', { paddockWindows: [], events: [] });
    expect(r.mode).toBe('never');
    expect(readyChipKind(r, { today: TODAY })).toBeNull();
  });

  it('active (grazed now) or caller-flagged active/linked → no chip', () => {
    const r = readiness('A', closedAt('A', -60), { hasActiveEvent: true });
    expect(r.mode).toBe('active');
    expect(readyChipKind(r, { today: TODAY })).toBeNull();
    const ready = readiness('S', closedAt('S', -60));
    expect(readyChipKind(ready, { today: TODAY, isActive: true })).toBeNull();
    expect(readyChipKind(null, { today: TODAY })).toBeNull();
  });
});

describe('OI-0273 grid: chip right of the name on Calendar, List and phone', () => {
  const ok = () => ({ valid: true, errors: [] });
  const ident = (r) => r;
  const put = (type, rec) => add(type, rec, ok, ident, type);
  const origWidth = window.innerWidth;
  const loc = (id, name, extra = {}) => put('locations', { id, operationId: 'op', farmId: 'farm', name, type: 'land', landUse: 'pasture', areaHectares: 2, ...extra });
  const ev = (id, dateOut) => put('events', { id, operationId: 'op', farmId: 'farm', dateOut });
  const pw = (id, eventId, locationId, dateOpened, dateClosed) => put('eventPaddockWindows', { id, operationId: 'op', eventId, locationId, dateOpened, dateClosed, areaPct: 100 });

  beforeEach(() => {
    _reset();
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    window.innerWidth = 1280;
    put('operations', { id: 'op', name: 'Op', unitSystem: 'imperial' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op' });
    loc('L-ready', 'Ready One');
    ev('e-ready', iso(-25)); pw('p-ready', 'e-ready', 'L-ready', iso(-30), iso(-25));
    loc('L-soon', 'Soon');
    ev('e-soon', iso(-10)); pw('p-soon', 'e-soon', 'L-soon', iso(-15), iso(-10));
    loc('L-pastmax', 'Past Max');
    ev('e-pm', iso(-60)); pw('p-pm', 'e-pm', 'L-pastmax', iso(-65), iso(-60));
    loc('L-rel21', 'Rel 21');
    ev('e-r21', iso(-21)); pw('p-r21', 'e-r21', 'L-rel21', iso(-26), null);
    loc('L-rel20', 'Rel 20');
    ev('e-r20', iso(-20)); pw('p-r20', 'e-r20', 'L-rel20', iso(-25), null);
    loc('L-never', 'Never');
    loc('L-active', 'Active Now');
    ev('e-act', null); pw('p-act', 'e-act', 'L-active', iso(-60), null);
    // Linked secondary of a ready-looking paddock → no chip.
    loc('L-linked', 'Linked Sec', { linkedPaddockId: 'L-ready' });
    ev('e-lk', iso(-25)); pw('p-lk', 'e-lk', 'L-linked', iso(-30), iso(-25));
  });
  afterEach(() => { window.innerWidth = origWidth; });

  const mount = () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  };
  const chipFor = (c, id) => c.querySelector(`[data-testid="loc-mgmt-ready-chip"][data-location-id="${id}"]`);

  function checkChips(c) {
    expect(chipFor(c, 'L-ready').textContent).toBe('Ready');
    expect(chipFor(c, 'L-ready').classList.contains('loc-mgmt__ready-chip--ready')).toBe(true);
    expect(chipFor(c, 'L-pastmax').textContent).toBe('Ready');
    expect(chipFor(c, 'L-rel21').textContent).toBe('Ready?');
    expect(chipFor(c, 'L-rel21').classList.contains('loc-mgmt__ready-chip--maybe')).toBe(true);
    for (const id of ['L-soon', 'L-rel20', 'L-never', 'L-active', 'L-linked']) {
      expect(chipFor(c, id), id).toBeNull();
    }
    // Sits just right of the name text, inside the shared name cell.
    const nameText = chipFor(c, 'L-ready').parentElement;
    expect(nameText.classList.contains('loc-mgmt__name-text')).toBe(true);
    expect(nameText.firstChild.textContent).toBe('Ready One');
    expect(nameText.childNodes[1]).toBe(chipFor(c, 'L-ready'));
    // Status tags unchanged: never grazed keeps its copy; active keeps ● Active.
    const tag = id => c.querySelector(`[data-testid="paddock-row"][data-location-id="${id}"] .loc-mgmt__tag`)?.textContent;
    expect(tag('L-never')).toMatch(/^Never grazed/);
    expect(tag('L-active')).toBe('● Active');
  }

  it('desktop Calendar', () => { checkChips(mount()); });

  it('List view', () => {
    setView('list');
    const c = mount();
    expect(c.querySelector('[data-testid="paddock-row"]').classList.contains('loc-mgmt__name--static')).toBe(true);
    checkChips(c);
  });

  it('Rp1 phone (Calendar and List)', () => {
    window.innerWidth = 400;
    checkChips(mount());
    document.body.innerHTML = '';
    setView('list');
    checkChips(mount());
  });
});
