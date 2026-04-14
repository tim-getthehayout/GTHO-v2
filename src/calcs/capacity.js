/** @file Capacity Forecast calculation registrations — CP-54. 1 formula (Capacity Forecast domain §4.11). */

import { registerCalc } from '../utils/calc-registry.js';

// CAP-1: Period Capacity Coverage
registerCalc({
  name: 'CAP-1',
  category: 'capacity',
  description: 'Fraction of a selected period that a paddock can feed a set of groups, given forecast standing DM',
  formula: 'coverage_fraction = min(1, dm_available_kg / dm_demand_kg); dm_demand_kg = sum(group.total_dmi_kg_per_day) × period_days',
  source: 'V2_CALCULATION_SPEC.md §4.11',
  notes: 'v2-only. No v1 equivalent. Never-grazed paddocks: forecastDmKg=0 → 100% shortfall. Multi-group: sums DMI across all selected groups. Strip grazing: dm_available sums across strips via FOR-6.',
  inputs: [
    { name: 'forecastDmKg', type: 'number', unit: 'kg', notes: 'From FOR-6 at start_date + period_days' },
    { name: 'groupDmiKgPerDay', type: 'array', unit: '{ dmiKgPerDay }', notes: 'One entry per selected group, from ANI-1 / DMI-2' },
    { name: 'periodDays', type: 'integer', unit: 'days' },
  ],
  output: { type: 'object', shape: '{ dmAvailableKg, dmDemandKg, coverageFraction, coversHours, shortfallLbsHay, surplusHours }', unit: 'kg / fraction / hours / lbs' },
  example: {
    inputs: {
      forecastDmKg: 3000,
      groupDmiKgPerDay: [{ dmiKgPerDay: 250 }, { dmiKgPerDay: 150 }],
      periodDays: 3,
    },
    output: {
      dmAvailableKg: 3000,
      dmDemandKg: 1200,
      coverageFraction: 1,
      coversHours: 72,
      shortfallLbsHay: 0,
      surplusHours: 108,
    },
  },
  fn({ forecastDmKg, groupDmiKgPerDay, periodDays }) {
    const totalDmiPerDay = groupDmiKgPerDay.reduce((sum, g) => sum + g.dmiKgPerDay, 0);
    const dmDemandKg = totalDmiPerDay * periodDays;

    if (dmDemandKg <= 0) {
      return {
        dmAvailableKg: forecastDmKg,
        dmDemandKg: 0,
        coverageFraction: 1,
        coversHours: periodDays * 24,
        shortfallLbsHay: 0,
        surplusHours: 0,
      };
    }

    const coverageFraction = Math.min(1, forecastDmKg / dmDemandKg);
    const coversHours = coverageFraction * periodDays * 24;
    const shortfallKg = Math.max(0, dmDemandKg - forecastDmKg);
    const shortfallLbsHay = shortfallKg * 2.20462;
    const surplusKg = Math.max(0, forecastDmKg - dmDemandKg);
    const surplusHours = totalDmiPerDay > 0 ? (surplusKg / totalDmiPerDay) * 24 : 0;

    return {
      dmAvailableKg: forecastDmKg,
      dmDemandKg,
      coverageFraction,
      coversHours,
      shortfallLbsHay,
      surplusHours,
    };
  },
});
