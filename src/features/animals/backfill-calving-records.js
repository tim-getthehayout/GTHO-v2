/** @file OI-0132 Class B — backfill calving records from lineage.
 *
 * Walks every animal in the operation and routes qualifying calves (damId set,
 * birthDate set, no matching animal_calving_records row) through the A1 branch
 * of `syncCalvingRecordForAnimal`. Idempotent: re-running reports 0 created
 * because the helper's "already exists" short-circuit fires.
 *
 * Skip reasons mirror OI-0132 Class B spec §UX Flow §3:
 *   - damId null → not counted at all
 *   - birthDate null → skippedNoBirthDate
 *   - damId points at non-existent animal → skippedDamMissing
 *   - record already exists for (damId, calfId) → skippedAlreadyExists
 *   - helper/store throws → skippedError (logged via logger.error)
 */

import { getAll } from '../../data/store.js';
import { syncCalvingRecordForAnimal } from './calving-sync.js';
import { logger } from '../../utils/logger.js';

/**
 * @param {string} operationId
 * @returns {Promise<{
 *   created: number,
 *   skippedNoBirthDate: number,
 *   skippedDamMissing: number,
 *   skippedAlreadyExists: number,
 *   skippedError: number,
 * }>}
 */
export async function backfillCalvingRecords(operationId) {
  const summary = {
    created: 0,
    skippedNoBirthDate: 0,
    skippedDamMissing: 0,
    skippedAlreadyExists: 0,
    skippedError: 0,
  };

  const animals = getAll('animals').filter(a => a.operationId === operationId);
  for (const calf of animals) {
    if (!calf.damId) continue;
    if (!calf.birthDate) {
      summary.skippedNoBirthDate += 1;
      continue;
    }
    try {
      const result = await syncCalvingRecordForAnimal({
        before: { damId: null, birthDate: calf.birthDate, sireAnimalId: calf.sireAnimalId || null },
        after: { id: calf.id, damId: calf.damId, birthDate: calf.birthDate, sireAnimalId: calf.sireAnimalId || null },
        operationId,
        confirmDeleteHandler: null,
      });
      if (result.action === 'create') {
        summary.created += 1;
      } else if (result.action === 'noop' && result.reason === 'dam-not-found') {
        summary.skippedDamMissing += 1;
      } else if (result.action === 'noop' && result.reason === 'already-exists') {
        summary.skippedAlreadyExists += 1;
      }
    } catch (err) {
      summary.skippedError += 1;
      logger.error('calving-backfill', 'failed for calf', {
        calfId: calf.id,
        damId: calf.damId,
        error: err?.message || String(err),
      });
    }
  }

  return summary;
}
