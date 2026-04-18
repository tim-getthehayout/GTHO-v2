/** @file Unit tests for reopen-event classifier (OI-0094 entry #10). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import { classifyGwsForReopen, classifyPwsForReopen } from '../../src/features/events/reopen-event.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';

function seedGroup(id, name) {
  add('groups', GroupEntity.create({ id, operationId: OP, farmId: FARM, name }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}
function seedEvent(id, dateIn, dateOut = null) {
  add('events', EventEntity.create({ id, operationId: OP, farmId: FARM, dateIn, dateOut }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}
function seedGw(id, { groupId, eventId, dateJoined, dateLeft = null, headCount = 5, avgWeightKg = 500 }) {
  add('eventGroupWindows', GroupWindowEntity.create({
    id, operationId: OP, groupId, eventId, dateJoined, dateLeft, headCount, avgWeightKg,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}
function seedMembership(id, { animalId, groupId, dateJoined = '2026-04-01', dateLeft = null }) {
  add('animalGroupMemberships', MembershipEntity.create({
    id, operationId: OP, animalId, groupId, dateJoined, dateLeft,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}
function seedAnimal(id) {
  add('animals', AnimalEntity.create({ id, operationId: OP, active: true }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

describe('classifyGwsForReopen', () => {
  beforeEach(() => _reset());

  it('reopens windows when the group is still intact and has not moved', () => {
    seedGroup('g1', 'Herd');
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedGw('gw1', { groupId: 'g1', eventId: 'e1', dateJoined: '2026-04-01', dateLeft: '2026-04-10' });
    seedAnimal('a1');
    seedMembership('m1', { animalId: 'a1', groupId: 'g1' });

    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { reopen, keepClosed } = classifyGwsForReopen(event);
    expect(reopen).toHaveLength(1);
    expect(reopen[0].gw.id).toBe('gw1');
    expect(keepClosed).toHaveLength(0);
  });

  it('keeps a window closed when the group has since moved to another open event', () => {
    seedGroup('g1', 'Herd');
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedEvent('e2', '2026-04-10');
    seedGw('gw1', { groupId: 'g1', eventId: 'e1', dateJoined: '2026-04-01', dateLeft: '2026-04-10' });
    seedGw('gw2', { groupId: 'g1', eventId: 'e2', dateJoined: '2026-04-10', dateLeft: null });
    seedAnimal('a1');
    seedMembership('m1', { animalId: 'a1', groupId: 'g1' });

    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { reopen, keepClosed } = classifyGwsForReopen(event);
    expect(reopen).toHaveLength(0);
    expect(keepClosed).toHaveLength(1);
    expect(keepClosed[0].reason).toBe('moved');
  });

  it('keeps a window closed when the group has no live memberships (culled to zero)', () => {
    seedGroup('g1', 'Culls');
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedGw('gw1', { groupId: 'g1', eventId: 'e1', dateJoined: '2026-04-01', dateLeft: '2026-04-10' });
    seedAnimal('a1');
    seedMembership('m1', { animalId: 'a1', groupId: 'g1', dateLeft: '2026-04-09' });

    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { reopen, keepClosed } = classifyGwsForReopen(event);
    expect(reopen).toHaveLength(0);
    expect(keepClosed).toHaveLength(1);
    expect(keepClosed[0].reason).toBe('empty');
  });

  it('partitions multiple windows correctly (mixed outcomes)', () => {
    seedGroup('g1', 'Herd A');
    seedGroup('g2', 'Herd B');
    seedGroup('g3', 'Culls');
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedEvent('e2', '2026-04-10');
    seedGw('gwA', { groupId: 'g1', eventId: 'e1', dateJoined: '2026-04-01', dateLeft: '2026-04-10' });
    seedGw('gwB', { groupId: 'g2', eventId: 'e1', dateJoined: '2026-04-01', dateLeft: '2026-04-10' });
    seedGw('gwC', { groupId: 'g3', eventId: 'e1', dateJoined: '2026-04-01', dateLeft: '2026-04-10' });
    // g1 stayed put
    seedAnimal('a1'); seedMembership('m1', { animalId: 'a1', groupId: 'g1' });
    // g2 moved to e2
    seedGw('gwB2', { groupId: 'g2', eventId: 'e2', dateJoined: '2026-04-10', dateLeft: null });
    seedAnimal('a2'); seedMembership('m2', { animalId: 'a2', groupId: 'g2' });
    // g3 emptied — no live memberships

    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { reopen, keepClosed } = classifyGwsForReopen(event);
    expect(reopen.map(r => r.gw.id).sort()).toEqual(['gwA']);
    expect(keepClosed).toHaveLength(2);
    const reasons = keepClosed.map(k => k.reason).sort();
    expect(reasons).toEqual(['empty', 'moved']);
  });
});

// OI-0095: paddock-side classifier — parallel to classifyGwsForReopen.
function seedPw(id, { eventId, locationId, dateOpened = '2026-04-01', dateClosed = null, areaPct = 100 }) {
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id, operationId: OP, eventId, locationId, dateOpened, dateClosed, areaPct,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

describe('classifyPwsForReopen', () => {
  beforeEach(() => _reset());

  it('reopens all PWs that closed on dateOut with no later reuse', () => {
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedPw('pw1', { eventId: 'e1', locationId: 'L1', dateOpened: '2026-04-01', dateClosed: '2026-04-10' });
    seedPw('pw2', { eventId: 'e1', locationId: 'L2', dateOpened: '2026-04-01', dateClosed: '2026-04-10' });
    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { toReopen, toKeepClosed } = classifyPwsForReopen(event);
    expect(toReopen.map(r => r.pw.id).sort()).toEqual(['pw1', 'pw2']);
    expect(toKeepClosed).toHaveLength(0);
  });

  it('keeps closed: mid-event Advance Strip reuse (strip 1 closed + strip 2 opened same day)', () => {
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedPw('strip1', { eventId: 'e1', locationId: 'L1', dateOpened: '2026-04-01', dateClosed: '2026-04-05' });
    seedPw('strip2', { eventId: 'e1', locationId: 'L1', dateOpened: '2026-04-05', dateClosed: '2026-04-10' });
    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { toReopen, toKeepClosed } = classifyPwsForReopen(event);
    // strip1 doesn't get considered (dateClosed != dateOut).
    // strip2 closed on dateOut; no later reuse on L1 → reopen.
    expect(toReopen.map(r => r.pw.id)).toEqual(['strip2']);
    expect(toKeepClosed).toHaveLength(0);
  });

  it('keeps closed: paddock reused later in event (swap pattern)', () => {
    seedEvent('e1', '2026-04-01', '2026-04-10');
    // L1 closed mid-event on dateOut-ish, then another PW on L1 opened after — classifier
    // should see the later PW and keep the earlier one closed even though dateClosed matches.
    seedPw('pw-early', { eventId: 'e1', locationId: 'L1', dateOpened: '2026-04-01', dateClosed: '2026-04-10' });
    seedPw('pw-later', { eventId: 'e1', locationId: 'L1', dateOpened: '2026-04-10', dateClosed: null });
    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { toReopen, toKeepClosed } = classifyPwsForReopen(event);
    expect(toReopen).toHaveLength(0);
    expect(toKeepClosed).toHaveLength(1);
    expect(toKeepClosed[0].reason).toBe('reused');
  });

  it('keeps closed: another event has an open window on the same paddock', () => {
    seedEvent('e1', '2026-04-01', '2026-04-10');
    seedEvent('e2', '2026-04-11', null);
    seedPw('pw-closed', { eventId: 'e1', locationId: 'L1', dateOpened: '2026-04-01', dateClosed: '2026-04-10' });
    seedPw('pw-other', { eventId: 'e2', locationId: 'L1', dateOpened: '2026-04-11', dateClosed: null });
    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { toReopen, toKeepClosed } = classifyPwsForReopen(event);
    expect(toReopen).toHaveLength(0);
    expect(toKeepClosed).toHaveLength(1);
    expect(toKeepClosed[0].reason).toBe('swap');
  });

  it('returns empty arrays when no PWs are closed on dateOut', () => {
    seedEvent('e1', '2026-04-01', '2026-04-10');
    const event = { id: 'e1', dateOut: '2026-04-10' };
    const { toReopen, toKeepClosed } = classifyPwsForReopen(event);
    expect(toReopen).toHaveLength(0);
    expect(toKeepClosed).toHaveLength(0);
  });
});
