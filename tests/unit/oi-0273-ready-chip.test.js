/** @file OI-0273 (Rg0+Ro0+Rp1 + Tim t1375u Rq1) “Ready” / “Ready (est.)” chip just right
 * of the pasture name; plus the List type badge land-use label (OI-0271 follow-up). */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  computeReadiness, closeRecoveryAnchor, readyChipKind, READY_CHIP_TEXT,
} from '../../src/features/events/rotation-calendar/readiness.js';

beforeAll(() => setLocale('en', enLocale));

const iso = (offset) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TODAY = iso(0);

/** One closed window; `minDays` set → close obs entered recovery days, else farm defaults. */
const closedAt = (locId, closeOffset, minDays = null, maxDays = null) => ({
  paddockWindows: [{ id: `pw-${locId}`, locationId: locId, eventId: `ev-${locId}`, dateOpened: iso(closeOffset - 5), dateClosed: iso(closeOffset) }],
  events: [{ id: `ev-${locId}`, dateOut: iso(closeOffset) }],
  observations: minDays == null ? [] : [{
    id: `o-${locId}`, type: 'close', source: 'event', sourceId: `pw-${locId}`, locationId: locId,
    observedAt: iso(closeOffset), recoveryMinDays: minDays, recoveryMaxDays: maxDays ?? minDays + 14,
  }],
});
/** Grazed, no close date on the window → relative mode. */
const relativeAt = (locId, outOffset) => ({
  paddockWindows: [{ id: `pw-${locId}`, locationId: locId, eventId: `ev-${locId}`, dateOpened: iso(outOffset - 5), dateClosed: null }],
  events: [{ id: `ev-${locId}`, dateOut: iso(outOffset) }],
  observations: [],
});
const survey = (locId, offset, minDays, maxDays) => ({
  id: `s-${locId}-${offset}`, type: 'survey', source: 'survey', locationId: locId,
  observedAt: iso(offset), recoveryMinDays: minDays, recoveryMaxDays: maxDays,
});
const readiness = (locId, data, extra = {}) => computeReadiness({ id: locId }, {
  today: TODAY, defaultRecoveryMinDays: 21, defaultRecoveryMaxDays: 35, ...data, ...extra,
});
const kind = (r, opts = {}) => readyChipKind(r, { today: TODAY, minRestDays: 21, ...opts });

describe('OI-0273 closeRecoveryAnchor.obsSuppliedDays (read-only flag)', () => {
  it('true when the close obs entered recovery days; false on farm defaults; carried onto the Sv2 close anchor', () => {
    const entered = closedAt('E', -30, 25);
    expect(closeRecoveryAnchor('E', { ...entered })).toMatchObject({ obsSuppliedDays: true, minDays: 25 });
    expect(readiness('E', entered).anchor).toMatchObject({ dateSource: 'close', obsSuppliedDays: true });
    const dflt = closedAt('D', -30);
    expect(closeRecoveryAnchor('D', { ...dflt })).toMatchObject({ obsSuppliedDays: false, minDays: 21 });
    expect(readiness('D', dflt).anchor).toMatchObject({ dateSource: 'close', obsSuppliedDays: false });
  });

  it('other readiness output unchanged by the flag (same window / label)', () => {
    const r = readiness('D', closedAt('D', -30));
    expect(r.mode).toBe('survey');
    expect(r.earliestReturn).toBe(iso(-9));
    expect(r.label).toMatch(/^Estimated ready /);
  });
});

describe('OI-0273 readyChipKind (unit)', () => {
  it('entered-recovery close past earliestReturn → Ready; before → none', () => {
    expect(kind(readiness('E', closedAt('E', -30, 25)))).toBe('ready');
    expect(kind(readiness('E', closedAt('E', -30, 40)))).toBeNull();
    expect(READY_CHIP_TEXT.ready).toBe('Ready');
  });

  it('farm-default close (≥ 21 days) → Ready (est.); under 21 → none', () => {
    expect(kind(readiness('D', closedAt('D', -21)))).toBe('estimated');
    expect(kind(readiness('D', closedAt('D', -60)))).toBe('estimated');
    expect(kind(readiness('D', closedAt('D', -20)))).toBeNull();
    expect(READY_CHIP_TEXT.estimated).toBe('Ready (est.)');
  });

  it('survey-anchored: before / on / after earliestReturn → none / Ready / Ready; past_max still Ready (Ro0)', () => {
    const base = closedAt('S', -40); // farm-default close, later survey wins (Sv2)
    const at = (svOffset, min) => readiness('S', { ...base, observations: [survey('S', svOffset, min, min + 10)] });
    const before = at(-10, 20);
    expect(before.anchor.dateSource).toBe('survey');
    expect(before.earliestReturn > TODAY).toBe(true);
    expect(kind(before)).toBeNull(); // a real anchor not yet due → no est. fallback
    const on = at(-10, 10);
    expect(on.earliestReturn).toBe(TODAY);
    expect(kind(on)).toBe('ready');
    expect(kind(at(-10, 5))).toBe('ready');
    const pastMax = at(-30, 5);
    expect(pastMax.confidence).toBe('past_max');
    expect(kind(pastMax)).toBe('ready');
  });

  it('Sv2: a same-day survey loses to the close — the close’s own recovery days decide', () => {
    const dflt = closedAt('Q', -30);
    const sameDayOnDefault = readiness('Q', { ...dflt, observations: [survey('Q', -30, 5, 10)] });
    expect(sameDayOnDefault.anchor.dateSource).toBe('close');
    expect(kind(sameDayOnDefault)).toBe('estimated');
    const entered = closedAt('Q', -30, 25);
    const sameDayOnEntered = readiness('Q', {
      ...entered, observations: [...entered.observations, survey('Q', -30, 50, 60)],
    });
    expect(kind(sameDayOnEntered)).toBe('ready');
  });

  it('strip paddock: one strip still under its min → no chip', () => {
    const data = {
      paddockWindows: [
        { id: 'pwA', locationId: 'P', eventId: 'ev', dateOpened: iso(-33), dateClosed: iso(-30), isStripGraze: true, stripGroupId: 'sg' },
        { id: 'pwB', locationId: 'P', eventId: 'ev', dateOpened: iso(-36), dateClosed: iso(-35), isStripGraze: true, stripGroupId: 'sg' },
      ],
      events: [{ id: 'ev', dateOut: iso(-30) }],
      observations: [
        { id: 'oA', type: 'close', source: 'event', sourceId: 'pwA', locationId: 'P', observedAt: iso(-30), recoveryMinDays: 25, recoveryMaxDays: 35 },
        { id: 'oB', type: 'close', source: 'event', sourceId: 'pwB', locationId: 'P', observedAt: iso(-35), recoveryMinDays: 40, recoveryMaxDays: 50 },
      ],
    };
    const r = readiness('P', data);
    expect(r.earliestReturn > TODAY).toBe(true);
    expect(kind(r)).toBeNull();
    // Every strip past its min (entered days) → Ready.
    const r2 = readiness('P', { ...data, observations: [data.observations[0]] });
    expect(kind(r2)).toBe('ready');
  });

  it('relative mode: 20 → none; 21 and 40 → Ready (est.); farm min respected', () => {
    const r20 = readiness('R', relativeAt('R', -20));
    expect(r20.mode).toBe('relative');
    expect(r20.daysSinceLastGraze).toBe(20);
    expect(kind(r20)).toBeNull();
    const r21 = readiness('R', relativeAt('R', -21));
    expect(r21.daysSinceLastGraze).toBe(21);
    expect(kind(r21)).toBe('estimated');
    expect(kind(readiness('R', relativeAt('R', -40)))).toBe('estimated');
    expect(kind(readiness('R', relativeAt('R', -25)), { minRestDays: 30 })).toBeNull();
  });

  it('Rg0 never grazed, active, and active/linked flagged by the caller → none', () => {
    const never = readiness('N', { paddockWindows: [], events: [], observations: [] });
    expect(never.mode).toBe('never');
    expect(kind(never)).toBeNull();
    const active = readiness('A', closedAt('A', -60), { hasActiveEvent: true });
    expect(active.mode).toBe('active');
    expect(kind(active)).toBeNull();
    expect(kind(readiness('E', closedAt('E', -30, 25)), { isActive: true })).toBeNull();
    expect(kind(readiness('R', relativeAt('R', -40)), { isActive: true })).toBeNull();
    expect(kind(null)).toBeNull();
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
  const closeObs = (id, pwId, locationId, offset, min) => put('paddockObservations', {
    id, operationId: 'op', type: 'close', source: 'event', sourceId: pwId, locationId, observedAt: iso(offset), recoveryMinDays: min, recoveryMaxDays: min + 14,
  });

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
    // Entered recovery days (25), closed 30 days ago → Ready.
    loc('L-ready', 'Ready One');
    ev('e-ready', iso(-30)); pw('p-ready', 'e-ready', 'L-ready', iso(-35), iso(-30));
    closeObs('o-ready', 'p-ready', 'L-ready', -30, 25);
    // Farm-default close 25 days ago → Ready (est.).
    loc('L-dflt', 'Default Close');
    ev('e-dflt', iso(-25)); pw('p-dflt', 'e-dflt', 'L-dflt', iso(-30), iso(-25));
    // Farm-default close 10 days ago → none.
    loc('L-soon', 'Soon');
    ev('e-soon', iso(-10)); pw('p-soon', 'e-soon', 'L-soon', iso(-15), iso(-10));
    // Relative (window never closed) 21 / 20 days.
    loc('L-rel21', 'Rel 21');
    ev('e-r21', iso(-21)); pw('p-r21', 'e-r21', 'L-rel21', iso(-26), null);
    loc('L-rel20', 'Rel 20');
    ev('e-r20', iso(-20)); pw('p-r20', 'e-r20', 'L-rel20', iso(-25), null);
    loc('L-never', 'Never');
    loc('L-active', 'Active Now');
    ev('e-act', null); pw('p-act', 'e-act', 'L-active', iso(-60), null);
    // Linked secondary of a ready-looking paddock → no chip.
    loc('L-linked', 'Linked Sec', { linkedPaddockId: 'L-ready' });
    ev('e-lk', iso(-30)); pw('p-lk', 'e-lk', 'L-linked', iso(-35), iso(-30));
    closeObs('o-lk', 'p-lk', 'L-linked', -30, 25);
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
    expect(chipFor(c, 'L-dflt').textContent).toBe('Ready (est.)');
    expect(chipFor(c, 'L-dflt').classList.contains('loc-mgmt__ready-chip--est')).toBe(true);
    expect(chipFor(c, 'L-rel21').textContent).toBe('Ready (est.)');
    for (const id of ['L-soon', 'L-rel20', 'L-never', 'L-active', 'L-linked']) {
      expect(chipFor(c, id), id).toBeNull();
    }
    expect(c.textContent).not.toMatch(/Ready\?/);
    // Sits just right of the name, inside the shared name cell.
    const nameText = chipFor(c, 'L-ready').parentElement;
    expect(nameText.classList.contains('loc-mgmt__name-text')).toBe(true);
    expect(nameText.firstChild.classList.contains('loc-mgmt__name-label')).toBe(true);
    expect(nameText.firstChild.textContent).toBe('Ready One');
    expect(nameText.childNodes[1]).toBe(chipFor(c, 'L-ready'));
    // Status tags unchanged.
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
    let c = mount();
    expect(c.querySelector('.loc-mgmt--phone')).toBeTruthy();
    checkChips(c);
    document.body.innerHTML = '';
    setView('list');
    c = mount();
    checkChips(c);
  });

  it('phone layout CSS: name ellipses first; chip never shrinks or wraps', () => {
    const css = readFileSync(resolve(__dirname, '../../src/styles/main.css'), 'utf8');
    const rule = (sel) => {
      const i = css.indexOf(`${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    const chip = rule('.loc-mgmt__ready-chip');
    expect(chip).toMatch(/flex-shrink:\s*0/);
    expect(chip).toMatch(/white-space:\s*nowrap/);
    const text = rule('.loc-mgmt--phone .loc-mgmt__name-text');
    expect(text).toMatch(/display:\s*flex/);
    expect(text).toMatch(/flex-wrap:\s*nowrap/);
    expect(text).toMatch(/min-width:\s*0/);
    const label = rule('.loc-mgmt--phone .loc-mgmt__name-label');
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(label).toMatch(/white-space:\s*nowrap/);
    expect(rule('.loc-mgmt__ready-chip--est')).toMatch(/dashed/);
    expect(rule('.loc-mgmt__ready-chip--ready')).toMatch(/background:\s*var\(--green-l\)/);
  });

  it('List type badge shows the land-use label, never the raw value (mixed_use → Mixed-use)', () => {
    loc('L-mixed', 'Mixed One', { landUse: 'mixed_use' });
    loc('L-nolu', 'No Land Use', { landUse: null });
    setView('list');
    const c = mount();
    const badge = id => c.querySelector(`[data-testid="loc-mgmt-land-use-badge"][data-location-id="${id}"]`).textContent;
    expect(badge('L-mixed')).toBe('Mixed-use');
    expect(badge('L-ready')).toBe('Pasture');
    expect(badge('L-nolu')).toBe('Pasture');
    expect(c.textContent).not.toMatch(/mixed_use/);
  });
});
