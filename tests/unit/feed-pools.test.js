import { it, expect } from 'vitest';
import { replayFeedPools, poolKey, poolConversion, poolReading, poolDailyActual } from '../../src/calcs/feed-pools.js';
const key=poolKey({eventId:'e',locationId:'p',feedTypeId:'hay'});
const types=[{id:'hay',unit:'bale'}];
const delivery=(id,date,time,q,w,dm,unit='bale')=>({id,eventId:'e',locationId:'p',feedTypeId:'hay',kind:'inventory_feeding',batchId:id,date,time,quantity:q,unitSnapshot:unit,weightPerUnitKgSnapshot:w,dmPctSnapshot:dm});
const check=(id,date,time)=>({id,eventId:'e',date,time});
const item=(id,q,w,dm)=>({id:'i'+id,feedCheckId:id,locationId:'p',feedTypeId:'hay',batchId:null,remainingQuantity:q,unitSnapshot:'bale',weightPerUnitKgSnapshot:w,dmPctSnapshot:dm});
const base=()=>({eventId:'e',feedTypes:types,entries:[delivery('a','2026-11-05','10:00',2,400,80),delivery('b','2026-11-05','11:00',2,600,90)],checks:[],items:[]});
it('blends counts, as-fed mass and dry matter by mass, then blends leftovers with later feedings',()=>{
 const input=base(),pool=replayFeedPools(input).get(key);expect(pool).toMatchObject({q:4,m:2000,d:1720,estimate:true});expect(poolConversion(pool)).toMatchObject({weightPerUnitKgSnapshot:500,dmPctSnapshot:86});const reading=poolReading(pool,2);input.checks=[check('c','2026-11-06','09:00')];input.items=[{...reading,feedCheckId:'c'}];input.entries.push(delivery('c','2026-11-07','09:00',1,400,80));expect(replayFeedPools(input).get(key)).toMatchObject({q:3,m:1400,d:1180});
 // Immutable feeding snapshots, never mutable batch defaults.
 input.batches=[{id:'a',feedTypeId:'wrong',weightPerUnitKg:1,dmPct:1}];expect(replayFeedPools(input).get(key).d).toBe(1180);
});
it('mixed/unverified units stay mass-based until empty, including a check and later common-unit feeding',()=>{
 const input=base();input.entries[1].unitSnapshot='bal';let pool=replayFeedPools(input).get(key);expect(pool).toMatchObject({q:2000,m:2000,d:1720,massBased:true,unit:'kg'});const reading=poolReading(pool,1000,'kg');input.checks=[check('c','2026-11-06','09:00')];input.items=[{...reading,feedCheckId:'c'}];input.entries.push(delivery('d','2026-11-07','09:00',1,500,85));expect(replayFeedPools(input).get(key)).toMatchObject({q:1500,m:1500,massBased:true});input.checks.push(check('z','2026-11-08','09:00'));input.items.push({...poolReading(replayFeedPools(input).get(key),0,'kg'),feedCheckId:'z'});input.entries.push(delivery('f','2026-11-09','09:00',1,500,85));expect(replayFeedPools(input).get(key)).toMatchObject({q:1,m:500,massBased:false,unit:'bale'});
});
it('missing conversion is unknown, blocks positive reading, and confirmed zero is usable',()=>{const input=base();input.entries[0].weightPerUnitKgSnapshot=null;const pool=replayFeedPools(input).get(key);expect(pool.m).toBeNull();expect(()=>poolReading(pool,1)).toThrow('conversion');expect(poolReading(pool,0).remainingQuantity).toBe(0);});
it('partial checks do not zero other pools and strict endpoint ordering is independent of insertion order',()=>{
 const input=base();input.entries.push({...delivery('straw','2026-11-05','10:00',3,100,90),feedTypeId:'straw'});input.checks=[check('a','2026-11-05','10:00'),check('b','2026-11-09','13:00')];input.items=[item('a',2,400,80),item('b',1,500,86)];input.entries.push(delivery('later','2026-11-09','14:00',7,500,86));
 expect(replayFeedPools(input).get(poolKey({eventId:'e',locationId:'p',feedTypeId:'straw'})).q).toBe(3);expect(poolDailyActual(input,'2026-11-08').get(key)).toBeCloseTo((640+1080-430)/4);const before=JSON.stringify(input);const reverse={...input,entries:[...input.entries].reverse(),checks:[...input.checks].reverse(),items:[...input.items].reverse()};expect([...replayFeedPools(reverse)]).toEqual([...replayFeedPools(input)]);expect(JSON.stringify(input)).toBe(before);
});

it.each([
 ['2026-11-05','08:59',25],['2026-11-05','09:00',25],['2026-11-05','09:01',50],
 ['2026-11-09','12:59',50],['2026-11-09','13:00',50],['2026-11-09','13:01',25],
])('pool interval uses strict opening and inclusive closing at %s %s', (date,time,expected)=>{
 const input={eventId:'e',feedTypes:types,entries:[delivery('d',date,time,1,100,100)],checks:[check('a','2026-11-05','09:00'),check('b','2026-11-09','13:00')],items:[item('a',2,100,100),item('b',1,100,100)]};expect(poolDailyActual(input,'2026-11-08').get(key)).toBe(expected);
});
it('same-day multiple observations and missing-time midnight conventions stay deterministic',()=>{
 const input={eventId:'e',feedTypes:types,entries:[delivery('d','2026-11-05',null,1,100,100),delivery('later','2026-11-05','13:00',6,100,100)],checks:[check('a','2026-11-05',null),check('b','2026-11-05','13:00')],items:[item('a',2,100,100),item('b',8,100,100)]};expect(replayFeedPools(input).get(key)).toMatchObject({q:8,m:800,d:800});
});
