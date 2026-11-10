import { beforeEach, it, expect } from 'vitest';
import '../../src/calcs/core.js';
import { resetForms, seed, queueSpy, button, fill, OP } from './manual-entry-helpers.js';
import { loadFromStorage } from '../../src/data/local-storage.js';
import { getAll, remove, update } from '../../src/data/store.js';
import * as Category from '../../src/entities/treatment-category.js';
import { renderAnimalsScreen } from '../../src/features/animals/index.js';
let panel, queued;
beforeEach(()=>{
  resetForms();seed('treatmentCategories',Category,{id:'vaccines',name:'Vaccination'});seed('treatmentCategories',Category,{id:'parasites',name:'Parasite control'});
  const root=document.createElement('main');document.body.append(root);renderAnimalsScreen(root);button(root,'💉 Treatments').click();panel=document.querySelector('#manage-treatments-panel');queued=queueSpy();
});
it('actual Animals manager Add persists and displays the explicitly chosen stored category',()=>{
  fill(panel,'[data-testid="treatment-manager-name"]','BVD vaccine');fill(panel,'[data-testid="treatment-manager-category"]','vaccines','change');button(panel,'Add').click();
  expect(panel.querySelector('.auth-error').textContent).toBe('');expect(getAll('treatmentTypes')).toHaveLength(1);expect(getAll('treatmentTypes')[0]).toMatchObject({operationId:OP,name:'BVD vaccine',categoryId:'vaccines'});
  expect(queued('treatment_types')[0]).toMatchObject({name:'BVD vaccine',category_id:'vaccines'});expect(panel.textContent).toContain('Vaccination');expect(loadFromStorage('treatmentTypes')[0].categoryId).toBe('vaccines');
});
it.each(['missing','removed','archived','other operation','blank name'])('%s category/name is visibly rejected with no type or queued insert',kind=>{
  fill(panel,'[data-testid="treatment-manager-name"]',kind==='blank name'?'':'BVD vaccine');if(kind!=='missing')fill(panel,'[data-testid="treatment-manager-category"]','vaccines','change');
  if(kind==='removed')remove('treatmentCategories','vaccines','treatment_categories');if(kind==='archived')update('treatmentCategories','vaccines',{archived:true},Category.validate,Category.toSupabaseShape,'treatment_categories');if(kind==='other operation')update('treatmentCategories','vaccines',{operationId:'different'},Category.validate,Category.toSupabaseShape,'treatment_categories');
  button(panel,'Add').click();expect(getAll('treatmentTypes')).toHaveLength(0);expect(queued('treatment_types')).toHaveLength(0);expect(panel.querySelector('.auth-error').textContent).not.toBe('');
});
