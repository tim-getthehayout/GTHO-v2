import { beforeEach, it, expect } from 'vitest';
import '../../src/calcs/core.js';
import { resetForms, queueSpy, button, fill, OP } from './manual-entry-helpers.js';
import { getAll, mergeRemote } from '../../src/data/store.js';
import { loadFromStorage } from '../../src/data/local-storage.js';
import * as Bull from '../../src/entities/ai-bull.js';
import { renderAnimalsScreen } from '../../src/features/animals/index.js';
let panel,root,queued;
beforeEach(()=>{resetForms();root=document.createElement('main');document.body.append(root);renderAnimalsScreen(root);button(root,'🐂 AI Sires').click();panel=document.querySelector('#manage-ai-bulls-panel');queued=queueSpy();});
it.each(['  REG-123/ABC  ',''])('real manager Add and pull/readback round-trip registration %s through the existing column',registration=>{
 fill(panel,'[data-testid="ai-manager-name"]','Example sire');fill(panel,'[data-testid="ai-manager-breed"]','Angus');fill(panel,'[data-testid="ai-manager-reg"]',registration);button(panel,'Add sire').click();
 const row=getAll('aiBulls')[0],regNum=registration.trim()||null;expect(row).toMatchObject({operationId:OP,name:'Example sire',breed:'Angus',regNum});expect(loadFromStorage('aiBulls')[0].regNum).toBe(regNum);expect(queued('ai_bulls')[0]).toMatchObject({id:row.id,name:'Example sire',breed:'Angus',reg_num:regNum});expect(queued('ai_bulls')[0]).not.toHaveProperty('regNumber');
 const remote=Bull.fromSupabaseShape({...Bull.toSupabaseShape(row),reg_num:'PULLED-456'});mergeRemote('aiBulls',[remote]);button(root,'🐂 AI Sires').click();expect(panel.textContent).toContain('PULLED-456');expect(getAll('aiBulls')[0].id).toBe(row.id);
 expect(panel.querySelector('[data-testid="ai-manager-epds"]').disabled).toBe(false);expect(panel.textContent).not.toContain('snapshotted');
});
