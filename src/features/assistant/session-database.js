/** Backend-only transaction-scoped PostgreSQL row locking.
 * connect() supplies a dedicated authenticated connection with query(text,values)
 * and release(). No connection string, credentials or driver defaults live here.
 * Unlike owner-token RPC acquisition, PostgreSQL releases this lock on process /
 * connection death; the next request waits then resumes the trusted checkpoint.
 */
export function createSessionDatabase({ connect }) {
  return {
    async withSessionLock(scope,ref,work) {
      const connection = await connect();
      const owner = crypto.randomUUID();
      let transaction = false;
      try {
        // Autocommit the durable lock identity before the lock-holding transaction.
        await connection.query('INSERT INTO assistant_session_locks (operation_id,conversation_ref,owner_token) VALUES ($1,$2,$3) ON CONFLICT (operation_id,conversation_ref) DO NOTHING',[scope.operationId,ref,owner]);
        await connection.query('BEGIN'); transaction = true;
        const locked = await connection.query('SELECT id FROM assistant_session_locks WHERE operation_id = $1 AND conversation_ref = $2 FOR UPDATE',[scope.operationId,ref]);
        if (locked.rows?.length !== 1) throw new Error('exclusive-session-lock-not-acquired');
        await connection.query('UPDATE assistant_session_locks SET owner_token = $3, updated_at = now() WHERE operation_id = $1 AND conversation_ref = $2',[scope.operationId,ref,owner]);
        const result = await work(owner);
        await connection.query('COMMIT'); transaction = false;
        return result;
      } finally {
        try { if (transaction) await connection.query('ROLLBACK'); }
        finally { await connection.release(); }
      }
    },
  };
}
