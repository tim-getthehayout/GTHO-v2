/** @file #478 — local cache ownership: wipe on sign-out and a persisted
 * (user_id, operation_id) scope guard, so one account's (or one operation's)
 * cached farm data, sync queue and drafts never show or flush under another.
 * Supabase's own `sb-*` auth keys are never touched.
 */
import { ENTITY_TYPES, clearEntities, beginBatch, endBatch, getSyncAdapter, setSyncAdapter } from './store.js';
import { clearStorage, loadFromStorage } from './local-storage.js';
import { invalidateRemotePulls } from './pull-remote.js';
import { logger } from '../utils/logger.js';

export const CACHE_SCOPE_KEY = 'gtho_v2_cache_scope';

/** Non-`gtho_v2_` localStorage keys that hold one account's app/sync/assistant state. */
export const USER_LOCAL_KEYS = Object.freeze([
  '_sync_queue', '_dead_letter_queue', '_resync_skipped', '_sync_unacked', '_log_buffer',
  'gtho_last_pulled_at', 'gtho_rollback_in_progress', 'gtho.oneTimeFix.paddockOrphanCleanupDone',
]);
export const USER_LOCAL_PREFIXES = Object.freeze(['gtho-assistant-feedback-draft:', 'gtho-voice-log:']);
/** Per-tab session keys. `gtho_invite_token`, the password-recovery flag and
 * `gtho_pwa_update_accepted` are kept on purpose. `dev-audit-event-search` is
 * the key the dev audit search actually uses (the brief's `gtho_dev_audit_search`
 * is cleared too, in case anything ever writes it). */
export const USER_SESSION_KEYS = Object.freeze(['gtho_session_id', 'gtho_field_mode_return', 'gtho_dev_audit_search', 'dev-audit-event-search']);

function safe(fn) { try { fn(); } catch { /* storage unavailable */ } }

/**
 * Drop every trace of the signed-in account's local data: in-memory store,
 * all `gtho_v2_*` keys (cache scope included), sync queue / dead letters /
 * unacked / resync-skipped, log buffer, last-pull stamp, rollback and
 * one-time-fix flags, assistant drafts and voice logs, and per-tab session
 * keys. Any in-flight remote pull is invalidated and the current sync
 * adapter is retired so nothing queued for this account can flush later.
 */
export function clearLocalUserData() {
  invalidateRemotePulls();
  const adapter = getSyncAdapter();
  safe(() => adapter?.dispose?.());
  setSyncAdapter(null);
  beginBatch();
  try { clearEntities(ENTITY_TYPES); } finally { endBatch(); }
  safe(() => clearStorage());
  safe(() => {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (USER_LOCAL_KEYS.includes(key) || USER_LOCAL_PREFIXES.some(p => key.startsWith(p)))) doomed.push(key);
    }
    doomed.forEach(key => localStorage.removeItem(key));
  });
  safe(() => USER_SESSION_KEYS.forEach(key => sessionStorage.removeItem(key)));
}

/** @returns {{ userId: string, operationId: string|null } | null} */
export function readCacheScope() {
  try {
    const scope = JSON.parse(localStorage.getItem(CACHE_SCOPE_KEY) || 'null');
    return scope && typeof scope.userId === 'string' ? { userId: scope.userId, operationId: scope.operationId ?? null } : null;
  } catch { return null; }
}

export function stampCacheScope(userId, operationId = null) {
  safe(() => localStorage.setItem(CACHE_SCOPE_KEY, JSON.stringify({ userId, operationId: operationId ?? null })));
}

/**
 * Ownership guard. Run before the sync queue flushes and before the store
 * hydrates from localStorage (boot, sign-in, any operation switch).
 * - scope for another user, or (active operation known) another operation → wipe, stamp.
 * - no scope yet (devices from before #478): a local member row for this user
 *   means the same user upgrading in place → stamp, keep offline writes;
 *   cached operations without one are another user's → wipe.
 * @param {string} userId
 * @param {string|null} [activeOperationId] operation confirmed for this user, when known
 * @returns {'kept'|'stamped'|'wiped'}
 */
export function enforceCacheScope(userId, activeOperationId = null) {
  if (!userId) return 'kept';
  const scope = readCacheScope();
  if (scope) {
    const otherUser = scope.userId !== userId;
    const otherOperation = !otherUser && activeOperationId != null && scope.operationId != null && scope.operationId !== activeOperationId;
    if (otherUser || otherOperation) {
      logger.info('auth', 'Local cache belongs to another account or operation; cleared', { reason: otherUser ? 'user' : 'operation' });
      clearLocalUserData();
      stampCacheScope(userId, activeOperationId);
      return 'wiped';
    }
    if (scope.operationId == null && activeOperationId != null) { stampCacheScope(userId, activeOperationId); return 'stamped'; }
    return 'kept';
  }
  const operations = loadFromStorage('operations');
  if (operations.length === 0) { stampCacheScope(userId, activeOperationId); return 'stamped'; }
  const ownsCache = loadFromStorage('operationMembers').some(member => member?.userId === userId);
  if (ownsCache) { stampCacheScope(userId, operations[0]?.id ?? null); return 'stamped'; }
  logger.info('auth', 'Local cache from another account found on upgrade; cleared');
  clearLocalUserData();
  stampCacheScope(userId, null);
  return 'wiped';
}

/** After onboarding or a strict pull hydrates the operation, record it on the scope. */
export function noteHydratedOperation(userId, operationId) {
  if (!userId || !operationId) return;
  const scope = readCacheScope();
  if (!scope || (scope.userId === userId && scope.operationId == null)) stampCacheScope(userId, operationId);
}
