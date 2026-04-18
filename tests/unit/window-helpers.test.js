/** @file Tests for window-helpers — OI-0091. */
import { describe, it, expect } from 'vitest';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../src/calcs/window-helpers.js';

const GW = {
  id: 'gw-1',
  groupId: 'g-1',
  dateJoined: '2026-04-01',
  dateLeft: null,
  headCount: 10,
  avgWeightKg: 450,
};

function mem(animalId, { dateJoined = '2026-04-01', dateLeft = null, groupId = 'g-1' } = {}) {
  return { id: `m-${animalId}`, animalId, groupId, dateJoined, dateLeft };
}

describe('getLiveWindowHeadCount', () => {
  it('returns stored snapshot for closed windows', () => {
    const closed = { ...GW, dateLeft: '2026-04-15', headCount: 8 };
    const result = getLiveWindowHeadCount(closed, { memberships: [], now: '2026-04-20' });
    expect(result).toBe(8);
  });

  it('counts live memberships for open window pre-cull', () => {
    const memberships = [mem('a1'), mem('a2'), mem('a3')];
    const result = getLiveWindowHeadCount(GW, { memberships, now: '2026-04-10' });
    expect(result).toBe(3);
  });

  it('excludes culled memberships (exclusive upper bound on dateLeft)', () => {
    // Cull of a1 on 2026-04-15; new window opens same day; live on 2026-04-15 must exclude a1.
    const memberships = [
      mem('a1', { dateLeft: '2026-04-15' }),
      mem('a2'),
      mem('a3'),
    ];
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-15' })).toBe(2);
    // Before cull: includes a1.
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-14' })).toBe(3);
  });

  it('isolates multi-group members to their own groupId', () => {
    const memberships = [
      mem('a1'), mem('a2'),
      mem('b1', { groupId: 'g-2' }),
      mem('b2', { groupId: 'g-2' }),
    ];
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-10' })).toBe(2);
  });

  it('returns 0 when no memberships match', () => {
    const memberships = [mem('b1', { groupId: 'g-2' })];
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-10' })).toBe(0);
  });

  it('pins to the passed `now` parameter — future dates change the answer', () => {
    const memberships = [
      mem('a1', { dateLeft: '2026-04-15' }),
      mem('a2'),
    ];
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-10' })).toBe(2);
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-20' })).toBe(1);
  });

  it('respects inclusive lower bound on dateJoined', () => {
    const memberships = [mem('a1', { dateJoined: '2026-04-10' })];
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-09' })).toBe(0);
    expect(getLiveWindowHeadCount(GW, { memberships, now: '2026-04-10' })).toBe(1);
  });
});

describe('getLiveWindowAvgWeight', () => {
  const animals = [
    { id: 'a1' }, { id: 'a2' }, { id: 'a3' },
  ];

  it('returns stored snapshot for closed windows', () => {
    const closed = { ...GW, dateLeft: '2026-04-15', avgWeightKg: 500 };
    expect(getLiveWindowAvgWeight(closed, { memberships: [], animals: [], animalWeightRecords: [], now: '2026-04-20' })).toBe(500);
  });

  it('averages latest per-animal weight <= now', () => {
    const memberships = [mem('a1'), mem('a2')];
    const animalWeightRecords = [
      { animalId: 'a1', weightKg: 400, date: '2026-04-02' },
      { animalId: 'a1', weightKg: 420, date: '2026-04-10' },
      { animalId: 'a2', weightKg: 480, date: '2026-04-08' },
    ];
    const result = getLiveWindowAvgWeight(GW, { memberships, animals, animalWeightRecords, now: '2026-04-12' });
    expect(result).toBe((420 + 480) / 2);
  });

  it('falls back to stored avgWeightKg when no weight records exist', () => {
    const memberships = [mem('a1')];
    const result = getLiveWindowAvgWeight(GW, { memberships, animals, animalWeightRecords: [], now: '2026-04-10' });
    expect(result).toBe(450);
  });

  it('ignores weight records after `now`', () => {
    const memberships = [mem('a1')];
    const animalWeightRecords = [{ animalId: 'a1', weightKg: 999, date: '2026-05-01' }];
    const result = getLiveWindowAvgWeight(GW, { memberships, animals, animalWeightRecords, now: '2026-04-10' });
    expect(result).toBe(450);
  });
});
