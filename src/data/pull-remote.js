/** @file Pull remote data from Supabase and merge into the store.
 *  Called on boot (after store init) and on reconnect (after queue flush).
 */

import { getSyncAdapter, mergeRemote } from './store.js';
import { SYNC_REGISTRY } from './sync-registry.js';
import { logger } from '../utils/logger.js';

/**
 * Pull all tables from Supabase and merge into the local store.
 * Skips tables where the pull fails (logs error, continues).
 * @returns {Promise<{ pulled: number, errors: number }>}
 */
export async function pullAllRemote() {
  const adapter = getSyncAdapter();
  if (!adapter) return { pulled: 0, errors: 0 };

  const online = await adapter.isOnline();
  if (!online) return { pulled: 0, errors: 0 };

  let pulled = 0;
  let errors = 0;

  for (const [entityType, reg] of Object.entries(SYNC_REGISTRY)) {
    try {
      const rows = await adapter.pullAll(reg.table);
      if (rows.length > 0) {
        const records = rows.map(row => reg.from(row));
        mergeRemote(entityType, records);
        pulled += rows.length;
      }
    } catch (err) {
      logger.error('sync', `pullAll failed for ${reg.table}`, { error: err.message });
      errors++;
    }
  }

  return { pulled, errors };
}
