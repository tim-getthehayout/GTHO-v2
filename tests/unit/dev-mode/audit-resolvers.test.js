/** @file OI-0138 phase 5 — audit-resolvers MVP coverage.
 *
 * Each resolver: (a) is applicable when its required entities exist for the
 * event; (b) calls getCalcByName(name).fn(...) for output (NEVER reimplements
 * formulas); (c) annotates each input with a `source` string; (d) marks
 * inputs `missing` when the source isn't found.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as ForageTypeEntity from '../../../src/entities/forage-type.js';
import * as ObservationEntity from '../../../src/entities/paddock-observation.js';
import * as NpkPriceEntity from '../../../src/entities/npk-price-history.js';
import * as AmendmentEntity from '../../../src/entities/amendment.js';
import * as InputProductEntity from '../../../src/entities/input-product.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';

import '../../../src/calcs/feed-forage.js'; // ensure calcs are registered
import '../../../src/calcs/core.js'; // OI-0157-B2: NPK-1 + NPK-3 + ANI-AU/AUD/ADA
import '../../../src/calcs/advanced.js'; // OI-0157-B2: NPK-2 + NPK-4 + CST-3 + REC-1
import { resolveCalcForCalcCard, getResolverNames } from '../../../src/features/dev-mode/audit-resolvers.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000c1';
const LOC = '00000000-0000-0000-0000-0000000000d1';
const GROUP = '00000000-0000-0000-0000-0000000000e1';
const CLS = '00000000-0000-0000-0000-0000000000f1';
const FT = '00000000-0000-0000-0000-00000000ff01';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
});

describe('audit-resolvers (OI-0138)', () => {
  it('exposes 13 resolver names (OI-0157-B2: +NPK-1/2/3/4 +CST-3 +REC-1 +ANI-AU/AUD/ADA)', () => {
    expect(getResolverNames().sort()).toEqual([
      'ANI-ADA', 'ANI-AU', 'ANI-AUD',
      'CST-3',
      'DMI-2', 'DMI-3', 'DMI-8',
      'FOR-1',
      'NPK-1', 'NPK-2', 'NPK-3', 'NPK-4',
      'REC-1',
    ]);
  });

  describe('DMI-2', () => {
    it('returns applicable=false when no open group window exists', () => {
      const out = resolveCalcForCalcCard('DMI-2', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('resolves inputs + output for an open group window with class metadata', () => {
      add('animalClasses', AnimalClassEntity.create({
        id: CLS, operationId: OP, name: 'Cow', species: 'beef_cattle', role: 'cow',
        defaultWeightKg: 500, dmiPct: 2.5, dmiPctLactating: 3.0,
      }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
      add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Cow-Calf' }),
        GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
      add('eventGroupWindows', GroupWindowEntity.create({
        id: 'gw-1', operationId: OP, eventId: EVT, groupId: GROUP, animalClassId: CLS,
        dateJoined: '2026-04-01', headCount: 20, avgWeightKg: 500,
      }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

      const out = resolveCalcForCalcCard('DMI-2', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances).toHaveLength(1);
      const inst = out.instances[0];
      expect(inst.inputs.find(i => i.name === 'headCount').value).toBe(20);
      expect(inst.inputs.find(i => i.name === 'dmiPct').value).toBe(2.5);
      // 20 head × 500 kg × 2.5% / 100 = 250 kg/day (DMI-2 example value)
      expect(inst.output).toBe(250);
      expect(inst.gateStatus).toBe('ok');
    });

    it('flags missing animalClass with fallback dmiPct (2.5)', () => {
      // No animalClasses seeded → gw.animalClassId resolves to null → fallback.
      add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'G' }),
        GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
      add('eventGroupWindows', GroupWindowEntity.create({
        id: 'gw-2', operationId: OP, eventId: EVT, groupId: GROUP,
        dateJoined: '2026-04-01', headCount: 10, avgWeightKg: 500,
      }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

      const out = resolveCalcForCalcCard('DMI-2', { eventId: EVT });
      const inst = out.instances[0];
      const dmiPctInput = inst.inputs.find(i => i.name === 'dmiPct');
      expect(dmiPctInput.value).toBe(2.5);
      expect(dmiPctInput.missing).toBe(true);
      expect(inst.output).toBe(125); // 10 × 500 × 2.5/100
    });
  });

  describe('DMI-3', () => {
    it('returns applicable=false when DMI-2 is not applicable', () => {
      const out = resolveCalcForCalcCard('DMI-3', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('sums DMI-2 outputs across multiple windows', () => {
      add('animalClasses', AnimalClassEntity.create({
        id: CLS, operationId: OP, name: 'Cow', species: 'beef_cattle', role: 'cow',
        defaultWeightKg: 500, dmiPct: 2.5, dmiPctLactating: 3.0,
      }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
      add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'A' }),
        GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
      add('groups', GroupEntity.create({ id: 'group-b', operationId: OP, name: 'B' }),
        GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
      add('eventGroupWindows', GroupWindowEntity.create({
        id: 'gw-a', operationId: OP, eventId: EVT, groupId: GROUP, animalClassId: CLS,
        dateJoined: '2026-04-01', headCount: 20, avgWeightKg: 500,
      }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
      add('eventGroupWindows', GroupWindowEntity.create({
        id: 'gw-b', operationId: OP, eventId: EVT, groupId: 'group-b', animalClassId: CLS,
        dateJoined: '2026-04-01', headCount: 12, avgWeightKg: 500,
      }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

      const out = resolveCalcForCalcCard('DMI-3', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances[0].output).toBe(250 + 150); // 20×500×2.5% + 12×500×2.5%
    });
  });

  describe('FOR-1', () => {
    it('returns applicable=false when no open paddock window exists', () => {
      const out = resolveCalcForCalcCard('FOR-1', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('gates when forage observation is missing', () => {
      add('locations', LocationEntity.create({ id: LOC, operationId: OP, farmId: FARM, name: 'P-1', areaHectares: 2 }),
        LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
      add('eventPaddockWindows', PaddockWindowEntity.create({
        id: 'pw-1', operationId: OP, eventId: EVT, locationId: LOC, dateOpened: '2026-04-01',
      }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

      const out = resolveCalcForCalcCard('FOR-1', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances[0].gateStatus).toMatch(/gated/);
      expect(out.instances[0].output).toBeNull();
      const heightInput = out.instances[0].inputs.find(i => i.name === 'forageHeightCm');
      expect(heightInput.missing).toBe(true);
    });

    it('computes output when all inputs present', () => {
      add('forageTypes', ForageTypeEntity.create({
        id: FT, operationId: OP, name: 'Cool-season grass',
        dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 50,
      }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
      add('locations', LocationEntity.create({
        id: LOC, operationId: OP, farmId: FARM, name: 'P-1',
        areaHectares: 2, forageTypeId: FT,
      }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
      add('eventPaddockWindows', PaddockWindowEntity.create({
        id: 'pw-2', operationId: OP, eventId: EVT, locationId: LOC,
        dateOpened: '2026-04-01', areaPct: 100,
      }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      add('paddockObservations', ObservationEntity.create({
        operationId: OP, locationId: LOC, type: 'open', source: 'event',
        sourceId: EVT, date: '2026-04-01', observedAt: '2026-04-01T12:00:00Z',
        forageHeightCm: 25, forageCoverPct: 80,
      }), ObservationEntity.validate, ObservationEntity.toSupabaseShape, 'paddock_observations');

      const out = resolveCalcForCalcCard('FOR-1', { eventId: EVT });
      expect(out.instances[0].gateStatus).toBe('ok');
      // (25 - 5) × 2 × 1 × 0.8 × 110 = 3520 (FOR-1 example output)
      expect(out.instances[0].output).toBe(3520);
    });
  });

  describe('dispatcher', () => {
    it('returns null for unregistered resolver names', () => {
      expect(resolveCalcForCalcCard('FAKE-CALC', { eventId: EVT })).toBeNull();
    });
  });
});

// OI-0157-B2: applicability-true + applicability-false coverage for each
// of the 9 new resolvers. Mirrors the DMI-2 / FOR-1 pattern: seed entities,
// call `resolveCalcForCalcCard(name, { eventId })`, assert applicable +
// inputs/output OR applicable=false + reason.
describe('audit-resolvers (OI-0157-B2 — NPK / fertility / stocking)', () => {
  function seedClassWithExcretionRates() {
    add('animalClasses', AnimalClassEntity.create({
      id: CLS, operationId: OP, name: 'Cow', species: 'beef_cattle', role: 'cow',
      defaultWeightKg: 545, dmiPct: 2.5,
      excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136,
    }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  }

  function seedOpenGroupWindow({ id = 'gw-b2', headCount = 50, avgWeightKg = 545, animalClassId = CLS, dateJoined = '2026-04-29' } = {}) {
    add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Cow-Calf' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventGroupWindows', GroupWindowEntity.create({
      id, operationId: OP, eventId: EVT, groupId: GROUP, animalClassId,
      dateJoined, headCount, avgWeightKg,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }

  function seedOpenPaddockWindow({ id = 'pw-b2', locationId = LOC, areaHectares = 5, areaPct = 100, dateOpened = '2026-04-29' } = {}) {
    add('locations', LocationEntity.create({
      id: locationId, operationId: OP, farmId: FARM, name: 'P-B2', areaHectares,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id, operationId: OP, eventId: EVT, locationId, dateOpened, areaPct,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  }

  function seedClosedPaddockWindow({ id = 'pw-closed', locationId = LOC, dateOpened = '2026-04-20', dateClosed = '2026-04-29' } = {}) {
    add('locations', LocationEntity.create({
      id: locationId, operationId: OP, farmId: FARM, name: 'P-closed', areaHectares: 5,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id, operationId: OP, eventId: EVT, locationId, dateOpened, dateClosed, areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  }

  function seedNpkPrices({ farmId = FARM, effectiveDate = '2026-01-01', n = 1.5, p = 2.2, k = 0.9 } = {}) {
    add('npkPriceHistory', NpkPriceEntity.create({
      operationId: OP, farmId, effectiveDate, nPricePerKg: n, pPricePerKg: p, kPricePerKg: k,
    }), NpkPriceEntity.validate, NpkPriceEntity.toSupabaseShape, 'npk_price_history');
  }

  describe('NPK-1 (group-window)', () => {
    it('returns applicable=false when no open group window exists', () => {
      const out = resolveCalcForCalcCard('NPK-1', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('computes per-window NPK output when an open group window exists', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      const out = resolveCalcForCalcCard('NPK-1', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances).toHaveLength(1);
      const inst = out.instances[0];
      // Output is an object { nKg, pKg, kKg } from the registered NPK-1 calc.
      expect(inst.output).toHaveProperty('nKg');
      expect(inst.output.nKg).toBeGreaterThan(0);
      expect(inst.gateStatus).toBe('ok');
    });

    it('falls back to NRC defaults and marks inputs missing — eventGroupWindows entity does not carry animalClassId today', () => {
      // Note: eventGroupWindows entity does NOT carry an animalClassId field
      // (per OI-0157-B2 implementation note). The resolver looks up
      // `gw.animalClassId` which is always undefined in current data, so the
      // class lookup returns null and the resolver falls back to NRC defaults.
      // When the field is added to the entity (separate OI), this test will
      // need to assert the no-fallback path.
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      const out = resolveCalcForCalcCard('NPK-1', { eventId: EVT });
      const inst = out.instances[0];
      const nRate = inst.inputs.find(i => i.name === 'excretionNRate');
      expect(nRate.value).toBe(0.145); // NRC default
      expect(nRate.missing).toBe(true);
      expect(nRate.source).toMatch(/fallback/);
    });
  });

  describe('NPK-2 (event)', () => {
    it('gates with actionable reason when npk_price_history is empty for the farm', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      // No NPK price rows seeded.
      const out = resolveCalcForCalcCard('NPK-2', { eventId: EVT });
      expect(out.applicable).toBe(false);
      expect(out.reason).toMatch(/Settings → NPK Prices/);
    });

    it('computes total $ value when prices + group windows exist', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      seedNpkPrices();
      const out = resolveCalcForCalcCard('NPK-2', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances).toHaveLength(1);
      const inst = out.instances[0];
      expect(typeof inst.output).toBe('number');
      expect(inst.output).toBeGreaterThan(0);
      expect(inst.inputs.find(i => i.name === 'nPricePerKg').value).toBe(1.5);
    });
  });

  describe('NPK-3 (paddock-window)', () => {
    it('returns applicable=false when no open paddock window exists', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      const out = resolveCalcForCalcCard('NPK-3', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('distributes total NPK across paddock windows area-weighted', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      seedOpenPaddockWindow();
      const out = resolveCalcForCalcCard('NPK-3', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances).toHaveLength(1);
      const inst = out.instances[0];
      expect(inst.output).toHaveProperty('nKg');
      expect(inst.output.nKg).toBeGreaterThanOrEqual(0);
    });
  });

  describe('NPK-4 (event)', () => {
    it('returns applicable=false when no amendments in window', () => {
      // Need at least one paddock window so the event has a derivable start;
      // otherwise the resolver gates earlier with "Event start not derivable".
      seedOpenPaddockWindow({ dateOpened: '2026-04-01' });
      const out = resolveCalcForCalcCard('NPK-4', { eventId: EVT });
      expect(out.applicable).toBe(false);
      expect(out.reason).toMatch(/No amendments/);
    });

    it('sums amendments applied during the event window', () => {
      const CAT = '00000000-0000-0000-0000-0000000cat01';
      const PROD = '00000000-0000-0000-0000-0000000pro01';
      add('inputProducts', InputProductEntity.create({
        id: PROD, operationId: OP, categoryId: CAT,
        name: 'Urea', nPct: 46, pPct: 0, kPct: 0,
      }), InputProductEntity.validate, InputProductEntity.toSupabaseShape, 'input_products');
      seedOpenPaddockWindow({ dateOpened: '2026-04-01' }); // event start = 2026-04-01
      add('amendments', AmendmentEntity.create({
        operationId: OP, appliedAt: '2026-04-15T10:00:00Z',
        sourceType: 'product', inputProductId: PROD, totalQty: 100,
      }), AmendmentEntity.validate, AmendmentEntity.toSupabaseShape, 'amendments');
      const out = resolveCalcForCalcCard('NPK-4', { eventId: EVT });
      expect(out.applicable).toBe(true);
      const inst = out.instances[0];
      expect(inst.output.nKg).toBeCloseTo(46, 5); // 100 kg × 46% = 46 kg N
      expect(inst.inputs.find(i => i.name === 'amendmentCount').value).toBe(1);
    });
  });

  describe('CST-3 (event)', () => {
    it('gates with same actionable reason as NPK-2 when prices are empty', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      const out = resolveCalcForCalcCard('CST-3', { eventId: EVT });
      expect(out.applicable).toBe(false);
      expect(out.reason).toMatch(/Settings → NPK Prices/);
    });

    it('computes the cost rollup when all inputs present', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      seedNpkPrices();
      const out = resolveCalcForCalcCard('CST-3', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(typeof out.instances[0].output).toBe('number');
    });
  });

  describe('REC-1 (paddock-window)', () => {
    it('returns applicable=false when no closed paddock windows', () => {
      seedOpenPaddockWindow();
      const out = resolveCalcForCalcCard('REC-1', { eventId: EVT });
      expect(out.applicable).toBe(false);
      expect(out.reason).toMatch(/No closed paddock windows/);
    });

    it('reads recovery days from the close observation when present', () => {
      seedClosedPaddockWindow();
      add('paddockObservations', ObservationEntity.create({
        operationId: OP, locationId: LOC, type: 'close', source: 'event', sourceId: 'pw-closed',
        date: '2026-04-29', observedAt: '2026-04-29T12:00:00Z',
        recoveryMinDays: 21, recoveryMaxDays: 35,
      }), ObservationEntity.validate, ObservationEntity.toSupabaseShape, 'paddock_observations');
      const out = resolveCalcForCalcCard('REC-1', { eventId: EVT });
      expect(out.applicable).toBe(true);
      const inst = out.instances[0];
      expect(inst.gateStatus).toBe('ok');
      expect(inst.inputs.find(i => i.name === 'recoveryMinDays').value).toBe(21);
      expect(inst.output).toHaveProperty('earliestReturn');
      expect(inst.output).toHaveProperty('windowCloses');
    });

    it('falls back to farm settings defaults when observation lacks recovery days', () => {
      add('farmSettings', FarmSettingEntity.create({
        farmId: FARM, operationId: OP,
        defaultRecoveryMinDays: 25, defaultRecoveryMaxDays: 40,
      }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
      seedClosedPaddockWindow();
      const out = resolveCalcForCalcCard('REC-1', { eventId: EVT });
      const inst = out.instances[0];
      const minInput = inst.inputs.find(i => i.name === 'recoveryMinDays');
      expect(minInput.value).toBe(25);
      expect(minInput.source).toMatch(/farmSettings/);
    });

    it('gates when both observation and farm settings lack recovery days', () => {
      seedClosedPaddockWindow();
      const out = resolveCalcForCalcCard('REC-1', { eventId: EVT });
      const inst = out.instances[0];
      expect(inst.gateStatus).toMatch(/gated/);
      expect(inst.inputs.find(i => i.name === 'recoveryMinDays').missing).toBe(true);
    });
  });

  describe('ANI-AU (group-window)', () => {
    it('returns applicable=false when no open group window exists', () => {
      const out = resolveCalcForCalcCard('ANI-AU', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('matches the registered ANI-AU formula (50 head × 545 kg / 453.6)', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow({ headCount: 50, avgWeightKg: 545 });
      const out = resolveCalcForCalcCard('ANI-AU', { eventId: EVT });
      expect(out.applicable).toBe(true);
      expect(out.instances[0].output).toBeCloseTo(60.075, 3);
    });
  });

  describe('ANI-AUD (group-window)', () => {
    it('returns applicable=false when no open group window exists', () => {
      const out = resolveCalcForCalcCard('ANI-AUD', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('multiplies AU × days for an open window', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow({ dateJoined: '2026-04-01' });
      const out = resolveCalcForCalcCard('ANI-AUD', { eventId: EVT });
      expect(out.applicable).toBe(true);
      const inst = out.instances[0];
      expect(typeof inst.output).toBe('number');
      const days = inst.inputs.find(i => i.name === 'days').value;
      expect(days).toBeGreaterThanOrEqual(1);
      const au = inst.inputs.find(i => i.name === 'au').value;
      expect(inst.output).toBeCloseTo(au * days, 6);
    });
  });

  describe('ANI-ADA (paddock-window)', () => {
    it('returns applicable=false when no open paddock window exists', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow();
      const out = resolveCalcForCalcCard('ANI-ADA', { eventId: EVT });
      expect(out.applicable).toBe(false);
    });

    it('divides Σ AU-days by acres (hectare→acre conversion)', () => {
      seedClassWithExcretionRates();
      seedOpenGroupWindow({ dateJoined: '2026-04-01' });
      seedOpenPaddockWindow({ areaHectares: 4, areaPct: 100 });
      const out = resolveCalcForCalcCard('ANI-ADA', { eventId: EVT });
      expect(out.applicable).toBe(true);
      const inst = out.instances[0];
      expect(typeof inst.output).toBe('number');
      const acresInput = inst.inputs.find(i => i.name === 'areaAcres');
      // 4 ha × 1.0 (areaPct=100) × 2.47105 = 9.8842 ac
      expect(acresInput.value).toBeCloseTo(9.8842, 3);
    });
  });
});
