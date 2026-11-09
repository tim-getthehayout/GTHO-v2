import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { add,update,getAll,getById,_reset,setSyncAdapter,runDurableWrite,init } from '../../../src/data/store.js';
import { getDurableWriteReceipt } from '../../../src/data/local-storage.js';
import * as Animal from '../../../src/entities/animal.js';
const op = '00000000-0000-4000-8000-000000000001';
const key = JSON.stringify([op,'conversation','proposal',1]);
const create = () => Animal.create({ operationId: op,sex: 'female',tagNum: crypto.randomUUID() });
beforeEach(() => { localStorage.clear();_reset(); });
afterEach(() => vi.restoreAllMocks());
describe('durable local save evidence and recovery', () => {
  it('does not publish memory, sync or success when ordinary persistence fails', () => {
    const adapter = { push: vi.fn() };setSyncAdapter(adapter);
    const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => add('animals',create(),Animal.validate,Animal.toSupabaseShape,'animals')).toThrow('quota');
    expect(getAll('animals')).toEqual([]);expect(adapter.push).not.toHaveBeenCalled();spy.mockRestore();
  });
  it('stages all validations before any write, including a validator failure swallowed by a normal UI', () => {
    expect(() => runDurableWrite(key,() => {
      add('animals',create(),Animal.validate,Animal.toSupabaseShape,'animals');
      try { add('animals',Animal.create({}),Animal.validate,Animal.toSupabaseShape,'animals'); } catch { /* normal UI status */ }
      return 'not-a-save';
    })).toThrow('Validation failed');
    expect(getAll('animals')).toEqual([]);expect(localStorage.getItem('gtho_v2_animals')).toBeNull();expect(getDurableWriteReceipt(key)).toBeNull();
  });
  it('persists all rows, existing sync queue and exact-key receipt before reporting local success; retries never apply again', () => {
    const write = vi.fn(() => { const a = create();add('animals',a,Animal.validate,Animal.toSupabaseShape,'animals');update('animals',a.id,{ confirmedBred: false },Animal.validate,Animal.toSupabaseShape,'animals');return a.id; });
    const result = runDurableWrite(key,write);
    expect(result.localSavedAt).toBeTruthy();expect(result.syncQueuedAt).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('_sync_queue'))).toHaveLength(2);
    _reset();expect(runDurableWrite(key,write)).toEqual(result);expect(write).toHaveBeenCalledOnce();expect(getAll('animals')).toHaveLength(1);
  });
  it('recovers a crash between entity writes and outcome persistence without rerunning the write', () => {
    const a = create();let fail = true;const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(k,v) { if (k === 'gtho_v2_write_receipts' && fail) throw new Error('crash'); return original.call(this,k,v); });
    expect(() => runDurableWrite(key,() => { add('animals',a,Animal.validate,Animal.toSupabaseShape,'animals');return a.id; })).toThrow('crash');
    expect(localStorage.getItem('gtho_v2_write_journal')).toBeTruthy();
    fail = false;_reset();init();
    const receipt = runDurableWrite(key,() => { throw new Error('must not reapply'); });
    expect(receipt.savedRecordId).toBe(a.id);expect(getById('animals',a.id)).toBeTruthy();expect(JSON.parse(localStorage.getItem('_sync_queue'))).toHaveLength(1);spy.mockRestore();
  });
  it('rejects cross-operation writes and malformed execute identities without durable rows',() => {
    const other = Animal.create({ operationId: 'another-operation',tagNum: 'other',sex: 'female' });
    expect(() => runDurableWrite(key,() => { add('animals',other,Animal.validate);return other.id; })).toThrow('operation-mismatch');
    expect(() => runDurableWrite(JSON.stringify([op,{},'proposal',1]),() => 'id')).toThrow('invalid-execution-key');
    expect(getAll('animals')).toHaveLength(0);expect(localStorage.getItem('gtho_v2_write_journal')).toBeNull();
  });
  it('recovers a pending journal before a later ordinary mutation so the later write cannot overwrite confirmed rows',() => {
    const a = create(),b = create(),original = Storage.prototype.setItem;let fail = true;
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(k,v) { if (k === 'gtho_v2_write_receipts' && fail) throw new Error('crash');return original.call(this,k,v); });
    expect(() => runDurableWrite(key,() => { add('animals',a,Animal.validate,Animal.toSupabaseShape,'animals');return a.id; })).toThrow('crash');
    fail = false;add('animals',b,Animal.validate,Animal.toSupabaseShape,'animals');
    expect(getAll('animals').map(row => row.id)).toEqual([a.id,b.id]);
    expect(getDurableWriteReceipt(key).savedRecordId).toBe(a.id);init();expect(getAll('animals')).toHaveLength(2);
  });

});
