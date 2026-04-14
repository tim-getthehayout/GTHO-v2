/**
 * @file v1 → v2 migration transform tests — CP-57.
 * Tests each transform section per V2_MIGRATION_PLAN.md §2.1–§2.25.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isV1Export,
  transformV1ToV2,
  generateDoseAuditCsv,
  parseDose,
  matchDoseUnit,
  inferRole,
  createIdMap,
  LBS_TO_KG,
  ACRES_TO_HA,
  INCHES_TO_CM,
  LBS_PER_ACRE_TO_KG_PER_HA,
  CURRENT_SCHEMA_VERSION,
} from '../../src/data/v1-migration.js';

// Minimal v1 fixture
function makeV1(overrides = {}) {
  return {
    pastures: [],
    events: [],
    animals: [],
    animalClasses: [],
    animalGroups: [],
    animalGroupMemberships: [],
    feedTypes: [],
    batches: [],
    surveys: [],
    paddockObservations: [],
    forageTypes: [],
    aiBulls: [],
    treatmentTypes: [],
    inputProducts: [],
    inputApplications: [],
    inputApplicationLocations: [],
    animalWeightRecords: [],
    animalHealthEvents: [],
    harvestEvents: [],
    manureBatches: [],
    manureBatchTransactions: [],
    soilTests: [],
    todos: [],
    feedback: [],
    batchNutritionalProfiles: [],
    herd: { name: 'Test Ranch' },
    settings: {
      auWeight: 1000,
      residualGrazeHeight: 4,
      forageUtilizationPct: 65,
      nPrice: 0.55,
      pPrice: 0.65,
      kPrice: 0.42,
      recoveryRequired: false,
      recoveryMinDays: 30,
      recoveryMaxDays: 60,
    },
    ...overrides,
  };
}

const baseOpts = {
  operationId: '00000000-0000-0000-0000-000000000001',
  userId: 'user-1',
  userEmail: 'test@example.com',
  timezone: 'America/Chicago',
  existingDoseUnits: [
    { id: 'du-ml', name: 'ml' },
    { id: 'du-tablet', name: 'tablet' },
  ],
};

describe('v1-migration (CP-57)', () => {
  describe('isV1Export', () => {
    it('detects v1 exports', () => {
      expect(isV1Export({ pastures: [], events: [] })).toBe(true);
      expect(isV1Export({ herd: { name: 'X' } })).toBe(true);
      expect(isV1Export({ settings: {} })).toBe(true);
    });

    it('rejects v2 backups', () => {
      expect(isV1Export({ format: 'gtho-v2-backup', tables: {} })).toBe(false);
    });

    it('rejects nullish', () => {
      expect(isV1Export(null)).toBe(false);
      expect(isV1Export(undefined)).toBe(false);
      expect(isV1Export('string')).toBe(false);
    });
  });

  describe('createIdMap', () => {
    it('generates stable UUIDs per v1 ID', () => {
      const map = createIdMap();
      const a = map.remap('123');
      const b = map.remap('123');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{8}-/);
    });

    it('returns null for null input', () => {
      const map = createIdMap();
      expect(map.remap(null)).toBeNull();
    });

    it('generates different UUIDs for different inputs', () => {
      const map = createIdMap();
      expect(map.remap('1')).not.toBe(map.remap('2'));
    });
  });

  describe('parseDose', () => {
    it('parses "10ml"', () => {
      expect(parseDose('10ml')).toEqual({ amount: 10, unitStr: 'ml' });
    });

    it('parses "2.5 tabs"', () => {
      expect(parseDose('2.5 tabs')).toEqual({ amount: 2.5, unitStr: 'tabs' });
    });

    it('returns null for unparseable', () => {
      expect(parseDose('a lot')).toBeNull();
      expect(parseDose(null)).toBeNull();
      expect(parseDose('')).toBeNull();
    });
  });

  describe('matchDoseUnit', () => {
    const lookup = new Map([['ml', 'du-ml'], ['tablet', 'du-tablet']]);

    it('matches direct', () => {
      expect(matchDoseUnit('ml', lookup)).toBe('du-ml');
    });

    it('matches alias', () => {
      expect(matchDoseUnit('tabs', lookup)).toBe('du-tablet');
      expect(matchDoseUnit('cc', lookup)).toBe('du-ml');
    });

    it('returns null for no match', () => {
      expect(matchDoseUnit('gallons', lookup)).toBeNull();
    });
  });

  describe('inferRole', () => {
    it('maps class names to roles', () => {
      expect(inferRole('Cow')).toBe('cow');
      expect(inferRole('Spring Calves')).toBe('calf');
      expect(inferRole('Bull')).toBe('bull');
      expect(inferRole('Steer')).toBe('steer');
      expect(inferRole('Yearling Heifer')).toBe('cow');
      expect(inferRole('Unknown')).toBe('cow'); // default
    });
  });

  describe('transformV1ToV2 — envelope shape', () => {
    it('produces a valid v2 backup envelope', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      expect(envelope.format).toBe('gtho-v2-backup');
      expect(envelope.format_version).toBe(1);
      expect(envelope.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      expect(envelope.operation_id).toBe(baseOpts.operationId);
      expect(envelope.tables).toBeDefined();
      expect(envelope.counts).toBeDefined();
    });

    it('creates exactly one operation, farm, farm_settings, and user_preferences', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      expect(envelope.tables.operations).toHaveLength(1);
      expect(envelope.tables.farms).toHaveLength(1);
      expect(envelope.tables.farm_settings).toHaveLength(1);
      expect(envelope.tables.user_preferences).toHaveLength(1);
    });
  });

  describe('§2.8 — Operation + Farm + Farm Settings', () => {
    it('maps herd name to operation name', () => {
      const { envelope } = transformV1ToV2(makeV1({ herd: { name: 'Triple J Ranch' } }), baseOpts);
      expect(envelope.tables.operations[0].name).toBe('Triple J Ranch');
    });

    it('converts AU weight lbs → kg', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      const fs = envelope.tables.farm_settings[0];
      expect(fs.default_au_weight_kg).toBeCloseTo(1000 * LBS_TO_KG, 1);
    });

    it('converts residual height inches → cm', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      const fs = envelope.tables.farm_settings[0];
      expect(fs.default_residual_height_cm).toBeCloseTo(4 * INCHES_TO_CM, 1);
    });

    it('converts NPK prices $/lb → $/kg', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      const fs = envelope.tables.farm_settings[0];
      expect(fs.n_price_per_kg).toBeCloseTo(0.55 / LBS_TO_KG, 2);
      expect(fs.p_price_per_kg).toBeCloseTo(0.65 / LBS_TO_KG, 2);
      expect(fs.k_price_per_kg).toBeCloseTo(0.42 / LBS_TO_KG, 2);
    });

    it('sets schema_version to current', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      expect(envelope.tables.operations[0].schema_version).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('sets unit_system to imperial', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      expect(envelope.tables.operations[0].unit_system).toBe('imperial');
    });
  });

  describe('§2.1 — Pastures → Locations', () => {
    it('converts paddock to land/pasture', () => {
      const v1 = makeV1({ pastures: [{ id: 'p1', name: 'North', locationType: 'paddock', acres: 10 }] });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const loc = envelope.tables.locations[0];
      expect(loc.type).toBe('land');
      expect(loc.land_use).toBe('pasture');
      expect(loc.area_hectares).toBeCloseTo(10 * ACRES_TO_HA, 2);
    });

    it('converts drylot to confinement', () => {
      const v1 = makeV1({ pastures: [{ id: 'p2', name: 'Barn', locationType: 'drylot', acres: 1 }] });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const loc = envelope.tables.locations[0];
      expect(loc.type).toBe('confinement');
      expect(loc.land_use).toBeNull();
    });

    it('converts barn to confinement', () => {
      const v1 = makeV1({ pastures: [{ id: 'p3', name: 'Winter Barn', locationType: 'barn' }] });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.locations[0].type).toBe('confinement');
    });

    it('remaps forage_type_id', () => {
      const v1 = makeV1({
        forageTypes: [{ id: 'ft1', name: 'Fescue' }],
        pastures: [{ id: 'p1', name: 'Field', locationType: 'paddock', forageTypeId: 'ft1' }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const loc = envelope.tables.locations[0];
      const ft = envelope.tables.forage_types[0];
      expect(loc.forage_type_id).toBe(ft.id);
    });
  });

  describe('§2.2–§2.3 — Events + Paddock Windows', () => {
    it('creates event with anchor paddock window', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'Field A' }],
        events: [{
          id: 'e1',
          pastureId: 'p1',
          dateIn: '2025-06-01',
          dateOut: '2025-06-10',
          groups: [],
          feedEntries: [],
          feedResidualChecks: [],
          subMoves: [],
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.events).toHaveLength(1);
      expect(envelope.tables.event_paddock_windows).toHaveLength(1);

      const pw = envelope.tables.event_paddock_windows[0];
      expect(pw.date_opened).toBe('2025-06-01');
      expect(pw.date_closed).toBe('2025-06-10');
      expect(pw.is_strip_graze).toBe(false);
      expect(pw.area_pct).toBe(100);
    });

    it('sets source_event_id to null for all migrated events', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'A' }],
        events: [{ id: 'e1', pastureId: 'p1', dateIn: '2025-01-01', groups: [], feedEntries: [], feedResidualChecks: [], subMoves: [] }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.events[0].source_event_id).toBeNull();
    });

    it('creates additional paddock windows from sub-moves', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
        events: [{
          id: 'e1', pastureId: 'p1', dateIn: '2025-06-01',
          groups: [], feedEntries: [], feedResidualChecks: [],
          subMoves: [{ id: 'sm1', pastureId: 'p2', dateOpened: '2025-06-05' }],
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.event_paddock_windows).toHaveLength(2);
    });
  });

  describe('§2.4 — Group Windows', () => {
    it('converts group memberships to group windows with metric weight', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'A' }],
        animalGroups: [{ id: 'g1', name: 'Herd 1' }],
        events: [{
          id: 'e1', pastureId: 'p1', dateIn: '2025-06-01',
          groups: [{ groupId: 'g1', headSnapshot: 50, weightSnapshot: 1200, dateJoined: '2025-06-01' }],
          feedEntries: [], feedResidualChecks: [], subMoves: [],
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const gw = envelope.tables.event_group_windows[0];
      expect(gw.head_count).toBe(50);
      expect(gw.avg_weight_kg).toBeCloseTo(1200 * LBS_TO_KG, 1);
    });
  });

  describe('§2.5 — Feed Entries', () => {
    it('creates feed entries with absolute quantity', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'A' }],
        feedTypes: [{ id: 'ft1', name: 'Hay' }],
        batches: [{ id: 'b1', typeId: 'ft1', quantity: 100, remaining: 80, unit: 'bale' }],
        events: [{
          id: 'e1', pastureId: 'p1', dateIn: '2025-06-01',
          groups: [], subMoves: [], feedResidualChecks: [],
          feedEntries: [{ id: 'fe1', batchId: 'b1', qty: -5, date: '2025-06-01' }],
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.event_feed_entries[0].quantity).toBe(5);
    });
  });

  describe('§2.7 — Health Events Split', () => {
    it('routes BCS to animal_bcs_scores', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        animalHealthEvents: [{ animalId: 'a1', type: 'bcs', score: 6, date: '2025-03-01' }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.animal_bcs_scores).toHaveLength(1);
      expect(envelope.tables.animal_bcs_scores[0].score).toBe(6);
    });

    it('routes treatments with parsed dose', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        treatmentTypes: [{ id: 'tt1', name: 'Ivermectin', category: 'Dewormer' }],
        animalHealthEvents: [{
          animalId: 'a1', type: 'treatment', dose: '10ml',
          treatmentTypeId: 'tt1', date: '2025-03-01',
        }],
      });
      const { envelope, audit } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.animal_treatments).toHaveLength(1);
      expect(envelope.tables.animal_treatments[0].dose_amount).toBe(10);
      expect(envelope.tables.animal_treatments[0].dose_unit_id).toBe('du-ml');
      expect(audit.unparseableDoses).toHaveLength(0);
    });

    it('logs unparseable doses to audit', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        treatmentTypes: [{ id: 'tt1', name: 'Drug X', category: 'Other' }],
        animalHealthEvents: [{
          animalId: 'a1', type: 'treatment', dose: 'a lot',
          treatmentTypeId: 'tt1', date: '2025-03-01',
        }],
      });
      const { audit } = transformV1ToV2(v1, baseOpts);
      expect(audit.unparseableDoses).toHaveLength(1);
      expect(audit.unparseableDoses[0].animalTag).toBe('A001');
      expect(audit.unparseableDoses[0].rawDose).toBe('a lot');
    });

    it('routes notes to animal_notes table', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        animalHealthEvents: [{ animalId: 'a1', type: 'note', notes: 'Limping', date: '2025-03-01' }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.animal_notes).toHaveLength(1);
      expect(envelope.tables.animal_notes[0].note).toBe('Limping');
    });

    it('routes breeding (ai) to breeding records', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        aiBulls: [{ id: 'ab1', name: 'Angus Prime' }],
        animalHealthEvents: [{
          animalId: 'a1', type: 'breeding', subtype: 'ai',
          aiBullId: 'ab1', date: '2025-04-01',
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.animal_breeding_records).toHaveLength(1);
      expect(envelope.tables.animal_breeding_records[0].method).toBe('ai');
    });

    it('routes breeding (heat) to heat records', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        animalHealthEvents: [{ animalId: 'a1', type: 'breeding', subtype: 'heat', date: '2025-04-01' }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.animal_heat_records).toHaveLength(1);
    });

    it('routes calving with birth weight extraction', () => {
      const v1 = makeV1({
        animals: [{ id: 'dam1', tag: 'D001' }, { id: 'calf1', tag: 'C001' }],
        animalHealthEvents: [{
          animalId: 'dam1', type: 'calving', calfId: 'calf1',
          birthWeightLbs: 80, date: '2025-03-15',
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.animal_calving_records).toHaveLength(1);
      expect(envelope.tables.animal_calving_records[0].dried_off_date).toBeNull();
      // Birth weight → weight record for calf
      const calfWeights = envelope.tables.animal_weight_records.filter(
        w => w.source === 'calving'
      );
      expect(calfWeights).toHaveLength(1);
      expect(calfWeights[0].weight_kg).toBeCloseTo(80 * LBS_TO_KG, 1);
    });
  });

  describe('§2.9 — Animal Weight Records', () => {
    it('converts weight lbs → kg with source import', () => {
      const v1 = makeV1({
        animals: [{ id: 'a1', tag: 'A001' }],
        animalWeightRecords: [{ id: 'w1', animalId: 'a1', weightLbs: 1100, recordedAt: '2025-01-01' }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const wr = envelope.tables.animal_weight_records[0];
      expect(wr.weight_kg).toBeCloseTo(1100 * LBS_TO_KG, 1);
      expect(wr.source).toBe('import');
    });
  });

  describe('§2.10 — Forage Types', () => {
    it('converts dm_lbs_per_inch_per_acre to metric', () => {
      const v1 = makeV1({
        forageTypes: [{ id: 'ft1', name: 'Fescue', dmLbsPerInchPerAcre: 200 }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.forage_types[0].dm_kg_per_cm_per_ha).toBeCloseTo(200 * 0.4412, 1);
    });
  });

  describe('§2.11 — Surveys', () => {
    it('extracts draft entries for draft surveys', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'North' }],
        surveys: [{
          id: 's1', status: 'draft',
          draftRatings: { p1: { vegHeight: 8, forageCoverPct: 70, rating: 80 } },
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.surveys).toHaveLength(1);
      expect(envelope.tables.survey_draft_entries).toHaveLength(1);
      expect(envelope.tables.survey_draft_entries[0].forage_height_cm).toBeCloseTo(8 * INCHES_TO_CM, 1);
    });

    it('does not extract draft entries for committed surveys', () => {
      const v1 = makeV1({
        surveys: [{
          id: 's1', status: 'committed',
          draftRatings: { p1: { vegHeight: 8 } },
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.survey_draft_entries).toHaveLength(0);
    });
  });

  describe('§2.14 — Animal Classes', () => {
    it('converts weight to kg and sets species to beef_cattle', () => {
      const v1 = makeV1({
        animalClasses: [{ id: 'ac1', name: 'Cow', weight: 1200, dmiPct: 2.5 }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const ac = envelope.tables.animal_classes[0];
      expect(ac.species).toBe('beef_cattle');
      expect(ac.default_weight_kg).toBeCloseTo(1200 * LBS_TO_KG, 1);
      expect(ac.dmi_pct).toBe(2.5);
      expect(ac.role).toBe('cow');
    });
  });

  describe('§2.19 — Manure Batches', () => {
    it('converts volume and nutrients from lbs to kg', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'Barn', locationType: 'drylot' }],
        manureBatches: [{
          id: 'mb1', label: 'Spring 2025', sourceLocationId: 'p1',
          estimatedVolumeLbs: 10000, nLbs: 50, pLbs: 30, kLbs: 40,
        }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const mb = envelope.tables.manure_batches[0];
      expect(mb.estimated_volume_kg).toBeCloseTo(10000 * LBS_TO_KG, 0);
      expect(mb.n_kg).toBeCloseTo(50 * LBS_TO_KG, 1);
    });
  });

  describe('§2.22 — Soil Tests', () => {
    it('converts lbs/acre NPK to kg/ha', () => {
      const v1 = makeV1({
        pastures: [{ id: 'p1', name: 'North' }],
        soilTests: [{ id: 'st1', landId: 'p1', date: '2025-01-01', n: 100, p: 50, k: 200, pH: 6.5 }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      const st = envelope.tables.soil_tests[0];
      expect(st.n).toBeCloseTo(100 * LBS_PER_ACRE_TO_KG_PER_HA, 1);
      expect(st.p).toBeCloseTo(50 * LBS_PER_ACRE_TO_KG_PER_HA, 1);
      expect(st.ph).toBe(6.5);
      expect(st.unit).toBe('kg/ha');
    });
  });

  describe('§2.25 — NPK Price History', () => {
    it('creates one price history row with converted prices', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      expect(envelope.tables.npk_price_history).toHaveLength(1);
      const nph = envelope.tables.npk_price_history[0];
      expect(nph.n_price_per_kg).toBeCloseTo(0.55 / LBS_TO_KG, 2);
      expect(nph.notes).toBe('Migrated from v1');
    });
  });

  describe('§2.24 — Treatment Categories extraction', () => {
    it('extracts implicit categories from treatment types', () => {
      const v1 = makeV1({
        treatmentTypes: [
          { id: 'tt1', name: 'Ivermectin', category: 'Dewormer' },
          { id: 'tt2', name: 'Penicillin', category: 'Antibiotic' },
          { id: 'tt3', name: 'Cydectin', category: 'Dewormer' },
        ],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);
      expect(envelope.tables.treatment_categories).toHaveLength(2);
      const names = envelope.tables.treatment_categories.map(c => c.name);
      expect(names).toContain('Dewormer');
      expect(names).toContain('Antibiotic');
    });
  });

  describe('FK remapping', () => {
    it('remaps all v1 IDs to v2 UUIDs consistently', () => {
      const v1 = makeV1({
        pastures: [{ id: '100', name: 'North' }],
        forageTypes: [{ id: '200', name: 'Fescue' }],
        animalClasses: [{ id: '300', name: 'Cow', weight: 1200 }],
        animals: [{ id: '400', tag: 'A001', classId: '300' }],
      });
      const { envelope } = transformV1ToV2(v1, baseOpts);

      // All IDs should be UUIDs
      const loc = envelope.tables.locations[0];
      const animal = envelope.tables.animals[0];
      const ac = envelope.tables.animal_classes[0];
      expect(loc.id).toMatch(/^[0-9a-f]{8}-/);
      expect(animal.class_id).toBe(ac.id);
    });
  });

  describe('generateDoseAuditCsv', () => {
    it('generates valid CSV', () => {
      const csv = generateDoseAuditCsv([
        { animalTag: 'A001', date: '2025-01-01', rawDose: '2 cc', treatmentType: 'Dewormer' },
        { animalTag: 'B"002', date: '2025-02-01', rawDose: 'some', treatmentType: 'Other' },
      ]);
      expect(csv).toContain('Animal Tag,Date,Raw Dose,Treatment Type');
      expect(csv).toContain('"A001"');
      expect(csv).toContain('"B""002"'); // escaped quotes
    });

    it('returns empty for no doses', () => {
      expect(generateDoseAuditCsv([])).toBe('');
    });
  });

  describe('envelope table completeness', () => {
    it('includes all tables from FK_ORDER', () => {
      const { envelope } = transformV1ToV2(makeV1(), baseOpts);
      const expectedTables = [
        'operations', 'farms', 'forage_types', 'animal_classes', 'feed_types',
        'ai_bulls', 'spreaders', 'input_product_categories', 'input_product_units',
        'treatment_categories', 'dose_units', 'farm_settings', 'user_preferences',
        'locations', 'animals', 'groups', 'batches', 'treatment_types', 'input_products',
        'animal_group_memberships', 'batch_adjustments', 'batch_nutritional_profiles',
        'soil_tests', 'surveys', 'events', 'manure_batches', 'amendments',
        'amendment_locations', 'manure_batch_transactions', 'npk_price_history',
        'event_paddock_windows', 'event_group_windows', 'event_feed_entries',
        'event_feed_checks', 'event_feed_check_items', 'paddock_observations',
        'survey_draft_entries', 'harvest_events', 'harvest_event_fields',
        'animal_weight_records', 'animal_treatments', 'animal_bcs_scores',
        'animal_breeding_records', 'animal_heat_records', 'animal_calving_records',
        'animal_notes', 'todos', 'todo_assignments', 'submissions',
      ];
      for (const table of expectedTables) {
        expect(envelope.tables).toHaveProperty(table);
        expect(Array.isArray(envelope.tables[table])).toBe(true);
      }
    });
  });

  describe('integration — full v1 fixture (CP-58)', () => {
    let envelope;
    let audit;

    beforeEach(async () => {
      const { default: fixture } = await import('../fixtures/v1-export-sample.json');
      const result = transformV1ToV2(fixture, baseOpts);
      envelope = result.envelope;
      audit = result.audit;
    });

    it('produces a valid v2 envelope from the fixture', () => {
      expect(envelope.format).toBe('gtho-v2-backup');
      expect(envelope.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      expect(envelope.operation_id).toBe(baseOpts.operationId);
    });

    it('transforms all 3 pastures into locations', () => {
      expect(envelope.tables.locations).toHaveLength(3);
      const types = envelope.tables.locations.map(l => l.type);
      expect(types.filter(t => t === 'land')).toHaveLength(2);
      expect(types.filter(t => t === 'confinement')).toHaveLength(1);
    });

    it('transforms 2 events with correct paddock windows', () => {
      expect(envelope.tables.events).toHaveLength(2);
      // Event e-1 has anchor + 1 sub-move = 2 windows, event e-2 has anchor = 1 window
      expect(envelope.tables.event_paddock_windows).toHaveLength(3);
      // All windows default to full-paddock
      for (const pw of envelope.tables.event_paddock_windows) {
        expect(pw.is_strip_graze).toBe(false);
        expect(pw.area_pct).toBe(100);
      }
    });

    it('transforms 3 animals with correct class remapping', () => {
      expect(envelope.tables.animals).toHaveLength(3);
      const classes = envelope.tables.animal_classes;
      expect(classes).toHaveLength(2);
      // Every animal's class_id points to a valid class
      for (const a of envelope.tables.animals) {
        if (a.class_id) {
          expect(classes.some(c => c.id === a.class_id)).toBe(true);
        }
      }
    });

    it('splits health events across 5 tables + weight records + notes', () => {
      expect(envelope.tables.animal_bcs_scores).toHaveLength(1);
      expect(envelope.tables.animal_treatments).toHaveLength(2);
      expect(envelope.tables.animal_breeding_records).toHaveLength(1);
      expect(envelope.tables.animal_heat_records).toHaveLength(1);
      expect(envelope.tables.animal_calving_records).toHaveLength(1);
      expect(envelope.tables.animal_notes).toHaveLength(1);
      expect(envelope.tables.animal_notes[0].note).toBe('Limping on left rear');
    });

    it('extracts birth weight into weight records', () => {
      const calvingWeights = envelope.tables.animal_weight_records.filter(
        w => w.source === 'calving'
      );
      expect(calvingWeights).toHaveLength(1);
      expect(calvingWeights[0].weight_kg).toBeCloseTo(75 * LBS_TO_KG, 1);
    });

    it('imports weight records with source=import', () => {
      const importWeights = envelope.tables.animal_weight_records.filter(
        w => w.source === 'import'
      );
      expect(importWeights).toHaveLength(2);
      expect(importWeights[0].weight_kg).toBeCloseTo(1150 * LBS_TO_KG, 0);
    });

    it('logs one unparseable dose in audit', () => {
      expect(audit.unparseableDoses).toHaveLength(1);
      expect(audit.unparseableDoses[0].rawDose).toBe('a big squirt');
      expect(audit.unparseableDoses[0].animalTag).toBe('002');
    });

    it('collects NPK parity data for events with npkLedger', () => {
      expect(audit.npkDeltas).toHaveLength(1);
      expect(audit.npkDeltas[0].v1N).toBeCloseTo(5.2, 1);
    });

    it('converts farm settings from imperial', () => {
      const fs = envelope.tables.farm_settings[0];
      expect(fs.default_au_weight_kg).toBeCloseTo(1000 * LBS_TO_KG, 0);
      expect(fs.default_residual_height_cm).toBeCloseTo(4 * INCHES_TO_CM, 1);
      expect(fs.n_price_per_kg).toBeCloseTo(0.55 / LBS_TO_KG, 2);
      expect(fs.recovery_required).toBe(true);
    });

    it('creates NPK price history row', () => {
      expect(envelope.tables.npk_price_history).toHaveLength(1);
      expect(envelope.tables.npk_price_history[0].n_price_per_kg).toBeCloseTo(0.55 / LBS_TO_KG, 2);
    });

    it('transforms soil tests with unit conversion', () => {
      expect(envelope.tables.soil_tests).toHaveLength(1);
      expect(envelope.tables.soil_tests[0].ph).toBe(6.2);
      expect(envelope.tables.soil_tests[0].unit).toBe('kg/ha');
    });

    it('transforms harvest events with nested fields', () => {
      expect(envelope.tables.harvest_events).toHaveLength(1);
      expect(envelope.tables.harvest_event_fields).toHaveLength(1);
    });

    it('transforms manure batches and transactions', () => {
      expect(envelope.tables.manure_batches).toHaveLength(1);
      expect(envelope.tables.manure_batch_transactions).toHaveLength(1);
      expect(envelope.tables.manure_batches[0].estimated_volume_kg).toBeCloseTo(20000 * LBS_TO_KG, 0);
    });

    it('transforms amendments and locations', () => {
      expect(envelope.tables.amendments).toHaveLength(1);
      expect(envelope.tables.amendment_locations).toHaveLength(1);
      expect(envelope.tables.amendment_locations[0].area_ha).toBeCloseTo(12 * ACRES_TO_HA, 2);
    });

    it('validates envelope passes backup-import validation', async () => {
      const { validateBackup } = await import('../../src/data/backup-import.js');
      const result = validateBackup(envelope);
      expect(result.valid).toBe(true);
    });

    it('no data loss — every v1 record maps to at least one v2 row', () => {
      // Pastures → locations
      expect(envelope.tables.locations.length).toBe(3);
      // Events → events
      expect(envelope.tables.events.length).toBe(2);
      // Animals → animals
      expect(envelope.tables.animals.length).toBe(3);
      // Groups → groups
      expect(envelope.tables.groups.length).toBe(2);
      // Feed types
      expect(envelope.tables.feed_types.length).toBe(1);
      // Batches
      expect(envelope.tables.batches.length).toBe(1);
      // Surveys
      expect(envelope.tables.surveys.length).toBe(1);
      // Observations
      expect(envelope.tables.paddock_observations.length).toBe(1);
      // Todos
      expect(envelope.tables.todos.length).toBe(1);
      // AI bulls
      expect(envelope.tables.ai_bulls.length).toBe(1);
      // Treatment types
      expect(envelope.tables.treatment_types.length).toBe(2);
      // Treatment categories (extracted)
      expect(envelope.tables.treatment_categories.length).toBe(2);
      // Input products
      expect(envelope.tables.input_products.length).toBe(1);
    });
  });
});
