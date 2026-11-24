/**
 * @file L2 — a pull that brings nothing new does not write or notify.
 * mergeRemote skips a row only when updatedAt is equal AND the content is
 * deep-equal to local; equal time with different content still applies and
 * notifies; a newer remote row applies as before; a pending local edit (newer
 * updatedAt, queued for push) still wins over an older server row.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  init, _reset, getAll, getById, mergeRemote, subscribe, update, setSyncAdapter, sameRecordContent,
} from '../../src/data/store.js';
import * as GroupEntity from '../../src/entities/group.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const G1 = '00000000-0000-0000-0000-000000000101';
const T0 = '2026-11-24T10:00:00.000Z';
const T1 = '2026-11-24T11:00:00.000Z';

const row = (over = {}) => ({
  id: G1, operationId: OP, farmId: FARM, name: 'Herd', color: '#336699',
  archived: false, tags: ['a', 'b'], meta: { n: 1 }, createdAt: T0, updatedAt: T0, ...over,
});
const tick = () => new Promise(r => setTimeout(r, 0));

describe('L2 mergeRemote no-op skip', () => {
  let calls;
  beforeEach(async () => {
    localStorage.clear();
    _reset();
    init();
    mergeRemote('groups', [row()]);
    await tick();
    calls = 0;
    subscribe('groups', () => { calls += 1; });
  });

  it('equal updatedAt + same content: no write, no notify', async () => {
    const before = localStorage.getItem('gtho_v2_groups');
    const res = mergeRemote('groups', [row({ tags: ['a', 'b'], meta: { n: 1 } })]);
    await tick();
    expect(res).toEqual({ added: 0, updated: 0 });
    expect(calls).toBe(0);
    expect(localStorage.getItem('gtho_v2_groups')).toBe(before);
  });

  it('a key that is undefined counts as absent (JSON round-trip)', async () => {
    mergeRemote('groups', [row({ notes: undefined })]);
    await tick();
    expect(calls).toBe(0);
  });

  it('equal updatedAt + different content: applied and notified', async () => {
    const res = mergeRemote('groups', [row({ name: 'Herd 2' })]);
    await tick();
    expect(res.updated).toBe(1);
    expect(calls).toBe(1);
    expect(getById('groups', G1).name).toBe('Herd 2');
  });

  it('equal updatedAt + nested difference: applied and notified', async () => {
    mergeRemote('groups', [row({ meta: { n: 2 } })]);
    await tick();
    expect(calls).toBe(1);
    expect(getById('groups', G1).meta).toEqual({ n: 2 });
  });

  it('newer remote row: applied and notified as before', async () => {
    const res = mergeRemote('groups', [row({ updatedAt: T1 })]);
    await tick();
    expect(res.updated).toBe(1);
    expect(calls).toBe(1);
    expect(getById('groups', G1).updatedAt).toBe(T1);
  });

  it('older remote row: ignored as before', async () => {
    mergeRemote('groups', [row({ name: 'Old', updatedAt: '2026-11-24T09:00:00.000Z' })]);
    await tick();
    expect(calls).toBe(0);
    expect(getById('groups', G1).name).toBe('Herd');
  });

  it('a pending local queue row still wins over the server row', async () => {
    const queued = [];
    setSyncAdapter({
      isOnline: async () => true,
      pullAll: async () => [],
      push: async () => ({ success: true }),
      enqueueWrite: (table, record, operation) => { queued.push({ table, record, operation }); return true; },
    });
    update('groups', G1, { name: 'Local edit' }, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    await tick();
    expect(queued.length).toBeGreaterThan(0);
    calls = 0;
    // Server still has the pre-edit row (equal-or-older time than the local edit).
    mergeRemote('groups', [row()]);
    await tick();
    expect(getById('groups', G1).name).toBe('Local edit');
    expect(calls).toBe(0);
  });

  it('new rows are still added', async () => {
    const res = mergeRemote('groups', [row(), row({ id: '00000000-0000-0000-0000-000000000102', name: 'B' })]);
    await tick();
    expect(res).toEqual({ added: 1, updated: 0 });
    expect(calls).toBe(1);
    expect(getAll('groups')).toHaveLength(2);
  });
});

describe('sameRecordContent', () => {
  it('compares structurally', () => {
    expect(sameRecordContent({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(sameRecordContent({ a: 1 }, { a: '1' })).toBe(false);
    expect(sameRecordContent({ a: null }, {})).toBe(false);
    expect(sameRecordContent({ a: NaN }, { a: NaN })).toBe(true);
    expect(sameRecordContent([1, 2], [1, 2, 3])).toBe(false);
    expect(sameRecordContent(new Date(5), new Date(5))).toBe(true);
    expect(sameRecordContent(new Date(5), { })).toBe(false);
  });
});
