/**
 * #476 backup/restore hardening — data layer (items 1, 2, 3, 7, 8).
 * In-memory Supabase double only; no live DB.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ rows: {}, calls: [], proofs: [], missingTables: [], orders: [] }));
vi.mock('../../src/data/supabase-client.js', async () => {
  const { makeBackupClient } = await import('./historical-backup-double.js');
  const client = makeBackupClient(db);
  const from = client.from.bind(client);
  client.from = table => {
    const query = from(table);
    const order = query.order;
    query.order = (...args) => { db.orders.push([table, ...args]); return order(...args); };
    return query;
  };
  return { supabase: client };
});
vi.mock('../../src/features/auth/session.js', () => ({ getUser: () => ({ id: 'user', email: 'test@example.test' }) }));
import { CustomSync } from '../../src/data/custom-sync.js';
import { _reset, setSyncAdapter, mergeRemote, getAll, clearEntities } from '../../src/data/store.js';
import { canExport, exportOperationBackup, BACKUP_TABLES } from '../../src/data/backup-export.js';
import { importOperationBackup, preflightAssistantRestore, restoredEntityTypes, CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';
import { pullAllRemoteReplacing } from '../../src/data/pull-remote.js';
import { isTableReleased, RELEASED_SCHEMA_VERSION } from '../../src/data/schema-release.js';
import { supabase } from '../../src/data/supabase-client.js';

const OP = '00000000-0000-4000-8000-000000000476';
const F1 = '00000000-0000-4000-8000-0000000476f1';
const GHOST = '00000000-0000-4000-8000-0000000476f9';
const stored = type => JSON.parse(localStorage.getItem(`gtho_v2_${type}`) || '[]');
const envelope = tables => ({ format: 'gtho-v2-backup', format_version: 1, schema_version: CURRENT_SCHEMA_VERSION, operation_id: OP, tables: { operations: [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION }], ...tables } });

beforeEach(() => {
  localStorage.clear(); _reset();
  db.rows = {}; db.calls = []; db.proofs = []; db.missingTables = []; db.orders = [];
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { setSyncAdapter(null); vi.restoreAllMocks(); });

describe('1 · restore replaces the local store before re-hydrating', () => {
  it('an older/smaller backup clears removed and newer local rows from store and storage; auth/sync keys stay', async () => {
    localStorage.setItem('sb-test-auth-token', 'session');
    localStorage.setItem('_sync_queue', '[]');
    localStorage.setItem('gtho_v2_releaseNotes', '[{"id":"rn"}]');
    mergeRemote('farms', [
      { id: GHOST, operationId: OP, name: 'Deleted since backup', updatedAt: '2026-11-20T00:00:00Z' },
      { id: F1, operationId: OP, name: 'Newer local edit', updatedAt: '2026-11-26T00:00:00Z' },
    ]);
    mergeRemote('events', [{ id: 'ev-ghost', operationId: OP, updatedAt: '2026-11-26T00:00:00Z' }]);
    expect(stored('farms')).toHaveLength(2);
    setSyncAdapter(new CustomSync());
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION }];
    const backup = envelope({ farms: [{ id: F1, operation_id: OP, name: 'Backup name', updated_at: '2026-11-01T00:00:00Z' }] });
    const result = await importOperationBackup(backup, OP, null, { skipAutoBackup: true });
    expect(result, result.error).toMatchObject({ success: true });
    expect(getAll('farms').map(f => [f.id, f.name])).toEqual([[F1, 'Backup name']]);
    expect(stored('farms').map(f => f.id)).toEqual([F1]);
    expect(getAll('events')).toEqual([]);
    expect(stored('events')).toEqual([]);
    expect(localStorage.getItem('sb-test-auth-token')).toBe('session');
    expect(localStorage.getItem('_sync_queue')).toBe('[]');
    expect(localStorage.getItem('gtho_v2_releaseNotes')).toBe('[{"id":"rn"}]');
  });

  it('restored entity types cover the restored tables only (not members or release notes)', () => {
    const types = restoredEntityTypes();
    for (const type of ['operations', 'farms', 'events', 'milkPickups', 'calfMilkFeedings', 'userPreferences']) expect(types).toContain(type);
    expect(types).not.toContain('operationMembers');
    expect(types).not.toContain('releaseNotes');
  });

  it('pullAllRemoteReplacing clears first, even when the remote table is empty', async () => {
    mergeRemote('farms', [{ id: GHOST, operationId: OP, name: 'Ghost' }]);
    setSyncAdapter({ isOnline: async () => true, pullAll: async table => (table === 'farms' ? [] : []), flush: async () => {}, push: () => {}, getQueuedItems: () => [], getDeadLetters: () => [] });
    await pullAllRemoteReplacing(['farms']);
    expect(getAll('farms')).toEqual([]);
    expect(localStorage.getItem('gtho_v2_farms')).toBeNull();
  });

  it('clearEntities ignores unknown types and leaves other entity types alone', () => {
    mergeRemote('farms', [{ id: F1, operationId: OP }]);
    mergeRemote('events', [{ id: 'e1', operationId: OP }]);
    clearEntities(['farms', 'notAType']);
    expect(getAll('farms')).toEqual([]);
    expect(getAll('events')).toHaveLength(1);
    expect(stored('events')).toHaveLength(1);
  });
});

describe('2 · canExport uses getSyncHealth', () => {
  const adapter = health => ({ getStatus: () => 'idle', getSyncHealth: () => health });
  it.each([
    [{ status: 'failed', queueLength: 0, deadLetterCount: 1 }, 'dead_letters'],
    [{ status: 'idle', queueLength: 0, deadLetterCount: 2 }, 'dead_letters'],
    [{ status: 'idle', queueLength: 3, deadLetterCount: 0 }, 'syncing'],
    [{ status: 'syncing', queueLength: 1, deadLetterCount: 0 }, 'syncing'],
    [{ status: 'signedOut', queueLength: 1, deadLetterCount: 0 }, 'signed_out'],
    [{ status: 'offline', queueLength: 0, deadLetterCount: 0 }, 'offline'],
    [{ status: 'error', queueLength: 0, deadLetterCount: 0 }, 'sync_error'],
  ])('blocks %o (getStatus says idle)', (health, reason) => {
    setSyncAdapter(adapter(health));
    expect(canExport()).toEqual({ ok: false, reason });
  });
  it('allows a clean idle health', () => {
    setSyncAdapter(adapter({ status: 'idle', queueLength: 0, deadLetterCount: 0 }));
    expect(canExport()).toEqual({ ok: true });
  });
  it('falls back to getStatus for adapters without getSyncHealth', () => {
    setSyncAdapter({ getStatus: () => 'idle' });
    expect(canExport()).toEqual({ ok: true });
    setSyncAdapter({ getStatus: () => 'syncing' });
    expect(canExport().ok).toBe(false);
  });
  it('blocks a restore while CustomSync holds a dead letter', async () => {
    const sync = new CustomSync();
    setSyncAdapter(sync);
    localStorage.setItem('_dead_letter_queue', JSON.stringify([{ table: 'farms', record: { id: F1, operation_id: OP }, operation: 'upsert', errors: ['x'] }]));
    expect(sync.getSyncHealth().deadLetterCount).toBe(1);
    expect(canExport()).toMatchObject({ ok: false, reason: 'dead_letters' });
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION }];
    const result = await importOperationBackup(envelope({}), OP, null, { skipAutoBackup: true });
    expect(result.success).toBe(false);
    expect(db.calls.some(call => call.operation === 'delete')).toBe(false);
  });
});

describe('3 · paginated export always orders by id', () => {
  it('every released paginated table is ordered by id ascending', async () => {
    setSyncAdapter(new CustomSync());
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION }];
    await exportOperationBackup(OP);
    const paginated = Object.entries(BACKUP_TABLES).filter(([table, cfg]) => cfg.paginate && isTableReleased(table, RELEASED_SCHEMA_VERSION)).map(([table]) => table);
    expect(paginated).toContain('events');
    expect(paginated).toContain('milk_pickups');
    for (const table of paginated) expect(db.orders, table).toContainEqual([table, 'id', { ascending: true }]);
  });
});

describe('7 · operations.archived on restore', () => {
  const opUpdate = () => db.calls.find(call => call.table === 'operations' && call.operation === 'update').payload;
  it.each([[true], [false]])('keeps archived=%s from the backup', async archived => {
    setSyncAdapter(new CustomSync());
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION, archived: !archived }];
    const backup = envelope({});
    backup.tables.operations[0].archived = archived;
    expect((await importOperationBackup(backup, OP, null, { skipAutoBackup: true })).success).toBe(true);
    expect(opUpdate().archived).toBe(archived);
  });
  it('leaves archived alone when the backup row has none', async () => {
    setSyncAdapter(new CustomSync());
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION, archived: false }];
    expect((await importOperationBackup(envelope({}), OP, null, { skipAutoBackup: true })).success).toBe(true);
    expect(opUpdate()).not.toHaveProperty('archived');
  });
});

describe('8 · preflight refuses operation-scoped rows without operation_id', () => {
  it.each([[undefined], [null]])('refuses a farm row with operation_id %s before any delete', async value => {
    const row = { id: F1, name: 'x' };
    if (value === null) row.operation_id = null;
    supabase.rpc.mockClear();
    const res = await preflightAssistantRestore(envelope({ farms: [row] }), OP, supabase);
    expect(res).toMatchObject({ success: false });
    expect(res.error).toMatch(/farms rows are missing operation_id/);
    expect(supabase.rpc).not.toHaveBeenCalledWith('assistant_restore_prepare', expect.anything());
  });
  it('a full import with such a row changes nothing', async () => {
    setSyncAdapter(new CustomSync());
    db.rows.operations = [{ id: OP, name: 'Farm', schema_version: CURRENT_SCHEMA_VERSION }];
    const result = await importOperationBackup(envelope({ events: [{ id: 'e1' }] }), OP, null, { skipAutoBackup: true });
    expect(result.success).toBe(false);
    expect(db.calls.some(call => ['delete', 'insert', 'update'].includes(call.operation))).toBe(false);
  });
  it('unit tables keep shared standard rows (operation_id null) and operations rows are exempt', async () => {
    const res = await preflightAssistantRestore(envelope({ dose_units: [{ id: 'std', operation_id: null, name: 'mL' }], farms: [{ id: F1, operation_id: OP }] }), OP, supabase);
    expect(res).toMatchObject({ success: true });
  });
});
