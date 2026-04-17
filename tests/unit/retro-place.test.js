/** @file Tests for retro-place flow — SP-10 Gap option 3 (OI-0083). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeCandidateEvents,
  computeCandidatePaddocks,
  findConflictingWindow,
  commitRetroPlace,
} from '../../src/features/events/retro-place.js';
import { _reset, add, getById, getAll, setSyncAdapter } from '../../src/data/store.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const GROUP = '00000000-0000-0000-0000-0000000000bb';

const mkEvent = (id, dateIn, dateOut) => ({ id, dateIn, dateOut });
const mkGw = (overrides = {}) => GroupWindowEntity.create({
  operationId: OP,
  eventId: 'e1',
  groupId: GROUP,
  dateJoined: '2026-04-01',
  headCount: 50,
  avgWeightKg: 450,
  ...overrides,
});

describe('retro-place: computeCandidateEvents', () => {
  it('keeps events that fully contain the gap', () => {
    const events = [
      mkEvent('a', '2026-03-01', '2026-03-31'), // fully contains 03-10..03-20
      mkEvent('b', '2026-03-15', '2026-03-25'), // partial overlap only
      mkEvent('c', '2026-04-01', '2026-04-30'), // entirely after
    ];
    const result = computeCandidateEvents({
      sourceEventId: 'src', gapStart: '2026-03-10', gapEnd: '2026-03-20', allEvents: events,
    });
    expect(result.map(e => e.id)).toEqual(['a']);
  });

  it('excludes the source event even if it fully contains the gap', () => {
    const events = [
      mkEvent('src', '2026-03-01', '2026-03-31'),
      mkEvent('a', '2026-03-01', '2026-03-31'),
    ];
    const result = computeCandidateEvents({
      sourceEventId: 'src', gapStart: '2026-03-10', gapEnd: '2026-03-20', allEvents: events,
    });
    expect(result.map(e => e.id)).toEqual(['a']);
  });

  it('excludes open events (no dateOut)', () => {
    const events = [
      mkEvent('a', '2026-03-01', null),
      mkEvent('b', '2026-03-01', '2026-03-31'),
    ];
    const result = computeCandidateEvents({
      sourceEventId: 'src', gapStart: '2026-03-10', gapEnd: '2026-03-20', allEvents: events,
    });
    expect(result.map(e => e.id)).toEqual(['b']);
  });

  it('returns empty when no event contains the gap', () => {
    const events = [
      mkEvent('a', '2026-04-01', '2026-04-30'),
    ];
    const result = computeCandidateEvents({
      sourceEventId: 'src', gapStart: '2026-03-10', gapEnd: '2026-03-20', allEvents: events,
    });
    expect(result).toEqual([]);
  });
});

describe('retro-place: computeCandidatePaddocks', () => {
  it('keeps paddock windows that fully contain the gap', () => {
    const paddocks = [
      { eventId: 'dest', locationId: 'l1', dateOpened: '2026-03-01', dateClosed: '2026-03-31' },
      { eventId: 'dest', locationId: 'l2', dateOpened: '2026-03-15', dateClosed: '2026-03-31' },
      { eventId: 'other', locationId: 'l3', dateOpened: '2026-03-01', dateClosed: '2026-03-31' },
    ];
    const result = computeCandidatePaddocks({
      destEventId: 'dest', gapStart: '2026-03-05', gapEnd: '2026-03-25', allPaddockWindows: paddocks,
    });
    expect(result.map(pw => pw.locationId)).toEqual(['l1']);
  });

  it('excludes open paddocks (no dateClosed)', () => {
    const paddocks = [
      { eventId: 'dest', locationId: 'l1', dateOpened: '2026-03-01', dateClosed: null },
    ];
    const result = computeCandidatePaddocks({
      destEventId: 'dest', gapStart: '2026-03-05', gapEnd: '2026-03-25', allPaddockWindows: paddocks,
    });
    expect(result).toEqual([]);
  });
});

describe('retro-place: findConflictingWindow', () => {
  it('detects overlap when group already has a window covering part of the gap', () => {
    const gws = [
      { eventId: 'dest', groupId: GROUP, dateJoined: '2026-03-01', dateLeft: '2026-03-15' },
    ];
    const result = findConflictingWindow({
      destEventId: 'dest', groupId: GROUP, gapStart: '2026-03-10', gapEnd: '2026-03-20', allGroupWindows: gws,
    });
    expect(result).toBeTruthy();
    expect(result.dateLeft).toBe('2026-03-15');
  });

  it('returns null when no overlap exists', () => {
    const gws = [
      { eventId: 'dest', groupId: GROUP, dateJoined: '2026-02-01', dateLeft: '2026-02-28' },
    ];
    const result = findConflictingWindow({
      destEventId: 'dest', groupId: GROUP, gapStart: '2026-03-10', gapEnd: '2026-03-20', allGroupWindows: gws,
    });
    expect(result).toBeNull();
  });

  it('ignores windows for a different group', () => {
    const gws = [
      { eventId: 'dest', groupId: 'OTHER-GROUP', dateJoined: '2026-03-01', dateLeft: '2026-03-31' },
    ];
    const result = findConflictingWindow({
      destEventId: 'dest', groupId: GROUP, gapStart: '2026-03-10', gapEnd: '2026-03-20', allGroupWindows: gws,
    });
    expect(result).toBeNull();
  });

  it('treats an open window (no dateLeft) as ongoing for overlap purposes', () => {
    const gws = [
      { eventId: 'dest', groupId: GROUP, dateJoined: '2026-03-15', dateLeft: null },
    ];
    const result = findConflictingWindow({
      destEventId: 'dest', groupId: GROUP, gapStart: '2026-03-10', gapEnd: '2026-03-20', allGroupWindows: gws,
    });
    expect(result).toBeTruthy();
  });
});

describe('retro-place: commitRetroPlace', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    setSyncAdapter(null);
  });

  it('atomically lands both writes on success', () => {
    const sourceWindow = mkGw({ id: 'src-gw', eventId: 'src-evt', dateJoined: '2026-04-15' });
    add('eventGroupWindows', sourceWindow, GroupWindowEntity.validate);

    const newDestWindow = mkGw({
      id: 'dest-gw', eventId: 'dest-evt',
      dateJoined: '2026-04-01', dateLeft: '2026-04-15',
    });

    const result = commitRetroPlace({
      sourceWindow,
      newDateJoined: '2026-04-15',
      newDestWindow,
    });

    expect(result.sourceUpdated.dateJoined).toBe('2026-04-15');
    expect(result.destAdded.id).toBe('dest-gw');

    const all = getAll('eventGroupWindows');
    expect(all).toHaveLength(2);
    expect(getById('eventGroupWindows', 'src-gw').dateJoined).toBe('2026-04-15');
    expect(getById('eventGroupWindows', 'dest-gw')).toBeTruthy();
  });

  it('rejects when source window staged value would fail validation', () => {
    const sourceWindow = mkGw({ id: 'src-gw' });
    add('eventGroupWindows', sourceWindow, GroupWindowEntity.validate);
    const newDestWindow = mkGw({ id: 'dest-gw', dateJoined: '2026-04-01', dateLeft: '2026-04-15' });

    expect(() => commitRetroPlace({
      sourceWindow,
      newDateJoined: null,
      newDestWindow,
    })).toThrow(/Source window invalid/);

    expect(getAll('eventGroupWindows')).toHaveLength(1);
  });

  it('rejects when destination window would fail validation', () => {
    const sourceWindow = mkGw({ id: 'src-gw', dateJoined: '2026-04-15' });
    add('eventGroupWindows', sourceWindow, GroupWindowEntity.validate);
    const badDest = mkGw({ id: 'dest-gw', headCount: 0 });

    expect(() => commitRetroPlace({
      sourceWindow,
      newDateJoined: '2026-04-15',
      newDestWindow: badDest,
    })).toThrow(/Destination window invalid/);

    expect(getAll('eventGroupWindows')).toHaveLength(1);
  });

  it('reverts the source update when add throws', async () => {
    const originalDate = '2026-04-01';
    const sourceWindow = mkGw({ id: 'src-gw', dateJoined: originalDate });
    add('eventGroupWindows', sourceWindow, GroupWindowEntity.validate);

    const collidingId = 'dest-gw-existing';
    const existing = mkGw({ id: collidingId, dateJoined: '2026-03-01', dateLeft: '2026-03-15' });
    add('eventGroupWindows', existing, GroupWindowEntity.validate);

    const newDestWindow = mkGw({
      id: collidingId,
      eventId: 'dest-evt',
      dateJoined: '2026-04-01', dateLeft: '2026-04-15',
    });

    const adapterPushSpy = vi.fn().mockImplementation((table, _record, op) => {
      if (op === 'insert' && table === 'event_group_windows') throw new Error('sync push failed on insert');
    });
    setSyncAdapter({ push: adapterPushSpy });

    expect(() => commitRetroPlace({
      sourceWindow,
      newDateJoined: '2026-04-15',
      newDestWindow,
    })).toThrow();

    expect(getById('eventGroupWindows', 'src-gw').dateJoined).toBe(originalDate);
  });
});
