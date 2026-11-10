/** Staged pool forms, mounted only by the compiled compatible release. */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, runDurableWrite } from '../../data/store.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { explicitObservationTime, validateObservationTime } from '../../ui/explicit-observation-time.js';
import { feedSnapshot, replayFeedPools } from '../../calcs/feed-pools.js';
import { poolInput, liveFeedPools, commitPoolCheck, deletePoolObservation, poolExecutionKey, writePoolTransfer } from './pool-ledger.js';
function field(label,input){return el('div',{className:'field'},[el('label',{},[label]),input]);}
function clocks(panel,check){
 const date=el('input',{type:'date',value:check?.date||getLocalTodayStr(),'data-testid':'pool-date'}),time=el('input',{type:'time',value:check?.time||new Date().toTimeString().slice(0,5),'data-testid':'pool-time'});
 panel.appendChild(el('div',{className:'two'},[field(t('pool.date'),date),field(t('pool.time'),time)]));
 const state={date:date.value,time:time.value,explicitTimeDate:check?null:date.value};panel.appendChild(explicitObservationTime(state,date,time));
 return {date,time,validate(){state.date=date.value;state.time=time.value;validateObservationTime(state);if(date.value>getLocalTodayStr())throw new Error(t('pool.future'));}};
}
function poolLabel(pool){return `${getById('feedTypes',pool.feedTypeId)?.name||'?'} → ${getById('locations',pool.locationId)?.name||'?'}`;}
function describe(pool){return `${pool.q??'?'} ${pool.unit||'kg'} · ${pool.massBased?t('pool.mass'):pool.estimate?t('pool.estimate'):t('pool.blended')}`;}
export function renderPoolCheckForm(panel,event,operationId,{check=null,item=null,close}={}){
 clear(panel);panel.appendChild(el('h3',{},[check?t('pool.edit'):t('pool.check')]));const clock=clocks(panel,check),input=poolInput(event.id),notes=el('input',{type:'text',value:check?.notes||'','data-testid':'pool-notes'});
 panel.appendChild(field(t('pool.notes'),notes));
 let pools=liveFeedPools(event.id,clock.date.value,clock.time.value);
 if(check){const old=replayFeedPools({...input,entries:[],checks:[check]});pools=old;if(item){const type=feedSnapshot(item,input.batches).feedTypeId;pools=new Map([...pools].filter(([,pool])=>pool.feedTypeId===type && pool.locationId===item.locationId));}}
 const cards=[];
 for(const [key,pool] of pools){const selected=el('input',{type:'checkbox',checked:true,'data-testid':`pool-select-${pool.feedTypeId}-${pool.locationId}`}),amount=el('input',{type:'number',min:'0',step:'any',value:pool.q??'','data-testid':`pool-remaining-${pool.feedTypeId}-${pool.locationId}`}),unit=el('span',{},[pool.unit||'kg']),hint=el('p',{className:'form-hint'},[describe(pool)]);
  const card=el('div',{className:'card','data-testid':'pool-card'},[el('label',{},[selected,poolLabel(pool)]),hint,field(t('pool.remaining'),amount),unit]);panel.appendChild(card);cards.push({key,pool,selected,amount,unit,hint});
 }
 const status=el('div',{className:'auth-error'});panel.appendChild(status);
 const refresh=()=>{const now=liveFeedPools(event.id,clock.date.value,clock.time.value,check?.id);for(const card of cards){const pool=now.get(card.key);if(!pool)continue;const unit=pool.unit||'kg';if(card.unit.textContent!==unit){card.amount.value='';card.unit.textContent=unit;status.textContent=t('pool.unitChanged');}card.hint.textContent=describe(pool);}};
 clock.date.addEventListener('change',refresh);clock.time.addEventListener('input',refresh);
 const key=poolExecutionKey(operationId,'pool-check'),deleteKey=poolExecutionKey(operationId,'pool-check-delete');let committed=false;
 panel.appendChild(el('div',{className:'btn-row'},[el('button',{className:'btn btn-green',onClick:()=>{clear(status);try{if(committed)return;clock.validate();const readings=cards.filter(card=>card.selected.checked).map(card=>({feedTypeId:card.pool.feedTypeId,locationId:card.pool.locationId,remainingQuantity:card.amount.value.trim()===''?NaN:Number(card.amount.value),unit:card.unit.textContent}));commitPoolCheck({operationId,eventId:event.id,date:clock.date.value,time:clock.time.value,notes:notes.value.trim()||null,readings,checkId:check?.id},key);committed=true;close?.();}catch(error){status.textContent=error.message;}}},[t('action.save')]),el('button',{className:'btn btn-outline',onClick:close},[t('action.cancel')])]));
 if(check && cards.length===1)panel.appendChild(el('button',{className:'btn btn-outline',onClick:()=>{if(!window.confirm(t('pool.deleteConfirm')))return;try{deletePoolObservation({operationId,checkId:check.id,feedTypeId:cards[0].pool.feedTypeId,locationId:cards[0].pool.locationId},deleteKey);close?.();}catch(error){status.textContent=error.message;}}},[t('action.delete')]));
}
export function renderPoolTransferForm(panel,event,operationId,{close,preselectFeedTypeId,preselectLocationId}={}){
 clear(panel);panel.appendChild(el('h3',{},[t('pool.move')]));const clock=clocks(panel),cards=[];
 for(const [key,pool] of liveFeedPools(event.id)){if(pool.q===0 && pool.m===0)continue;const selected=el('input',{type:'checkbox',checked:pool.feedTypeId===preselectFeedTypeId && pool.locationId===preselectLocationId,'data-testid':`pool-select-${pool.feedTypeId}-${pool.locationId}`});const remaining=el('input',{type:'number',min:'0',step:'any',value:pool.q??'','data-testid':`pool-remaining-${pool.feedTypeId}-${pool.locationId}`}),amount=el('input',{type:'number',min:'0',step:'any',value:'','data-testid':`pool-move-${pool.feedTypeId}-${pool.locationId}`});panel.appendChild(el('div',{className:'card','data-testid':'pool-card'},[el('label',{},[selected,poolLabel(pool)]),el('p',{className:'form-hint'},[describe(pool)]),field(t('pool.confirmRemaining'),remaining),field(`${t('pool.moveAmount')} (${pool.unit||'kg'})`,amount)]));cards.push({key,pool,selected,remaining,amount});}
 const destination=el('select',{'data-testid':'pool-destination'},[el('option',{value:''},[t('pool.chooseDestination')])]);
 for(const storage of getAll('locations').filter(row=>row.operationId===operationId && row.type==='storage'))destination.appendChild(el('option',{value:`storage|${storage.id}`},[`${t('pool.return')} → ${storage.name}`]));
 const events=new Map(getAll('events').filter(row=>row.operationId===operationId && !row.dateOut).map(row=>[row.id,row]));
 for(const pw of getAll('eventPaddockWindows').filter(row=>events.has(row.eventId)&&!row.dateClosed))destination.appendChild(el('option',{value:`event|${pw.eventId}|${pw.locationId}`},[`${t('pool.carry')} → ${getById('locations',pw.locationId)?.name||'?'} (${events.get(pw.eventId).name||pw.eventId.slice(0,8)})`]));
 panel.appendChild(field(t('pool.destination'),destination));panel.appendChild(el('p',{className:'form-hint'},[t('pool.returnHint')]));const status=el('div',{className:'auth-error'});panel.appendChild(status);
 const key=poolExecutionKey(operationId,'pool-move');let committed=false;
 panel.appendChild(el('div',{className:'btn-row'},[el('button',{className:'btn btn-green',onClick:()=>{clear(status);try{if(committed)return;clock.validate();const selected=cards.filter(card=>card.selected.checked);if(!selected.length||!destination.value)throw new Error(t('pool.chooseDestination'));const [kind,id,location]=destination.value.split('|');const rows=selected.map(card=>({operationId,eventId:event.id,feedTypeId:card.pool.feedTypeId,locationId:card.pool.locationId,quantity:card.amount.value.trim()===''?NaN:Number(card.amount.value),confirmedRemaining:card.remaining.value.trim()===''?NaN:Number(card.remaining.value),unit:card.pool.unit,date:clock.date.value,time:clock.time.value,...(kind==='storage'?{storageLocationId:id}:{destinationEventId:id,destinationLocationId:location})}));
 if(!window.confirm(`${t('pool.confirmMove')} ${clock.date.value} ${clock.time.value}: ${rows.map(row=>`${row.quantity} ${row.unit} ${getById('feedTypes',row.feedTypeId)?.name}`).join(', ')} → ${destination.selectedOptions[0].textContent}`))return;
 runDurableWrite(key,()=>{let result;for(const row of rows)result=writePoolTransfer(row);return result;});committed=true;close?.();}catch(error){status.textContent=error.message;}}},[t('action.save')]),el('button',{className:'btn btn-outline',onClick:close},[t('action.cancel')])]));
}
