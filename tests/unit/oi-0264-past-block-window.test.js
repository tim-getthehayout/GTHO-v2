/** @file OI-0264 Pw1+Hc1+Mw1+Cn1 — Rotation past blocks per paddock window. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PwEntity from '../../src/entities/event-paddock-window.js';
import * as GwEntity from '../../src/entities/event-group-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  pastWindowSpan, headCountAtWindowEnd, groupWindowPresentOnEnd,
  computePaddockWindowMetrics, eventConnectors,
} from '../../src/features/events/rotation-calendar/past-window.js';
import { computeLocationMetrics } from '../../src/features/events/rotation-calendar/location-metrics.js';
import { renderPastBlock, formatPastureFeedDmiLine } from '../../src/features/events/rotation-calendar/past-block.js';
import { renderLegend } from '../../src/features/events/rotation-calendar/legend.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';

beforeAll(() => setLocale('en', enLocale));

// 38cb666e-shaped fixture (synthetic ids): F-1 opens first; F-4, F-5, F-2, F-3
// stagger in; F-4/F-5 close Apr 28; F-1/F-2/F-3 close with the event May 6.
const EV = { id: 'ev', dateOut: '2026-05-06' };
const W = {
  f1: { id: 'p1', eventId: 'ev', locationId: 'F-1', dateOpened: '2026-04-23', dateClosed: '2026-05-06', areaPct: 100 },
  f4: { id: 'p4', eventId: 'ev', locationId: 'F-4', dateOpened: '2026-04-24', dateClosed: '2026-04-28', areaPct: 100 },
  f5: { id: 'p5', eventId: 'ev', locationId: 'F-5', dateOpened: '2026-04-25', dateClosed: '2026-04-28', areaPct: 100 },
  f2: { id: 'p2', eventId: 'ev', locationId: 'F-2', dateOpened: '2026-04-28', dateClosed: '2026-05-06', areaPct: 100 },
  f3: { id: 'p3', eventId: 'ev', locationId: 'F-3', dateOpened: '2026-04-29', dateClosed: '2026-05-06', areaPct: 100 },
};
const ALL = [W.f1, W.f4, W.f5, W.f2, W.f3];
// Group A hands over on Apr 29 (30 → 27 hd); group B stays (4 hd).
const GWS = [
  { id: 'gA1', eventId: 'ev', groupId: 'gA', dateJoined: '2026-04-23', dateLeft: '2026-04-29', headCount: 30 },
  { id: 'gA2', eventId: 'ev', groupId: 'gA', dateJoined: '2026-04-29', dateLeft: '2026-05-06', headCount: 27 },
  { id: 'gB', eventId: 'ev', groupId: 'gB', dateJoined: '2026-04-23', dateLeft: '2026-05-06', headCount: 4 },
];
const GROUPS = [{ id: 'gA', name: 'Cows' }, { id: 'gB', name: 'Bulls' }];
const hc = (pw, extra = {}) => headCountAtWindowEnd(pw, {
  eventGroupWindows: GWS, groups: GROUPS, memberships: [], animals: [], today: '2026-11-22', ...extra,
});

describe('OI-0264 Pw1 — bar per window', () => {
  it('1. staggered staircase: each window starts on its own open date', () => {
    const starts = ALL.map(pw => pastWindowSpan(pw, EV, { today: '2026-11-22' }).start);
    expect(starts).toEqual(['2026-04-23', '2026-04-24', '2026-04-25', '2026-04-28', '2026-04-29']);
  });

  it('2. early close: F-4/F-5 end Apr 28 while F-1 ends May 6', () => {
    expect(pastWindowSpan(W.f4, EV, { today: '2026-11-22' })).toMatchObject({ end: '2026-04-28', days: 5 });
    expect(pastWindowSpan(W.f5, EV, { today: '2026-11-22' })).toMatchObject({ end: '2026-04-28', days: 4 });
    expect(pastWindowSpan(W.f1, EV, { today: '2026-11-22' })).toMatchObject({ end: '2026-05-06', days: 14 });
  });

  it('3. late close: window closing after its event draws as recorded', () => {
    const ev = { id: 'e3', dateOut: '2026-11-16' };
    const pw = { id: 'x', eventId: 'e3', locationId: 'E-3', dateOpened: '2026-11-10', dateClosed: '2026-11-17' };
    expect(pastWindowSpan(pw, ev, { today: '2026-11-22' })).toMatchObject({ end: '2026-11-17', days: 8, isActive: false });
  });

  it('4. open window runs to today and carries the NOW ring; closed sibling does not', () => {
    const ev = { id: 'e4', dateOut: null };
    const open = { id: 'o', dateOpened: '2026-11-15', dateClosed: null };
    const shut = { id: 's', dateOpened: '2026-11-10', dateClosed: '2026-11-15' };
    expect(pastWindowSpan(open, ev, { today: '2026-11-22' })).toMatchObject({ end: '2026-11-22', isActive: true });
    expect(pastWindowSpan(shut, ev, { today: '2026-11-22' }).isActive).toBe(false);
    // Guard: still-open window on a closed event stops at the event close.
    expect(pastWindowSpan(open, { id: 'e4', dateOut: '2026-11-18' }, { today: '2026-11-22' }).end).toBe('2026-11-18');
  });

  it('5. repeat windows on one paddock give two bars with their own spans', () => {
    const a = { id: 'r1', dateOpened: '2026-06-01', dateClosed: '2026-06-05' };
    const b = { id: 'r2', dateOpened: '2026-06-10', dateClosed: '2026-06-12' };
    const ev = { id: 'r', dateOut: '2026-06-12' };
    expect([a, b].map(pw => pastWindowSpan(pw, ev, { today: '2026-11-22' }).days)).toEqual([5, 3]);
  });
});

describe('OI-0264 Hc1 — head count at window end', () => {
  it('6. 38cb666e shape: F-1/F-2/F-3 show 31 hd, F-4/F-5 show 34 hd', () => {
    expect([W.f1, W.f2, W.f3].map(pw => hc(pw).headCount)).toEqual([31, 31, 31]);
    expect([W.f4, W.f5].map(pw => hc(pw).headCount)).toEqual([34, 34]);
  });

  it('7. same-day hand-over on Apr 29 picks the later-joined, longer window (27)', () => {
    const r = hc({ id: 'h', dateClosed: '2026-04-29' });
    const a = r.picks.find(p => p.groupId === 'gA');
    expect(a.id).toBe('gA2');
    expect(r.headCount).toBe(31);
  });

  it('8. each group once; label de-duplicated to "Multiple Groups (2)"', () => {
    const r = hc(W.f1);
    expect(r.groups).toHaveLength(2);
    const node = renderPastBlock({
      leftPx: 0, widthPx: 200, groups: r.groups, auds: 10, days: 14, headCount: r.headCount,
      isActive: false, isStripGraze: false, strips: [], storedFeedOnly: false, eventId: 'ev', onClickBlock: () => {},
    });
    expect(node.textContent).toContain('Multiple Groups (2)');
    expect(node.textContent).toContain('31');
  });

  it('9. bad-data group window (dateLeft < dateJoined) is skipped', () => {
    const bad = { id: 'bad', groupId: 'gZ', dateJoined: '2026-05-01', dateLeft: '2026-04-20', headCount: 99 };
    expect(groupWindowPresentOnEnd(bad, '2026-04-25')).toBe(false);
    const r = hc(W.f4, { eventGroupWindows: [...GWS, bad] });
    expect(r.headCount).toBe(34);
  });
});

// Metric ctx (known DMI) modelled on location-management-metrics fixtures.
const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
const herd = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, classId: 'ac1', archived: false, status: 'active' }));
const LOCS = ['L1', 'L2'].map(id => ({ id, name: id, type: 'land', landUse: 'pasture', areaHectares: 4.047 }));
function mctx(over = {}) {
  return {
    today: '2026-11-22',
    groupWindows: [],
    memberships: herd.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null })),
    animals: herd,
    animalClasses: [cls],
    animalWeightRecords: herd.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-09-01' })),
    locations: LOCS,
    observations: [],
    feedEntries: [], feedChecks: [], feedCheckItems: [], batches: [], feedTypes: [], batchNutritionalProfiles: [],
    ...over,
  };
}
const spanOf = (pw, ev) => pastWindowSpan(pw, ev, { today: '2026-11-22' });

describe('OI-0264 Mw1 — window-scoped label metrics', () => {
  it('10. noPasture window shows Pasture 0% · Feed 100% · 0 DMI', () => {
    const ev = { id: 'n', dateOut: '2026-10-05' };
    const pw = { id: 'np', eventId: 'n', locationId: 'L1', dateOpened: '2026-10-01', dateClosed: '2026-10-05', noPasture: true };
    const m = computePaddockWindowMetrics(pw, LOCS[0], ev, spanOf(pw, ev), mctx({ paddockWindows: [pw] }));
    expect(m).toMatchObject({ pasturePct: 0, feedPct: 100, dmi: 0, storedFeedOnly: true });
    expect(formatPastureFeedDmiLine({ pasturePct: 0, feedPct: 100, dmi: 0, headCount: 10 })).toContain('Pasture 0% · Feed 100% · 0 DMI');
  });

  it('11. unknown DMI → "Pasture —% · Feed —% · — DMI" while the sibling window stays known', () => {
    const ev = { id: 'u', dateOut: '2026-10-10' };
    const bad = { id: 'pb', eventId: 'u', locationId: 'L1', dateOpened: '2026-10-01', dateClosed: '2026-10-05', areaPct: 100 };
    const good = { id: 'pg', eventId: 'u', locationId: 'L2', dateOpened: '2026-10-05', dateClosed: '2026-10-10', areaPct: 100 };
    const badHerd = [{ id: 'z1', classId: 'acBad', archived: false, status: 'active' }];
    const ctx = mctx({
      paddockWindows: [bad, good],
      groupWindows: [
        { id: 'gwBad', eventId: 'u', groupId: 'gBad', animalClassId: 'acBad', dateJoined: '2026-10-01', dateLeft: '2026-10-04', headCount: 1, avgWeightKg: 0 },
        { id: 'gwOk', eventId: 'u', groupId: 'g1', animalClassId: 'ac1', dateJoined: '2026-10-05', dateLeft: '2026-10-10', headCount: 10, avgWeightKg: 453.6 },
      ],
      animals: [...herd, ...badHerd],
      animalClasses: [cls, { id: 'acBad', species: 'beef_cattle' }],
      memberships: [
        ...herd.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null })),
        { id: 'mz1', animalId: 'z1', groupId: 'gBad', dateJoined: '2026-01-01', dateLeft: '2026-10-04' },
      ],
    });
    const mb = computePaddockWindowMetrics(bad, LOCS[0], ev, spanOf(bad, ev), ctx);
    const mg = computePaddockWindowMetrics(good, LOCS[1], ev, spanOf(good, ev), ctx);
    expect(mb.dmi).toBeNull();
    expect(formatPastureFeedDmiLine({ ...mb, headCount: 1 })).toContain('Pasture —% · Feed —% · — DMI');
    expect(mg.dmi).toBeGreaterThan(0);
    expect(mg.pasturePct).toBe(100);
    expect(mg.feedPct).toBe(0);
  });

  it('12. F-4 and F-1 metrics differ; unscoped (List column) result is unchanged', () => {
    const ev = { id: 'd', dateOut: '2026-10-10' };
    const a = { id: 'wa', eventId: 'd', locationId: 'L1', dateOpened: '2026-10-01', dateClosed: '2026-10-10', areaPct: 100 };
    const b = { id: 'wb', eventId: 'd', locationId: 'L2', dateOpened: '2026-10-07', dateClosed: '2026-10-10', areaPct: 100 };
    const ctx = mctx({
      paddockWindows: [a, b],
      groupWindows: [{ id: 'gw', eventId: 'd', groupId: 'g1', animalClassId: 'ac1', dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 10, avgWeightKg: 453.6 }],
    });
    const ma = computePaddockWindowMetrics(a, LOCS[0], ev, spanOf(a, ev), ctx);
    const mb = computePaddockWindowMetrics(b, LOCS[1], ev, spanOf(b, ev), ctx);
    expect(ma.auds).toBeGreaterThan(mb.auds);
    expect(ma.dmi).not.toBeCloseTo(mb.dmi, 3);
    // List column (unscoped) == window-scoped when the location has a single window.
    const list = computeLocationMetrics(LOCS[0], { ...ctx, events: [ev], windowStart: '2026-10-01', windowEnd: '2026-10-10' });
    expect(list.auds).toBeCloseTo(ma.raw.auds, 6);
    expect(list.dmiKg).toBeCloseTo(ma.raw.dmiKg, 6);
    // Repeat windows: unscoped season total = sum of the per-window bars.
    const r1 = { id: 'r1', eventId: 'd', locationId: 'L1', dateOpened: '2026-10-01', dateClosed: '2026-10-04', areaPct: 100 };
    const r2 = { id: 'r2', eventId: 'd', locationId: 'L1', dateOpened: '2026-10-06', dateClosed: '2026-10-10', areaPct: 100 };
    const rctx = { ...ctx, paddockWindows: [r1, r2] };
    const s1 = computePaddockWindowMetrics(r1, LOCS[0], ev, spanOf(r1, ev), rctx);
    const s2 = computePaddockWindowMetrics(r2, LOCS[0], ev, spanOf(r2, ev), rctx);
    const season = computeLocationMetrics(LOCS[0], { ...rctx, events: [ev], windowStart: '2026-10-01', windowEnd: '2026-10-10' });
    expect(s1.raw.auds + s2.raw.auds).toBeCloseTo(season.auds, 6);
  });
});

describe('OI-0264 Cn1 — sub-move connectors', () => {
  it('13. 38cb666e shape: Apr 24 F-1→F-4, Apr 25 F-1→F-5, Apr 28 F-1→F-2, Apr 29 F-1→F-3', () => {
    const cs = eventConnectors(ALL).map(c => `${c.date} ${c.fromLocationId}→${c.toLocationId}`);
    expect(cs).toEqual([
      '2026-04-24 F-1→F-4', '2026-04-25 F-1→F-5', '2026-04-28 F-1→F-2', '2026-04-29 F-1→F-3',
    ]);
  });

  it('13b. no open source → the window that closed most recently; same first day → first window', () => {
    const a = { id: 'a', locationId: 'A', dateOpened: '2026-04-01', dateClosed: '2026-04-05' };
    const a2 = { id: 'a2', locationId: 'A2', dateOpened: '2026-04-01', dateClosed: '2026-04-03' };
    const b = { id: 'b', locationId: 'B', dateOpened: '2026-04-07', dateClosed: null };
    const cs = eventConnectors([b, a2, a]);
    expect(cs.map(c => `${c.date} ${c.fromLocationId}→${c.toLocationId}`)).toEqual([
      '2026-04-01 A→A2', '2026-04-07 A→B',
    ]);
  });

  it('13c. legend swatch is a line sample labelled "Sub-move connector"', () => {
    const lg = renderLegend();
    expect(lg.textContent).toContain('Sub-move connector');
    expect(lg.querySelector('.legend__swatch--submove-connector')).toBeTruthy();
  });
});

// Grid wiring: one past-block per window, NOW ring on the open window only,
// clicks still carry paddockWindowId, connector overlay present.
const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LID = n => `00000000-0000-4000-8000-0000000000c${n}`;
const PID = n => `00000000-0000-4000-8000-0000000000d${n}`;
const EID = '00000000-0000-4000-8000-0000000000e1';
const GID = '00000000-0000-4000-8000-0000000000f1';
const iso = (offset) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('OI-0264 grid wiring', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
      OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
    add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
      FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
    add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
      FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
    for (const n of [1, 2, 3]) {
      add('locations', LocationEntity.create({
        id: LID(n), operationId: OP, farmId: FARM, name: `F-${n}`, type: 'land', landUse: 'pasture', areaHectares: 4,
      }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    }
    add('groups', GroupEntity.create({ id: GID, operationId: OP, name: 'Cows' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('events', EventEntity.create({ id: EID, operationId: OP, farmId: FARM, dateOut: null }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const pws = [
      { id: PID(1), locationId: LID(1), dateOpened: iso(-10), dateClosed: iso(-3) },
      { id: PID(2), locationId: LID(2), dateOpened: iso(-7), dateClosed: null },
      { id: PID(3), locationId: LID(1), dateOpened: iso(-2), dateClosed: iso(-1) },
      { id: PID(4), locationId: LID(3), dateOpened: iso(-5), dateClosed: iso(-4) },
    ];
    for (const p of pws) {
      add('eventPaddockWindows', PwEntity.create({ operationId: OP, eventId: EID, areaPct: 100, ...p }),
        PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
    }
    add('eventGroupWindows', GwEntity.create({
      operationId: OP, eventId: EID, groupId: GID, dateJoined: iso(-10), headCount: 12, avgWeightKg: 450,
    }), GwEntity.validate, GwEntity.toSupabaseShape, 'event_group_windows');
  });

  it('renders one bar per window (repeat windows twice) with NOW ring only on the open window', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    const blocks = [...c.querySelectorAll('[data-testid="past-block"]')];
    expect(blocks.map(b => b.dataset.paddockWindowId).sort()).toEqual([PID(1), PID(2), PID(3), PID(4)].sort());
    const active = blocks.filter(b => b.classList.contains('past-block--active'));
    expect(active.map(b => b.dataset.paddockWindowId)).toEqual([PID(2)]);
    const row1 = c.querySelector(`[data-testid="loc-mgmt-row"][data-location-id="${LID(1)}"]`)
      || c.querySelector(`[data-testid="paddock-row"][data-location-id="${LID(1)}"]`).closest('.loc-mgmt__row');
    expect(row1.querySelectorAll('[data-testid="past-block"]')).toHaveLength(2);
  });

  it('draws a pointer-events:none connector overlay for cross-row sub-moves', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    const overlay = c.querySelector('[data-testid="submove-connectors"]');
    expect(overlay).toBeTruthy();
    const conns = [...overlay.querySelectorAll('[data-testid="submove-connector"]')];
    // F-2 at -7 (from F-1), F-3 at -5 (from F-1), F-1 repeat at -2: source F-2 (open) → cross-row.
    expect(conns.map(n => `${n.dataset.date} ${n.dataset.toLocationId}`)).toEqual([
      `${iso(-7)} ${LID(2)}`, `${iso(-5)} ${LID(3)}`, `${iso(-2)} ${LID(1)}`,
    ]);
    expect(conns[2].dataset.fromLocationId).toBe(LID(2));
  });

  it('same-row repeat windows and hidden (filtered) target rows draw no connector', () => {
    const E2 = '00000000-0000-4000-8000-0000000000e2';
    const E3 = '00000000-0000-4000-8000-0000000000e3';
    const CROP = '00000000-0000-4000-8000-0000000000c9';
    add('locations', LocationEntity.create({
      id: CROP, operationId: OP, farmId: FARM, name: 'Crop', type: 'land', landUse: 'crop', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    for (const id of [E2, E3]) {
      add('events', EventEntity.create({ id, operationId: OP, farmId: FARM, dateOut: iso(-12) }),
        EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    }
    const pws = [
      // E2: repeat on F-3 after a gap → source is the same row → skipped.
      { id: PID(5), eventId: E2, locationId: LID(3), dateOpened: iso(-20), dateClosed: iso(-16) },
      { id: PID(6), eventId: E2, locationId: LID(3), dateOpened: iso(-14), dateClosed: iso(-12) },
      // E3: target paddock is crop (not a rendered row) → skipped.
      { id: PID(7), eventId: E3, locationId: LID(2), dateOpened: iso(-20), dateClosed: iso(-12) },
      { id: PID(8), eventId: E3, locationId: CROP, dateOpened: iso(-18), dateClosed: iso(-13) },
    ];
    for (const p of pws) {
      add('eventPaddockWindows', PwEntity.create({ operationId: OP, areaPct: 100, ...p }),
        PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
    }
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    const conns = [...c.querySelectorAll('[data-testid="submove-connector"]')];
    expect(conns.map(n => n.dataset.toPwId)).toEqual([PID(2), PID(4), PID(3)]);
    expect(conns.every(n => n.closest('[data-testid="submove-connectors"]'))).toBe(true);
  });
});
