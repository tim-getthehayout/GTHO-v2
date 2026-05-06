/** @file OI-0158 — audit page renderer is registry-driven across all three
 * scopes. Pre-OI-0158 the renderer hardcoded DMI-2 / FOR-1 by name and
 * silently discarded every other group-window / paddock-window resolver
 * result. This test seam asserts the integration contract a stub resolver
 * proves end-to-end: a result with `scope: 'group-window'` lands in the
 * matching group-window sub-block; a result with `scope: 'paddock-window'`
 * lands in the matching paddock-window block. The OI-0157-B2 ship-as-half-
 * a-feature gap was the absence of this assertion.
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as ForageTypeEntity from '../../../src/entities/forage-type.js';
import { registerCalc, _clearRegistry } from '../../../src/utils/calc-registry.js';
import * as Resolvers from '../../../src/features/dev-mode/audit-resolvers.js';

// Side-effect imports — production calc registrations have to be available
// when audit.js iterates getAllCalcs() (otherwise the existing DMI-2 / FOR-1
// resolvers fail to register and the dispatcher returns null for them).
import '../../../src/calcs/feed-forage.js';
import '../../../src/calcs/core.js';
import '../../../src/calcs/advanced.js';

import { renderEventAudit } from '../../../src/features/dev-mode/audit.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000c1';
const LOC = '00000000-0000-0000-0000-0000000000d1';
const GROUP = '00000000-0000-0000-0000-0000000000e1';
const PW_ID = 'pw-stub-render';
const GW_ID = 'gw-stub-render';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  // Force unit toggle to its persistence default for deterministic render.
  localStorage.removeItem('dev-audit-unit-mode');
  // Common fixture: one operation, one farm, one event with one open paddock
  // window + one open group window.
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-29' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('forageTypes', ForageTypeEntity.create({
    id: 'ft-stub', operationId: OP, name: 'Cool-season grass',
    dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 50,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'P-1',
    areaHectares: 2, forageTypeId: 'ft-stub',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_ID, operationId: OP, eventId: EVT, locationId: LOC, dateOpened: '2026-04-29', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Stub Group' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_ID, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-29', headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
});

function mountContainer() {
  const c = document.createElement('div');
  c.id = 'app-content';
  document.body.appendChild(c);
  window.location.hash = `#/dev/audit?id=${EVT}`;
  return c;
}

/** Register a stub calc + spy on `resolveCalcForCalcCard` so it returns a
 * controlled stub result whenever the renderer asks for the stub calc's
 * name. Pass-through for every other calc name (DMI-2, FOR-1, etc.). */
function installStubResolver(calcName, scope, instance, descriptionTag = '(OI-0158 stub)') {
  // Register the stub calc so getAllCalcs() includes it — the audit
  // renderer iterates that registry and calls resolveCalcForCalcCard for
  // each entry. Without registration the dispatcher never asks about the
  // stub name.
  try {
    registerCalc({
      name: calcName,
      category: 'animal', // any valid category — content unused in this test
      description: `Stub for OI-0158 integration test ${descriptionTag}`,
      formula: 'stub',
      source: 'OI-0158 test seam',
      inputs: [],
      output: { type: 'number', unit: '' },
      fn: () => instance.output,
    });
  } catch { /* already registered from a prior test run — fine */ }

  const realResolve = Resolvers.resolveCalcForCalcCard;
  vi.spyOn(Resolvers, 'resolveCalcForCalcCard').mockImplementation((name, ctx) => {
    if (name === calcName) {
      return {
        name: calcName,
        applicable: true,
        scope,
        instances: [instance],
      };
    }
    return realResolve(name, ctx);
  });
}

describe('renderEventAudit yielding contract (OI-0150-A)', () => {
  it('returns a Promise (renderEventAudit is async)', () => {
    const result = renderEventAudit(mountContainer());
    expect(result).toBeInstanceOf(Promise);
    return result; // resolve to clean up
  });

  it('yields between sections via setTimeout(0) macrotasks', async () => {
    // Spy on globalThis.setTimeout — every section boundary should produce
    // at least one setTimeout(fn, 0) call. Yields are between every two of
    // 7 top-level sections + once per paddock-window iteration; the spec
    // contract requires ≥ 2 yield sites in production code.
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await renderEventAudit(mountContainer());
    const zeroDelayCalls = spy.mock.calls.filter(([, ms]) => ms === 0);
    expect(zeroDelayCalls.length).toBeGreaterThanOrEqual(2);
    spy.mockRestore();
  });
});

describe('audit renderer dispatches by scope (OI-0158)', () => {
  it('group-window-scoped stub result renders inside the matching group-window sub-block', async () => {
    const STUB = 'STUB-GW-OI0158';
    installStubResolver(STUB, 'group-window', {
      label: 'Stub group-window output',
      groupWindowId: GW_ID,
      inputs: [],
      output: 42,
      gateStatus: 'ok',
      outputMeasure: null,
      outputSuffix: ' stub',
    });

    await renderEventAudit(mountContainer());

    // Pre-OI-0158: this query returned null because the renderer hardcoded
    // DMI-2 by name in the group-window sub-block. Post-OI-0158: the
    // generic loop iterates groupWindowResultsByGwId and surfaces every
    // group-window-scoped resolver result.
    const card = document.querySelector(`[data-testid="dev-audit-calc-card-${STUB}-${GW_ID}"]`);
    expect(card).toBeTruthy();
    // The card sits inside the matching group-window sub-block, not at the
    // event-level rollup section.
    const subBlock = document.querySelector(`[data-testid="dev-audit-group-window-${GW_ID}"]`);
    expect(subBlock).toBeTruthy();
    expect(subBlock.contains(card)).toBe(true);
  });

  it('paddock-window-scoped stub result renders inside the matching paddock-window block', async () => {
    const STUB = 'STUB-PW-OI0158';
    installStubResolver(STUB, 'paddock-window', {
      label: 'Stub paddock-window output',
      paddockWindowId: PW_ID,
      inputs: [],
      output: 7,
      gateStatus: 'ok',
      outputMeasure: null,
      outputSuffix: ' stub',
    });

    await renderEventAudit(mountContainer());

    const card = document.querySelector(`[data-testid="dev-audit-calc-card-${STUB}-${PW_ID}"]`);
    expect(card).toBeTruthy();
    const pwBlock = document.querySelector(`[data-testid="dev-audit-paddock-window-${PW_ID}"]`);
    expect(pwBlock).toBeTruthy();
    expect(pwBlock.contains(card)).toBe(true);
  });

  it('cards in a window block are sorted alphabetically by calc name (deterministic)', async () => {
    // Two stub resolvers in the same group-window scope — assert the cards
    // appear in alphabetical order regardless of iteration order in the
    // dispatcher's allCalcs loop.
    const STUB_Z = 'STUB-Z-OI0158';
    const STUB_A = 'STUB-A-OI0158';

    // Register both stubs.
    try {
      registerCalc({
        name: STUB_Z, category: 'animal', description: 'Z', formula: 'stub', source: 'test',
        inputs: [], output: { type: 'number', unit: '' }, fn: () => 0,
      });
    } catch { /* */ }
    try {
      registerCalc({
        name: STUB_A, category: 'animal', description: 'A', formula: 'stub', source: 'test',
        inputs: [], output: { type: 'number', unit: '' }, fn: () => 0,
      });
    } catch { /* */ }

    const realResolve = Resolvers.resolveCalcForCalcCard;
    vi.spyOn(Resolvers, 'resolveCalcForCalcCard').mockImplementation((name, ctx) => {
      if (name === STUB_Z || name === STUB_A) {
        return {
          name, applicable: true, scope: 'group-window',
          instances: [{
            label: name, groupWindowId: GW_ID,
            inputs: [], output: 1, gateStatus: 'ok',
          }],
        };
      }
      return realResolve(name, ctx);
    });

    await renderEventAudit(mountContainer());

    const subBlock = document.querySelector(`[data-testid="dev-audit-group-window-${GW_ID}"]`);
    const cardA = subBlock.querySelector(`[data-testid="dev-audit-calc-card-${STUB_A}-${GW_ID}"]`);
    const cardZ = subBlock.querySelector(`[data-testid="dev-audit-calc-card-${STUB_Z}-${GW_ID}"]`);
    expect(cardA).toBeTruthy();
    expect(cardZ).toBeTruthy();
    // A precedes Z in DOM order — alphabetical sort by name.
    const order = [...subBlock.querySelectorAll('[data-testid^="dev-audit-calc-card-"]')]
      .map(el => el.getAttribute('data-testid'));
    const idxA = order.indexOf(`dev-audit-calc-card-${STUB_A}-${GW_ID}`);
    const idxZ = order.indexOf(`dev-audit-calc-card-${STUB_Z}-${GW_ID}`);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxZ).toBeGreaterThan(idxA);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
