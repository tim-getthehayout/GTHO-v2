import { describe,it,expect,vi } from 'vitest';
import { CustomSync } from '../../../src/data/custom-sync.js';
import { commitDurableWrite } from '../../../src/data/local-storage.js';
describe('journal queue versus in-flight normal sync',() => {
  it('does not erase newly journalled multi-record commands when an earlier flush finishes',async () => {
    localStorage.clear();
    localStorage.setItem('_sync_queue',JSON.stringify([{ id: 'old',table: 'animals',operation: 'upsert',record: { id: 'old' },attempts: 0,errors: [] }]));
    const sync = new CustomSync();vi.spyOn(sync,'isOnline').mockResolvedValue(true);
    let release;const gate = new Promise(resolve => { release = resolve; });
    const push = vi.spyOn(sync,'_pushToRemote').mockImplementation(async () => { await gate;return { success: true }; });
    const flushing = sync.flush();await vi.waitFor(() => expect(push).toHaveBeenCalledOnce());
    commitDurableWrite(JSON.stringify(['op','conversation','proposal',1]),{ animals: [{ id: 'new' }] },[{ table: 'animals',record: { id: 'new' },operation: 'insert' }],'new');
    release();await flushing;
    const remaining = JSON.parse(localStorage.getItem('_sync_queue'));expect(remaining).toHaveLength(1);expect(remaining[0]).toMatchObject({ id: 'new',operation: 'upsert',durable_key: expect.any(String) });
  });
});
