/** @file SyncAdapter base class — interface per V2_APP_ARCHITECTURE.md §5.1 */

/**
 * Abstract sync adapter interface. Implementations must override all methods.
 */
export class SyncAdapter {
  /**
   * Push a single record to remote.
   * @param {string} table
   * @param {object} record - Supabase-shaped (snake_case)
   * @returns {Promise<{id: string, success: boolean, error?: string}>}
   */
  async push(_table, _record) {
    throw new Error('SyncAdapter.push() not implemented');
  }

  /**
   * Push multiple records to remote.
   * @param {string} table
   * @param {Array<object>} records
   * @returns {Promise<Array<{id: string, success: boolean, error?: string}>>}
   */
  async pushBatch(_table, _records) {
    throw new Error('SyncAdapter.pushBatch() not implemented');
  }

  /**
   * Pull records modified after a timestamp.
   * @param {string} table
   * @param {string} since - ISO timestamp
   * @returns {Promise<Array<object>>}
   */
  async pull(_table, _since) {
    throw new Error('SyncAdapter.pull() not implemented');
  }

  /**
   * Pull all records for a table.
   * @param {string} table
   * @returns {Promise<Array<object>>}
   */
  async pullAll(_table) {
    throw new Error('SyncAdapter.pullAll() not implemented');
  }

  /**
   * Delete a record from remote.
   * @param {string} table
   * @param {string} id
   * @returns {Promise<{id: string, success: boolean, error?: string}>}
   */
  async delete(_table, _id) {
    throw new Error('SyncAdapter.delete() not implemented');
  }

  /**
   * Check if currently online.
   * @returns {Promise<boolean>}
   */
  async isOnline() {
    throw new Error('SyncAdapter.isOnline() not implemented');
  }

  /**
   * Get current sync status.
   * @returns {'idle'|'syncing'|'error'|'offline'}
   */
  getStatus() {
    throw new Error('SyncAdapter.getStatus() not implemented');
  }

  /**
   * Register a status change listener.
   * @param {Function} callback - (status: string) => void
   * @returns {Function} unsubscribe
   */
  onStatusChange(_callback) {
    throw new Error('SyncAdapter.onStatusChange() not implemented');
  }
}
