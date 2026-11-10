/** Read-only staged pool target resolver. No model lot selection or conversion.
 * Intentionally not registered in FARM_ENTRY_UIS/tools: general rollout is held. */
import { normalizeSpokenName } from './spoken-numbers.js';
import { replayFeedPools, poolKey, poolReading } from '../../calcs/feed-pools.js';
import { localFormTimestamp } from '../../utils/form-values.js';
import { rowInstant } from '../../utils/date-utils.js';
const ask=question=>({status:'question',question});
const name=value=>typeof value==='string'?normalizeSpokenName(value):'';
export function resolveFeedPoolTarget(snapshot,proposal){
 if(!proposal||typeof proposal!=='object')return ask('Which feed type and paddock did you observe?');
 if(['batchId','batchName','batchIds','returnBatchId','transferId','unitSnapshot','weightPerUnitKgSnapshot','dmPctSnapshot','weightPerUnitKg','dmPct'].some(key=>Object.hasOwn(proposal,key)))return ask('Name the feed type and paddock, not an original batch or a conversion.');
 for(const [field,question]of[['feedTypeName','Which feed type?'],['locationName','Which physical paddock?'],['quantity','What quantity remains or moves?'],['unit','In which unit?'],['date','What observation date?'],['time','What observation time?']])if(proposal[field]==null||proposal[field]==='')return ask(question);
 try{localFormTimestamp(proposal.date,proposal.time);}catch{return ask('What valid observation date and time?');}
 const operationId=snapshot.operationId,own=rows=>(rows||[]).filter(row=>row.operationId===operationId);
 const types=own(snapshot.feedTypes).filter(row=>!row.archived && name(row.name)===name(proposal.feedTypeName));
 if(types.length!==1)return ask('Which exact feed type?');
 const farms=own(snapshot.farms).filter(row=>!proposal.farmName||name(row.name)===name(proposal.farmName));
 const locations=own(snapshot.locations).filter(row=>row.type!=='storage' && name(row.name)===name(proposal.locationName) && (!proposal.farmName||farms.some(farm=>farm.id===row.farmId)));
 if(locations.length!==1)return ask('Which exact paddock and farm?');
 const locationId=locations[0].id,feedTypeId=types[0].id;
 const events=own(snapshot.events),windows=own(snapshot.paddockWindows);
 const eventIds=[...new Set(windows.filter(row=>row.locationId===locationId && rowInstant(row.dateOpened,row.timeOpened)<=rowInstant(proposal.date,proposal.time) && (!row.dateClosed||rowInstant(row.dateClosed,row.timeClosed)>=rowInstant(proposal.date,proposal.time))).map(row=>row.eventId))].filter(id=>events.some(row=>row.id===id));
 if(eventIds.length!==1)return ask('Which grazing event at that paddock?');
 const eventId=eventIds[0],input={eventId,entries:own(snapshot.entries),checks:own(snapshot.checks),items:own(snapshot.items),batches:own(snapshot.batches),feedTypes:types};
 const pool=replayFeedPools(input,{through:rowInstant(proposal.date,proposal.time)}).get(poolKey({eventId,locationId,feedTypeId}));
 if(!pool)return ask('Which existing feed pool?');
 try{const reading=poolReading(pool,proposal.quantity,proposal.unit);return {status:'resolved',fill:{eventId,locationId,feedTypeId,quantity:proposal.quantity,unit:proposal.unit,date:proposal.date,time:proposal.time},conversion:{unitSnapshot:reading.unitSnapshot,weightPerUnitKgSnapshot:reading.weightPerUnitKgSnapshot,dmPctSnapshot:reading.dmPctSnapshot}};}catch{return ask('Enter an available quantity in the displayed pool unit; positive readings need known conversions.');}
}

/** Resolve carries/removals by spoken type/location, never an original lot.
 * Explicit physical destination is host-scoped and must still be open. */
export function resolveFeedPoolMoveTarget(snapshot,proposal){
 const resolved=resolveFeedPoolTarget(snapshot,proposal);if(resolved.status!=='resolved')return resolved;
 if(!(proposal.quantity>0))return ask('What positive quantity should move?');
 if(!proposal.destinationName || !['storage','event'].includes(proposal.destinationType))return ask('Which storage location or open destination paddock?');
 const own=rows=>(rows||[]).filter(row=>row.operationId===snapshot.operationId);
 const destinations=own(snapshot.locations).filter(row=>name(row.name)===name(proposal.destinationName) && (proposal.destinationType==='storage'?row.type==='storage':row.type!=='storage'));
 if(destinations.length!==1)return ask('Which exact physical destination?');
 const location=destinations[0];
 if(proposal.destinationType==='storage')return {...resolved,fill:{...resolved.fill,storageLocationId:location.id}};
 const windows=own(snapshot.paddockWindows).filter(row=>row.locationId===location.id && !row.dateClosed && rowInstant(row.dateOpened,row.timeOpened)<=rowInstant(proposal.date,proposal.time));
 const events=own(snapshot.events).filter(row=>!row.dateOut && windows.some(window=>window.eventId===row.id));
 if(events.length!==1 || events[0].id===resolved.fill.eventId && location.id===resolved.fill.locationId)return ask('Which different open destination paddock?');
 return {...resolved,fill:{...resolved.fill,destinationEventId:events[0].id,destinationLocationId:location.id}};
}
