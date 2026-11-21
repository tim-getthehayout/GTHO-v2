/**
 * @file Exposure / preg-check / due bands — A0+E1+B0-extend+C3+D0+D4+F0+Fg1+Gs1+Gd+Gc0.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveBullExposureIntervals,
  isPregnancyCheckMember,
  dueBandForFemale,
  passesPregCheckProtocol,
  resolvePregCheckProtocol,
  formatPregCheckProtocolSummary,
  hasConfirmedBredDateMissing,
  CATTLE_GESTATION_DAYS,
  DEFAULT_PREG_CHECK_MIN_DAYS_SINCE_EXPOSURE,
  DEFAULT_PREG_CHECK_MIN_DAYS_POST_CALVING,
  addDaysToDateOnly,
  daysSince,
} from '../../../src/calcs/bull-exposure.js';

const OP = '00000000-0000-0000-0000-000000024301';
const CLASS_COW = '00000000-0000-0000-0000-0000000243c1';
const CLASS_HEIFER = '00000000-0000-0000-0000-0000000243c2';
const CLASS_BULL = '00000000-0000-0000-0000-0000000243c3';
const CLASS_EWE = '00000000-0000-0000-0000-0000000243c4';
const F1 = '00000000-0000-0000-0000-0000000243f1';
const F2 = '00000000-0000-0000-0000-0000000243f2';
const F3 = '00000000-0000-0000-0000-0000000243f3';
const B1 = '00000000-0000-0000-0000-0000000243b1';
const G_COW = '00000000-0000-0000-0000-0000000243g1';
const G_BULL = '00000000-0000-0000-0000-0000000243g2';
const EV = '00000000-0000-0000-0000-0000000243e1';

const classes = [
  { id: CLASS_COW, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow' },
  { id: CLASS_HEIFER, operationId: OP, name: 'Heifers', species: 'beef_cattle', role: 'heifer' },
  { id: CLASS_BULL, operationId: OP, name: 'Bulls', species: 'beef_cattle', role: 'bull' },
  { id: CLASS_EWE, operationId: OP, name: 'Ewes', species: 'sheep', role: 'ewe' },
];

function cow(id, overrides = {}) {
  return {
    id, operationId: OP, classId: CLASS_COW, sex: 'female', active: true,
    confirmedBred: false, tagNum: id.slice(-4), ...overrides,
  };
}
function heifer(id, overrides = {}) {
  return cow(id, { classId: CLASS_HEIFER, ...overrides });
}
function bull(id, overrides = {}) {
  return {
    id, operationId: OP, classId: CLASS_BULL, sex: 'male', active: true,
    confirmedBred: false, tagNum: id.slice(-4), ...overrides,
  };
}
function mem(id, animalId, groupId, dateJoined, dateLeft = null) {
  return { id, operationId: OP, animalId, groupId, dateJoined, dateLeft };
}
function egw(id, groupId, dateJoined, dateLeft = null, eventId = EV) {
  return {
    id, operationId: OP, eventId, groupId, dateJoined, dateLeft,
    headCount: 10, avgWeightKg: 500,
  };
}

describe('bull-exposure protocol defaults', () => {
  it('Gd0 defaults 35/45 AND when farm_settings missing', () => {
    const p = resolvePregCheckProtocol(null);
    expect(p).toEqual({
      minDaysSinceExposure: DEFAULT_PREG_CHECK_MIN_DAYS_SINCE_EXPOSURE,
      minDaysPostCalving: DEFAULT_PREG_CHECK_MIN_DAYS_POST_CALVING,
      combine: 'AND',
      family: 'cattle',
    });
    expect(formatPregCheckProtocolSummary(p)).toBe(
      'Protocol: ≥35d since exposure AND ≥45d post-partum',
    );
  });
});

describe('same-group exposure (A0)', () => {
  it('derives overlapping membership interval for cow + bull in same group', () => {
    const animals = [cow(F1), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2026-05-01', '2026-07-01'),
      mem('m2', B1, G_COW, '2026-05-15', '2026-06-15'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [],
    });
    const ok = intervals.filter(r => r.includeInView);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({
      femaleId: F1, bullId: B1,
      exposureStart: '2026-05-15', exposureEnd: '2026-06-15',
      source: 'same_group_membership', ambiguity_flag: 'ok',
    });
  });
});

describe('shared-event EGW exposure (A0)', () => {
  it('derives co-presence when bull-group and cow-group share an event window', () => {
    const animals = [cow(F1), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2026-04-01', null),
      mem('m2', B1, G_BULL, '2026-04-01', null),
    ];
    const eventGroupWindows = [
      egw('e1', G_COW, '2026-06-01', '2026-06-20'),
      egw('e2', G_BULL, '2026-06-10', '2026-06-30'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows,
    });
    const ok = intervals.filter(r => r.includeInView && r.source === 'shared_event_group_windows');
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok[0]).toMatchObject({
      femaleId: F1, bullId: B1,
      exposureStart: '2026-06-10', exposureEnd: '2026-06-20',
    });
  });
});

describe('Fg1 ambiguous excluded', () => {
  it('flags migration_date_fallback and excludes from includeInView', () => {
    const animals = [cow(F1), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2024-01-01', null),
      mem('m2', B1, G_COW, '2024-01-01', null),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [],
      migrationFallbackDates: ['2024-01-01'],
    });
    expect(intervals.length).toBeGreaterThan(0);
    expect(intervals.every(r => r.ambiguity_flag === 'migration_date_fallback')).toBe(true);
    expect(intervals.every(r => r.includeInView === false)).toBe(true);
  });

  it('flags missing_join_date', () => {
    const animals = [cow(F1), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, null, null),
      mem('m2', B1, G_COW, '2026-05-01', null),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [],
    });
    // No overlap can form without female join date; if any row, must be flagged
    expect(intervals.every(r => r.includeInView === false)).toBe(true);
  });
});

describe('protocol AND boundary (Gc0 + Gd0)', () => {
  it('requires both exposure and post-calving minima', () => {
    expect(passesPregCheckProtocol({
      exposureStart: '2026-01-01',
      lastCalvingDate: '2026-02-01',
      asOfDate: '2026-02-20', // 50d since exposure, 19d since calving
      protocol: resolvePregCheckProtocol(null),
    })).toBe(false);
    expect(passesPregCheckProtocol({
      exposureStart: '2026-01-01',
      lastCalvingDate: '2026-01-10',
      asOfDate: '2026-03-01', // 59d exposure, 50d calving
      protocol: resolvePregCheckProtocol(null),
    })).toBe(true);
  });

  it('heifer with no calving: post-calving N/A (satisfied)', () => {
    expect(passesPregCheckProtocol({
      exposureStart: '2026-01-01',
      lastCalvingDate: null,
      asOfDate: '2026-02-10', // 40d >= 35
      protocol: resolvePregCheckProtocol(null),
    })).toBe(true);
    expect(passesPregCheckProtocol({
      exposureStart: '2026-01-01',
      lastCalvingDate: null,
      asOfDate: '2026-01-20', // 19d < 35
      protocol: resolvePregCheckProtocol(null),
    })).toBe(false);
  });
});

describe('Pregnancy Check membership (D0) vs confirmed (D4)', () => {
  const asOf = '2026-08-01';
  const animalsBase = () => {
    const openCow = cow(F1);
    const bredCow = cow(F2, { confirmedBred: true, confirmedBredDate: '2026-06-01' });
    const bredNoDate = cow(F3, { confirmedBred: true, confirmedBredDate: null });
    const bullA = bull(B1);
    return { openCow, bredCow, bredNoDate, bullA };
  };

  function intervalsFor(...femaleIds) {
    const { openCow, bredCow, bredNoDate, bullA } = animalsBase();
    const animals = [openCow, bredCow, bredNoDate, bullA];
    const memberships = femaleIds.flatMap((fid, i) => [
      mem(`mf${i}`, fid, G_COW, '2026-05-01', '2026-06-01'),
      mem(`mb${i}`, B1, G_COW, '2026-05-01', '2026-06-01'),
    ]);
    // dedupe bull mem
    const membershipsDedup = [
      mem('mf0', F1, G_COW, '2026-05-01', '2026-06-01'),
      mem('mf1', F2, G_COW, '2026-05-01', '2026-06-01'),
      mem('mf2', F3, G_COW, '2026-05-01', '2026-06-01'),
      mem('mb', B1, G_COW, '2026-05-01', '2026-06-01'),
    ];
    return {
      animals,
      intervals: deriveBullExposureIntervals({
        animals, animalClasses: classes, memberships: membershipsDedup, eventGroupWindows: [],
      }),
    };
  }

  it('includes open exposed heifer/cow that passes protocol; excludes confirmed bred', () => {
    const { animals, intervals } = intervalsFor(F1, F2, F3);
    const open = animals.find(a => a.id === F1);
    const bred = animals.find(a => a.id === F2);
    const bredMissing = animals.find(a => a.id === F3);
    expect(isPregnancyCheckMember({
      animal: open, animalClass: classes[0], intervals, calvingRecords: [],
      protocol: resolvePregCheckProtocol(null), asOfDate: asOf,
    })).toBe(true);
    expect(isPregnancyCheckMember({
      animal: bred, animalClass: classes[0], intervals, calvingRecords: [],
      protocol: resolvePregCheckProtocol(null), asOfDate: asOf,
    })).toBe(false);
    expect(isPregnancyCheckMember({
      animal: bredMissing, animalClass: classes[0], intervals, calvingRecords: [],
      protocol: resolvePregCheckProtocol(null), asOfDate: asOf,
    })).toBe(false);
    expect(hasConfirmedBredDateMissing(bredMissing)).toBe(true);
  });

  it('confirmed-bred still gets an exposure due band (due view)', () => {
    const { animals, intervals } = intervalsFor(F2);
    const bred = animals.find(a => a.id === F2);
    const band = dueBandForFemale({
      animal: bred, animalClass: classes[0], intervals, breedingRecords: [],
    });
    expect(band.earliestDue).toBe(addDaysToDateOnly('2026-05-01', CATTLE_GESTATION_DAYS));
    expect(band.latestDue).toBe(addDaysToDateOnly('2026-06-01', CATTLE_GESTATION_DAYS));
    expect(band.confirmedOn).toBe('2026-06-01');
  });
});

describe('exposure-only due band (C0)', () => {
  it('earliest = start+G, latest = end+G; confirmation is not conception', () => {
    const animals = [cow(F1), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2026-01-01', '2026-01-31'),
      mem('m2', B1, G_COW, '2026-01-01', '2026-01-31'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [],
    });
    const band = dueBandForFemale({
      animal: animals[0], animalClass: classes[0], intervals, breedingRecords: [],
    });
    expect(daysSince('2026-01-01', band.earliestDue)).toBe(CATTLE_GESTATION_DAYS);
    expect(daysSince('2026-01-31', band.latestDue)).toBe(CATTLE_GESTATION_DAYS);
  });

  it('prefers breeding-record expected_calving as point beside band', () => {
    const animals = [cow(F1, { confirmedBred: true, confirmedBredDate: '2026-03-01' }), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2026-01-01', '2026-01-31'),
      mem('m2', B1, G_COW, '2026-01-01', '2026-01-31'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [],
    });
    const band = dueBandForFemale({
      animal: animals[0],
      animalClass: classes[0],
      intervals,
      breedingRecords: [{ animalId: F1, expectedCalving: '2026-10-15' }],
    });
    expect(band.expectedCalving).toBe('2026-10-15');
    expect(band.confirmedOn).toBe('2026-03-01');
    expect(band.earliestDue).toBeTruthy();
  });
});

describe('heifer no calving + cattle-only', () => {
  it('sheep ewe is not included in cattle-only derive', () => {
    const ewe = {
      id: F1, operationId: OP, classId: CLASS_EWE, sex: 'female', active: true,
      confirmedBred: false, tagNum: 'E1',
    };
    const animals = [ewe, bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2026-05-01', null),
      mem('m2', B1, G_COW, '2026-05-01', null),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [], cattleOnly: true,
    });
    expect(intervals.filter(r => r.femaleId === F1)).toHaveLength(0);
  });

  it('heifer with no calving passes D0 when exposure clock met', () => {
    const animals = [heifer(F1), bull(B1)];
    const memberships = [
      mem('m1', F1, G_COW, '2026-05-01', '2026-06-01'),
      mem('m2', B1, G_COW, '2026-05-01', '2026-06-01'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: classes, memberships, eventGroupWindows: [],
    });
    expect(isPregnancyCheckMember({
      animal: animals[0],
      animalClass: classes[1],
      intervals,
      calvingRecords: [],
      protocol: resolvePregCheckProtocol(null),
      asOfDate: '2026-08-01',
    })).toBe(true);
  });
});


describe('multispecies derive (E1)', () => {
  const CLASS_RAM = '00000000-0000-0000-0000-0000000243c5';
  const CLASS_DOE = '00000000-0000-0000-0000-0000000243c6';
  const CLASS_BUCK = '00000000-0000-0000-0000-0000000243c7';
  const multiClasses = [
    ...classes,
    { id: CLASS_RAM, operationId: OP, name: 'Rams', species: 'sheep', role: 'ram' },
    { id: CLASS_DOE, operationId: OP, name: 'Does', species: 'goat', role: 'doe' },
    { id: CLASS_BUCK, operationId: OP, name: 'Bucks', species: 'goat', role: 'buck' },
  ];
  const G_SHEEP = '00000000-0000-0000-0000-0000000243g3';
  const G_GOAT = '00000000-0000-0000-0000-0000000243g4';
  const EWE1 = '00000000-0000-0000-0000-0000000243w1';
  const RAM1 = '00000000-0000-0000-0000-0000000243r1';
  const DOE1 = '00000000-0000-0000-0000-0000000243d1';
  const BUCK1 = '00000000-0000-0000-0000-0000000243k1';

  it('derives ram↔ewe same-group exposure', () => {
    const animals = [
      { id: EWE1, operationId: OP, classId: CLASS_EWE, sex: 'female', active: true, confirmedBred: false },
      { id: RAM1, operationId: OP, classId: CLASS_RAM, sex: 'male', active: true, confirmedBred: false },
    ];
    const memberships = [
      mem('m1', EWE1, G_SHEEP, '2026-05-01', '2026-07-01'),
      mem('m2', RAM1, G_SHEEP, '2026-05-15', '2026-06-15'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: multiClasses, memberships, eventGroupWindows: [],
    });
    const ok = intervals.filter(r => r.includeInView);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({
      femaleId: EWE1, bullId: RAM1,
      exposureStart: '2026-05-15', exposureEnd: '2026-06-15',
    });
  });

  it('derives buck↔doe same-group exposure', () => {
    const animals = [
      { id: DOE1, operationId: OP, classId: CLASS_DOE, sex: 'female', active: true, confirmedBred: false },
      { id: BUCK1, operationId: OP, classId: CLASS_BUCK, sex: 'male', active: true, confirmedBred: false },
    ];
    const memberships = [
      mem('m1', DOE1, G_GOAT, '2026-04-01', '2026-06-01'),
      mem('m2', BUCK1, G_GOAT, '2026-04-10', '2026-05-20'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: multiClasses, memberships, eventGroupWindows: [],
    });
    const ok = intervals.filter(r => r.includeInView);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ femaleId: DOE1, bullId: BUCK1 });
  });

  it('does not pair ram with cow (matching-species only)', () => {
    const animals = [
      cow(F1),
      { id: RAM1, operationId: OP, classId: CLASS_RAM, sex: 'male', active: true, confirmedBred: false },
    ];
    const memberships = [
      mem('m1', F1, G_COW, '2026-05-01', null),
      mem('m2', RAM1, G_COW, '2026-05-01', null),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: multiClasses, memberships, eventGroupWindows: [],
    });
    expect(intervals.filter(r => r.femaleId === F1)).toHaveLength(0);
  });

  it('resolvePregCheckProtocol returns sheep/goat Gd defaults', () => {
    expect(resolvePregCheckProtocol(null, 'sheep')).toMatchObject({
      minDaysSinceExposure: 25, minDaysPostCalving: 30, family: 'sheep', combine: 'AND',
    });
    expect(resolvePregCheckProtocol(null, 'goat')).toMatchObject({
      minDaysSinceExposure: 25, minDaysPostCalving: 30, family: 'goat',
    });
    expect(resolvePregCheckProtocol(null, 'beef_cattle')).toMatchObject({
      minDaysSinceExposure: 35, minDaysPostCalving: 45, family: 'cattle',
    });
  });

  it('D0 uses per-species protocol for ewe', () => {
    const ewe = {
      id: EWE1, operationId: OP, classId: CLASS_EWE, sex: 'female', active: true, confirmedBred: false,
    };
    const ram = {
      id: RAM1, operationId: OP, classId: CLASS_RAM, sex: 'male', active: true, confirmedBred: false,
    };
    const animals = [ewe, ram];
    const memberships = [
      mem('m1', EWE1, G_SHEEP, '2026-05-01', '2026-06-01'),
      mem('m2', RAM1, G_SHEEP, '2026-05-01', '2026-06-01'),
    ];
    const intervals = deriveBullExposureIntervals({
      animals, animalClasses: multiClasses, memberships, eventGroupWindows: [],
    });
    const eweClass = multiClasses.find(c => c.id === CLASS_EWE);
    // 25d sheep exposure met at asOf 2026-06-30 (60d); cattle 35 would also pass here
    expect(isPregnancyCheckMember({
      animal: ewe, animalClass: eweClass, intervals, calvingRecords: [],
      farmSettings: null, asOfDate: '2026-06-30',
    })).toBe(true);
    // Too soon for sheep 25d (asOf = exposure_start + 10)
    expect(isPregnancyCheckMember({
      animal: ewe, animalClass: eweClass, intervals, calvingRecords: [],
      farmSettings: null, asOfDate: '2026-05-11',
    })).toBe(false);
  });
});
