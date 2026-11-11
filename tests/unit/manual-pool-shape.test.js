import { it, expect } from 'vitest';
import * as Entry from '../../src/entities/event-feed-entry.js';
import * as Item from '../../src/entities/event-feed-check-item.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { validateBackup, BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
const snapshot={feedTypeId:'type',unitSnapshot:'bale',weightPerUnitKgSnapshot:500,dmPctSnapshot:85};
const entry=patch=>Entry.create({operationId:'op',eventId:'event',locationId:'paddock',date:'2026-11-05',quantity:3,...snapshot,...patch});
const item=patch=>Item.create({operationId:'op',feedCheckId:'check',locationId:'paddock',remainingQuantity:2,...snapshot,...patch});
it('staged check and pool transfers retain null batch identity and all conversion/link fields through push/pull',()=>{
 const rows=[item(),entry({kind:'pool_carry',transferId:'tx'}),entry({kind:'pool_removal',entryType:'removal',destinationType:'batch',transferId:'return-tx',returnBatchId:'returned',returnStorageLocationId:'shed'})];
 for(const row of rows){const entity=row.feedCheckId?Item:Entry;expect(entity.validate(row)).toMatchObject({valid:true});const payload=entity.toSupabaseShape(row);expect(payload.batch_id).toBeNull();expect(payload).toMatchObject({feed_type_id:'type',unit_snapshot:'bale',weight_per_unit_kg_snapshot:500,dm_pct_snapshot:85});expect(entity.fromSupabaseShape(JSON.parse(JSON.stringify(payload)))).toEqual(row);}
});
it('positive pool checks and transfers reject missing/invalid conversion, while explicit zero check is allowed',()=>{
 for(const patch of [{weightPerUnitKgSnapshot:null},{dmPctSnapshot:null},{weightPerUnitKgSnapshot:NaN},{dmPctSnapshot:101},{unitSnapshot:''},{batchId:'old-batch'},{remainingQuantity:-1}]) expect(Item.validate(item(patch)).valid).toBe(false);
 expect(Item.validate(item({remainingQuantity:0,unitSnapshot:null,weightPerUnitKgSnapshot:null,dmPctSnapshot:null})).valid).toBe(true);
 for(const patch of [{transferId:null},{batchId:'old'},{dmPctSnapshot:null},{kind:'unknown'},{entryType:'removal'},{returnBatchId:'returned'},{transferId:123}])expect(Entry.validate(entry({kind:'pool_carry',transferId:'tx',...patch})).valid).toBe(false);
 expect(Entry.validate(entry({kind:'inventory_feeding'})).valid).toBe(false);expect(Entry.validate(entry({kind:'inventory_feeding',batchId:'inventory',unitSnapshot:null,weightPerUnitKgSnapshot:null,dmPctSnapshot:null})).valid).toBe(true);
});
it('42→43 defaults only absent values, retains legacy rows and transfer links, stamps both versions and preserves dependency order',()=>{
 const legacy={id:'old',batch_id:'old-batch',location_id:'paddock',quantity:7};const linked=Entry.toSupabaseShape(entry({kind:'pool_removal',entryType:'removal',destinationType:'batch',transferId:'tx',returnBatchId:'returned',returnStorageLocationId:'shed'}));
 const backup={format:'gtho-v2-backup',format_version:1,schema_version:42,operation_id:'op',tables:{operations:[{schema_version:42}],event_feed_entries:[legacy,linked],event_feed_check_items:[{id:'legacy-check',batch_id:'old-batch'},Item.toSupabaseShape(item())]}};
 const migrated=BACKUP_MIGRATIONS[42](JSON.parse(JSON.stringify(backup)));expect(migrated.schema_version).toBe(43);expect(migrated.tables.operations[0].schema_version).toBe(43);expect(migrated.tables.event_feed_entries[0]).toMatchObject({...legacy,kind:null,feed_type_id:null,transfer_id:null});expect(migrated.tables.event_feed_entries[1]).toEqual(linked);expect(migrated.tables.event_feed_check_items[1]).toEqual(backup.tables.event_feed_check_items[1]);expect(validateBackup(migrated).valid).toBe(true);
 for(const table of ['feed_types','batches','locations'])expect(BROWSER_FK_ORDER.indexOf(table)).toBeLessThan(BROWSER_FK_ORDER.indexOf('event_feed_entries'));
});
