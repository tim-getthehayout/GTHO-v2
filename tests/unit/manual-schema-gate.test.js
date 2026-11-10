import { beforeEach, it, expect, vi } from 'vitest';
import { resetForms, seed, fill, button, OP } from './manual-entry-helpers.js';
import { getAll } from '../../src/data/store.js';
import * as Sire from '../../src/entities/ai-bull.js';
import * as Animal from '../../src/entities/animal.js';
import * as Breeding from '../../src/entities/animal-breeding-record.js';
import '../../src/calcs/core.js';
import { renderAnimalsScreen } from '../../src/features/animals/index.js';
import { openBreedingSheet } from '../../src/features/health/breeding.js';
import { validateBackup, resolveOperationsSchemaStamp, CURRENT_SCHEMA_VERSION, serverHasStagedColumns } from '../../src/data/backup-import.js';
import { importOperationBackup } from '../../src/data/backup-import.js';
beforeEach(()=>resetForms());
it('unreleased columns are never sent to a legacy server and nonempty staged text is never silently dropped',()=>{
 expect(CURRENT_SCHEMA_VERSION).toBe(41);expect(Sire.toSupabaseShape(Sire.create({operationId:OP,name:'S'}))).not.toHaveProperty('epds');expect(Breeding.toSupabaseShape(Breeding.create({operationId:OP}))).not.toHaveProperty('sire_name');expect(()=>Sire.toSupabaseShape(Sire.create({epds:'CE+8'}))).toThrow('migration 42');expect(()=>Breeding.toSupabaseShape(Breeding.create({sireName:'Independent'}))).toThrow('migration 42');
});
it('real manager blocks unapproved EPD write, keeps inputs and allows existing-field Save after clearing it',()=>{
 openAISiresSheet(OP);const panel=document.querySelector('#manage-ai-bulls-panel');fill(panel,'[data-testid="ai-manager-name"]','Sire');fill(panel,'[data-testid="ai-manager-epds"]','CE+8');button(panel,'Add sire').click();expect(getAll('aiBulls')).toHaveLength(0);expect(panel.querySelector('.auth-error').textContent).toContain('migration 42');expect(panel.querySelector('[data-testid="ai-manager-epds"]').value).toBe('CE+8');fill(panel,'[data-testid="ai-manager-epds"]','');button(panel,'Add sire').click();expect(getAll('aiBulls')).toHaveLength(1);
});
it.each(['ai','bull'])('real %s breeding cannot discard entered free text before approved release',method=>{
 const dam=seed('animals',Animal,{id:'dam',sex:'female'});openBreedingSheet(dam,OP);const panel=document.querySelector('#breeding-sheet-panel');fill(panel,'select',method,'change');fill(panel,'input[type="date"]','2026-11-05');const section=panel.querySelector(method==='ai'?'#ae-evt-ai-fields':'#ae-evt-bull-fields');fill(section,'input','Entered sire');button(panel,'Save').click();expect(getAll('animalBreedingRecords')).toHaveLength(0);expect(section.querySelector('input').value).toBe('Entered sire');expect(panel.querySelector('.auth-error').textContent).toContain('migration 42');
});
it('mislabeled new fields or higher operation stamps fail validation before any restore action',async()=>{
 const fixture=(tables)=>({format:'gtho-v2-backup',format_version:1,schema_version:41,operation_id:OP,tables});
 for(const tables of [{ai_bulls:[{epds:null}]},{animal_breeding_records:[{sire_name:'text'}]},{operations:[{schema_version:42}]}]) {const backup=fixture(tables);expect(validateBackup(backup).valid).toBe(false);const progress=vi.fn();const result=await importOperationBackup(backup,OP,progress);expect(result.success).toBe(false);}
 const client={rpc:vi.fn().mockResolvedValue({data:'discarded',error:null})};await expect(resolveOperationsSchemaStamp(42,client)).rejects.toThrow('Unverified');expect(client.rpc).not.toHaveBeenCalled();
});

function openAISiresSheet() { const root=document.createElement('main');document.body.append(root);renderAnimalsScreen(root);button(root,'🐂 AI Sires').click(); }

it('042 compatibility needs successful read-only column proofs, not an operation stamp or 041 RPC', async()=>{
 const from=vi.fn(()=>({select:vi.fn(()=>({limit:vi.fn().mockResolvedValue({data:[],error:null})}))}));expect(await serverHasStagedColumns(42,{from})).toBe(true);expect(from.mock.calls.map(([table])=>table)).toEqual(['ai_bulls','animal_breeding_records']);
 expect(await serverHasStagedColumns(42,{from:()=>({select:()=>({limit:async()=>({data:null,error:{code:'42703'}})})})})).toBe(false);expect(await serverHasStagedColumns(43,{from})).toBe(false);
});
