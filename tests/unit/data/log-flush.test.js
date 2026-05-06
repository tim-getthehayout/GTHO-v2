/** @file OI-0150-C — `flushLoggerBuffer` writes the local logger buffer to
 * `app_logs`, decorates each row with user / operation / session / version,
 * leaves the buffer intact on insert failure, and prefers `sendBeacon` for
 * unload-time payloads when the size is small enough.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks — see audit-resolvers.test.js / logs.test.js for the same
// vi.hoisted pattern used to share state with vi.mock factories.
const ctrl = vi.hoisted(() => ({
  buffer: [],
  insertCalls: [],
  insertResult: { error: null },
  user: { id: 'user-A' },
  operation: { id: 'op-A' },
  beaconCalls: [],
}));

vi.mock('../../../src/data/supabase-client.js', () => ({
  supabase: {
    supabaseUrl: 'https://example.supabase.co',
    from: () => ({
      insert: (rows) => {
        ctrl.insertCalls.push(rows);
        return Promise.resolve(ctrl.insertResult);
      },
    }),
  },
}));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    getBuffer: () => ctrl.buffer,
    clearBuffer: () => { ctrl.buffer = []; },
    error: vi.fn(),
  },
}));
vi.mock('../../../src/data/store.js', () => ({
  getOperation: () => ctrl.operation,
}));
vi.mock('../../../src/features/auth/session.js', () => ({
  getUser: () => ctrl.user,
}));

import { flushLoggerBuffer } from '../../../src/data/log-flush.js';

beforeEach(() => {
  ctrl.buffer = [];
  ctrl.insertCalls = [];
  ctrl.insertResult = { error: null };
  ctrl.user = { id: 'user-A' };
  ctrl.operation = { id: 'op-A' };
  ctrl.beaconCalls = [];
  // Stub navigator.sendBeacon — record calls; signal success.
  globalThis.navigator.sendBeacon = (url, body) => {
    ctrl.beaconCalls.push({ url, size: body && body.size != null ? body.size : 0 });
    return true;
  };
  try { sessionStorage.setItem('gtho_session_id', 'session-A'); } catch { /* */ }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function entry(level, source, message, opts = {}) {
  return {
    level, source, message,
    context: opts.context || { ix: 1 },
    session_id: opts.session_id || null,
    created_at: opts.created_at || '2026-05-06T00:00:00Z',
  };
}

describe('flushLoggerBuffer (OI-0150-C)', () => {
  it('returns flushed=0 when the buffer is empty (no insert call)', async () => {
    const result = await flushLoggerBuffer();
    expect(result).toEqual({ flushed: 0, dropped: 0 });
    expect(ctrl.insertCalls.length).toBe(0);
  });

  it('batch-inserts buffer entries with decorated user/operation/session/version', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1'), entry('warn', 'sync', 'msg-2')];
    const result = await flushLoggerBuffer();
    expect(result.flushed).toBe(2);
    expect(ctrl.insertCalls.length).toBe(1);
    const rows = ctrl.insertCalls[0];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.user_id).toBe('user-A');
      expect(row.operation_id).toBe('op-A');
      expect(row.session_id).toBe('session-A');
      expect(row.app_version).toBeTruthy();
    }
  });

  it('clears the buffer on successful insert', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1')];
    await flushLoggerBuffer();
    // The mocked logger.clearBuffer assigns ctrl.buffer = [].
    expect(ctrl.buffer.length).toBe(0);
  });

  it('keeps the buffer intact on insert failure', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1'), entry('error', 'audit', 'msg-2')];
    ctrl.insertResult = { error: { message: 'rls denied' } };
    const result = await flushLoggerBuffer();
    expect(result.flushed).toBe(0);
    // Buffer NOT cleared — must be retried next flush.
    expect(ctrl.buffer.length).toBe(2);
  });

  it('preserves the entry-level session_id when present (OI-0150-C: stamped at createEntry time)', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1', { session_id: 'older-session-X' })];
    await flushLoggerBuffer();
    expect(ctrl.insertCalls[0][0].session_id).toBe('older-session-X');
  });

  it('falls back to current sessionStorage session_id when entry has none', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1', { session_id: null })];
    await flushLoggerBuffer();
    expect(ctrl.insertCalls[0][0].session_id).toBe('session-A');
  });

  it('handles null user / operation gracefully (defensive — pre-auth errors)', async () => {
    ctrl.user = null;
    ctrl.operation = null;
    ctrl.buffer = [entry('error', 'audit', 'msg-1')];
    await flushLoggerBuffer();
    const row = ctrl.insertCalls[0][0];
    expect(row.user_id).toBeNull();
    expect(row.operation_id).toBeNull();
  });

  it('uses sendBeacon for small payloads when opts.unloading is true', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1')];
    await flushLoggerBuffer({ unloading: true });
    expect(ctrl.beaconCalls.length).toBe(1);
    expect(ctrl.beaconCalls[0].url).toContain('/rest/v1/app_logs');
  });

  it('does NOT use sendBeacon when opts.unloading is false (regular fetch path only)', async () => {
    ctrl.buffer = [entry('error', 'audit', 'msg-1')];
    await flushLoggerBuffer();
    expect(ctrl.beaconCalls.length).toBe(0);
    expect(ctrl.insertCalls.length).toBe(1);
  });
});

describe('flushLoggerBuffer — gtho_session_id boot generation contract', () => {
  it('every flush in the same browser session shares one session_id (entries written before sessionStorage was set inherit current)', async () => {
    sessionStorage.setItem('gtho_session_id', 'session-stable-XYZ');
    ctrl.buffer = [
      entry('error', 'a', 'm1', { session_id: null }),
      entry('error', 'b', 'm2', { session_id: null }),
    ];
    await flushLoggerBuffer();
    expect(ctrl.insertCalls[0][0].session_id).toBe('session-stable-XYZ');
    expect(ctrl.insertCalls[0][1].session_id).toBe('session-stable-XYZ');
  });
});
