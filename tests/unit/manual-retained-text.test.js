import { beforeEach, it, expect, vi } from 'vitest';
// Exercise the staged release without enabling it in the production build.
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 42 }));
import { resetForms, seed, button, fill, queueSpy, OP } from './manual-entry-helpers.js';
import { getAll, getById, mergeRemote } from '../../src/data/store.js';
import { loadFromStorage } from '../../src/data/local-storage.js';
import * as Sire from '../../src/entities/ai-bull.js';
import * as Animal from '../../src/entities/animal.js';
import * as Breeding from '../../src/entities/animal-breeding-record.js';
import '../../src/calcs/core.js';
import { renderAnimalsScreen } from '../../src/features/animals/index.js';
import { openBreedingSheet } from '../../src/features/health/breeding.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { validateBackup, migrateBackupForward } from '../../src/data/backup-import.js';
let queued;
beforeEach(()=>{resetForms();queued=queueSpy();});
it.each([' CE+8 BW-1.2 WW+68; $API (ACC .31) ', '   '])('real sire manager Save/pull/readback retains unstructured EPD text %s', text=>{
 openAISiresSheet(OP);const panel=document.querySelector('#manage-ai-bulls-panel');
 fill(panel,'[data-testid="ai-manager-name"]','Reference sire');fill(panel,'[data-testid="ai-manager-reg"]','REG-7');fill(panel,'[data-testid="ai-manager-breed"]','Angus');fill(panel,'[data-testid="ai-manager-epds"]',text);button(panel,'Add sire').click();
 const saved=getAll('aiBulls')[0],expected=text.trim()||null;expect(saved).toMatchObject({name:'Reference sire',regNum:'REG-7',breed:'Angus',epds:expected});expect(loadFromStorage('aiBulls')[0].epds).toBe(expected);
 const row=queued('ai_bulls')[0];expect(row).toMatchObject({reg_num:'REG-7',epds:expected});mergeRemote('aiBulls',[Sire.fromSupabaseShape({...row,updated_at:'2099-01-01T00:00:00Z'})]);openAISiresSheet(OP);if(expected) expect(document.querySelector('#manage-ai-bulls-panel').textContent).toContain(expected);expect(getById('aiBulls',saved.id).epds).toBe(expected);
});
it.each(['ai','bull'])('real %s breeding Save preserves entered sireName independently of its chosen reference', method=>{
 const dam=seed('animals',Animal,{id:'dam',tagNum:'DAM',sex:'female'});seed('animals',Animal,{id:'bull',tagNum:'BULL',sex:'male'});seed('aiBulls',Sire,{id:'ai',name:'Reference name'});openBreedingSheet(dam,OP);const panel=document.querySelector('#breeding-sheet-panel');
 fill(panel,'select',method,'change');fill(panel,'input[type="date"]','2026-11-05');fill(panel,'input[type="time"]','13:00');const section=panel.querySelector(method==='ai'?'#ae-evt-ai-fields':'#ae-evt-bull-fields');fill(section,'select',method==='ai'?'ai':'bull','change');fill(section,'input','  Entered name, not reference  ');button(panel,'Save').click();
 expect(panel.querySelector('.auth-error').textContent).toBe('');const record=getAll('animalBreedingRecords')[0];expect(record).toMatchObject({method,sireName:'Entered name, not reference',sireAnimalId:method==='bull'?'bull':null,sireAiBullId:method==='ai'?'ai':null});expect(loadFromStorage('animalBreedingRecords')[0].sireName).toBe(record.sireName);const row=queued('animal_breeding_records')[0];expect(row.sire_name).toBe(record.sireName);expect(Breeding.fromSupabaseShape(row)).toMatchObject(record);
});
it('nullable text accepts punctuation/blanks but rejects non-string values without broadening methods or required name',()=>{
 for(const value of [0,1,{},[]]) {expect(Sire.validate(Sire.create({operationId:OP,name:'S',epds:value})).valid).toBe(false);expect(Breeding.validate(Breeding.create({operationId:OP,animalId:'a',bredAt:'2026-11-05T13:00:00Z',method:'ai',sireName:value})).valid).toBe(false);}
 expect(Sire.validate(Sire.create({operationId:OP,name:' ',epds:'text'})).valid).toBe(false);expect(Breeding.validate(Breeding.create({operationId:OP,animalId:'a',bredAt:'2026-11-05T13:00:00Z',method:'heat'})).valid).toBe(false);expect(Sire.fromSupabaseShape({}).epds).toBeNull();expect(Breeding.fromSupabaseShape({}).sireName).toBeNull();
});
it('CP-55/56 serialized fixture migrates missing text only, preserves supplied values and advances both stamps',()=>{
 const fixture=JSON.parse(JSON.stringify({format:'gtho-v2-backup',format_version:1,schema_version:41,operation_id:OP,tables:{operations:[{schema_version:41}],ai_bulls:[{id:'old'},{id:'new',epds:'CE+8 BW-1.2'},{id:'null',epds:null}],animal_breeding_records:[{id:'old'},{id:'new',sire_name:'Independent text'}]}}));
 const out=BACKUP_MIGRATIONS[41](fixture);expect(out.schema_version).toBe(42);expect(out.tables.operations[0].schema_version).toBe(42);expect(out.tables.ai_bulls.map(row=>row.epds)).toEqual([null,'CE+8 BW-1.2',null]);expect(out.tables.animal_breeding_records.map(row=>row.sire_name)).toEqual([null,'Independent text']);expect(validateBackup(out).valid).toBe(true);expect(migrateBackupForward(out).migrated).toBe(false);expect(Sire.toSupabaseShape(Sire.fromSupabaseShape(out.tables.ai_bulls[1])).epds).toBe('CE+8 BW-1.2');expect(Breeding.toSupabaseShape(Breeding.fromSupabaseShape(out.tables.animal_breeding_records[1])).sire_name).toBe('Independent text');
});

function openAISiresSheet() { const root=document.createElement('main');document.body.append(root);renderAnimalsScreen(root);button(root,'🐂 AI Sires').click(); }
