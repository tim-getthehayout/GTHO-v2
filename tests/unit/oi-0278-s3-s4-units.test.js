/**
 * @file OI-0278 S3 + S4 (#433) — units everywhere: Events / feed / animals /
 * Locations (S3 rows 30, 31, 33, 37–40, 50–52, 54) and NPK / amendments /
 * inputs / assistant (S4 rows 44, 46–49, Appendix B, farm reads, prompt line).
 * Rows 34 and 43 shipped with #462. Same fixtures under imperial and metric.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale, t } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as ManureBatchEntity from '../../src/entities/manure-batch.js';
import * as NpkPriceEntity from '../../src/entities/npk-price-history.js';
import * as ForageTypeEntity from '../../src/entities/forage-type.js';
import { formatMeasure } from '../../src/utils/units.js';
import { formatMeasure as coreFormatMeasure } from '../../src/utils/units-core.js';
import { computeFeedEntryDm } from '../../src/features/events/detail.js';
import { manureWeightInputValue, manureWeightFromInput, renderManureScreen } from '../../src/features/amendments/manure.js';
import { npkPriceInputValue, npkPriceFromInput, renderNpkPricesScreen } from '../../src/features/amendments/npk-prices.js';
import { composeFieldLabel, toDisplayValue, toStoredValue } from '../../src/features/settings/unit-descriptor.js';
import { FORAGE_FIELD_DESCRIPTORS } from '../../src/features/settings/forage-type-sheet.js';
import { renderForageTypesSection } from '../../src/features/settings/forage-types-section.js';
import { farmReadDisplay, createFarmReadPort } from '../../src/features/assistant/farm-reads.js';

beforeAll(() => setLocale('en', enLocale));

const OP = '00000000-0000-4000-8000-000000000a01';
const FARM = '00000000-0000-4000-8000-000000000b01';
const read = f => fs.readFileSync(f, 'utf8');

function seed(unitSystem) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
}

describe('S3 — Events / feed / animals / Locations', () => {
  it('row 30: Locations card "Est. available" uses the helper (no "lbs DM"); row 31 sort label "Area"', () => {
    const src = read('src/features/locations/index.js');
    expect(src).toContain("formatMeasure(dmAvail, 'weight', { unitSystem: unitSys })");
    expect(src).toContain('Est. available: ${dmText} DM');
    expect(src).not.toMatch(/lbs DM/);
    expect(src).toContain("sortEl('Area', 'acres')");
    // Same value both systems: 1,000 kg DM.
    expect(`${formatMeasure(1000, 'weight', { unitSystem: 'imperial' })} DM`).toBe('2,205 lb DM');
    expect(`${formatMeasure(1000, 'weight', { unitSystem: 'metric' })} DM`).toBe('1,000 kg DM');
  });

  it('row 33: Event detail DMI target has one unit ("12.3 lb/day"), not "lbs lbs/day"', () => {
    const src = read('src/features/events/detail.js');
    expect(src).toContain("`${t('dmi.targetForecast')}: ${dmiStr}/day`");
    expect(`${formatMeasure(5.58, 'weight', { unitSystem: 'imperial', decimals: 1 })}/day`).toBe('12.3 lb/day');
    expect(`${formatMeasure(5.58, 'weight', { unitSystem: 'metric', decimals: 1 })}/day`).toBe('5.6 kg/day');
  });

  it('feed-entry DM (detail) in both systems via the helper, Ua short unit', () => {
    const b = { weightPerUnitKg: 500, dmPct: 85 };
    expect(computeFeedEntryDm(2, b, 'imperial').text).toBe('1,874 lb DM');
    expect(computeFeedEntryDm(2, b, 'metric').text).toBe('850 kg DM');
  });

  it('rows 37–40: mass pool hint, delivery as-fed / DM / total, feed-check consumed DMI use the helper', () => {
    const pool = read('src/features/feed/pool-forms.js');
    expect(pool).toContain("pool.massBased&&pool.q!=null?formatMeasure(pool.q,'weight')");
    const delivery = read('src/features/feed/delivery.js');
    expect(delivery).not.toMatch(/KG_TO_LBS|lbs as-fed|lbs DM|} lbs`/);
    expect(delivery).toContain("`${formatMeasure(asFedKg, 'weight')} as-fed`");
    expect(delivery).toContain("[formatMeasure(totalDmi, 'weight')]");
    const check = read('src/features/feed/check.js');
    expect(check).not.toMatch(/KG_TO_LBS|lbs DMI/);
    expect(check).toContain("~${formatMeasure(dmiKg, 'weight')} DMI");
    // 2 bales × 500 kg × 85% DM.
    expect(formatMeasure(850, 'weight', { unitSystem: 'imperial' })).toBe('1,874 lb');
    expect(formatMeasure(850, 'weight', { unitSystem: 'metric' })).toBe('850 kg');
  });

  it('rows 50–52: animals class / bulk row / weight sheet show one short unit', () => {
    const animals = read('src/features/animals/index.js');
    expect(animals).not.toContain("[`${weightDisplay} ${unitLabel('weight', unitSys)}`]");
    expect(animals).not.toContain("${currentDisplay} ${unitLabel('weight', unitSys)}");
    const weight = read('src/features/health/weight.js');
    expect(weight).not.toMatch(/: '\\u2014'\} \$\{wUnit\}`/);
    expect(formatMeasure(498.95, 'weight', { unitSystem: 'imperial' })).toBe('1,100 lb');
    expect(formatMeasure(498.95, 'weight', { unitSystem: 'metric' })).toBe('499 kg');
  });

  it('row 54: map import shows the file area in the farm unit', () => {
    const src = read('src/features/map/import-sheet.js');
    expect(src).not.toContain('2.47105');
    expect(src).toContain('`${areaText} from file');
    expect(formatMeasure(4.047, 'area', { unitSystem: 'imperial', decimals: 1 })).toBe('10.0 ac');
    expect(formatMeasure(4.047, 'area', { unitSystem: 'metric', decimals: 1 })).toBe('4.0 ha');
  });
});

describe('S4 — NPK / amendments / inputs', () => {
  it('row 44: amendment NPK preview via the npk family', () => {
    const src = read('src/features/amendments/entry.js');
    expect(src).not.toContain('kg  P: ${pKg} kg');
    expect(src).toContain("formatMeasure((pct / 100) * qty, 'npk', { decimals: 2 })");
  });

  for (const us of ['imperial', 'metric']) {
    const w = us === 'imperial' ? 'lb' : 'kg';
    it(`rows 46–47 + Appendix B (${us}): manure list, labels and inputs in ${w}`, () => {
      seed(us);
      add('manureBatches', ManureBatchEntity.create({
        id: '00000000-0000-4000-8000-000000000c01', operationId: OP, label: 'Pile A',
        estimatedVolumeKg: 1000, nKg: 5, pKg: 2, kKg: 4, captureDate: '2026-11-01',
      }), ManureBatchEntity.validate, ManureBatchEntity.toSupabaseShape, 'manure_batches');
      const c = document.createElement('div');
      document.body.appendChild(c);
      renderManureScreen(c);
      const text = c.textContent;
      if (us === 'imperial') {
        expect(text).toContain('2,205/2,205 lb');
        expect(text).toContain('N: 11.0 lb P: 4.4 lb K: 8.8 lb');
      } else {
        expect(text).toContain('1,000/1,000 kg');
        expect(text).toContain('N: 5.0 kg P: 2.0 kg K: 4.0 kg');
      }
      expect(t('amendment.manureBatchVolume', { unit: w })).toBe(`Estimated Volume (${w})`);
      expect(t('amendment.manureBatchComposition', { unit: w })).toBe(`Composition (${w} per batch)`);
      expect(t('amendment.txVolume', { unit: w })).toBe(`Volume (${w})`);
    });

    it(`row 48 + Appendix B (${us}): NPK prices list and labels in $/${w}`, () => {
      seed(us);
      add('npkPriceHistory', NpkPriceEntity.create({
        id: '00000000-0000-4000-8000-000000000d01', operationId: OP, farmId: FARM,
        effectiveDate: '2026-01-01', nPricePerKg: 1.10, pPricePerKg: 2.20462, kPricePerKg: 1.5,
      }), NpkPriceEntity.validate, NpkPriceEntity.toSupabaseShape, 'npk_price_history');
      const c = document.createElement('div');
      document.body.appendChild(c);
      renderNpkPricesScreen(c);
      expect(c.textContent).toContain(us === 'imperial'
        ? 'N: $0.50/lb  P: $1.00/lb  K: $0.68/lb'
        : 'N: $1.10/kg  P: $2.20/kg  K: $1.50/kg');
      expect(t('amendment.npkN', { unit: `$/${w}` })).toBe(`N Price ($/${w})`);
    });
  }

  it('Appendix B round trips: manure kg and NPK $/kg save canonical metric', () => {
    expect(manureWeightInputValue(1000, 'imperial')).toBe('2204.62');
    expect(manureWeightFromInput('2204.62', 'imperial')).toBeCloseTo(1000, 2);
    expect(manureWeightFromInput('2204.62', 'imperial', 1000)).toBe(1000); // untouched → no drift
    expect(manureWeightInputValue(1000, 'metric')).toBe('1000');
    expect(manureWeightFromInput('1000', 'metric')).toBe(1000);
    expect(manureWeightFromInput('', 'imperial')).toBeNull();
    expect(npkPriceInputValue(1.10, 'imperial')).toBe('0.499');
    expect(npkPriceFromInput('0.50', 'imperial')).toBeCloseTo(1.10231, 4);
    expect(npkPriceInputValue(1.10, 'metric')).toBe('1.1');
    expect(npkPriceFromInput('1.1', 'metric')).toBe(1.1);
    expect(npkPriceFromInput('', 'metric')).toBeNull();
  });

  it('row 49 (Fa): forage NPK removal inputs lb/ton DM on imperial (×2.0), kg/t DM on metric; round trip', () => {
    const n = FORAGE_FIELD_DESCRIPTORS.find(f => f.key === 'nPerTonneDm');
    expect(composeFieldLabel(n, 'imperial')).toBe('N (lb/ton DM)');
    expect(composeFieldLabel(n, 'metric')).toBe('N (kg/t DM)');
    expect(toDisplayValue(24, n, 'imperial')).toBeCloseTo(48, 6);
    expect(toStoredValue(48, n, 'imperial')).toBeCloseTo(24, 6);
    expect(toDisplayValue(24, n, 'metric')).toBe(24);
  });

  for (const us of ['imperial', 'metric']) {
    it(`row 49 (Fa) list meta line (${us})`, () => {
      seed(us);
      add('forageTypes', ForageTypeEntity.create({
        id: '00000000-0000-4000-8000-000000000e01', operationId: OP, name: 'Mixed Grass',
        dmPct: 35, nPerTonneDm: 24, pPerTonneDm: 3.25, kPerTonneDm: 20,
      }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
      const node = renderForageTypesSection(OP);
      document.body.appendChild(node);
      expect(node.textContent).toContain(us === 'imperial'
        ? 'DM 35% · N 48 / P 6.5 / K 40 lb/ton DM'
        : 'DM 35% · N 24 / P 3.3 / K 20 kg/t DM');
    });
  }

  it('Appendix B: class excretion rates relabel only (ratio, no conversion)', () => {
    const src = read('src/features/animals/index.js');
    expect(src).toContain("const excretionUnit = `${excretionW} / 1000 ${excretionW} BW / day`;");
    expect(src).toContain('`Excretion N (${excretionUnit})`');
  });

  it('unused "Weight/unit (kg)" key removed (brief: feed.weightPerUnit; it lived under harvest)', () => {
    expect(JSON.stringify(enLocale)).not.toContain('Weight/unit (kg)');
    expect(enLocale.harvest.weightPerUnit).toBeUndefined();
  });
});

describe('S4 — assistant reads + prompt line', () => {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const scope = { operationId: id(1), actorId: id(2) };

  it('farmReadDisplay formats in the given unit system (store-free core)', () => {
    const r = { location: { areaHectares: 4.047 }, animal: {}, animalClass: { defaultWeightKg: 498.95 } };
    expect(farmReadDisplay(r, 'imperial', { latestWeightKg: 453.6 })).toEqual({ locationArea: '10.0 ac', animalWeight: '1,000 lb', classDefaultWeight: '1,100 lb' });
    expect(farmReadDisplay(r, 'metric', { latestWeightKg: 453.6 })).toEqual({ locationArea: '4.0 ha', animalWeight: '454 kg', classDefaultWeight: '499 kg' });
    expect(farmReadDisplay({ location: { areaHectares: null } }, 'metric')).toEqual({});
    expect(coreFormatMeasure(1, 'weight', { unitSystem: 'metric' })).toBe('1.0 kg');
  });

  for (const us of ['imperial', 'metric']) {
    it(`read payload carries unitSystem + display strings (${us})`, async () => {
      const loc = { id: id(9), operationId: scope.operationId, name: 'E-1', areaHectares: 4.047 };
      const data = { operations: [{ id: scope.operationId, unitSystem: us }], locations: [loc], events: [], eventPaddockWindows: [] };
      const readPort = createFarmReadPort({ authorize: async () => true, getAll: e => data[e] || [] });
      const out = await readPort(scope, 'paddock-grazing-evidence', { locationId: loc.id });
      expect(out.unitSystem).toBe(us);
      expect(out.display.locationArea).toBe(us === 'imperial' ? '10.0 ac' : '4.0 ha');
      expect(out.location.areaHectares).toBe(4.047); // canonical value unchanged
    });
  }

  it('server prompt has the one unit line (edge deploy needed)', () => {
    const src = read('src/features/assistant/server/host.js');
    expect(src).toContain("Speak in the farm\\'s unit system (read results carry unitSystem)");
    expect(src).not.toMatch(/from '\.\.\/\.\.\/\.\.\/utils\/units\.js'/);
    expect(read('src/features/assistant/farm-reads.js')).toContain("from '../../utils/units-core.js'");
  });
});
