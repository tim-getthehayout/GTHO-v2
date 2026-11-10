/** Host-owned, offline-first pool writes. All compound effects share one journal. */
import { getAll, getById, add, update, remove, runDurableWrite } from '../../data/store.js';
import { RELEASED_SCHEMA_VERSION } from '../../data/schema-release.js';
import { releasedColumns } from '../../data/schema-columns.js';
import { poolKey, feedSnapshot, replayFeedPools, poolReading, poolConversion, poolHistory } from '../../calcs/feed-pools.js';
import { rowInstant } from '../../utils/date-utils.js';
import { localFormTimestamp } from '../../utils/form-values.js';
import * as Check from '../../entities/event-feed-check.js';
import * as Item from '../../entities/event-feed-check-item.js';
import * as Entry from '../../entities/event-feed-entry.js';
import * as Batch from '../../entities/batch.js';
import { placeInitialBalance } from './batch-balances.js';
export const poolWritesEnabled = () => RELEASED_SCHEMA_VERSION >= 43;
export const poolInput = eventId => ({ eventId, entries:getAll('eventFeedEntries'), checks:getAll('eventFeedChecks'), items:getAll('eventFeedCheckItems'), batches:getAll('batches'), feedTypes:getAll('feedTypes') });
export const liveFeedPools = (eventId, date, time, excludeCheckId) => replayFeedPools(poolInput(eventId), { through:date?rowInstant(date,time):undefined, excludeCheckId });
export function inventoryPoolSnapshot(batch) {
  if (!poolWritesEnabled()) return {};
  return {kind:'inventory_feeding',feedTypeId:batch.feedTypeId,unitSnapshot:batch.unit,weightPerUnitKgSnapshot:batch.weightPerUnitKg??null,dmPctSnapshot:batch.dmPct??null};
}
function requireScope(type,id,operationId) {
  const row=getById(type,id);
  if(!row || row.operationId!==operationId)throw new Error('The selected pool reference is unavailable.');
  return row;
}
function requirePoolScope(eventId,locationId,feedTypeId,operationId,date,time) {
  releasedColumns(43,{feed_type_id:feedTypeId});localFormTimestamp(date,time);
  const event=requireScope('events',eventId,operationId);requireScope('locations',locationId,operationId);requireScope('feedTypes',feedTypeId,operationId);
  const openings=[...getAll('eventPaddockWindows').filter(row=>row.eventId===eventId).map(row=>row.dateOpened),...getAll('eventGroupWindows').filter(row=>row.eventId===eventId).map(row=>row.dateJoined)].filter(Boolean).sort();
  if(openings[0] && date<openings[0] || event.dateOut && date>event.dateOut)throw new Error('Observation must be within the event dates.');
  return event;
}
function validate(entity,row) { const result=entity.validate(row); if(!result.valid)throw new Error(result.errors.join('; ')); entity.toSupabaseShape(row); return row; }
const persist=(type,entity,row,table)=>add(type,row,entity.validate,entity.toSupabaseShape,table);
export const poolExecutionKey=(operationId,target)=>JSON.stringify([operationId,target,crypto.randomUUID(),1]);

/** No-op observation edits preserve legacy child IDs and payloads exactly.
 * Explicit edits replace ONLY the selected pool's grouped children, never later observations. */
export function writePoolCheck({operationId,eventId,date,time,notes=null,readings,checkId=null,isCloseReading=false}) {
  if(!Array.isArray(readings)||!readings.length)throw new Error('Select at least one feed pool.');
  const input=poolInput(eventId),existing=checkId?requireScope('eventFeedChecks',checkId,operationId):null;
  if(existing && existing.eventId!==eventId)throw new Error('Observation belongs to another event.');
  const keys=new Set();
  for(const reading of readings){requirePoolScope(eventId,reading.locationId,reading.feedTypeId,operationId,date,time);const key=poolKey({eventId,...reading});if(keys.has(key))throw new Error('Duplicate pool reading.');keys.add(key);}
  const oldChildren=existing?input.items.filter(row=>row.feedCheckId===checkId):[];
  const oldPools=existing?replayFeedPools({...input,entries:[],checks:[existing],items:oldChildren}):new Map();
  if(existing && existing.date===date && (existing.time||'')===(time||'') && (existing.notes||'')===(notes||'') && readings.every(row=>{const old=oldPools.get(poolKey({eventId,...row}));return old && row.remainingQuantity===old.q && (!row.unit || row.unit===old.unit);} ))return existing.id;
  const before=replayFeedPools(input,{through:rowInstant(date,time),excludeCheckId:checkId});
  const check=validate(Check,Check.create({...existing,operationId,eventId,date,time,notes,isCloseReading:existing?.isCloseReading??isCloseReading}));
  const children=readings.map(row=>{const pool=before.get(poolKey({eventId,...row}));if(!pool)throw new Error('No feed is available in this pool.');return validate(Item,Item.create({operationId,feedCheckId:check.id,...poolReading(pool,row.remainingQuantity,row.unit??pool.unit)}));});
  const removed=oldChildren.filter(row=>{const snap=feedSnapshot(row,input.batches);return keys.has(poolKey({eventId,locationId:row.locationId,feedTypeId:snap.feedTypeId}));});
  // Refuse a conflicting later observation; never offer to erase it.
  const proposed={...input,checks:[...input.checks.filter(row=>row.id!==check.id),check],items:[...input.items.filter(row=>!removed.some(old=>old.id===row.id)),...children]};
  for(const anchor of poolHistory(proposed).records.filter(row=>row.order===1 && row.stamp>rowInstant(date,time) && keys.has(row.key))) {
    const stock=replayFeedPools(proposed,{through:anchor.stamp,excludeCheckId:anchor.id}).get(anchor.key);
    const measured=replayFeedPools({...proposed,entries:[],checks:[anchor.check]}).get(anchor.key);
    if(stock?.m!=null && measured?.m!=null && measured.m>stock.m+1e-8)throw new Error('This change conflicts with a later observation. That observation has been kept; review it first.');
  }
  if(existing) update('eventFeedChecks',check.id,{date,time,notes},Check.validate,Check.toSupabaseShape,'event_feed_checks');
  else persist('eventFeedChecks',Check,check,'event_feed_checks');
  for(const row of removed)remove('eventFeedCheckItems',row.id,'event_feed_check_items');
  for(const row of children)persist('eventFeedCheckItems',Item,row,'event_feed_check_items');
  return check.id;
}
export function unchangedPoolCheck(args) {
  if(!args.checkId || !args.readings?.length)return false;
  const existing=requireScope('eventFeedChecks',args.checkId,args.operationId);if(existing.eventId!==args.eventId)return false;
  const old=replayFeedPools({...poolInput(args.eventId),entries:[],checks:[existing]});
  return existing.date===args.date && (existing.time||'')===(args.time||'') && (existing.notes||'')===(args.notes||'') && args.readings.every(row=>{const pool=old.get(poolKey({eventId:args.eventId,...row}));return pool && row.remainingQuantity===pool.q && (!row.unit || row.unit===(pool.unit||'kg'));});
}
export const commitPoolCheck = (args,key) => unchangedPoolCheck(args)?args.checkId:runDurableWrite(key,()=>writePoolCheck(args));
export function deletePoolObservation({operationId,checkId,feedTypeId,locationId},key){return runDurableWrite(key,()=>{
  const check=requireScope('eventFeedChecks',checkId,operationId),input=poolInput(check.eventId);
  const children=input.items.filter(row=>row.feedCheckId===checkId && row.locationId===locationId && feedSnapshot(row,input.batches).feedTypeId===feedTypeId);
  if(!children.length)throw new Error('Observation is unavailable.');
  for(const row of children)remove('eventFeedCheckItems',row.id,'event_feed_check_items');
  if(!getAll('eventFeedCheckItems').some(row=>row.feedCheckId===checkId))remove('eventFeedChecks',checkId,'event_feed_checks');
  return checkId;
});}
export function afterObservation(date,time){const d=new Date(localFormTimestamp(date,time));d.setMilliseconds(d.getMilliseconds()+1);return {date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`};}

/** Transfer already-fed feed; never call original-lot restore/deduct helpers. */
export function writePoolTransfer({operationId,eventId,locationId,feedTypeId,date,time,quantity,unit,destinationEventId=null,destinationLocationId=null,storageLocationId=null,confirmedRemaining=null,arrival=null,allowClosed=false}) {
  const source=requirePoolScope(eventId,locationId,feedTypeId,operationId,date,time);
  if(source.dateOut && !allowClosed)throw new Error('Source event is closed.');
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error('Move amount must be positive and finite.');
  if(confirmedRemaining!=null)writePoolCheck({operationId,eventId,date,time,readings:[{locationId,feedTypeId,remainingQuantity:confirmedRemaining,unit}]});
  const pool=liveFeedPools(eventId,date,time).get(poolKey({eventId,locationId,feedTypeId}));
  poolReading(pool,quantity,unit??pool?.unit);const conversion=poolConversion(pool),transferId=crypto.randomUUID();
  const moved=afterObservation(date,time),arrived=arrival||moved;
  if(rowInstant(arrived.date,arrived.time)<rowInstant(moved.date,moved.time))throw new Error('Feed cannot arrive before removal.');
  let returned=null;
  if(storageLocationId){const storage=requireScope('locations',storageLocationId,operationId);if(storage.type!=='storage')throw new Error('Choose an explicit storage location.');
    if(destinationEventId)throw new Error('Choose one feed destination.');
    const type=requireScope('feedTypes',feedTypeId,operationId);
    returned=validate(Batch,Batch.create({operationId,feedTypeId,name:`Returned feed — ${type.name} (${date} ${time||''})`,source:'returned-feed',quantity,remaining:quantity,unit:conversion.unitSnapshot,weightPerUnitKg:conversion.weightPerUnitKgSnapshot,dmPct:conversion.dmPctSnapshot,costPerUnit:null,notes:`Returned feed; transfer ${transferId}`}));
  } else {
    const target=requireScope('events',destinationEventId,operationId);requireScope('locations',destinationLocationId,operationId);
    if(target.dateOut || !getAll('eventPaddockWindows').some(row=>row.eventId===destinationEventId && row.locationId===destinationLocationId && !row.dateClosed))throw new Error('Choose an open destination paddock.');
    if(destinationEventId===eventId && destinationLocationId===locationId)throw new Error('Choose a different destination pool.');
  }
  const removal=validate(Entry,Entry.create({operationId,eventId,locationId,batchId:null,...conversion,...moved,quantity,kind:'pool_removal',entryType:'removal',transferId,destinationType:returned?'batch':'event',destinationEventId:returned?null:destinationEventId,returnBatchId:returned?.id??null,returnStorageLocationId:storageLocationId}));
  const carry=returned?null:validate(Entry,Entry.create({operationId,eventId:destinationEventId,locationId:destinationLocationId,batchId:null,...conversion,...arrived,quantity,kind:'pool_carry',transferId,sourceEventId:eventId}));
  assertPoolTransferPair(removal,carry,returned);
  const proposed={...poolInput(eventId),entries:[...getAll('eventFeedEntries'),removal]};
  for(const anchor of poolHistory(proposed).records.filter(row=>row.order===1 && row.key===poolKey({eventId,locationId,feedTypeId}) && row.stamp>rowInstant(moved.date,moved.time))){
    const stock=replayFeedPools(proposed,{through:anchor.stamp,excludeCheckId:anchor.id}).get(anchor.key);
    const observed=replayFeedPools({...proposed,entries:[],checks:[anchor.check]}).get(anchor.key);
    if(stock?.m!=null && observed?.m!=null && observed.m>stock.m+1e-8)throw new Error('The movement conflicts with a later observation, which has been kept.');
  }
  if(returned){persist('batches',Batch,returned,'batches');placeInitialBalance({operationId,batchId:returned.id,locationId:storageLocationId,quantity,movedAt:new Date(localFormTimestamp(moved.date,moved.time)).toISOString(),notes:`Returned feed; transfer ${transferId}`});}
  persist('eventFeedEntries',Entry,removal,'event_feed_entries');if(carry)persist('eventFeedEntries',Entry,carry,'event_feed_entries');
  return removal.id;
}
export const commitPoolTransfer=(args,key)=>runDurableWrite(key,()=>writePoolTransfer(args));

/** Pairing is host-enforced, with no transfer FK or model-selected lot. */
export function assertPoolTransferPair(removal,carry,returned=null){
 if(removal.kind!=='pool_removal'||!removal.transferId)throw new Error('Invalid pool removal.');
 if(returned){if(carry || removal.destinationType!=='batch' || removal.returnBatchId!==returned.id || !removal.returnStorageLocationId)throw new Error('Invalid pool return linkage.');
 for(const [source,target]of [['quantity','quantity'],['unitSnapshot','unit'],['weightPerUnitKgSnapshot','weightPerUnitKg'],['dmPctSnapshot','dmPct'],['feedTypeId','feedTypeId']])if(removal[source]!==returned[target])throw new Error('Returned batch does not conserve pool masses.');return;}
 if(!carry || carry.kind!=='pool_carry' || carry.transferId!==removal.transferId || removal.destinationType!=='event' || carry.eventId!==removal.destinationEventId || carry.sourceEventId!==removal.eventId)throw new Error('Incomplete pool transfer pair.');
 for(const key of ['feedTypeId','quantity','unitSnapshot','weightPerUnitKgSnapshot','dmPctSnapshot'])if(carry[key]!==removal[key])throw new Error('Pool transfer does not conserve quantity and conversion.');
}
