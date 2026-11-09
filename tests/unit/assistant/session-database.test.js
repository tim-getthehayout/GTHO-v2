import { describe,it,expect,vi } from 'vitest';
import { createSessionDatabase } from '../../../src/features/assistant/session-database.js';
function pool() {
  const tails = new Map(),connections = [];
  const connect = async () => {
    let unlock;
    const connection = { query: vi.fn(async (sql,values = []) => {
      if (sql.includes('FOR UPDATE')) {
        const key = JSON.stringify(values),prior = tails.get(key) || Promise.resolve();
        let release;const next = new Promise(resolve => { release = resolve; });tails.set(key,next);
        await prior;unlock = release;
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') { unlock?.();unlock = null; }
      return { rows: [{ id: 'durable-lock-row' }] };
    }),release: vi.fn(async () => { unlock?.(); }) };
    connections.push(connection);return connection;
  };
  return { connect,connections };
}
describe('transaction-scoped crash-recoverable session lock', () => {
  it('waits across requests; a failed owner rolls back and the next request proceeds without a lease expiry or deleting the durable identity',async () => {
    const db = pool(),sessions = createSessionDatabase(db),scope = { operationId: 'op' };
    let release,entered = false;const gate = new Promise(resolve => { release = resolve; });
    const first = sessions.withSessionLock(scope,'ref',async () => { await gate;throw new Error('connection owner failed'); });
    await vi.waitFor(() => expect(db.connections[0]?.query).toHaveBeenCalledWith('UPDATE assistant_session_locks SET owner_token = $3, updated_at = now() WHERE operation_id = $1 AND conversation_ref = $2',['op','ref',expect.any(String)]));
    const second = sessions.withSessionLock(scope,'ref',async () => { entered = true;return 'trusted-resume'; });
    await Promise.resolve();expect(entered).toBe(false);
    release();await expect(first).rejects.toThrow('owner failed');expect(await second).toBe('trusted-resume');
    expect(db.connections[0].query).toHaveBeenCalledWith('ROLLBACK');expect(db.connections[1].query).toHaveBeenCalledWith('COMMIT');
    for (const connection of db.connections) expect(connection.release).toHaveBeenCalledOnce();
    expect(db.connections.flatMap(connection => connection.query.mock.calls).some(([sql]) => /DELETE|INTERVAL|lease/i.test(sql))).toBe(false);
  });
  it('fails closed if a connection cannot positively acquire the lock row',async () => {
    const connection = { query: vi.fn(async () => ({ rows: [] })),release: vi.fn() },work = vi.fn();
    await expect(createSessionDatabase({ connect: async () => connection }).withSessionLock({ operationId: 'op' },'ref',work)).rejects.toThrow('lock-not-acquired');
    expect(work).not.toHaveBeenCalled();expect(connection.query).toHaveBeenCalledWith('ROLLBACK');expect(connection.release).toHaveBeenCalledOnce();
  });

});
