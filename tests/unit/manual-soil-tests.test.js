import { beforeEach, it, expect } from 'vitest';
import { resetForms, seed, fill, button, queueSpy, OP, FARM } from './manual-entry-helpers.js';
import { getAll } from '../../src/data/store.js';
import { loadFromStorage } from '../../src/data/local-storage.js';
import * as Location from '../../src/entities/location.js';
import * as Soil from '../../src/entities/soil-test.js';
import { renderLocationsScreen } from '../../src/features/locations/index.js';
import { renderSoilTestsScreen } from '../../src/features/amendments/soil-tests.js';
let queued;
beforeEach(()=>{resetForms();seed('locations',Location,{id:'field',farmId:FARM,name:'Field',type:'land'});queued=queueSpy();});
function open(path){const root=document.createElement('main');document.body.append(root);if(path==='shortcut'){renderLocationsScreen(root);button(root,'✎ Soil').click();return document.querySelector('#soil-sheet-panel');}renderSoilTestsScreen(root);root.querySelector('[data-testid="soil-tests-add-btn"]').click();return document.querySelector('#soil-test-sheet-panel');}
function control(panel,path,key){const names={date:'date',unit:'unit',n:'n',p:'p',k:'k',ph:'ph',om:'organicMatter'};return panel.querySelector(`[data-testid="${path==='shortcut'?'location-soil-'+key:'soil-test-'+names[key]}"]`);}
function save(panel,path){(path==='shortcut'?button(panel,'Save test'):panel.querySelector('[data-testid="soil-test-save"]')).click();}
it.each(['shortcut','full'])('real %s Save preserves organic matter, entered zero values, units and canonical timestamp in local and queued records',path=>{
 const panel=open(path);for(const [key,value] of Object.entries({date:'2026-11-05',unit:'ppm',n:'0',p:'0',k:'0',ph:'0',om:'4.2'}))control(panel,path,key).value=value;save(panel,path);
 expect(panel.querySelector('.auth-error').textContent).toBe('');expect(getAll('soilTests')).toHaveLength(1);expect(loadFromStorage('soilTests')[0]).toMatchObject({operationId:OP,locationId:'field',testedAt:'2026-11-05T12:00:00.000Z',unit:'ppm',n:0,p:0,k:0,ph:0,organicMatter:4.2});expect(queued('soil_tests')[0]).toMatchObject({organic_matter:4.2,n:0,p:0,k:0,ph:0,tested_at:'2026-11-05T12:00:00.000Z'});
});
it.each(['shortcut','full'])('real %s Save keeps optional blanks null rather than manufacturing zero',path=>{const panel=open(path);save(panel,path);expect(panel.querySelector('.auth-error').textContent).toBe('');expect(getAll('soilTests')[0]).toMatchObject({n:null,p:null,k:null,ph:null,organicMatter:null});});
it.each(['shortcut','full'])('real %s rejects invalid date, nonfinite numeric, unit and ranges with no row',path=>{
 const panel=open(path);for(const [key,value] of [['ph','15'],['om','101'],['date',''],['unit','']]){const input=control(panel,path,key),original=input.value;input.value=value;save(panel,path);expect(getAll('soilTests')).toHaveLength(0);expect(panel.querySelector('.auth-error').textContent).not.toBe('');input.value=original;}
 const input=control(panel,path,'n');Object.defineProperty(input,'value',{configurable:true,value:'1e999'});save(panel,path);expect(getAll('soilTests')).toHaveLength(0);expect(queued('soil_tests')).toHaveLength(0);
});
it('both real entry points produce equivalent mapped domain data',()=>{for(const path of ['shortcut','full']){const panel=open(path);for(const [key,value]of Object.entries({date:'2026-11-05',unit:'ppm',n:'3',p:'0',k:'8',ph:'6.5',om:'0'}))control(panel,path,key).value=value;save(panel,path);}const rows=queued('soil_tests').map(({id,created_at,updated_at,...rest})=>rest);expect(rows).toHaveLength(2);expect(rows[0]).toEqual(rows[1]);});
it.each([NaN,Infinity,'4.2'])('the touched numeric contract rejects %s rather than mapping corrupt organic matter',organicMatter=>{expect(Soil.validate(Soil.create({operationId:OP,locationId:'field',testedAt:'2026-11-05',unit:'ppm',organicMatter})).valid).toBe(false);});
