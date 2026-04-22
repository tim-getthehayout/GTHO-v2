/**
 * @file OI-0127 — Seed-data role assignment integrity.
 *
 * Weaning is an offspring property (calf / lamb / kid). Lactation DMI is a
 * dam property (cow / ewe / doe). Asserts `weaningAgeDays` lives only on
 * offspring rows and `dmiPctLactating` only on dam rows, across all four
 * species defined in `ANIMAL_CLASSES_BY_SPECIES`.
 */
import { describe, it, expect } from 'vitest';
import { ANIMAL_CLASSES_BY_SPECIES } from '../../src/features/onboarding/seed-data.js';

const DAM_ROLES = new Set(['cow', 'ewe', 'doe']);
const OFFSPRING_ROLES = new Set(['calf', 'lamb', 'kid']);

describe('OI-0127 — seed-data role assignment', () => {
  it('weaningAgeDays is non-null only on offspring roles', () => {
    for (const [species, rows] of Object.entries(ANIMAL_CLASSES_BY_SPECIES)) {
      for (const row of rows) {
        if (OFFSPRING_ROLES.has(row.role)) {
          expect(row.weaningAgeDays, `${species}/${row.role} offspring should carry a weaning interval`).not.toBeNull();
          expect(typeof row.weaningAgeDays).toBe('number');
          expect(row.weaningAgeDays).toBeGreaterThan(0);
        } else {
          expect(row.weaningAgeDays, `${species}/${row.role} non-offspring must carry null weaningAgeDays`).toBeNull();
        }
      }
    }
  });

  it('dmiPctLactating is non-null only on dam roles', () => {
    for (const [species, rows] of Object.entries(ANIMAL_CLASSES_BY_SPECIES)) {
      for (const row of rows) {
        if (DAM_ROLES.has(row.role)) {
          expect(row.dmiPctLactating, `${species}/${row.role} dam should carry a lactating DMI%`).not.toBeNull();
          expect(typeof row.dmiPctLactating).toBe('number');
        } else {
          expect(row.dmiPctLactating, `${species}/${row.role} non-dam must carry null dmiPctLactating`).toBeNull();
        }
      }
    }
  });

  it('beef_cattle calf carries 205-day weaning per NRCS default', () => {
    const calf = ANIMAL_CLASSES_BY_SPECIES.beef_cattle.find(c => c.role === 'calf');
    expect(calf.weaningAgeDays).toBe(205);
  });

  it('beef_cattle cow no longer carries weaningAgeDays', () => {
    const cow = ANIMAL_CLASSES_BY_SPECIES.beef_cattle.find(c => c.role === 'cow');
    expect(cow.weaningAgeDays).toBeNull();
    expect(cow.dmiPctLactating).toBe(3.0);
  });

  it('sheep lamb carries 90-day weaning; ewe carries null', () => {
    const lamb = ANIMAL_CLASSES_BY_SPECIES.sheep.find(c => c.role === 'lamb');
    const ewe = ANIMAL_CLASSES_BY_SPECIES.sheep.find(c => c.role === 'ewe');
    expect(lamb.weaningAgeDays).toBe(90);
    expect(ewe.weaningAgeDays).toBeNull();
  });

  it('goat kid carries 90-day weaning; doe carries null', () => {
    const kid = ANIMAL_CLASSES_BY_SPECIES.goat.find(c => c.role === 'kid');
    const doe = ANIMAL_CLASSES_BY_SPECIES.goat.find(c => c.role === 'doe');
    expect(kid.weaningAgeDays).toBe(90);
    expect(doe.weaningAgeDays).toBeNull();
  });

  it('dairy_cattle calf carries 60-day weaning (industry standard early weaning)', () => {
    const calf = ANIMAL_CLASSES_BY_SPECIES.dairy_cattle.find(c => c.role === 'calf');
    expect(calf.weaningAgeDays).toBe(60);
  });
});
