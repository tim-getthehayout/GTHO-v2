/** @file Tests for window-helpers — OI-0091. */
import { describe, it, expect } from 'vitest';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight, getOpenPwForLocation } from '../../src/calcs/window-helpers.js';

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

  // OI-0130: class-default fallback tier (live → snapshot → class default → 0).
  describe('class-default fallback (OI-0130)', () => {
    const classedAnimals = [
      { id: 'a1', classId: 'cow-class' },
      { id: 'a2', classId: 'cow-class' },
      { id: 'a3', classId: 'calf-class' },
    ];
    const animalClasses = [
      { id: 'cow-class', defaultWeightKg: 545 },
      { id: 'calf-class', defaultWeightKg: 113 },
    ];

    it('per-animal weight record beats class default when both exist', () => {
      const memberships = [mem('a1'), mem('a2'), mem('a3')];
      const animalWeightRecords = [
        { animalId: 'a1', weightKg: 600, date: '2026-04-05' },
        { animalId: 'a2', weightKg: 580, date: '2026-04-05' },
        { animalId: 'a3', weightKg: 150, date: '2026-04-05' },
      ];
      const result = getLiveWindowAvgWeight(GW, {
        memberships, animals: classedAnimals, animalClasses, animalWeightRecords, now: '2026-04-10',
      });
      expect(result).toBe((600 + 580 + 150) / 3);
    });

    it('class default fills in when no weight record exists for any animal', () => {
      const memberships = [mem('a1'), mem('a2'), mem('a3')];
      const result = getLiveWindowAvgWeight(GW, {
        memberships, animals: classedAnimals, animalClasses, animalWeightRecords: [], now: '2026-04-10',
      });
      expect(result).toBe((545 + 545 + 113) / 3);
    });

    it('mixed: per-animal record for a1, class default for a2+a3', () => {
      const memberships = [mem('a1'), mem('a2'), mem('a3')];
      const animalWeightRecords = [{ animalId: 'a1', weightKg: 600, date: '2026-04-05' }];
      const result = getLiveWindowAvgWeight(GW, {
        memberships, animals: classedAnimals, animalClasses, animalWeightRecords, now: '2026-04-10',
      });
      expect(result).toBe((600 + 545 + 113) / 3);
    });

    it('drops animals with no weight record AND no class default from the count (not a false zero)', () => {
      const memberships = [mem('a1'), mem('a2'), mem('a-orphan')];
      const animalsWithOrphan = [
        { id: 'a1', classId: 'cow-class' },
        { id: 'a2', classId: 'cow-class' },
        { id: 'a-orphan', classId: null }, // no class
      ];
      const result = getLiveWindowAvgWeight(GW, {
        memberships, animals: animalsWithOrphan, animalClasses, animalWeightRecords: [], now: '2026-04-10',
      });
      // a-orphan dropped; result is cow-default average of a1+a2, NOT polluted by a 0.
      expect(result).toBe(545);
    });

    it('class-default-only still returns gw.avgWeightKg when no live members', () => {
      const memberships = []; // no live members
      const result = getLiveWindowAvgWeight(GW, {
        memberships, animals: classedAnimals, animalClasses, animalWeightRecords: [], now: '2026-04-10',
      });
      expect(result).toBe(450); // falls back to gw.avgWeightKg — existing behavior preserved
    });

    it('ignores classes whose defaultWeightKg is null / non-positive', () => {
      const memberships = [mem('a1'), mem('a2')];
      const classesWithNull = [{ id: 'cow-class', defaultWeightKg: null }];
      const result = getLiveWindowAvgWeight(GW, {
        memberships, animals: classedAnimals, animalClasses: classesWithNull, animalWeightRecords: [], now: '2026-04-10',
      });
      // Both animals drop from count → falls through to gw.avgWeightKg.
      expect(result).toBe(450);
    });
  });
});

describe('getOpenPwForLocation', () => {
  const EVT = 'e1';
  const LOC = 'l1';

  it('returns the open PW when present', () => {
    const pws = [
      { id: 'pw-0', eventId: EVT, locationId: LOC, dateClosed: '2026-04-10' },
      { id: 'pw-1', eventId: EVT, locationId: LOC, dateClosed: null },
    ];
    const result = getOpenPwForLocation(LOC, EVT, pws);
    expect(result.id).toBe('pw-1');
  });

  it('returns null when every PW for this (loc,event) is closed', () => {
    const pws = [
      { id: 'pw-0', eventId: EVT, locationId: LOC, dateClosed: '2026-04-10' },
      { id: 'pw-1', eventId: EVT, locationId: LOC, dateClosed: '2026-04-20' },
    ];
    expect(getOpenPwForLocation(LOC, EVT, pws)).toBeNull();
  });

  it('ignores other locations and other events', () => {
    const pws = [
      { id: 'pw-a', eventId: 'e2', locationId: LOC, dateClosed: null },
      { id: 'pw-b', eventId: EVT, locationId: 'l2', dateClosed: null },
    ];
    expect(getOpenPwForLocation(LOC, EVT, pws)).toBeNull();
  });

  it('returns null on missing args', () => {
    expect(getOpenPwForLocation(null, EVT, [])).toBeNull();
    expect(getOpenPwForLocation(LOC, null, [])).toBeNull();
    expect(getOpenPwForLocation(LOC, EVT, null)).toBeNull();
  });
});
