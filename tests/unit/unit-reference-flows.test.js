/** Real flows against an in-memory transport double; no SQL or live DB access. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 44 }));
const db = vi.hoisted(() => ({ rows: {}, calls: [], client: null }));
vi.mock('../../src/data/supabase-client.js', () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user', email: 'test@example.test' } } }) },
    from(table) {
      let operation = 'select', payload, options, page, filters = [];
      const query = {
        select(columns, opts) { operation = 'select'; options = opts; return query; },
        insert(rows) { operation = 'insert'; payload = rows; return query; },
        update(rows) { operation = 'update'; payload = rows; return query; },
        upsert(rows, opts) { operation = 'upsert'; payload = rows; options = opts; return query; },
        delete() { operation = 'delete'; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        range(start,end) { page=[start,end]; return query; },
        limit() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            db.calls.push({ table, operation, payload: structuredClone(payload), options });
            if (['dose_units', 'input_product_units'].includes(table) && !['select', 'insert', 'update', 'upsert'].includes(operation)) throw new Error('Forbidden unit operation');
            const rows = db.rows[table] || [];
            if (operation !== 'select') db.rows[table] = rows;
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
            return { data: structuredClone(page ? selected.slice(page[0],page[1]+1) : selected), count: options?.count ? selected.length : null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: vi.fn(async name => name === 'assistant_discard_empty_start' ? ({data:'discarded',error:null}) : name === 'unit_restore_id_conflicts' ? ({ data: false, error: null }) : ({ data: [{ outcome: name.endsWith('prepare') ? 'prepared' : name.endsWith('finish') ? 'finished' : 'aborted', fence_token: 'test-fence' }], error: null })),
  };
  db.client = client;
  return { supabase: client };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, getAll, setSyncAdapter, add, update, remove, mergeRemote, init } from '../../src/data/store.js';
import { renderOnboarding } from '../../src/features/onboarding/index.js';
import { UNIT_STANDARDS } from '../../src/utils/unit-standards.js';
import { renderDoseUnitsSection, renderHealthRefSheetMarkups } from '../../src/features/health/reference-tables.js';
import { pushAllToSupabase } from '../../src/data/push-all.js';
import { importOperationBackup, BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
import { exportOperationBackup, BACKUP_TABLES } from '../../src/data/backup-export.js';
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

it('real onboarding never seeds or queues standard units', async () => {
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
  expect(unitCalls()).toEqual([]); expect(getAll('doseUnits')).toEqual([]); expect(getAll('inputProductUnits')).toEqual([]);
});

it('real dose-unit editor creates, edits and archives with insert/update only', async () => {
  document.body.append(...renderHealthRefSheetMarkups());
  let section;
  const render = () => { section?.remove(); section = renderDoseUnitsSection('op'); document.body.append(section); };
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

it('Push All upserts only custom rows without deleting either table', async () => {
  add('doseUnits', Dose.create({ id: 'dose', name: 'mL', operationId: 'op' }), Dose.validate);
  add('inputProductUnits', Product.create({ id: 'product', name: 'kg', operationId: 'op' }), Product.validate);
  db.rows.dose_units = [{ id: 'dose', name: 'old', operation_id: 'op' }];
  mergeRemote('doseUnits', [Dose.create({ id: 'standard', name: 'standard' })]);
  expect((await pushAllToSupabase()).queued).toBe(2);
  await vi.waitFor(() => expect(db.rows.input_product_units).toHaveLength(1));
  expect(db.rows.dose_units[0].name).toBe('mL');
  expect(unitCalls().map(call => call.operation)).toEqual(['upsert', 'upsert']); noUnitDeletes();
});

it('real offline store writes queue inserts and archive updates, then flush with no unit deletes', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  add('doseUnits', Dose.create({ id: 'dose', name: 'mL', operationId: 'op' }), Dose.validate, Dose.toSupabaseShape, 'dose_units');
  add('inputProductUnits', Product.create({ id: 'product', name: 'kg', operationId: 'op' }), Product.validate, Product.toSupabaseShape, 'input_product_units');
  update('doseUnits', 'dose', { archived: true }, Dose.validate, Dose.toSupabaseShape, 'dose_units');
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('_sync_queue'))).toHaveLength(3));
  expect(JSON.parse(localStorage.getItem('_sync_queue')).map(row => row.operation)).toEqual(['insert', 'insert', 'update']);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); await adapter.flush();
  expect(db.rows.dose_units[0].archived).toBe(true); expect(db.rows.input_product_units[0].name).toBe('kg');
  expect(JSON.parse(localStorage.getItem('_sync_queue'))).toEqual([]); noUnitDeletes();
});

it('CP-56 restores both custom unit tables with id-conflict upserts and SELECT parity, never reference deletes', async () => {
  const fixture = { format: 'gtho-v2-backup', format_version: 1, schema_version: 44, operation_id: 'op', tables: {
    dose_units: [{ id: 'dose', name: 'updated mL', operation_id: 'op' }, { id: 'dose-new', name: 'new dose', operation_id: 'op' }],
    input_product_units: [{ id: 'product', name: 'updated kg', operation_id: 'op' }, { id: 'product-new', name: 'new product unit', operation_id: 'op' }],
  } };
  db.rows.dose_units = [{ id: 'dose', name: 'old mL', operation_id: 'op' }]; db.rows.input_product_units = [{ id: 'product', name: 'old kg', operation_id: 'op' }];
  const result = await importOperationBackup(structuredClone(fixture), 'op', null, { skipAutoBackup: true });
  expect(result, result.error).toMatchObject({ success: true });
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


it('standard rows render read-only, foreign customs are absent, and archived selected choices remain selectable only as historical values',()=>{
  mergeRemote('doseUnits',[Dose.create({id:'std',name:'ml'}),Dose.create({id:'foreign',name:'Foreign',operationId:'other'}),Dose.create({id:'custom',name:'Own',operationId:'op'})]);
  const section=renderDoseUnitsSection('op');document.body.append(section);
  const standard=section.querySelector('[data-testid="settings-dose-unit-std"]');expect(standard.textContent).toContain('Standard');expect(standard.querySelector('button')).toBeNull();expect(section.textContent).not.toContain('Foreign');
  expect(()=>update('doseUnits','std',{name:'bad'},Dose.validate,Dose.toSupabaseShape,'dose_units')).toThrow('read-only');
});

it('legacy unit cache/queue/dead letters are discarded content-free and never replayed',async()=>{
  const log=vi.spyOn(console,'info').mockImplementation(()=>{});
  const standard=UNIT_STANDARDS.find(row=>row.table==='dose_units');
  localStorage.setItem('gtho_v2_doseUnits',JSON.stringify([{id:'legacy',name:'sensitive'},{id:'old-mapper',name:'sensitive',operationId:null},Dose.create({id:standard.id,name:standard.name})]));init();expect(getAll('doseUnits').map(row=>row.id)).toEqual([standard.id]);
  localStorage.setItem('_sync_queue',JSON.stringify([{table:'dose_units',operation:'insert',record:{id:'legacy',name:'sensitive'}}]));
  localStorage.setItem('_dead_letter_queue',JSON.stringify([{table:'input_product_units',record:{id:'legacy',name:'sensitive'}}]));
  await adapter.flush();expect(unitCalls()).toEqual([]);expect(adapter.getQueuedItems()).toEqual([]);expect(adapter.getDeadLetters()).toEqual([]);
  expect(log.mock.calls).toHaveLength(3);for(const args of log.mock.calls){expect(Object.keys(args[2])).toEqual(['count']);expect(JSON.stringify(args)).not.toContain('sensitive');}
});

it('CP-56 rejects missing, foreign, duplicate and standard-conflicting references before any mutation or fence',async()=>{
 const standard=UNIT_STANDARDS.find(row=>row.table==='dose_units');db.rows.dose_units=[{id:standard.id,name:standard.name,operation_id:null}];
 const invalid=[{animal_treatments:[{id:'t',operation_id:'op',dose_unit_id:'missing'}]},{dose_units:[{id:'x',name:standard.name,operation_id:'op'}]},{dose_units:[{id:'x',name:'One',operation_id:'other'}]},{dose_units:[{id:'x',name:'One',operation_id:'op'},{id:'x',name:'Two',operation_id:'op'}]}];
 for(const tables of invalid){db.calls=[];db.client.rpc.mockClear();const before=structuredClone(db.rows);const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'op',tables},'op',null,{skipAutoBackup:true});expect(result.success).toBe(false);expect(db.rows).toEqual(before);expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.client.rpc).not.toHaveBeenCalled();}
});

it('CP-55 exports only current-operation custom units; standards and other customs stay out',async()=>{
 db.rows.operations=[{id:'op',name:'Farm',schema_version:44}];
 for(const table of tables)db.rows[table]=[{id:'standard-'+table,name:'Standard',operation_id:null},{id:'own-'+table,name:'Own',operation_id:'op'},{id:'foreign-'+table,name:'Foreign',operation_id:'other'}];
 const exported=await exportOperationBackup('op');const backup=JSON.parse(exported.json);
 for(const table of tables)expect(backup.tables[table]).toEqual([expect.objectContaining({id:'own-'+table,operation_id:'op'})]);expect(backup.tables).not.toHaveProperty('release_notes');
});

it('successful empty-to-rows full pull hydrates release notes without fabricating an error',async()=>{
 const {pullAllRemote}=await import('../../src/data/pull-remote.js');
 const first=await pullAllRemote();expect(first.errors).toBe(0);expect(getAll('releaseNotes')).toEqual([]);
 db.rows.release_notes=[{id:'note',version:'fixture',summary:'Summary',released_at:'2026-11-10T12:00:00Z'}];
 const second=await pullAllRemote();expect(second.errors).toBe(0);expect(getAll('releaseNotes')[0].id).toBe('note');
});

it('restore preflight rejects RLS-hidden foreign UUID collisions with no writes or fence',async()=>{
 db.client.rpc.mockResolvedValueOnce({data:true,error:null});const before=structuredClone(db.rows);
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'op',tables:{dose_units:[{id:'foreign',name:'Otherwise valid',operation_id:'op'}]}},'op',null,{skipAutoBackup:true});
 expect(result.success).toBe(false);expect(db.rows).toEqual(before);expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.client.rpc).toHaveBeenCalledExactlyOnceWith('unit_restore_id_conflicts',expect.anything());
});

it('CP-56 legacy-to-new and new round trips map standard IDs only, retain missing target customs, and never delete units',async()=>{
 const dose=UNIT_STANDARDS.find(row=>row.table==='dose_units');const product=UNIT_STANDARDS.find(row=>row.table==='input_product_units');
 db.rows.operations=[{id:'op',name:'Farm',schema_version:44}];
 db.rows.dose_units=[{id:dose.id,name:dose.name,operation_id:null},{id:'retained',name:'Retained target custom',operation_id:'op'}];
 db.rows.input_product_units=[{id:product.id,name:product.name,operation_id:null}];
 const old={format:'gtho-v2-backup',format_version:1,schema_version:43,operation_id:'op',tables:{
 operations:[{id:'op',name:'Farm',schema_version:43}],
 dose_units:[{id:dose.legacyId,name:'ignored name'},{id:'custom',name:'Custom legacy'}],input_product_units:[{id:product.legacyId,name:product.name}],
 animal_treatments:[{id:'t',operation_id:'op',dose_unit_id:dose.legacyId}],amendments:[{id:'a',operation_id:'op',qty_unit_id:product.legacyId}],input_products:[{id:'p',operation_id:'op',unit_id:product.legacyId}]
 }};
 const first=await importOperationBackup(old,'op',null,{skipAutoBackup:true});expect(first,first.error).toMatchObject({success:true});
 expect(db.rows.animal_treatments[0].dose_unit_id).toBe(dose.id);expect(db.rows.amendments[0].qty_unit_id).toBe(product.id);expect(db.rows.input_products[0].unit_id).toBe(product.id);
 expect(db.rows.dose_units).toEqual(expect.arrayContaining([expect.objectContaining({id:'retained'}),expect.objectContaining({id:'custom',operation_id:'op'})]));
 const fresh=JSON.parse((await exportOperationBackup('op')).json);expect(fresh.tables.dose_units.every(row=>row.operation_id==='op')).toBe(true);
 const second=await importOperationBackup(fresh,'op',null,{skipAutoBackup:true});expect(second,second.error).toMatchObject({success:true});noUnitDeletes();
});

it('the real product editor keeps an archived selected unit on an unrelated rename',async()=>{
 const {renderProductsSection,renderAmendmentRefSheetMarkups}=await import('../../src/features/amendments/reference-tables.js');
 const Item=await import('../../src/entities/input-product.js');
 mergeRemote('inputProductUnits',[Product.create({id:'archived',name:'Historical',archived:true}),Product.create({id:'foreign',name:'Foreign',operationId:'other'})]);
 mergeRemote('inputProductCategories',[{id:'category',operationId:'op',name:'Category',archived:false}]);
 add('inputProducts',Item.create({id:'item',operationId:'op',name:'Original',categoryId:'category',unitId:'archived'}),Item.validate);
 db.rows.input_products=[Item.toSupabaseShape(getAll('inputProducts')[0])];
 document.body.append(...renderAmendmentRefSheetMarkups());const section=renderProductsSection('op');document.body.append(section);button(section,'Edit').click();
 const panel=document.querySelector('#product-sheet-panel');const selected=panel.querySelector('[data-testid="product-sheet-unit"]');
 expect(selected.value).toBe('archived');expect([...selected.options].find(option=>option.value==='archived').disabled).toBe(true);expect([...selected.options].some(option=>option.value==='foreign')).toBe(false);
 fill(panel,'input','Renamed');button(panel,'Save').click();expect(getAll('inputProducts')[0]).toMatchObject({name:'Renamed',unitId:'archived'});
 await vi.waitFor(()=>expect(db.rows.input_products?.[0]?.unit_id).toBe('archived'));
});

it('unit export and restore preflight read every page without exporting standards or foreign customs',async()=>{
 db.rows.operations=[{id:'op',name:'Farm',schema_version:44}];
 const own=Array.from({length:1001},(_,i)=>({id:'custom-'+i,name:'Unit '+i,operation_id:'op'}));
 db.rows.dose_units=[{id:'std',name:'Standard',operation_id:null},...own,{id:'foreign',name:'Foreign',operation_id:'other'}];
 const backup=JSON.parse((await exportOperationBackup('op')).json);expect(backup.tables.dose_units).toEqual(own);
 const result=await importOperationBackup(backup,'op',null,{skipAutoBackup:true});expect(result,result.error).toMatchObject({success:true});noUnitDeletes();
});

it('unit preflight transport rejection returns a clear no-mutation failure without preparing a fence',async()=>{
 db.client.rpc.mockRejectedValueOnce(new Error('fixture network failure'));
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'op',tables:{dose_units:[{id:'custom',name:'Custom',operation_id:'op'}]}},'op',null,{skipAutoBackup:true});
 expect(result).toMatchObject({success:false,error:'Unit restore validation unavailable. Nothing was changed.'});expect(db.rows).toEqual({});expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.client.rpc).toHaveBeenCalledTimes(1);
});

it('unit deletes and standard writes cannot enter generic store, direct transport, batch or queue paths',async()=>{
 mergeRemote('doseUnits',[Dose.create({id:'std',name:'Standard'})]);
 expect(()=>remove('doseUnits','std','dose_units')).toThrow();
 for(const table of tables){
 expect((await adapter.delete(table,'custom')).success).toBe(false);
 expect((await adapter.push(table,{id:'std',name:'Standard',operation_id:null})).success).toBe(false);
 expect((await adapter.push(table,{id:'custom',name:'Custom',operation_id:'op'},'delete')).success).toBe(false);
 expect((await adapter.pushBatch(table,[{id:'std',name:'Standard',operation_id:null}]))[0].success).toBe(false);
 }
 expect(unitCalls()).toEqual([]);expect(adapter.getQueuedItems()).toEqual([]);
});
