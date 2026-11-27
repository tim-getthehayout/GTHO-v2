/** @file #478 — sign-out wipe and the (user_id, operation_id) cache-scope guard. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sb = vi.hoisted(() => ({ signOut: null, select: null }));
vi.mock('../../src/data/supabase-client.js', () => ({
  supabase: {
    auth: { signOut: (...a) => sb.signOut(...a), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
    // #485: strict pulls page with order('id').range(); sb.select answers each page.
    from: () => ({ select: (...a) => ({ order: () => ({ range: () => sb.select(...a) }) }) }),
  },
}));

import * as store from '../../src/data/store.js';
import { clearLocalUserData, enforceCacheScope, readCacheScope, stampCacheScope, noteHydratedOperation, CACHE_SCOPE_KEY } from '../../src/data/cache-scope.js';
import { pullAllRemote, pullEntitiesStrict } from '../../src/data/pull-remote.js';
import { logout } from '../../src/features/auth/session.js';
import { needsOnboarding } from '../../src/features/onboarding/index.js';
import { CustomSync } from '../../src/data/custom-sync.js';

const A = 'user-a'; const B = 'user-b'; const OP_A = 'op-a'; const OP_B = 'op-b';
const op = id => ({ id, name: `Farm ${id}`, updatedAt: '2026-11-01T00:00:00Z' });
const member = (id, userId, operationId) => ({ id, userId, operationId, role: 'owner', updatedAt: '2026-11-01T00:00:00Z' });
const QUEUE = JSON.stringify([{ table: 'animals', id: 'x', operation: 'upsert', record: { id: 'x' } }]);

/** Account A's device cache: store rows, persisted entities, queue/drafts and session keys. */
function seedAccountA({ scope = true } = {}) {
  store.mergeRemote('operations', [op(OP_A)]);
  store.mergeRemote('operationMembers', [member('m-a', A, OP_A)]);
  store.mergeRemote('animals', [{ id: 'cow-1', operationId: OP_A, updatedAt: '2026-11-01T00:00:00Z' }]);
  localStorage.setItem('gtho_v2_operations', JSON.stringify(store.getAll('operations')));
  localStorage.setItem('gtho_v2_operationMembers', JSON.stringify(store.getAll('operationMembers')));
  localStorage.setItem('gtho_v2_animals', JSON.stringify(store.getAll('animals')));
  localStorage.setItem('gtho_v2_write_journal', '{"writes":{},"queue":[]}');
  localStorage.setItem('gtho_v2_field_mode', 'true');
  for (const key of ['_sync_queue', '_dead_letter_queue', '_resync_skipped', '_sync_unacked']) localStorage.setItem(key, QUEUE);
  localStorage.setItem('_log_buffer', '[{"msg":"x"}]');
  localStorage.setItem('gtho_last_pulled_at', '123');
  localStorage.setItem('gtho_rollback_in_progress', 'true');
  localStorage.setItem('gtho.oneTimeFix.paddockOrphanCleanupDone', 'true');
  localStorage.setItem('gtho-assistant-feedback-draft:conv-1', '{"text":"hi"}');
  localStorage.setItem('gtho-voice-log:op-a', '[1]');
  if (scope) stampCacheScope(A, OP_A);
}

const KEPT_LOCAL = { 'sb-project-auth-token': '{"access_token":"t"}', gtho_pwa_update_accepted: '1' };
const KEPT_SESSION = { gtho_invite_token: 'tok', gtho_password_recovery: '1', gtho_pwa_update_accepted: '1' };
function seedKeptAndSession() {
  for (const [k, v] of Object.entries(KEPT_LOCAL)) localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(KEPT_SESSION)) sessionStorage.setItem(k, v);
  for (const k of ['gtho_session_id', 'gtho_field_mode_return', 'gtho_dev_audit_search', 'dev-audit-event-search']) sessionStorage.setItem(k, 'v');
}
const localKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort();
const leaked = () => store.ENTITY_TYPES.reduce((n, type) => n + store.getAll(type).length, 0);

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  store._reset();
  sb.signOut = vi.fn(async () => ({ error: null }));
  sb.select = vi.fn(async () => ({ data: [], error: null }));
});

describe('#478 sign-out wipe', () => {
  it('logout() clears store, gtho_v2_*, sync/assistant keys and per-tab session keys; keeps sb-*, invite, recovery, pwa', async () => {
    seedAccountA(); seedKeptAndSession();
    const adapter = { flush: vi.fn(async () => {}), dispose: vi.fn() };
    store.setSyncAdapter(adapter);
    await logout();
    expect(sb.signOut).toHaveBeenCalledTimes(1);
    expect(leaked()).toBe(0);
    expect(localKeys()).toEqual(Object.keys(KEPT_LOCAL).sort());
    expect(localStorage.getItem(CACHE_SCOPE_KEY)).toBeNull();
    for (const [k, v] of Object.entries(KEPT_SESSION)) expect(sessionStorage.getItem(k)).toBe(v);
    for (const k of ['gtho_session_id', 'gtho_field_mode_return', 'gtho_dev_audit_search', 'dev-audit-event-search']) expect(sessionStorage.getItem(k)).toBeNull();
    expect(adapter.dispose).toHaveBeenCalledTimes(1);
    expect(store.getSyncAdapter()).toBeNull();
    expect(adapter.flush).not.toHaveBeenCalled();
  });

  it('a retired CustomSync never flushes again', async () => {
    const sync = new CustomSync();
    const once = vi.spyOn(sync, '_flushOnce');
    sync.dispose();
    await sync.flush();
    sync.scheduleFlush();
    await Promise.resolve(); await Promise.resolve();
    expect(once).not.toHaveBeenCalled();
  });
});

describe('#478 cache-scope guard', () => {
  it('Account A → brand-new Account B: zero leaked rows, onboarding runs, A\'s queue is gone before any flush', () => {
    seedAccountA();
    const adapterA = { flush: vi.fn(async () => {}), dispose: vi.fn() };
    store.setSyncAdapter(adapterA);
    expect(enforceCacheScope(B)).toBe('wiped');
    store.getSyncAdapter()?.flush?.(); // what onAuthChange does next
    expect(adapterA.flush).not.toHaveBeenCalled();
    expect(localStorage.getItem('_sync_queue')).toBeNull();
    store.init();
    expect(leaked()).toBe(0);
    expect(needsOnboarding()).toBe(true);
    expect(readCacheScope()).toEqual({ userId: B, operationId: null });
  });

  it('Account A → existing Account B: A is cleared, only B hydrates, scope stamps B\'s operation', () => {
    seedAccountA();
    expect(enforceCacheScope(B, OP_B)).toBe('wiped');
    store.mergeRemote('operations', [op(OP_B)]);
    store.mergeRemote('operationMembers', [member('m-b', B, OP_B)]);
    expect(store.getAll('operations').map(o => o.id)).toEqual([OP_B]);
    expect(store.getAll('animals')).toEqual([]);
    expect(readCacheScope()).toEqual({ userId: B, operationId: OP_B });
  });

  it('same user switching operation wipes; unknown or same operation keeps', () => {
    seedAccountA();
    expect(enforceCacheScope(A, null)).toBe('kept');
    expect(enforceCacheScope(A, OP_A)).toBe('kept');
    expect(leaked()).toBeGreaterThan(0);
    expect(enforceCacheScope(A, OP_B)).toBe('wiped');
    expect(leaked()).toBe(0);
    expect(readCacheScope()).toEqual({ userId: A, operationId: OP_B });
  });

  it('upgrade path, same user (no scope yet): stamps in place and keeps the cache and offline writes', () => {
    seedAccountA({ scope: false });
    expect(readCacheScope()).toBeNull();
    expect(enforceCacheScope(A)).toBe('stamped');
    expect(readCacheScope()).toEqual({ userId: A, operationId: OP_A });
    expect(localStorage.getItem('_sync_queue')).toBe(QUEUE);
    expect(localStorage.getItem('gtho_v2_write_journal')).not.toBeNull();
    store.init();
    expect(store.getAll('animals').map(a => a.id)).toEqual(['cow-1']);
  });

  it('upgrade path, other user (no scope yet, e.g. a phone already signed into the new account): auto-wipes to onboarding', () => {
    seedAccountA({ scope: false });
    expect(enforceCacheScope(B)).toBe('wiped');
    expect(readCacheScope()).toEqual({ userId: B, operationId: null });
    store.init();
    expect(leaked()).toBe(0);
    expect(needsOnboarding()).toBe(true);
  });

  it('no scope and no cached operations: stamps without wiping', () => {
    localStorage.setItem('_sync_queue', QUEUE);
    expect(enforceCacheScope(A)).toBe('stamped');
    expect(localStorage.getItem('_sync_queue')).toBe(QUEUE);
  });

  it('noteHydratedOperation records the operation once onboarding / strict pull hydrates it', () => {
    stampCacheScope(A, null);
    noteHydratedOperation(A, OP_A);
    expect(readCacheScope()).toEqual({ userId: A, operationId: OP_A });
    noteHydratedOperation(A, OP_B); // never overwrites a known operation
    expect(readCacheScope()).toEqual({ userId: A, operationId: OP_A });
  });
});

describe('#478 in-flight pulls are discarded', () => {
  it('pullAllRemote() started before sign-out merges nothing afterwards', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const adapter = { isOnline: async () => true, pullAll: vi.fn(async table => { await gate; return table === 'operations' ? [{ id: OP_A, name: 'A', updated_at: '2026-11-01T00:00:00Z' }] : []; }), dispose: vi.fn() };
    store.setSyncAdapter(adapter);
    const pending = pullAllRemote();
    await Promise.resolve(); await Promise.resolve();
    clearLocalUserData();
    release();
    const result = await pending;
    expect(result.discarded).toBe(true);
    expect(store.getAll('operations')).toEqual([]);
    expect(localStorage.getItem('gtho_last_pulled_at')).toBeNull();
  });

  it('pullEntitiesStrict() from the previous session reports superseded and merges nothing', async () => {
    let release;
    sb.select = vi.fn(() => new Promise(r => { release = () => r({ data: [{ id: OP_A, name: 'A', updated_at: '2026-11-01T00:00:00Z' }], error: null }); }));
    store.setSyncAdapter({ isOnline: async () => true, dispose() {} });
    const pending = pullEntitiesStrict(['operations']);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    clearLocalUserData();
    release();
    expect(await pending).toMatchObject({ ok: false, error: 'superseded' });
    expect(store.getAll('operations')).toEqual([]);
  });

  it('a new pull after the wipe still runs', async () => {
    clearLocalUserData();
    store.setSyncAdapter({ isOnline: async () => true, pullAll: async table => (table === 'operations' ? [{ id: OP_B, name: 'B', updated_at: '2026-11-01T00:00:00Z' }] : []) });
    const result = await pullAllRemote();
    expect(result.discarded).toBeUndefined();
    expect(store.getAll('operations').map(o => o.id)).toEqual([OP_B]);
  });
});
