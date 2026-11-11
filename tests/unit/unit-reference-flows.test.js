/** Real flows against an in-memory transport double; no SQL or live DB access. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], orders: [], proofs: [], filters: [], missingColumn: null, client: null }));
vi.mock('../../src/data/supabase-client.js', () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user', email: 'test@example.test' } } }) },
    from(table) {
      let operation = 'select', payload, options, page, ordering, selection, zeroProof = false, filters = [];
      const query = {
        select(columns, opts) { operation = 'select'; selection = columns; options = opts; return query; },
        insert(rows) { operation = 'insert'; payload = rows; return query; },
        update(rows) { operation = 'update'; payload = rows; return query; },
        upsert(rows, opts) { operation = 'upsert'; payload = rows; options = opts; return query; },
        delete() { operation = 'delete'; return query; },
        eq(key, value) { filters.push([key, value]); db.filters.push({table,key,value}); return query; },
        order(column,opts) { ordering={column,...opts}; db.orders.push({table,column,...opts}); return query; },
        range(start,end) { page=[start,end]; return query; },
        limit(n) { zeroProof = n === 0; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            db.calls.push({ table, operation, payload: structuredClone(payload), options });
            if (zeroProof) {
              db.proofs.push({table,columns:selection,limit:0});
              const missing=db.missingColumn?.table===table && selection.split(',').includes(db.missingColumn.column);
              return {data:missing?null:[],error:missing?{code:'42703'}:null};
            }
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
            if (ordering) selected.sort((a,b)=>String(a[ordering.column]).localeCompare(String(b[ordering.column])));
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
import { importOperationBackup, BROWSER_FK_ORDER, CURRENT_SCHEMA_VERSION, validateBackup, resolveOperationsSchemaStamp } from '../../src/data/backup-import.js';
import { exportOperationBackup, BACKUP_TABLES } from '../../src/data/backup-export.js';
import { groupUnitRestoreRows } from '../../src/data/unit-restore-payload.js';
import { SYNC_REGISTRY } from '../../src/data/sync-registry.js';
import * as Dose from '../../src/entities/dose-unit.js';
import * as Product from '../../src/entities/input-product-unit.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { button, fill, OP } from './manual-entry-helpers.js';
import { RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS } from '../../src/data/schema-release.js';
import { releasedColumns } from '../../src/data/schema-columns.js';
const tables = ['dose_units', 'input_product_units'];
const unitCalls = () => db.calls.filter(call => tables.includes(call.table));
let adapter;
beforeEach(() => {
  localStorage.clear(); _reset(); document.body.replaceChildren(); setLocale('en', en);
  db.rows = {}; db.calls = []; db.orders = []; db.proofs = []; db.filters = []; db.missingColumn = null; db.client.rpc.mockClear();
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
  const render = () => { section?.remove(); section = renderDoseUnitsSection('00000000-0000-4000-8000-000000000001'); document.body.append(section); };
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

it('Push All upserts only current-operation custom rows without deleting either table', async () => {
  mergeRemote('operations',[{id:'00000000-0000-4000-8000-000000000001',name:'Current'}]);
  add('doseUnits', Dose.create({ id: 'a0000000-0000-4000-8000-000000000100', name: 'mL', operationId: '00000000-0000-4000-8000-000000000001' }), Dose.validate);
  add('inputProductUnits', Product.create({ id: 'a0000000-0000-4000-8000-000000000102', name: 'kg', operationId: '00000000-0000-4000-8000-000000000001' }), Product.validate);
  db.rows.dose_units = [{ id: 'a0000000-0000-4000-8000-000000000100', name: 'old', operation_id: '00000000-0000-4000-8000-000000000001' }];
  mergeRemote('doseUnits', [Dose.create({ id: 'a0000000-0000-4000-8000-000000000108', name: 'a0000000-0000-4000-8000-000000000108' })]);
  expect((await pushAllToSupabase()).queued).toBe(3);
  await vi.waitFor(() => expect(db.rows.input_product_units).toHaveLength(1));
  expect(db.rows.dose_units[0].name).toBe('mL');
  expect(unitCalls().map(call => call.operation)).toEqual(['upsert', 'upsert']); noUnitDeletes();
});

it('real offline store writes queue inserts and archive updates, then flush with no unit deletes', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  add('doseUnits', Dose.create({ id: 'a0000000-0000-4000-8000-000000000100', name: 'mL', operationId: '00000000-0000-4000-8000-000000000001' }), Dose.validate, Dose.toSupabaseShape, 'dose_units');
  add('inputProductUnits', Product.create({ id: 'a0000000-0000-4000-8000-000000000102', name: 'kg', operationId: '00000000-0000-4000-8000-000000000001' }), Product.validate, Product.toSupabaseShape, 'input_product_units');
  update('doseUnits', 'a0000000-0000-4000-8000-000000000100', { archived: true }, Dose.validate, Dose.toSupabaseShape, 'dose_units');
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('_sync_queue'))).toHaveLength(3));
  expect(JSON.parse(localStorage.getItem('_sync_queue')).map(row => row.operation)).toEqual(['insert', 'insert', 'update']);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); await adapter.flush();
  expect(db.rows.dose_units[0].archived).toBe(true); expect(db.rows.input_product_units[0].name).toBe('kg');
  expect(JSON.parse(localStorage.getItem('_sync_queue'))).toEqual([]); noUnitDeletes();
});

it('CP-56 restores both custom unit tables with id-conflict upserts and SELECT parity, never reference deletes', async () => {
  const fixture = { format: 'gtho-v2-backup', format_version: 1, schema_version: 44, operation_id: '00000000-0000-4000-8000-000000000001', tables: {
    dose_units: [{ id: 'a0000000-0000-4000-8000-000000000100', name: 'updated mL', operation_id: '00000000-0000-4000-8000-000000000001' }, { id: 'a0000000-0000-4000-8000-000000000101', name: 'new dose', operation_id: '00000000-0000-4000-8000-000000000001' }],
    input_product_units: [{ id: 'a0000000-0000-4000-8000-000000000102', name: 'updated kg', operation_id: '00000000-0000-4000-8000-000000000001' }, { id: 'a0000000-0000-4000-8000-000000000103', name: 'new product unit', operation_id: '00000000-0000-4000-8000-000000000001' }],
  } };
  db.rows.dose_units = [{ id: 'a0000000-0000-4000-8000-000000000100', name: 'old mL', operation_id: '00000000-0000-4000-8000-000000000001' }]; db.rows.input_product_units = [{ id: 'a0000000-0000-4000-8000-000000000102', name: 'old kg', operation_id: '00000000-0000-4000-8000-000000000001' }];
  const result = await importOperationBackup(structuredClone(fixture), '00000000-0000-4000-8000-000000000001', null, { skipAutoBackup: true });
  expect(result, result.error).toMatchObject({ success: true });
  for (const table of tables) {
    expect(db.rows[table]).toEqual(fixture.tables[table]);
    expect(unitCalls().filter(call => call.table === table && call.operation === 'upsert')).toEqual([
      { table, operation: 'upsert', payload: fixture.tables[table], options: { onConflict: 'id', defaultToNull: false } },
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
  mergeRemote('doseUnits',[Dose.create({id:'a0000000-0000-4000-8000-000000000107',name:'ml'}),Dose.create({id:'a0000000-0000-4000-8000-000000000106',name:'Foreign',operationId:'00000000-0000-4000-8000-000000000002'}),Dose.create({id:'a0000000-0000-4000-8000-000000000104',name:'Own',operationId:'00000000-0000-4000-8000-000000000001'})]);
  const section=renderDoseUnitsSection('00000000-0000-4000-8000-000000000001');document.body.append(section);
  const standard=section.querySelector('[data-testid="settings-dose-unit-a0000000-0000-4000-8000-000000000107"]');expect(standard.textContent).toContain('Standard');expect(standard.querySelector('button')).toBeNull();expect(section.textContent).not.toContain('Foreign');
  expect(()=>update('doseUnits','a0000000-0000-4000-8000-000000000107',{name:'bad'},Dose.validate,Dose.toSupabaseShape,'dose_units')).toThrow('read-only');
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
 const invalid=[{animal_treatments:[{id:'t',operation_id:'00000000-0000-4000-8000-000000000001',dose_unit_id:'missing'}]},{dose_units:[{id:'a0000000-0000-4000-8000-00000000010a',name:standard.name,operation_id:'00000000-0000-4000-8000-000000000001'}]},{dose_units:[{id:'a0000000-0000-4000-8000-00000000010a',name:'One',operation_id:'00000000-0000-4000-8000-000000000002'}]},{dose_units:[{id:'a0000000-0000-4000-8000-00000000010a',name:'One',operation_id:'00000000-0000-4000-8000-000000000001'},{id:'a0000000-0000-4000-8000-00000000010a',name:'Two',operation_id:'00000000-0000-4000-8000-000000000001'}]}];
 for(const tables of invalid){db.calls=[];db.client.rpc.mockClear();const before=structuredClone(db.rows);const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'00000000-0000-4000-8000-000000000001',tables},'00000000-0000-4000-8000-000000000001',null,{skipAutoBackup:true});expect(result.success).toBe(false);expect(db.rows).toEqual(before);expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.client.rpc).not.toHaveBeenCalled();}
});

it('CP-55 exports only current-operation custom units; standards and other customs stay out',async()=>{
 db.rows.operations=[{id:'00000000-0000-4000-8000-000000000001',name:'Farm',schema_version:44}];
 for(const table of tables)db.rows[table]=[{id:'standard-'+table,name:'Standard',operation_id:null},{id:'own-'+table,name:'Own',operation_id:'00000000-0000-4000-8000-000000000001'},{id:'foreign-'+table,name:'Foreign',operation_id:'00000000-0000-4000-8000-000000000002'}];
 const exported=await exportOperationBackup('00000000-0000-4000-8000-000000000001');const backup=JSON.parse(exported.json);
 for(const table of tables)expect(backup.tables[table]).toEqual([expect.objectContaining({id:'own-'+table,operation_id:'00000000-0000-4000-8000-000000000001'})]);expect(backup.tables).not.toHaveProperty('release_notes');
});

it('successful empty-to-rows full pull hydrates release notes without fabricating an error',async()=>{
 const {pullAllRemote}=await import('../../src/data/pull-remote.js');
 const first=await pullAllRemote();expect(first.errors).toBe(0);expect(getAll('releaseNotes')).toEqual([]);
 db.rows.release_notes=[{id:'note',version:'fixture',summary:'Summary',released_at:'2026-11-10T12:00:00Z'}];
 const second=await pullAllRemote();expect(second.errors).toBe(0);expect(getAll('releaseNotes')[0].id).toBe('note');
});

it('restore preflight rejects RLS-hidden foreign UUID collisions with no writes or fence',async()=>{
 db.client.rpc.mockResolvedValueOnce({data:true,error:null});const before=structuredClone(db.rows);
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'00000000-0000-4000-8000-000000000001',tables:{dose_units:[{id:'a0000000-0000-4000-8000-000000000106',name:'Otherwise valid',operation_id:'00000000-0000-4000-8000-000000000001'}]}},'00000000-0000-4000-8000-000000000001',null,{skipAutoBackup:true});
 expect(result.success).toBe(false);expect(db.rows).toEqual(before);expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.client.rpc).toHaveBeenCalledExactlyOnceWith('unit_restore_id_conflicts',expect.anything());
});

it('CP-56 legacy-to-new and new round trips map standard IDs only, retain missing target customs, and never delete units',async()=>{
 const dose=UNIT_STANDARDS.find(row=>row.table==='dose_units');const product=UNIT_STANDARDS.find(row=>row.table==='input_product_units');
 db.rows.operations=[{id:'00000000-0000-4000-8000-000000000001',name:'Farm',schema_version:44}];
 db.rows.dose_units=[{id:dose.id,name:dose.name,operation_id:null},{id:'a0000000-0000-4000-8000-000000000105',name:'Retained target custom',operation_id:'00000000-0000-4000-8000-000000000001'}];
 db.rows.input_product_units=[{id:product.id,name:product.name,operation_id:null}];
 const old={format:'gtho-v2-backup',format_version:1,schema_version:43,operation_id:'00000000-0000-4000-8000-000000000001',tables:{
 operations:[{id:'00000000-0000-4000-8000-000000000001',name:'Farm',schema_version:43}],
 dose_units:[{id:dose.legacyId,name:'ignored name'},{id:'a0000000-0000-4000-8000-000000000104',name:'Custom legacy'}],input_product_units:[{id:product.legacyId,name:product.name}],
 animal_treatments:[{id:'t',operation_id:'00000000-0000-4000-8000-000000000001',dose_unit_id:dose.legacyId}],amendments:[{id:'a',operation_id:'00000000-0000-4000-8000-000000000001',qty_unit_id:product.legacyId}],input_products:[{id:'p',operation_id:'00000000-0000-4000-8000-000000000001',unit_id:product.legacyId}]
 }};
 const first=await importOperationBackup(old,'00000000-0000-4000-8000-000000000001',null,{skipAutoBackup:true});expect(first,first.error).toMatchObject({success:true});
 expect(db.rows.animal_treatments[0].dose_unit_id).toBe(dose.id);expect(db.rows.amendments[0].qty_unit_id).toBe(product.id);expect(db.rows.input_products[0].unit_id).toBe(product.id);
 expect(db.rows.dose_units).toEqual(expect.arrayContaining([expect.objectContaining({id:'a0000000-0000-4000-8000-000000000105'}),expect.objectContaining({id:'a0000000-0000-4000-8000-000000000104',operation_id:'00000000-0000-4000-8000-000000000001'})]));
 const fresh=JSON.parse((await exportOperationBackup('00000000-0000-4000-8000-000000000001')).json);expect(fresh.tables.dose_units.every(row=>row.operation_id==='00000000-0000-4000-8000-000000000001')).toBe(true);
 const second=await importOperationBackup(fresh,'00000000-0000-4000-8000-000000000001',null,{skipAutoBackup:true});expect(second,second.error).toMatchObject({success:true});noUnitDeletes();
});

it('the real product editor keeps an archived selected unit on an unrelated rename',async()=>{
 const {renderProductsSection,renderAmendmentRefSheetMarkups}=await import('../../src/features/amendments/reference-tables.js');
 const Item=await import('../../src/entities/input-product.js');
 mergeRemote('inputProductUnits',[Product.create({id:'a0000000-0000-4000-8000-000000000109',name:'Historical',archived:true}),Product.create({id:'a0000000-0000-4000-8000-000000000106',name:'Foreign',operationId:'00000000-0000-4000-8000-000000000002'})]);
 mergeRemote('inputProductCategories',[{id:'category',operationId:'00000000-0000-4000-8000-000000000001',name:'Category',archived:false}]);
 add('inputProducts',Item.create({id:'item',operationId:'00000000-0000-4000-8000-000000000001',name:'Original',categoryId:'category',unitId:'a0000000-0000-4000-8000-000000000109'}),Item.validate);
 db.rows.input_products=[Item.toSupabaseShape(getAll('inputProducts')[0])];
 document.body.append(...renderAmendmentRefSheetMarkups());const section=renderProductsSection('00000000-0000-4000-8000-000000000001');document.body.append(section);button(section,'Edit').click();
 const panel=document.querySelector('#product-sheet-panel');const selected=panel.querySelector('[data-testid="product-sheet-unit"]');
 expect(selected.value).toBe('a0000000-0000-4000-8000-000000000109');expect([...selected.options].find(option=>option.value==='a0000000-0000-4000-8000-000000000109').disabled).toBe(true);expect([...selected.options].some(option=>option.value==='a0000000-0000-4000-8000-000000000106')).toBe(false);
 fill(panel,'input','Renamed');button(panel,'Save').click();expect(getAll('inputProducts')[0]).toMatchObject({name:'Renamed',unitId:'a0000000-0000-4000-8000-000000000109'});
 await vi.waitFor(()=>expect(db.rows.input_products?.[0]?.unit_id).toBe('a0000000-0000-4000-8000-000000000109'));
});

it('unit export and restore preflight read every page without exporting standards or foreign customs',async()=>{
 db.rows.operations=[{id:'00000000-0000-4000-8000-000000000001',name:'Farm',schema_version:44}];
 const own=Array.from({length:1001},(_,i)=>({id:'f0000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),name:'Unit '+i,operation_id:'00000000-0000-4000-8000-000000000001'}));
 db.rows.dose_units=[{id:'a0000000-0000-4000-8000-000000000107',name:'Standard',operation_id:null},...own,{id:'a0000000-0000-4000-8000-000000000106',name:'Foreign',operation_id:'00000000-0000-4000-8000-000000000002'}];
 const backup=JSON.parse((await exportOperationBackup('00000000-0000-4000-8000-000000000001')).json);expect(backup.tables.dose_units).toEqual(own);
 const result=await importOperationBackup(backup,'00000000-0000-4000-8000-000000000001',null,{skipAutoBackup:true});expect(result,result.error).toMatchObject({success:true});noUnitDeletes();
});

it('unit preflight transport rejection returns a clear no-mutation failure without preparing a fence',async()=>{
 db.client.rpc.mockRejectedValueOnce(new Error('fixture network failure'));
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:'00000000-0000-4000-8000-000000000001',tables:{dose_units:[{id:'a0000000-0000-4000-8000-000000000104',name:'Custom',operation_id:'00000000-0000-4000-8000-000000000001'}]}},'00000000-0000-4000-8000-000000000001',null,{skipAutoBackup:true});
 expect(result).toMatchObject({success:false,error:'Unit restore validation unavailable. Nothing was changed.'});expect(db.rows).toEqual({});expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.client.rpc).toHaveBeenCalledTimes(1);
});

it('unit deletes and standard writes cannot enter generic store, direct transport, batch or queue paths',async()=>{
 mergeRemote('doseUnits',[Dose.create({id:'a0000000-0000-4000-8000-000000000107',name:'Standard'})]);
 expect(()=>remove('doseUnits','a0000000-0000-4000-8000-000000000107','dose_units')).toThrow();
 for(const table of tables){
 expect((await adapter.delete(table,'a0000000-0000-4000-8000-000000000104')).success).toBe(false);
 expect((await adapter.push(table,{id:'a0000000-0000-4000-8000-000000000107',name:'Standard',operation_id:null})).success).toBe(false);
 expect((await adapter.push(table,{id:'a0000000-0000-4000-8000-000000000104',name:'Custom',operation_id:'00000000-0000-4000-8000-000000000001'},'delete')).success).toBe(false);
 expect((await adapter.pushBatch(table,[{id:'a0000000-0000-4000-8000-000000000107',name:'Standard',operation_id:null}]))[0].success).toBe(false);
 }
 expect(unitCalls()).toEqual([]);expect(adapter.getQueuedItems()).toEqual([]);
});


it('Push All with two cached operations sends only the selected operation, and no units without one',async()=>{
 const op1='00000000-0000-4000-8000-000000000001',op2='00000000-0000-4000-8000-000000000002';
 mergeRemote('operations',[{id:op1,name:'Current'}]);
 for(const [entity,Unit] of [['doseUnits',Dose],['inputProductUnits',Product]])mergeRemote(entity,[Unit.create({id:'own-'+entity,name:'Own',operationId:op1}),Unit.create({id:'foreign-'+entity,name:'Other farm',operationId:op2}),Unit.create({id:'std-'+entity,name:'Standard'})]);
 const transport={push:vi.fn(async()=>({success:true})),flush:vi.fn(async()=>{})};setSyncAdapter(transport);
 await pushAllToSupabase();expect(transport.push.mock.calls.filter(([table])=>tables.includes(table)).map(([,row])=>row.operation_id)).toEqual([op1,op1]);
 _reset();setSyncAdapter(transport);mergeRemote('doseUnits',[Dose.create({id:'cached',name:'Cached',operationId:op1})]);transport.push.mockClear();await pushAllToSupabase();expect(transport.push).not.toHaveBeenCalled();
});

it('queued and dead-letter actions replay under their original operation, never the selected one',async()=>{
 const op1='00000000-0000-4000-8000-000000000001',op2='00000000-0000-4000-8000-000000000002';
 const queuedId='a0000000-0000-4000-8000-000000000301',deadId='a0000000-0000-4000-8000-000000000302';
 mergeRemote('operations',[{id:op1,name:'Current'}]);db.rows.dose_units=[{id:queuedId,name:'Before',operation_id:op2}];
 localStorage.setItem('_sync_queue',JSON.stringify([{table:'dose_units',id:queuedId,operation:'update',record:{id:queuedId,name:'Queued original owner',operation_id:op2},attempts:0,errors:[]}]));
 localStorage.setItem('_dead_letter_queue',JSON.stringify([{table:'input_product_units',record:{id:deadId,name:'Dead-letter original owner',operation_id:op2},auto_drain_count:0}]));
 expect(adapter.getQueuedItems()).toHaveLength(1);expect(adapter.getDeadLetters()).toHaveLength(1);
 await adapter.flush();expect(db.rows.dose_units[0]).toMatchObject({name:'Queued original owner',operation_id:op2});expect(db.rows.input_product_units[0]).toMatchObject({name:'Dead-letter original owner',operation_id:op2});
 expect(unitCalls().map(call=>call.payload.operation_id)).toEqual([op2,op2]);expect(adapter.getQueuedItems()).toEqual([]);expect(adapter.getDeadLetters()).toEqual([]);
});

const invalidUnitFields=[['archived','invalid-boolean'],['archived',0],['created_at','invalid-timestamp'],['updated_at','invalid-timestamp'],['created_at',null],['updated_at',null],['created_at',123],['updated_at',false],['created_at','2026-02-30T12:00:00Z'],['created_at','2026-01-01T24:00:00Z'],['created_at','2026-01-01T12:00:00+16:00'],['id',null],['id',123],['id','not-a-uuid'],['name',null],['name',123],['name',' '],['operation_id',null],['operation_id',123],['unexpected_column','not supported']];
it.each(tables.flatMap(table=>invalidUnitFields.map(([field,value])=>({table,field,value}))))('CP-56 rejects $table.$field=$value before a fence, self-link detach, write or delete',async({table,field,value})=>{
 const op='00000000-0000-4000-8000-000000000001';
 db.rows.farms=[{id:'existing-farm',operation_id:op}];db.rows.animals=[{id:'existing-animal',operation_id:op,dam_id:'existing-parent'}];const before=structuredClone(db.rows);
 const row={id:'a0000000-0000-4000-8000-000000000401',operation_id:op,name:'Custom',[field]:value};
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:op,tables:{[table]:[row],farms:[],animals:[]}},op,null,{skipAutoBackup:true});
 expect(result.success).toBe(false);expect(result.error).toMatch(/Unit restore validation|Restore refused/);expect(db.client.rpc).not.toHaveBeenCalled();expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.rows).toEqual(before);
});

it('legacy invalid unit metadata is rejected after classification but before any fence or mutation',async()=>{
 const op='00000000-0000-4000-8000-000000000001';
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:43,operation_id:op,tables:{dose_units:[{id:'a0000000-0000-4000-8000-000000000402',name:'Legacy custom',archived:'invalid-boolean'}]}},op,null,{skipAutoBackup:true});
 expect(result.success).toBe(false);expect(result.error).toContain('archived');expect(db.client.rpc).not.toHaveBeenCalled();expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.rows).toEqual({});
});

it('CP-56 forwards only a fresh typed unit payload, preserves nullable archive and microsecond timestamps, and detects case-equivalent duplicate UUIDs',async()=>{
 const op='00000000-0000-4000-8000-000000000001';
 const id='af000000-0000-4000-8000-000000000001',stamp='2026-11-10T18:30:00.123456+00:00';
 const row={id:id.toUpperCase(),operation_id:op,name:' Custom e\u0301 ',archived:null,created_at:stamp,updated_at:stamp};const original=structuredClone(row);
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:op,tables:{dose_units:[row]}},op,null,{skipAutoBackup:true});
 expect(result,result.error).toMatchObject({success:true});expect(row).toEqual(original);expect(db.rows.dose_units[0]).toEqual({id,operation_id:op,name:'Custom é',archived:null,created_at:stamp,updated_at:stamp});
 db.calls=[];db.client.rpc.mockClear();const duplicate=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:op,tables:{dose_units:[{id,operation_id:op,name:'One'},{id:id.toUpperCase(),operation_id:op,name:'Two'}]}},op,null,{skipAutoBackup:true});
 expect(duplicate.success).toBe(false);expect(db.client.rpc).not.toHaveBeenCalled();expect(db.calls.every(call=>call.operation==='select')).toBe(true);
});

it('all unit backup pages request deterministic id ordering',async()=>{
 const op='00000000-0000-4000-8000-000000000001';db.rows.operations=[{id:op,name:'Farm',schema_version:44}];
 db.rows.dose_units=Array.from({length:1001},(_,i)=>({id:'f0000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),name:'Unit '+i,operation_id:op})).reverse();
 const backup=JSON.parse((await exportOperationBackup(op)).json);expect(backup.tables.dose_units.map(row=>row.id)).toEqual([...db.rows.dose_units].map(row=>row.id).sort());
 const imported=await importOperationBackup(backup,op,null,{skipAutoBackup:true});expect(imported,imported.error).toMatchObject({success:true});expect(db.orders.length).toBeGreaterThanOrEqual(4);expect(db.orders.every(order=>order.column==='id'&&order.ascending===true)).toBe(true);
});

it.each(tables)('CP-56 %s mixed restore requests omit absent metadata from conflict updates',async(table)=>{
 const op='00000000-0000-4000-8000-000000000001',old='2020-01-01T00:00:00Z',stamp='2026-11-10T18:30:00Z';
 const existing='ac000000-0000-4000-8000-000000000001',fresh='ac000000-0000-4000-8000-000000000002',minimal='ac000000-0000-4000-8000-000000000003',explicit='ac000000-0000-4000-8000-000000000004';
 db.rows[table]=[{id:existing,operation_id:op,name:'Keep metadata',archived:true,created_at:old,updated_at:old},{id:explicit,operation_id:op,name:'Replace metadata',archived:true,created_at:old,updated_at:old}];
 const rows=[{id:fresh,operation_id:op,name:'Full new row',archived:false,created_at:stamp,updated_at:stamp},{id:existing,operation_id:op,name:'Keep metadata'},{id:minimal,operation_id:op,name:'Default new row'},{id:explicit,operation_id:op,name:'Replace metadata',archived:null,created_at:stamp,updated_at:stamp}];
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:op,tables:{[table]:rows}},op,null,{skipAutoBackup:true});
 expect(result,result.error).toMatchObject({success:true});
 const sent=unitCalls().filter(call=>call.operation==='upsert');expect(sent).toHaveLength(2);
 expect(sent.map(call=>call.payload.map(row=>row.id))).toEqual([[fresh,explicit],[existing,minimal]]);
 expect(db.rows[table].find(row=>row.id===existing)).toMatchObject({archived:true,created_at:old,updated_at:old});
 expect(db.rows[table].find(row=>row.id===explicit)).toMatchObject({archived:null,created_at:stamp,updated_at:stamp});
 // Capture the installed SDK's real requests for the batches CP-56 actually sent.
 // Object.assign in this flow double alone cannot prove PostgREST preservation.
 const {createClient}=await import('@supabase/supabase-js');const requests=[];
 const client=createClient('https://example.invalid','dummy',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{requests.push({url:new URL(url),preference:new Headers(init.headers).get('Prefer'),body:JSON.parse(init.body)});return new Response(null,{status:201});}}});
 for(const call of sent){expect(call.options).toEqual({onConflict:'id',defaultToNull:false});expect((await client.from(table).upsert(call.payload,call.options)).error).toBeNull();}
 for(const request of requests){
  const columns=request.url.searchParams.get('columns').replaceAll('"','').split(',').sort();
  expect(request.preference).toContain('resolution=merge-duplicates');expect(request.preference).toContain('missing=default');
  for(const row of request.body)expect(Object.keys(row).sort()).toEqual(columns);
  if(request.body.some(row=>row.id===existing))expect(columns).toEqual(['id','name','operation_id']);
 }
});

it.each(tables)('CP-56 %s partitions before the 500-row batch limit, preserving every supplied field',async(table)=>{
 const op='00000000-0000-4000-8000-000000000001';
 const rows=Array.from({length:1002},(_,i)=>({id:'ae000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),operation_id:op,name:'Bulk '+i,...(i%2?{archived:false}:{})}));
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:op,tables:{[table]:rows}},op,null,{skipAutoBackup:true});
 expect(result,result.error).toMatchObject({success:true});const sent=unitCalls().filter(call=>call.operation==='upsert');
 expect(sent.map(call=>call.payload.length)).toEqual([500,1,500,1]);
 for(const call of sent)for(const row of call.payload)expect(Object.keys(row).sort()).toEqual(Object.keys(call.payload[0]).sort());
 expect(sent.flatMap(call=>call.payload).sort((a,b)=>a.id.localeCompare(b.id))).toEqual(rows);
});

it('unit restore grouping ignores key order, keeps all eight metadata shapes and never invents fields',()=>{
 const rows=Array.from({length:8},(_,mask)=>({id:'aa000000-0000-4000-8000-'+String(mask).padStart(12,'0'),operation_id:'00000000-0000-4000-8000-000000000001',name:'Unit',...(mask&1?{archived:null}:{}),...(mask&2?{created_at:'2025-01-01T00:00:00Z'}:{}),...(mask&4?{updated_at:'2025-01-01T00:00:00Z'}:{})}));
 const reordered=rows.map(row=>Object.fromEntries(Object.entries(row).reverse()));
 const before=structuredClone([...rows,...reordered]);const groups=groupUnitRestoreRows([...rows,...reordered]);
 expect(groups).toHaveLength(8);groups.forEach((group,index)=>expect(group).toEqual([rows[index],reordered[index]]));
 expect([...rows,...reordered]).toEqual(before);expect(groupUnitRestoreRows([])).toEqual([]);
});

// No schema-release mock: these exercise the exact client being prepared for publish.
it('actual release promotes 42–44 without removing independent column proofs or future guards',async()=>{
 expect(RELEASED_SCHEMA_VERSION).toBe(44);expect(CURRENT_SCHEMA_VERSION).toBe(44);expect(HELD_SCHEMA_VERSIONS).toEqual([]);
 expect(Object.keys(STAGED_COLUMNS).map(Number)).toEqual([42,43,44]);
 expect(()=>releasedColumns(45,{future_field:'value'})).toThrow();
 expect(validateBackup({format:'gtho-v2-backup',format_version:1,schema_version:45,operation_id:OP,tables:{}}).valid).toBe(false);
 await expect(resolveOperationsSchemaStamp(45,db.client)).rejects.toThrow('Unverified');expect(db.calls).toEqual([]);expect(db.client.rpc).not.toHaveBeenCalled();
});

it.each([41,42,43])('real CP-56 %s→44 promotes retained text, legacy pool rows and exact standard references before restore',async(version)=>{
 const operationId=crypto.randomUUID();
 db.rows.operations=[{id:operationId,name:'Existing farm',schema_version:44}];
 for(const table of tables)db.rows[table]=UNIT_STANDARDS.filter(unit=>unit.table===table).map(({id,name})=>({id,name,operation_id:null}));
 const dose=UNIT_STANDARDS.find(unit=>unit.table==='dose_units'),product=UNIT_STANDARDS.find(unit=>unit.table==='input_product_units');
 const custom=Dose.create({name:'Restored custom',operationId:operationId});
 const backup={format:'gtho-v2-backup',format_version:1,schema_version:version,operation_id:operationId,tables:{
  operations:[{id:operationId,name:'Farm',schema_version:version}],
  ai_bulls:[{id:'sire',operation_id:operationId,name:'Sire',epds:' CE+8, BW-1.2 '}],
  animal_breeding_records:[{id:'breeding',operation_id:operationId,sire_name:'Independent sire'}],
  event_feed_entries:[{id:'feeding',operation_id:operationId,batch_id:'retained-batch'}],
  event_feed_check_items:[{id:'check-item',operation_id:operationId,batch_id:'retained-batch'}],
  dose_units:[{id:dose.legacyId,name:dose.name},{id:custom.id,name:custom.name}],input_product_units:[{id:product.legacyId,name:product.name}],
  animal_treatments:[{id:'treatment',operation_id:operationId,dose_unit_id:dose.legacyId}],
  amendments:[{id:'amendment',operation_id:operationId,qty_unit_id:product.legacyId}],input_products:[{id:'product',operation_id:operationId,unit_id:product.legacyId}],
 }};
 const before=structuredClone(backup);const result=await importOperationBackup(backup,operationId,null,{skipAutoBackup:true});
 expect(result,result.error).toMatchObject({success:true});expect(backup).toEqual(before);
 expect(db.rows.operations[0].schema_version).toBe(44);expect(db.rows.ai_bulls[0].epds).toBe(' CE+8, BW-1.2 ');expect(db.rows.animal_breeding_records[0].sire_name).toBe('Independent sire');
 if(version<=42){expect(db.rows.event_feed_entries[0]).toMatchObject({batch_id:'retained-batch',kind:null,feed_type_id:null,return_batch_id:null});expect(db.rows.event_feed_check_items[0]).toMatchObject({batch_id:'retained-batch',feed_type_id:null});}
 expect(db.rows.animal_treatments[0].dose_unit_id).toBe(dose.id);expect(db.rows.amendments[0].qty_unit_id).toBe(product.id);expect(db.rows.input_products[0].unit_id).toBe(product.id);
 expect(db.rows.dose_units.find(row=>row.id===custom.id)).toMatchObject({operation_id:operationId,name:'Restored custom'});
 const names=db.client.rpc.mock.calls.map(([name])=>name);expect(names.indexOf('unit_restore_id_conflicts')).toBeLessThan(names.indexOf('assistant_restore_prepare'));
 for(const [table,columns]of Object.values(STAGED_COLUMNS).flatMap(tables=>Object.entries(tables)))expect(db.proofs).toContainEqual({table,columns:columns.join(','),limit:0});
 expect(unitCalls().filter(call=>call.operation==='upsert').flatMap(call=>call.payload).map(row=>row.id)).toEqual([custom.id]);noUnitDeletes();
});

it.each(Object.values(STAGED_COLUMNS).flatMap(tables=>Object.entries(tables).flatMap(([table,columns])=>columns.map(column=>({table,column})))))('released restore refuses missing $table.$column before any fence or mutation',async({table,column})=>{
 db.missingColumn={table,column};const before=structuredClone(db.rows);
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:41,operation_id:OP,tables:{operations:[{id:OP,schema_version:41}]}},OP,null,{skipAutoBackup:true});
 expect(result.success).toBe(false);expect(result.error).toMatch(/columns|verified/i);expect(db.rows).toEqual(before);expect(db.client.rpc).not.toHaveBeenCalled();expect(db.calls.every(call=>call.operation==='select')).toBe(true);
});

it.each([{error:{code:'PGRST202'}},{error:{code:'42501'}},{data:true},{data:null}])('released custom-unit restore refuses an unavailable or conflicting preflight RPC (%j) before fence/write/delete',async(rpcResult)=>{
 const operationId=crypto.randomUUID();
 db.client.rpc.mockResolvedValueOnce(rpcResult);
 const row=Dose.toSupabaseShape(Dose.create({name:'Custom',operationId:operationId}));
 const result=await importOperationBackup({format:'gtho-v2-backup',format_version:1,schema_version:44,operation_id:operationId,tables:{dose_units:[row]}},operationId,null,{skipAutoBackup:true});
 expect(result.success).toBe(false);expect(result.error).toContain('Unit restore validation');expect(db.client.rpc.mock.calls.map(([name])=>name)).toEqual(['unit_restore_id_conflicts']);expect(db.calls.every(call=>call.operation==='select')).toBe(true);expect(db.rows).toEqual({});
});

it('actual released CP-55 sends operation filters for both unit tables and excludes standards and foreign custom rows',async()=>{
 db.rows.operations=[{id:OP,name:'Farm',schema_version:44}];
 for(const table of tables)db.rows[table]=[{id:UNIT_STANDARDS.find(unit=>unit.table===table).id,name:'Standard',operation_id:null},{id:'own-custom',name:'Own',operation_id:OP},{id:'foreign-custom',name:'Foreign',operation_id:'other'}];
 const backup=JSON.parse((await exportOperationBackup(OP)).json);expect(backup.schema_version).toBe(44);
 for(const table of tables){expect(backup.tables[table].map(row=>row.id)).toEqual(['own-custom']);expect(db.filters.filter(filter=>filter.table===table)).toContainEqual({table,key:'operation_id',value:OP});}
 expect(db.calls.every(call=>call.operation==='select')).toBe(true);
});
