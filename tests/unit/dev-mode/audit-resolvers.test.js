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

import '../../../src/calcs/feed-forage.js'; // ensure calcs are registered
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
  it('exposes resolver names — DMI-2, DMI-3, DMI-8, FOR-1', () => {
    expect(getResolverNames().sort()).toEqual(['DMI-2', 'DMI-3', 'DMI-8', 'FOR-1']);
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
