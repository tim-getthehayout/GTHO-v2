import { UNIT_STANDARDS } from '../../src/utils/unit-standards.js';
import { beforeEach, it, expect, vi } from 'vitest';
import { resetForms, seed, fill, button, queueSpy, OP, FARM } from './manual-entry-helpers.js';
import { getAll, remove } from '../../src/data/store.js';
import * as Location from '../../src/entities/location.js';
import * as Product from '../../src/entities/input-product.js';
import * as Unit from '../../src/entities/input-product-unit.js';
import * as Manure from '../../src/entities/manure-batch.js';
import { renderLocationsScreen } from '../../src/features/locations/index.js';
const KG=UNIT_STANDARDS.find(row=>row.table==='input_product_units'&&row.name==='kg').id;
const BAG=UNIT_STANDARDS.find(row=>row.table==='input_product_units'&&row.name==='bag').id;
let panel, queued;
beforeEach(()=>{
  resetForms(); seed('locations',Location,{id:'field',farmId:FARM,name:'Field',type:'land',areaHectares:2});
  seed('inputProducts',Product,{id:'product',name:'Fertiliser',categoryId:'fertiliser',nPct:10}); seed('inputProductUnits',Unit,{id:KG,name:'kg'}); seed('inputProductUnits',Unit,{id:BAG,name:'bag'});
  seed('manureBatches',Manure,{id:'manure',label:'Stored manure'}); queued=queueSpy(); const root=document.createElement('div');document.body.append(root);renderLocationsScreen(root);button(root,'Apply input').click();panel=document.querySelector('#amendment-sheet-panel');
});
const prepare=()=>{fill(panel,'[data-testid="amendment-date"]','2026-11-05');fill(panel,'[data-testid="amendment-product"]','product','change');fill(panel,'[data-testid="amendment-qty"]','20');fill(panel,'[data-testid="amendment-unit"]',KG,'change');panel.querySelector('[data-testid="amendment-loc-field"]').click();};
it('Locations actual Save persists canonical source, date, explicit quantity/unit and location allocation atomically',()=>{
  prepare();const save=panel.querySelector('[data-testid="amendment-save"]');save.click();expect(panel.querySelector('.auth-error').textContent).toBe('');
  const parent=getAll('amendments')[0];expect(parent).toMatchObject({operationId:OP,appliedAt:'2026-11-05T12:00:00.000Z',inputProductId:'product',manureBatchId:null,totalQty:20,qtyUnitId:KG});
  expect(getAll('amendmentLocations')[0]).toMatchObject({amendmentId:parent.id,locationId:'field',qty:20,nKg:2});expect(queued('amendments')[0]).toMatchObject({input_product_id:'product',total_qty:20,qty_unit_id:KG});save.click();expect(getAll('amendments')).toHaveLength(1);
});
it('manure uses the selected real reference and does not silently turn an unconverted unit into nutrient kg',()=>{
  prepare();panel.querySelector('[data-testid="amendment-source-manure"]').click();fill(panel,'[data-testid="amendment-manure-batch"]','manure','change');fill(panel,'[data-testid="amendment-unit"]',BAG,'change');panel.querySelector('[data-testid="amendment-save"]').click();
  expect(getAll('amendments')[0]).toMatchObject({sourceType:'manure',manureBatchId:'manure',inputProductId:null,totalQty:20,qtyUnitId:BAG});expect(getAll('amendmentLocations')[0]).toMatchObject({qty:20,nKg:null});
});
it.each(['blank quantity','blank unit','removed source','removed location','invalid date'])('%s produces neither parent nor orphan allocation',kind=>{
  prepare();if(kind==='blank quantity')fill(panel,'[data-testid="amendment-qty"]','');if(kind==='blank unit')fill(panel,'[data-testid="amendment-unit"]','','change');if(kind==='removed source')remove('inputProducts','product','input_products');if(kind==='removed location')remove('locations','field','locations');if(kind==='invalid date')fill(panel,'[data-testid="amendment-date"]','');
  panel.querySelector('[data-testid="amendment-save"]').click();expect(getAll('amendments')).toHaveLength(0);expect(getAll('amendmentLocations')).toHaveLength(0);expect(panel.querySelector('.auth-error').textContent).not.toBe('');
});
it('storage failure rolls back the complete compound save and explicit retry saves once',()=>{
  prepare();const save=panel.querySelector('[data-testid="amendment-save"]'),fault=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});save.click();expect(getAll('amendments')).toHaveLength(0);expect(getAll('amendmentLocations')).toHaveLength(0);fault.mockRestore();save.click();expect(getAll('amendments')).toHaveLength(1);expect(getAll('amendmentLocations')).toHaveLength(1);
});
