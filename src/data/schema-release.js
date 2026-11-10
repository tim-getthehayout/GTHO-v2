/** Compiled compatibility ceiling, NOT the highest written migration.
 * Advance only after Tim's separate approval, backup, apply and column verification.
 * No runtime/localStorage flag may opt an unapplied schema into writes. */
export const RELEASED_SCHEMA_VERSION = 41;
export const HELD_SCHEMA_VERSIONS = [42];
export const STAGED_COLUMNS = {
  42: { ai_bulls: ['epds'], animal_breeding_records: ['sire_name'] },
};
