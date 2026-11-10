/** Real flows against an in-memory transport double; no SQL or live DB access. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], client: null }));
vi.mock('../../src/data/supabase-client.js', () => {
  const client = {
    from(table) {
      let operation = 'select', payload, options, filters = [];
      const query = {
        select(columns, opts) { operation = 'select'; options = opts; return query; },
        insert(rows) { operation = 'insert'; payload = rows; return query; },
        update(rows) { operation = 'update'; payload = rows; return query; },
        upsert(rows, opts) { operation = 'upsert'; payload = rows; options = opts; return query; },
        delete() { operation = 'delete'; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        range() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            db.calls.push({ table, operation, payload: structuredClone(payload), options });
            if (['dose_units', 'input_product_units'].includes(table) && !['select', 'insert', 'update', 'upsert'].includes(operation)) throw new Error('Forbidden unit operation');
            const rows = db.rows[table] ||= [];
            const matches = row => filters.every(([key, value]) => row[key] === value);
            if (operation === 'delete') db.rows[table] = rows.filter(row => !matches(row));
            if (operation === 'update') rows.filter(matches).forEach(row => Object.assign(row, structuredClone(payload)));
            if (operation === 'insert' || operation === 'upsert') {
              for (const row of Array.isArray(payload) ? payload : [payload]) {
                const existing = rows.find(old => old.id === row.id);
                if (existing && operation === 'insert') throw new Error('Duplicate insert');
                if (existing) Object.assign(existing, structuredClone(row));
                else rows.push(structuredClone(row));
              }
            }
            const selected = (db.rows[table] || []).filter(matches);
            return { data: structuredClone(selected), count: options?.count ? selected.length : null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: vi.fn(async name => ({ data: [{ outcome: name.endsWith('prepare') ? 'prepared' : name.endsWith('finish') ? 'finished' : 'aborted', fence_token: 'test-fence' }], error: null })),
  };
  db.client = client;
  return { supabase: client };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, getAll, setSyncAdapter, add, update } from '../../src/data/store.js';
import { renderOnboarding } from '../../src/features/onboarding/index.js';
import { DEFAULT_DOSE_UNITS, DEFAULT_INPUT_PRODUCT_UNITS } from '../../src/features/onboarding/seed-data.js';
import { renderDoseUnitsSection, renderHealthRefSheetMarkups } from '../../src/features/health/reference-tables.js';
import { pushAllToSupabase } from '../../src/data/push-all.js';
import { importOperationBackup, BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
import { BACKUP_TABLES } from '../../src/data/backup-export.js';
import { SYNC_REGISTRY } from '../../src/data/sync-registry.js';
import * as Dose from '../../src/entities/dose-unit.js';
import * as Product from '../../src/entities/input-product-unit.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { button, fill } from './manual-entry-helpers.js';
const tables = ['dose_units', 'input_product_units'];
const unitCalls = () => db.calls.filter(call => tables.includes(call.table));
let adapter;
beforeEach(() => {
  localStorage.clear(); _reset(); document.body.replaceChildren(); setLocale('en', en);
  db.rows = {}; db.calls = []; db.client.rpc.mockClear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  adapter = new CustomSync(); setSyncAdapter(adapter);
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });
function noUnitDeletes() {
  expect(unitCalls().length).toBeGreaterThan(0);
  expect(unitCalls().every(call => ['select', 'insert', 'update', 'upsert'].includes(call.operation))).toBe(true);
}

it('real onboarding seeds both unit tables using inserts, not deletes', async () => {
  const root = document.createElement('main'); document.body.append(root);
  const done = vi.fn(); renderOnboarding(root, done);
  fill(root, '[data-testid="onboarding-operation-name"]', 'Farm');
  root.querySelector('[data-testid="onboarding-next-1"]').click();
  fill(root, '[data-testid="onboarding-farm-name"]', 'Home');
  root.querySelector('[data-testid="onboarding-next-2"]').click();
  root.querySelector('[data-testid="onboarding-species-beef_cattle"]').click();
  root.querySelector('[data-testid="onboarding-next-3"]').click();
  root.querySelector('[data-testid="onboarding-confirm"]').click();
  await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(db.rows.dose_units).toHaveLength(DEFAULT_DOSE_UNITS.length));
  expect(db.rows.input_product_units.map(row => row.name)).toEqual(DEFAULT_INPUT_PRODUCT_UNITS);
  expect(db.rows.dose_units.map(row => row.name)).toEqual(DEFAULT_DOSE_UNITS);
  expect(unitCalls().every(call => call.operation === 'insert')).toBe(true); noUnitDeletes();
});

it('real dose-unit editor creates, edits and archives with insert/update only', async () => {
  document.body.append(...renderHealthRefSheetMarkups());
  let section;
  const render = () => { section?.remove(); section = renderDoseUnitsSection(); document.body.append(section); };
  render(); button(section, en.health.addDoseUnit).click();
  let panel = document.querySelector('#dose-unit-sheet-panel');
  fill(panel, 'input', 'Test unit'); button(panel, 'Save').click();
  await vi.waitFor(() => expect(db.rows.dose_units).toHaveLength(1));
  const id = getAll('doseUnits')[0].id; render(); button(section, 'Edit').click();
  panel = document.querySelector('#dose-unit-sheet-panel'); fill(panel, 'input', 'Edited unit'); button(panel, 'Save').click();
  await vi.waitFor(() => expect(db.rows.dose_units[0].name).toBe('Edited unit'));
  render(); vi.spyOn(window, 'confirm').mockReturnValue(true); button(section, 'Archive').click();
  await vi.waitFor(() => expect(db.rows.dose_units[0].archived).toBe(true));
  expect(db.rows.dose_units[0].id).toBe(id);
  expect(unitCalls().map(call => call.operation)).toEqual(['insert', 'update', 'update']); noUnitDeletes();
});

it('Push All upserts both existing and new shared rows without deleting either table', async () => {
  add('doseUnits', Dose.create({ id: 'dose', name: 'mL' }), Dose.validate);
  add('inputProductUnits', Product.create({ id: 'product', name: 'kg' }), Product.validate);
  db.rows.dose_units = [{ id: 'dose', name: 'old' }];
  expect((await pushAllToSupabase()).queued).toBe(2);
  await vi.waitFor(() => expect(db.rows.input_product_units).toHaveLength(1));
  expect(db.rows.dose_units[0].name).toBe('mL');
  expect(unitCalls().map(call => call.operation)).toEqual(['upsert', 'upsert']); noUnitDeletes();
});

it('real offline store writes queue inserts and archive updates, then flush with no unit deletes', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  add('doseUnits', Dose.create({ id: 'dose', name: 'mL' }), Dose.validate, Dose.toSupabaseShape, 'dose_units');
  add('inputProductUnits', Product.create({ id: 'product', name: 'kg' }), Product.validate, Product.toSupabaseShape, 'input_product_units');
  update('doseUnits', 'dose', { archived: true }, Dose.validate, Dose.toSupabaseShape, 'dose_units');
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('_sync_queue'))).toHaveLength(3));
  expect(JSON.parse(localStorage.getItem('_sync_queue')).map(row => row.operation)).toEqual(['insert', 'insert', 'update']);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); await adapter.flush();
  expect(db.rows.dose_units[0].archived).toBe(true); expect(db.rows.input_product_units[0].name).toBe('kg');
  expect(JSON.parse(localStorage.getItem('_sync_queue'))).toEqual([]); noUnitDeletes();
});

it('CP-56 restores both global tables with id-conflict upserts and SELECT parity, never reference deletes', async () => {
  const fixture = { format: 'gtho-v2-backup', format_version: 1, schema_version: 41, operation_id: 'op', tables: {
    dose_units: [{ id: 'dose', name: 'updated mL' }, { id: 'dose-new', name: 'new dose' }],
    input_product_units: [{ id: 'product', name: 'updated kg' }, { id: 'product-new', name: 'new product unit' }],
  } };
  db.rows.dose_units = [{ id: 'dose', name: 'old mL' }]; db.rows.input_product_units = [{ id: 'product', name: 'old kg' }];
  const result = await importOperationBackup(structuredClone(fixture), 'op', null, { skipAutoBackup: true });
  expect(result).toMatchObject({ success: true });
  for (const table of tables) {
    expect(db.rows[table]).toEqual(fixture.tables[table]);
    expect(unitCalls().filter(call => call.table === table && call.operation === 'upsert')).toEqual([
      { table, operation: 'upsert', payload: fixture.tables[table], options: { onConflict: 'id' } },
    ]);
    expect(unitCalls().some(call => call.table === table && call.operation === 'select')).toBe(true);
  }
  expect(db.client.rpc).toHaveBeenCalledWith('assistant_restore_finish', expect.anything()); noUnitDeletes();
});

it('registered client sync reads release_notes, but CP-55 and CP-56 do not include it', async () => {
  expect(SYNC_REGISTRY.releaseNotes.table).toBe('release_notes');
  await adapter.pullAll(SYNC_REGISTRY.releaseNotes.table);
  expect(db.calls).toContainEqual(expect.objectContaining({ table: 'release_notes', operation: 'select' }));
  expect(BROWSER_FK_ORDER).not.toContain('release_notes');
  expect(BACKUP_TABLES).not.toHaveProperty('release_notes');
});
