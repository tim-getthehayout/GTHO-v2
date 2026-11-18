/**
 * Sync durability: queue-first saves (A), the session check and 0-row
 * updates (B), and "Resync to server" sending only this device's
 * unconfirmed work (D). Mock Supabase client only; no SQL or live DB access.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const srv = vi.hoisted(() => ({
  rows: new Map(), log: [], reads: [], hidden: new Set(), session: true,
  hangNext: 0, failNext: 0, failFor: null, authNext: 0, holdNext: 0, holds: [], readFail: null, epoch: 0, delays: null,
}));

vi.mock('../../src/data/supabase-client.js', () => {
  const key = (t, id) => `${t}/${id}`;
  const pick = (row, cols) => Object.fromEntries(cols.split(',').map(c => [c, row[c]]));
  function write(table, op, payload, id) {
    return async () => {
      const rowId = id ?? payload?.id;
      const epoch = srv.epoch;
      if (srv.hangNext > 0) { srv.hangNext--; srv.log.push({ table, op, id: rowId, hung: true }); return new Promise(() => {}); }
      if (srv.delays) await new Promise(r => setTimeout(r, srv.delays()));
      if (srv.holdNext > 0) { srv.holdNext--; await new Promise(r => srv.holds.push(r)); }
      // The tab that sent it was reloaded before the request landed.
      if (epoch !== srv.epoch) return new Promise(() => {});
      if (srv.authNext > 0) { srv.authNext--; srv.log.push({ table, op, id: rowId, auth: true }); return { error: { code: 'PGRST301', message: 'JWT expired' } }; }
      if (srv.failNext > 0 && (!srv.failFor || srv.failFor === rowId)) { srv.failNext--; srv.log.push({ table, op, id: rowId, failed: true }); return { error: { message: 'Internal server error (500)' } }; }
      const k = key(table, rowId);
      const visible = srv.rows.has(k) && !srv.hidden.has(k);
      let data = null;
      if (op === 'insert') {
        if (srv.rows.has(k)) { srv.log.push({ table, op, id: rowId, duplicate: true }); return { error: { code: '23505', message: 'duplicate key value violates unique constraint "x_pkey"' } }; }
        srv.rows.set(k, { ...payload });
      } else if (op === 'update') {
        data = visible ? [{ id: rowId }] : [];
        if (visible) srv.rows.set(k, { ...srv.rows.get(k), ...payload });
      } else if (op === 'upsert') {
        srv.rows.set(k, { ...(srv.rows.get(k) || {}), ...payload });
      } else if (op === 'delete') {
        data = visible ? [{ id: rowId }] : [];
        if (visible) srv.rows.delete(k);
      }
      srv.log.push({ table, op, id: rowId, rec: payload ? { ...payload } : null });
      return { error: null, data };
    };
  }
  const chain = fn => ({ then: (a, b) => fn().then(a, b), eq() { return this; }, select() { return this; } });
  const supabase = {
    auth: { getSession: async () => ({ data: { session: srv.session ? { access_token: 'test-token' } : null }, error: null }) },
    from(table) {
      return {
        insert: p => chain(write(table, 'insert', p)),
        upsert: p => chain(write(table, 'upsert', p)),
        update: p => ({ eq: (_c, id) => chain(write(table, 'update', p, id)) }),
        delete: () => ({ eq: (_c, id) => chain(write(table, 'delete', null, id)) }),
        select: cols => ({
          in: (_c, ids) => chain(async () => {
            srv.reads.push({ table, cols, ids: [...ids] });
            if (srv.readFail === table) return { data: null, error: { message: 'Internal server error (500)' } };
            return { data: ids.filter(id => srv.rows.has(key(table, id))).map(id => pick(srv.rows.get(key(table, id)), cols)), error: null };
          }),
          gt: async (_c, since) => ({ data: [...srv.rows.entries()].filter(([k, row]) => k.startsWith(`${table}/`) && row.updated_at > since).map(([, row]) => ({ ...row })), error: null }),
        }),
      };
    },
  };
  return { supabase };
});

vi.mock('../../src/data/pull-remote.js', async (importOriginal) => ({ ...(await importOriginal()), pullAllRemote: vi.fn(async () => ({ pulled: 0, errors: 0 })) }));

import { CustomSync, ZERO_ROWS_REASON, NO_UPDATED_AT_TABLES, isAuthError } from '../../src/data/custom-sync.js';
import { commitDurableWrite, recoverDurableWrite } from '../../src/data/local-storage.js';
import { resetWriteOrderClock } from '../../src/data/write-order.js';
import { _reset, init, setSyncAdapter, update, add, remove, mergeRemote, getById, runDurableWrite } from '../../src/data/store.js';
import { ackMark, markEntries, UNACKED_KEY } from '../../src/data/unacked.js';
import { resyncSkippedExport } from '../../src/data/push-all.js';
import { pullAllRemote } from '../../src/data/pull-remote.js';
import { handleResyncClick } from '../../src/features/settings/index.js';
import * as Animal from '../../src/entities/animal.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { logger } from '../../src/utils/logger.js';

const T = 'event_group_windows';
const OPID = '00000000-0000-4000-8000-0000000000aa';
const AID = 'cccccccc-0000-4000-8000-000000000001';
const ts = (h, m = 0) => `2026-11-17T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const row = (id, h, extra = {}) => ({ id, v: h, updated_at: ts(h), ...extra });
const k = (id, table = T) => `${table}/${id}`;
const q = () => JSON.parse(localStorage.getItem('_sync_queue') || '[]');
const dl = () => JSON.parse(localStorage.getItem('_dead_letter_queue') || '[]');
const marks = () => Object.values(JSON.parse(localStorage.getItem(UNACKED_KEY) || '{}'));
const writes = id => srv.log.filter(e => (id == null || e.id === id) && !e.hung && !e.failed && !e.auth);
const tick = async (n = 30) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function makeSync({ online = true } = {}) {
  const sync = new CustomSync();
  sync.online = online;
  vi.spyOn(sync, 'isOnline').mockImplementation(async () => sync.online);
  return sync;
}
/** A page reload: in-flight requests of the old tab never land, memory is gone. */
function reload() {
  srv.epoch++;
  resetWriteOrderClock();
  _reset();
  init();
  const sync = makeSync();
  setSyncAdapter(sync);
  return sync;
}
const entry = (record, operation, at, extra = {}) => ({ id: record.id, table: extra.table || T, operation, record, enqueued_at: at, attempts: 0, errors: [], ...extra });
const letter = (record, extra = {}) => ({ id: record.id, table: T, record, error: 'x', retry_count: 5, dead_lettered_at: record.updated_at || ts(1), auto_drain_count: 3, ...extra });
function seed({ queue = [], letters = [], marked = [] } = {}) {
  localStorage.setItem('_sync_queue', JSON.stringify(queue));
  localStorage.setItem('_dead_letter_queue', JSON.stringify(letters));
  markEntries(marked);
}
const animal = (changes = {}) => Animal.create({ id: AID, operationId: OPID, sex: 'female', tagNum: '7', isBulk: false, updatedAt: ts(8), ...changes });

beforeEach(() => {
  localStorage.clear();
  resetWriteOrderClock();
  _reset();
  document.body.replaceChildren();
  setLocale('en', en);
  Object.assign(srv, { session: true, hangNext: 0, failNext: 0, failFor: null, authNext: 0, holdNext: 0, readFail: null, delays: null });
  srv.rows.clear(); srv.log.length = 0; srv.reads.length = 0; srv.hidden.clear(); srv.holds.length = 0;
  pullAllRemote.mockClear();
});

afterEach(() => {
  setSyncAdapter(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('A: queue-first', () => {
  it('A1: an online Edit Animal save whose request never returns survives a reload; the boot flush sends it', async () => {
    let sync = makeSync(); setSyncAdapter(sync);
    mergeRemote('animals', [animal()]); srv.rows.set(k(AID, 'animals'), Animal.toSupabaseShape(animal()));
    srv.hangNext = 1;
    update('animals', AID, { notes: 'new value' }, Animal.validate, Animal.toSupabaseShape, 'animals');
    expect(q()).toHaveLength(1);
    await tick();
    expect(srv.log.at(-1)).toMatchObject({ op: 'update', hung: true });
    sync = reload();
    expect(q()).toHaveLength(1);
    await sync.flush();
    expect(srv.rows.get(k(AID, 'animals')).notes).toBe('new value');
    expect(q()).toEqual([]); expect(dl()).toEqual([]);
  });

  it('A2: a reload during backoff after a failed attempt, or mid-send ("Update now"), loses nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let sync = makeSync(); setSyncAdapter(sync);
    srv.rows.set(k('r1'), row('r1', 9));
    srv.failNext = 1;
    sync.push(T, row('r1', 10), 'update');
    await tick();
    expect(srv.log).toEqual([expect.objectContaining({ failed: true })]);
    expect(q()).toHaveLength(1); expect(q()[0].attempts).toBe(0);
    sync = reload();
    srv.hangNext = 1;
    sync.push(T, row('r2', 11), 'upsert');
    await tick();
    sync = reload();
    await sync.flush();
    expect(srv.rows.get(k('r1')).v).toBe(10); expect(srv.rows.get(k('r2')).v).toBe(11);
    expect(q()).toEqual([]); expect(dl()).toEqual([]);
  });

  it('A3: when the queue write throws (quota) the save fails visibly; local row and state are unchanged', async () => {
    const sync = makeSync(); setSyncAdapter(sync);
    mergeRemote('animals', [animal()]);
    const before = localStorage.getItem('gtho_v2_animals');
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === '_sync_queue') throw new DOMException('quota', 'QuotaExceededError');
      return setItem.call(this, key, value);
    });
    expect(() => update('animals', AID, { notes: 'lost?' }, Animal.validate, Animal.toSupabaseShape, 'animals')).toThrow();
    expect(getById('animals', AID).notes).toBeFalsy();
    expect(localStorage.getItem('gtho_v2_animals')).toBe(before);
    expect(q()).toEqual([]); expect(marks()).toEqual([]);
    await tick();
    expect(srv.log).toEqual([]);
  });

  it('A4: a durable write reaches the server with no online, visibility or tap event', async () => {
    const sync = makeSync(); setSyncAdapter(sync);
    const events = vi.spyOn(window, 'dispatchEvent');
    runDurableWrite(JSON.stringify([OPID, 'calving', 'k1', 1]), () => {
      add('animals', animal({ updatedAt: ts(9) }), Animal.validate, Animal.toSupabaseShape, 'animals');
      return AID;
    });
    await vi.waitFor(() => expect(srv.rows.get(k(AID, 'animals'))).toMatchObject({ id: AID, tag_num: '7' }));
    expect(events).not.toHaveBeenCalled();
    expect(q()).toEqual([]);
  });

  it('A4: every F9 durable writer goes through runDurableWrite (the one central flush trigger)', () => {
    for (const file of ['animals/index.js', 'amendments/entry.js', 'feed/check.js', 'events/feed-entry-inline-form.js', 'events/move-feed-out.js', 'health/calving.js',
      'feed/pool-forms.js', 'feed/pool-ledger.js', 'events/close.js', 'events/move-wizard.js', 'events/submove.js', 'feed/delivery.js']) {
      expect(readFileSync(`${process.cwd()}/src/features/${file}`, 'utf8'), file).toMatch(/runDurableWrite\(/);
    }
  });

  it('A4: nothing outside src/data/ writes _sync_queue or calls commitDurableWrite; the F9 writers have at least 13 runDurableWrite call sites', () => {
    const offenders = [];
    for (const rel of readdirSync(`${process.cwd()}/src`, { recursive: true })) {
      const file = String(rel);
      if (!file.endsWith('.js') || file.startsWith('data/')) continue;
      const text = readFileSync(`${process.cwd()}/src/${file}`, 'utf8');
      if (/_sync_queue|commitDurableWrite/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    const sites = ['animals/index.js', 'amendments/entry.js', 'feed/check.js', 'events/feed-entry-inline-form.js', 'events/move-feed-out.js', 'health/calving.js',
      'feed/pool-forms.js', 'feed/pool-ledger.js', 'events/close.js', 'events/move-wizard.js', 'events/submove.js', 'feed/delivery.js']
      .reduce((n, file) => n + (readFileSync(`${process.cwd()}/src/features/${file}`, 'utf8').match(/runDurableWrite\(/g) || []).length, 0);
    expect(sites).toBeGreaterThanOrEqual(13);
  });

  it('A2/D10: a durable write whose mark write fails once is still marked when the journal replays', () => {
    const setItem = Storage.prototype.setItem;
    let failOnce = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === UNACKED_KEY && failOnce) { failOnce = false; throw new DOMException('quota', 'QuotaExceededError'); }
      return setItem.call(this, key, value);
    });
    const key = JSON.stringify([OPID, 'calving', 'k-mark', 1]);
    expect(() => commitDurableWrite(key, {}, [{ table: T, record: row('dw', 10), operation: 'insert' }], 'dw')).toThrow();
    expect(q().map(e => e.id)).toEqual(['dw']);
    expect(marks()).toEqual([]);
    recoverDurableWrite();
    expect(marks()).toEqual([expect.objectContaining({ table: T, id: 'dw', create: true })]);
    expect(q()).toHaveLength(1);
  });

  it('A5: saves made while a flush awaits the network (online and offline, not durable) stay queued and a follow-up flush sends them', async () => {
    const sync = makeSync();
    srv.holdNext = 1;
    sync.push(T, row('a', 10), 'upsert');
    await vi.waitFor(() => expect(srv.holds).toHaveLength(1));
    const first = sync.flush();
    sync.push(T, row('b', 11), 'upsert');
    sync.online = false;
    sync.enqueueWrite(T, row('c', 12), 'upsert');
    sync.online = true;
    expect(q().map(e => e.id)).toEqual(['a', 'b', 'c']);
    expect(q().every(e => !e.durable_key)).toBe(true);
    srv.holds.shift()();
    await first;
    expect([...srv.rows.keys()].sort()).toEqual([k('a'), k('b'), k('c')]);
    expect(q()).toEqual([]);
  });

  it('A6: a create that landed but was not pruned is re-sent harmlessly: no dead letter, server row unchanged', async () => {
    srv.rows.set(k('n1'), row('n1', 12, { v: 'newer from another device' }));
    seed({ queue: [entry(row('n1', 10), 'insert', ts(10))] });
    const sync = makeSync();
    await sync.flush();
    expect(srv.log).toEqual([expect.objectContaining({ op: 'insert', duplicate: true })]);
    expect(srv.rows.get(k('n1')).v).toBe('newer from another device');
    expect(dl()).toEqual([]); expect(q()).toEqual([]);
  });

  it('A7: ten rapid updates to one row with random delays and a reload after the fifth: the server ends with the tenth', async () => {
    srv.rows.set(k('w'), row('w', 1));
    srv.delays = () => Math.floor(Math.random() * 4);
    let sync = makeSync(); setSyncAdapter(sync);
    for (let i = 1; i <= 5; i++) sync.push(T, { id: 'w', v: i, updated_at: ts(10, i) }, 'update');
    await new Promise(r => setTimeout(r, 2));
    sync = reload();
    for (let i = 6; i <= 10; i++) { sync.push(T, { id: 'w', v: i, updated_at: ts(10, i) }, 'update'); await new Promise(r => setTimeout(r, Math.random() * 2)); }
    await vi.waitFor(async () => { await sync.flush(); expect(q()).toEqual([]); });
    expect(srv.rows.get(k('w')).v).toBe(10);
    expect(dl()).toEqual([]);
  });

  it('A8: a no-updated_at row saved twice with a reload between is sent in order; the clock never steps back', async () => {
    const table = 'batch_moves';
    let sync = makeSync({ online: false });
    sync.push(table, { id: 'm', qty: 1 }, 'upsert');
    const firstOrder = q()[0].enqueued_at;
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(firstOrder) - 60_000);
    sync = reload(); sync.online = false;
    sync.push(table, { id: 'm', qty: 2 }, 'upsert');
    expect(Date.parse(q()[1].enqueued_at)).toBeGreaterThan(Date.parse(firstOrder));
    sync.online = true;
    await sync.flush();
    expect(writes('m').map(e => e.rec.qty)).toEqual([1, 2]);
    expect(srv.rows.get(k('m', table)).qty).toBe(2);
  });

  it('A9: an online delete with a reload before the response: the row is deleted on the next start', async () => {
    srv.rows.set(k('d'), row('d', 9));
    let sync = makeSync();
    srv.hangNext = 1;
    sync.delete(T, 'd');
    await tick();
    sync = reload();
    await sync.flush();
    expect(srv.rows.has(k('d'))).toBe(false); expect(q()).toEqual([]);
  });

  it('A10: offline save then reconnect: queued with no request, sent on reconnect', async () => {
    const sync = makeSync({ online: false });
    const result = await sync.push(T, row('o', 10), 'upsert');
    expect(result).toMatchObject({ success: true, queued: true });
    expect(srv.log).toEqual([]); expect(q()).toHaveLength(1);
    sync.online = true;
    await sync.flush();
    expect(srv.rows.get(k('o')).v).toBe(10); expect(q()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('B: session check and 0-row updates', () => {
  it('B1: no session: no request, entry kept with attempts unchanged, no dead letter, signed-out header state; after sign-in it is sent', async () => {
    srv.session = false;
    const sync = makeSync();
    sync.push(T, row('s', 10), 'upsert');
    await sync.flush();
    expect(srv.log).toEqual([]);
    expect(q()).toEqual([expect.objectContaining({ id: 's', attempts: 0 })]);
    expect(dl()).toEqual([]);
    expect(sync.getSyncHealth()).toMatchObject({ status: 'signedOut', queueLength: 1, deadLetterCount: 0 });
    expect(en.sync.signedOut).toBe('Signed out · {count} changes waiting');
    srv.session = true;
    await sync.flush(); // what main.js runs on SIGNED_IN
    expect(srv.rows.get(k('s')).v).toBe(10); expect(q()).toEqual([]);
    expect(sync.getSyncHealth().status).toBe('idle');
  });

  it('B2: a JWT-expired answer keeps the write queued, not dead-lettered, attempts unchanged; sent after TOKEN_REFRESHED', async () => {
    srv.authNext = 1;
    const sync = makeSync();
    const result = await sync.push(T, row('j', 10), 'upsert');
    expect(result).toMatchObject({ success: false, auth: true });
    expect(q()).toEqual([expect.objectContaining({ id: 'j', attempts: 0 })]);
    expect(dl()).toEqual([]);
    expect(sync.getSyncHealth().status).toBe('signedOut');
    await sync.flush();
    expect(srv.rows.get(k('j')).v).toBe(10); expect(q()).toEqual([]);
  });

  it('B2: only real session errors count as auth (401, PGRST301-303, JWT expired/invalid/malformed)', () => {
    expect(isAuthError({ status: 401, message: 'x' })).toBe(true);
    expect(isAuthError({ code: 'PGRST301', message: 'x' })).toBe(true);
    expect(isAuthError({ message: 'JWT expired' })).toBe(true);
    expect(isAuthError({ message: 'invalid JWT: unable to parse or verify signature' })).toBe(true);
    expect(isAuthError({ message: 'JWT malformed' })).toBe(true);
    expect(isAuthError({ message: 'function public.jwt_claims() does not exist' })).toBe(false);
    expect(isAuthError({ message: 'column "jwt" does not exist' })).toBe(false);
    expect(isAuthError({ message: 'Internal server error (500)' })).toBe(false);
  });

  it('B3: an RLS 0-row update dead-letters at once with zero_rows, is not marked sent, and prunes nothing', async () => {
    srv.rows.set(k('h'), row('h', 9)); srv.hidden.add(k('h'));
    const sync = makeSync();
    const markSent = vi.spyOn(sync, '_markSent');
    const older = sync.push(T, row('h', 10), 'update');
    const newer = sync.push(T, row('h', 11), 'update');
    await Promise.all([older, newer]);
    expect(srv.log.filter(e => e.op === 'update')).toHaveLength(2);
    expect(dl()).toEqual([expect.objectContaining({ reason: ZERO_ROWS_REASON, retry_count: 1 }), expect.objectContaining({ reason: ZERO_ROWS_REASON, retry_count: 1 })]);
    expect(markSent).not.toHaveBeenCalled();
    expect(marks()).toEqual([expect.objectContaining({ id: 'h', stamp: ts(11) })]);
    expect(sync.getSyncHealth().deadLetterCount).toBe(2);
    expect(srv.rows.get(k('h')).v).toBe(9);
  });

  it('B4/B8: an update to a row deleted on the server (another device) dead-letters; drain and manual retry replay it only as update; never recreated', async () => {
    srv.rows.set(k('g'), row('g', 9));
    srv.rows.delete(k('g')); // device A deleted it
    const sync = makeSync();
    await sync.push(T, row('g', 10), 'update');
    expect(dl()).toEqual([expect.objectContaining({ reason: ZERO_ROWS_REASON, operation: 'update' })]);
    expect(sync.getSyncHealth().deadLetterCount).toBe(1);
    await sync.flush(); // auto-drain
    sync.retryDeadLetters(); await sync.flush(); // manual retry
    const ops = srv.log.filter(e => e.id === 'g').map(e => e.op);
    expect(ops.length).toBeGreaterThanOrEqual(3);
    expect(ops.every(op => op === 'update')).toBe(true);
    expect(srv.rows.has(k('g'))).toBe(false);
    expect(dl()).toHaveLength(1);
  });

  it('B5: an update while the row\'s create is unconfirmed is sent as upsert and succeeds', async () => {
    seed({ letters: [letter(row('c5', 9), { operation: 'insert', shape: 'insert', auto_drain_count: 3 })] });
    const sync = makeSync();
    const result = await sync.push(T, row('c5', 10), 'update');
    expect(result.success).toBe(true);
    expect(srv.log.find(e => e.id === 'c5').op).toBe('upsert');
    expect(srv.rows.get(k('c5')).v).toBe(10);
  });

  it('B6: a 1-row update is marked sent and older queued saves and letters are pruned', async () => {
    srv.rows.set(k('p'), row('p', 8));
    seed({ queue: [entry(row('p', 11), 'update', ts(11)), entry(row('p', 10), 'update', ts(10))], letters: [letter(row('p', 9))] });
    const sync = makeSync();
    const markSent = vi.spyOn(sync, '_markSent');
    await sync.flush();
    expect(markSent).toHaveBeenCalled();
    expect(writes('p').map(e => e.rec.v)).toEqual([11]);
    expect(q()).toEqual([]); expect(dl()).toEqual([]);
    expect(srv.rows.get(k('p')).v).toBe(11);
  });

  it('B7: the dead-letter drain applies the same 0-row and auth rules', async () => {
    srv.rows.set(k('x'), row('x', 8)); srv.hidden.add(k('x'));
    seed({ letters: [letter(row('x', 10), { operation: 'update', reason: ZERO_ROWS_REASON, auto_drain_count: 0 })] });
    const sync = makeSync();
    srv.authNext = 1;
    await sync.flush();
    expect(dl()[0].auto_drain_count).toBe(0);
    expect(sync.getSyncHealth().deadLetterCount).toBe(1);
    await sync.flush();
    expect(dl()[0]).toMatchObject({ reason: ZERO_ROWS_REASON, auto_drain_count: 1 });
    expect(srv.log.filter(e => e.id === 'x').every(e => e.op === 'update')).toBe(true);
  });

  it('B6 (deletes): a delete matching 0 rows is a success, logged at info', async () => {
    const info = vi.spyOn(logger, 'info');
    const sync = makeSync();
    const result = await sync.delete(T, 'missing');
    expect(result.success).toBe(true);
    expect(dl()).toEqual([]); expect(q()).toEqual([]);
    expect(info).toHaveBeenCalledWith('sync', 'Delete matched no rows', expect.not.objectContaining({ id: expect.anything() }));
  });

  it('B9: device B\'s session lapsed; the save is kept across a reload, lands after re-login, and device A sees it on pull', async () => {
    mergeRemote('animals', [animal({ confirmedBred: false })]); srv.rows.set(k(AID, 'animals'), Animal.toSupabaseShape(animal({ confirmedBred: false })));
    srv.session = false;
    let sync = makeSync(); setSyncAdapter(sync);
    update('animals', AID, { confirmedBred: true }, Animal.validate, Animal.toSupabaseShape, 'animals');
    await sync.flush();
    expect(srv.rows.get(k(AID, 'animals')).confirmed_bred).toBe(false);
    sync = reload();
    srv.session = true;
    await sync.flush();
    expect(srv.rows.get(k(AID, 'animals')).confirmed_bred).toBe(true);
    const deviceA = makeSync();
    expect((await deviceA.pull('animals', ts(8))).find(r => r.id === AID).confirmed_bred).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('D: Resync sends only unconfirmed work', () => {
  const local = new Map();
  const localRow = (table, id) => local.get(`${table}/${id}`) || null;
  const resync = async (sync) => sync.runExclusive(async () => {
    const plan = await sync.planResync(localRow);
    return { plan, outcome: plan.ok ? await sync.applyResync(plan) : null };
  });
  beforeEach(() => local.clear());

  function mixedSet() {
    srv.rows.set(k('r1'), row('r1', 10));
    srv.rows.set(k('r2'), row('r2', 12));
    srv.rows.set(k('r3'), row('r3', 11));
    srv.rows.set(k('r4'), row('r4', 10));
    local.set(k('r4'), row('r4', 13));
    seed({
      queue: [entry(row('r1', 11), 'update', ts(11)), entry(row('r2', 11), 'update', ts(11)), entry(row('r5', 11), 'insert', ts(11))],
      letters: [letter(row('r3', 11), { operation: 'update' }), letter(row('r6', 11), { operation: 'update', reason: ZERO_ROWS_REASON })],
      marked: [entry(row('r4', 13), 'update', ts(13))],
    });
  }

  it('D1: mixed set: N=3, M=2, G=1; exactly those 3 land; older/equal leave the server alone; the gone row is not recreated', async () => {
    mixedSet();
    const before2 = { ...srv.rows.get(k('r2')) }, before3 = { ...srv.rows.get(k('r3')) };
    const sync = makeSync();
    const { plan, outcome } = await resync(sync);
    expect(plan.counts).toEqual({ send: 3, skip: 2, existing: 0, gone: 1, cantCompare: 0 });
    expect(outcome).toEqual({ sent: 3, skipped: 2, failed: 0, gone: 1, cantCompare: 0, waiting: 0 });
    expect(writes().map(e => e.id).sort()).toEqual(['r1', 'r4', 'r5']);
    expect(srv.rows.get(k('r2'))).toEqual(before2); expect(srv.rows.get(k('r3'))).toEqual(before3);
    expect(srv.rows.has(k('r6'))).toBe(false);
    expect(dl()).toEqual([expect.objectContaining({ id: 'r6', reason: ZERO_ROWS_REASON })]);
  });

  it('D2/D3: rows outside the set (no entry, letter or mark), newer or missing on the server, are never read, counted or sent (the 23 Jun replay)', async () => {
    srv.rows.set(k('old'), row('old', 9));
    local.set(k('old'), row('old', 12)); local.set(k('missing'), row('missing', 12));
    const sync = makeSync();
    const { plan, outcome } = await resync(sync);
    expect(plan.items).toEqual([]); expect(plan.counts.send).toBe(0);
    expect(outcome.sent).toBe(0);
    expect(srv.reads).toEqual([]); expect(srv.log).toEqual([]);
  });

  it('D5: no-updated_at tables: a queued create missing on the server is sent; a change to an existing server row never is', async () => {
    expect(NO_UPDATED_AT_TABLES).toEqual(['event_feed_check_items', 'batch_moves', 'batch_adjustments', 'todo_assignments']);
    const table = 'batch_adjustments';
    srv.rows.set(k('exists', table), { id: 'exists', qty: 1 });
    seed({ queue: [entry({ id: 'new', qty: 5 }, 'insert', ts(10), { table }), entry({ id: 'exists', qty: 9 }, 'upsert', ts(10), { table }), entry({ id: 'exists2', qty: 9 }, 'update', ts(10), { table })] });
    srv.rows.set(k('exists2', table), { id: 'exists2', qty: 1 });
    const sync = makeSync();
    const { plan } = await resync(sync);
    expect(srv.reads.every(r => r.cols === 'id')).toBe(true);
    expect(plan.counts).toMatchObject({ send: 1, skip: 0, existing: 2 });
    expect(writes().map(e => e.id)).toEqual(['new']);
    expect(srv.rows.get(k('exists', table)).qty).toBe(1); expect(srv.rows.get(k('exists2', table)).qty).toBe(1);
  });

  it('D6: a failed server read aborts with nothing sent and names the table; no session refuses with no read and no send', async () => {
    mixedSet();
    srv.readFail = T;
    const sync = makeSync();
    let { plan } = await resync(sync);
    expect(plan).toEqual({ ok: false, reason: 'readFailed', table: T });
    expect(srv.log).toEqual([]);
    srv.readFail = null; srv.session = false; srv.reads.length = 0;
    ({ plan } = await resync(sync));
    expect(plan).toEqual({ ok: false, reason: 'signedOut' });
    expect(srv.reads).toEqual([]); expect(srv.log).toEqual([]);
  });

  it('D7: sent items keep their own local updated_at', async () => {
    mixedSet();
    await resync(makeSync());
    expect(srv.rows.get(k('r1')).updated_at).toBe(ts(11));
    expect(srv.rows.get(k('r4')).updated_at).toBe(ts(13));
  });

  it('D8: the result is awaited: a send failing 5 times and one hitting 0 rows are both failed and dead-lettered with reasons', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    srv.rows.set(k('f1'), row('f1', 9)); srv.rows.set(k('f2'), row('f2', 9)); srv.hidden.add(k('f2')); srv.rows.set(k('ok'), row('ok', 9));
    seed({ queue: [entry(row('f1', 10), 'update', ts(10)), entry(row('f2', 10), 'update', ts(10)), entry(row('ok', 10), 'update', ts(10))] });
    srv.failNext = 5; srv.failFor = 'f1';
    const running = resync(makeSync());
    await vi.advanceTimersByTimeAsync(20_000);
    const { outcome } = await running;
    expect(outcome).toMatchObject({ sent: 1, skipped: 0, failed: 2, waiting: 0 });
    expect(dl().map(l => [l.id, l.reason || null, l.error])).toEqual([
      ['f2', ZERO_ROWS_REASON, expect.stringContaining('0 rows')],
      ['f1', null, 'Internal server error (500)'],
    ]);
  });

  it('D8: an auth failure mid-run is reported as waiting for sign-in, not failed, and stays queued', async () => {
    srv.rows.set(k('a1'), row('a1', 9));
    seed({ queue: [entry(row('a1', 10), 'update', ts(10))] });
    srv.authNext = 1;
    const sync = makeSync();
    const { outcome } = await resync(sync);
    expect(outcome).toMatchObject({ sent: 0, failed: 0, waiting: 1 });
    expect(q()).toHaveLength(1); expect(dl()).toEqual([]);
    expect(sync.getSyncHealth().status).toBe('signedOut');
  });

  it('D9: skipped items leave the queue and letters and appear in the "skipped by Resync" export', async () => {
    mixedSet();
    const sync = makeSync(); setSyncAdapter(sync);
    await resync(sync);
    expect(q().map(e => e.id)).not.toContain('r2');
    expect(dl().map(l => l.id)).not.toContain('r3');
    const exported = JSON.parse(resyncSkippedExport());
    expect(exported.items.map(i => i.id).sort()).toEqual(['r2', 'r3']);
    expect(exported.items[0].record).toBeTruthy();
  });

  it('D10: the ack marker survives reload; only a confirmed send of the same or newer version clears it; 0 rows, a dead letter or a superseded drop never do', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    srv.rows.set(k('m1'), row('m1', 9)); srv.hidden.add(k('m1'));
    let sync = makeSync();
    sync.online = false;
    sync.push(T, row('m1', 10), 'update'); sync.push(T, row('m2', 10), 'upsert'); sync.push(T, row('m3', 12), 'upsert');
    sync = reload(); sync.online = false;
    expect(marks().map(m => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
    // m1: 0 rows; m2: 5 failures -> dead letter; m3: an older copy is superseded.
    srv.failNext = 5; srv.failFor = 'm2';
    sync.online = true;
    const run = sync.flush();
    await vi.advanceTimersByTimeAsync(20_000); await run;
    expect(srv.rows.get(k('m3')).v).toBe(12);
    expect(marks().map(m => m.id).sort()).toEqual(['m1', 'm2']);
    // (the m2 letter is past auto-drain, so this flush doesn't re-send it)
    seed({ queue: [entry(row('m3', 11), 'upsert', ts(11))], letters: dl().map(l => ({ ...l, auto_drain_count: 3 })) });
    markEntries([entry(row('m3', 13), 'update', ts(13))]);
    await sync.flush();
    expect(marks().map(m => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
    ackMark(T, 'm3', ts(12), null, false);
    expect(marks().map(m => m.id)).toContain('m3');
    ackMark(T, 'm3', ts(13), null, false);
    expect(marks().map(m => m.id)).not.toContain('m3');
  });

  it('D11: Resync twice in a row: the second shows N = 0', async () => {
    mixedSet();
    const sync = makeSync();
    await resync(sync);
    const { plan } = await resync(sync);
    expect(plan.counts.send).toBe(0);
  });

  it('D12 (two devices): stale B edits notes stamped before A\'s Confirmed bred: Resync skips and lists it; the server keeps true', async () => {
    srv.rows.set(k(AID, 'animals'), Animal.toSupabaseShape(animal({ confirmedBred: true, updatedAt: ts(12) })));
    const b = makeSync({ online: false }); setSyncAdapter(b);
    mergeRemote('animals', [animal({ confirmedBred: false })]);
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(ts(11));
    update('animals', AID, { notes: 'B notes' }, Animal.validate, Animal.toSupabaseShape, 'animals');
    vi.mocked(Date.prototype.toISOString).mockRestore();
    b.online = true;
    const { plan, outcome } = await resync(b);
    expect(plan.counts).toMatchObject({ send: 0, skip: 1 });
    expect(outcome).toMatchObject({ sent: 0, skipped: 1 });
    expect(srv.rows.get(k(AID, 'animals')).confirmed_bred).toBe(true);
    expect(b.getResyncSkipped().map(i => i.id)).toEqual([AID]);
  });

  it('D13 (two devices, known limit): B\'s edit stamped after A\'s is sent, and carries the stale confirmed_bred = false', async () => {
    srv.rows.set(k(AID, 'animals'), Animal.toSupabaseShape(animal({ confirmedBred: true, updatedAt: ts(12) })));
    const b = makeSync({ online: false }); setSyncAdapter(b);
    mergeRemote('animals', [animal({ confirmedBred: false })]);
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(ts(13));
    update('animals', AID, { notes: 'B notes' }, Animal.validate, Animal.toSupabaseShape, 'animals');
    vi.mocked(Date.prototype.toISOString).mockRestore();
    b.online = true;
    const { outcome } = await resync(b);
    expect(outcome).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    // Reported as sent; not safe: the stale flag overwrote A's. Closed by the server stale-write guard later.
    expect(srv.rows.get(k(AID, 'animals'))).toMatchObject({ notes: 'B notes', confirmed_bred: false });
  });

  it('blocker 1: a save made after the plan is never dropped by a skip or a gone; its mark stays', async () => {
    srv.rows.set(k('r2'), row('r2', 12));
    seed({ queue: [entry(row('r2', 11), 'update', ts(11))], letters: [letter(row('g', 11), { operation: 'update', reason: ZERO_ROWS_REASON })] });
    const sync = makeSync();
    const plan = await sync.planResync(localRow);
    expect(plan.items.map(i => [i.id, i.action]).sort()).toEqual([['g', 'gone'], ['r2', 'skip']]);
    sync.online = false;
    sync.enqueueWrite(T, row('r2', 13), 'update');
    sync.enqueueWrite(T, row('g', 12), 'update');
    await tick();
    const outcome = await sync.applyResync(plan);
    expect(outcome).toMatchObject({ skipped: 1, gone: 1, sent: 0 });
    expect(q().map(e => [e.id, e.record.v])).toEqual([['r2', 13], ['g', 12]]);
    expect(marks().find(m => m.id === 'r2')).toMatchObject({ stamp: ts(13) });
    expect(sync.getResyncSkipped()).toEqual([expect.objectContaining({ id: 'r2', record: expect.objectContaining({ v: 11 }) })]);
    sync.online = true;
    await sync.flush();
    expect(srv.rows.get(k('r2')).v).toBe(13);
  });

  it('blocker 3: a pre-PR dead letter with no operation, missing on the server, is can\'t compare and left untouched; retry can still create it', async () => {
    const legacy = { id: 'L', table: T, record: row('L', 10), error: 'old', retry_count: 5, dead_lettered_at: ts(10), auto_drain_count: 3 };
    seed({ letters: [legacy] });
    const sync = makeSync();
    const { plan, outcome } = await resync(sync);
    expect(plan.counts).toEqual({ send: 0, skip: 0, existing: 0, gone: 0, cantCompare: 1 });
    expect(outcome).toMatchObject({ sent: 0, gone: 0, cantCompare: 1 });
    expect(dl()).toEqual([legacy]);
    expect(srv.log).toEqual([]);
    sync.retryDeadLetters(); await sync.flush();
    expect(srv.log.filter(e => e.id === 'L').map(e => e.op)).toEqual(['upsert']);
    expect(srv.rows.get(k('L')).v).toBe(10);
  });

  it('blocker 4: a marked, never-acked create with a newer queued update is sent once as a create; counted once; the next Resync shows N = 0', async () => {
    markEntries([entry(row('c4', 10), 'insert', ts(10))]);
    seed({ queue: [entry(row('c4', 11), 'update', ts(11))] });
    const sync = makeSync();
    const { plan, outcome } = await resync(sync);
    expect(plan.counts).toEqual({ send: 1, skip: 0, existing: 0, gone: 0, cantCompare: 0 });
    expect(outcome).toMatchObject({ sent: 1, failed: 0 });
    expect(srv.log.filter(e => e.id === 'c4').map(e => e.op)).toEqual(['upsert']);
    expect(srv.rows.get(k('c4')).v).toBe(11);
    expect(dl()).toEqual([]); expect(q()).toEqual([]); expect(marks()).toEqual([]);
    expect((await resync(sync)).plan.counts.send).toBe(0);
  });

  it('logs one resync info line with counts and no ids', async () => {
    mixedSet();
    const info = vi.spyOn(logger, 'info');
    await resync(makeSync());
    const lines = info.mock.calls.filter(([cat]) => cat === 'resync');
    expect(lines).toEqual([['resync', 'resync', { sent: 3, skipped: 2, failed: 0, gone: 1, cantCompare: 0, waiting: 0 }]]);
  });
});

// ---------------------------------------------------------------------------
describe('D: Resync confirm and result sheets (Settings)', () => {
  function mountSettings(sync) {
    setSyncAdapter(sync);
    const mount = document.createElement('div'); mount.id = 'export-sheet-mount';
    const button = document.createElement('button');
    document.body.append(button, mount);
    return { mount, button };
  }
  const text = sel => document.querySelector(sel)?.textContent;
  const seedMixed = () => {
    srv.rows.set(k('r1'), row('r1', 10)); srv.rows.set(k('r2'), row('r2', 12));
    seed({ queue: [entry(row('r1', 11), 'update', ts(11)), entry(row('r2', 11), 'update', ts(11))], letters: [letter(row('r6', 11), { operation: 'update', reason: ZERO_ROWS_REASON })] });
  };

  it('shows the exact counts and buttons; Send waits for the result, offers Export, then pulls', async () => {
    seedMixed();
    const { button } = mountSettings(makeSync());
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-confirm-sheet"]')).toBeTruthy());
    expect(text('[data-testid="resync-confirm-sheet"] h4')).toBe('Resync to server');
    expect(text('[data-testid="resync-count-send"]')).toBe('1 unsynced change on this device is newer than the server and will be sent.');
    expect(text('[data-testid="resync-count-skip"]')).toBe('1 is already the same or newer on the server and will be skipped.');
    expect(text('[data-testid="resync-count-gone"]')).toBe("1 was deleted on the server or can't be reached and won't be sent.");
    expect(document.querySelector('[data-testid="resync-count-cant-compare"]')).toBeNull();
    expect(text('[data-testid="resync-cancel-btn"]')).toBe('Cancel');
    expect(text('[data-testid="resync-send-btn"]')).toBe('Send 1 change');
    expect(srv.log).toEqual([]);
    document.querySelector('[data-testid="resync-send-btn"]').click();
    await done;
    expect(text('[data-testid="resync-result"]')).toBe('Sent 1. Skipped 1. Failed 0.');
    expect(text('[data-testid="resync-result-gone"]')).toContain('1');
    expect(document.querySelector('[data-testid="resync-export-skipped-btn"]')).toBeTruthy();
    expect(pullAllRemote).toHaveBeenCalledTimes(1);
  });

  it('D4: Cancel writes nothing and leaves the queue, letters and marks as they were', async () => {
    seedMixed();
    const before = [localStorage.getItem('_sync_queue'), localStorage.getItem('_dead_letter_queue'), localStorage.getItem(UNACKED_KEY)];
    const { button } = mountSettings(makeSync());
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-cancel-btn"]')).toBeTruthy());
    document.querySelector('[data-testid="resync-cancel-btn"]').click();
    await done;
    expect(srv.log).toEqual([]);
    expect([localStorage.getItem('_sync_queue'), localStorage.getItem('_dead_letter_queue'), localStorage.getItem(UNACKED_KEY)]).toEqual(before);
    expect(pullAllRemote).not.toHaveBeenCalled();
  });

  it('with N = 0 only OK is offered', async () => {
    const { button } = mountSettings(makeSync());
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-confirm-sheet"]')).toBeTruthy());
    expect(text('[data-testid="resync-count-send"]')).toMatch(/^0 unsynced/);
    expect([...document.querySelectorAll('[data-testid="resync-confirm-sheet"] button')].map(b => b.textContent)).toEqual(['OK']);
    document.querySelector('[data-testid="resync-ok-btn"]').click();
    await done;
    expect(srv.log).toEqual([]);
  });

  it('says why when offline, signed out, or a read fails (naming the table)', async () => {
    seedMixed();
    const sync = makeSync({ online: false });
    const { button } = mountSettings(sync);
    await handleResyncClick(button);
    expect(text('[data-testid="resync-message"] p')).toBe(en.settings.resyncOffline);
    sync.online = true; srv.session = false;
    await handleResyncClick(button);
    expect(text('[data-testid="resync-message"] p')).toBe(en.settings.resyncSignedOut);
    srv.session = true; srv.readFail = T;
    await handleResyncClick(button);
    expect(text('[data-testid="resync-message"] p')).toBe(`Couldn't read ${T} from the server. Nothing was sent.`);
    expect(srv.log).toEqual([]);
  });

  it('blocker 2: the flush lock is free while the sheet is open, and a removed sheet counts as Cancel', async () => {
    seedMixed();
    const before = [localStorage.getItem('_sync_queue'), localStorage.getItem('_dead_letter_queue')];
    const sync = makeSync();
    const { button, mount } = mountSettings(sync);
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-confirm-sheet"]')).toBeTruthy());
    // A save on another screen goes out while the sheet waits.
    await sync.push(T, row('other', 10), 'upsert');
    expect(srv.rows.get(k('other')).v).toBe(10);
    // The flush sent the queue as usual; put the planned work back to compare.
    localStorage.setItem('_sync_queue', before[0]); localStorage.setItem('_dead_letter_queue', before[1]);
    srv.log.length = 0;
    mount.remove(); // navigating away
    await done;
    expect(button.disabled).toBe(false);
    expect(srv.log).toEqual([]);
    expect([localStorage.getItem('_sync_queue'), localStorage.getItem('_dead_letter_queue')]).toEqual(before);
    await sync.push(T, row('after', 10), 'upsert');
    expect(srv.rows.get(k('after')).v).toBe(10);
  });

  it('blockers 1+2: a save while the sheet is open goes out; at Send the plan is rebuilt and the sheet shown again because the counts changed', async () => {
    srv.rows.set(k('r1'), row('r1', 10)); srv.rows.set(k('r2'), row('r2', 12));
    seed({ queue: [entry(row('r2', 11), 'update', ts(11))], letters: [letter(row('r1', 11), { operation: 'update' })] });
    const sync = makeSync();
    const { button } = mountSettings(sync);
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-send-btn"]')).toBeTruthy());
    expect(text('[data-testid="resync-count-skip"]')).toMatch(/^1 is already/);
    await sync.push(T, row('r2', 13), 'update');
    expect(srv.rows.get(k('r2')).v).toBe(13);
    document.querySelector('[data-testid="resync-send-btn"]').click();
    await vi.waitFor(() => expect(text('[data-testid="resync-count-skip"]')).toMatch(/^0 are already/));
    expect(srv.rows.get(k('r1')).v).toBe(10);
    document.querySelector('[data-testid="resync-send-btn"]').click();
    await done;
    expect(text('[data-testid="resync-result"]')).toBe('Sent 1. Skipped 0. Failed 0.');
    expect(srv.rows.get(k('r1')).v).toBe(11); expect(srv.rows.get(k('r2')).v).toBe(13);
    expect(q()).toEqual([]); expect(dl()).toEqual([]);
  });

  it('existing rows on the no-updated_at tables are listed as already on the server', async () => {
    srv.rows.set(k('x', 'batch_moves'), { id: 'x', qty: 1 });
    seed({ queue: [entry({ id: 'x', qty: 2 }, 'upsert', ts(10), { table: 'batch_moves' })] });
    const { button } = mountSettings(makeSync());
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-confirm-sheet"]')).toBeTruthy());
    expect(text('[data-testid="resync-count-existing"]')).toBe('1 is already on the server and will be skipped.');
    expect(text('[data-testid="resync-count-skip"]')).toMatch(/^0 are already the same or newer/);
    document.querySelector('[data-testid="resync-ok-btn"]').click();
    await done;
  });

  it('D8: the result line reads "Sent X. Skipped M. Failed 2." with failures', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    srv.rows.set(k('f1'), row('f1', 9)); srv.rows.set(k('f2'), row('f2', 9)); srv.hidden.add(k('f2')); srv.rows.set(k('s1'), row('s1', 12));
    seed({ queue: [entry(row('f1', 10), 'update', ts(10)), entry(row('f2', 10), 'update', ts(10)), entry(row('s1', 10), 'update', ts(10))] });
    srv.failNext = 5; srv.failFor = 'f1';
    const { button } = mountSettings(makeSync());
    const done = handleResyncClick(button);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="resync-send-btn"]')).toBeTruthy());
    document.querySelector('[data-testid="resync-send-btn"]').click();
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
    expect(text('[data-testid="resync-result"]')).toBe('Sent 0. Skipped 1. Failed 2.');
  });
});
