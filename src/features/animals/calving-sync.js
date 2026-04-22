/** @file OI-0132 Class A — dam ↔ calf bidirectional sync helper.
 *
 * Keeps `animal_calving_records` in lockstep with `animals.dam_id` /
 * `animals.birth_date` whenever either changes on a calf. Called from:
 *
 *  - `saveAnimal` (Edit Animal dialog) after the `update('animals', ...)` lands
 *    — full A1/A2/A3/A4/noop routing.
 *  - `backfillCalvingRecords` (Settings > Tools) in A1-only mode to heal
 *    legacy calves that carry direct dam pointers without matching records.
 *  - Future Excel import row-write path.
 *
 * Returns a discriminated result `{ action, calvingRecordId, aborted, reason }`
 * so callers can branch on outcome. Four `action` values map to the transitions;
 * `'noop'` covers the non-mutating paths with `reason` naming which one:
 *   - `'already-exists'` — A1 short-circuit: record already present for (dam, calf).
 *   - `'dam-not-found'` — dam id doesn't match any live animal in the operation.
 *   - `'no-change'` — before/after identical or calf has no damId either side.
 *
 * `aborted` is `true` only when A3's confirmDeleteHandler returned `false`.
 */

import { getAll, add, update, remove } from '../../data/store.js';
import * as CalvingEntity from '../../entities/animal-calving-record.js';
import { logger } from '../../utils/logger.js';

/**
 * @param {object} args
 * @param {{ damId: string|null, birthDate: string|null, sireAnimalId?: string|null }|null} args.before
 *   Pre-save snapshot. Pass `null` for creates / backfill A1 mode (treated as all-null).
 * @param {{ id: string, damId: string|null, birthDate: string|null, sireAnimalId?: string|null }} args.after
 *   Post-save animal record (id + the three fields we care about).
 * @param {string} args.operationId
 * @param {((damName: string) => Promise<boolean>|boolean)|null} [args.confirmDeleteHandler]
 *   Called only on A3 (damId non-null → null). Returns true to proceed, false to abort.
 *   Pass `null` in backfill / non-UI contexts — A3 will then always abort.
 * @returns {Promise<{ action: 'create'|'move'|'delete'|'update-date'|'noop', calvingRecordId: string|null, aborted: boolean, reason?: string }>}
 */
export async function syncCalvingRecordForAnimal({ before, after, operationId, confirmDeleteHandler = null }) {
  const beforeDamId = before?.damId ?? null;
  const beforeBirthDate = before?.birthDate ?? null;
  const afterDamId = after?.damId ?? null;
  const afterBirthDate = after?.birthDate ?? null;

  // A1 — create
  if (!beforeDamId && afterDamId) {
    const dam = getAll('animals').find(a => a.id === afterDamId && a.operationId === operationId);
    if (!dam) {
      logger.warn('calving-sync', 'dam not found', { damId: afterDamId, calfId: after.id });
      return { action: 'noop', calvingRecordId: null, aborted: false, reason: 'dam-not-found' };
    }
    const existing = getAll('animalCalvingRecords').find(
      r => r.damId === afterDamId && r.calfId === after.id,
    );
    if (existing) {
      return { action: 'noop', calvingRecordId: existing.id, aborted: false, reason: 'already-exists' };
    }
    const record = CalvingEntity.create({
      operationId,
      damId: afterDamId,
      calfId: after.id,
      calvedAt: `${afterBirthDate}T12:00:00Z`,
      sireAnimalId: after.sireAnimalId || null,
      sireAiBullId: null,
      stillbirth: false,
      driedOffDate: null,
      notes: null,
    });
    add('animalCalvingRecords', record, CalvingEntity.validate,
      CalvingEntity.toSupabaseShape, 'animal_calving_records');
    return { action: 'create', calvingRecordId: record.id, aborted: false };
  }

  // A2 — move (dam changed)
  if (beforeDamId && afterDamId && beforeDamId !== afterDamId) {
    const dam = getAll('animals').find(a => a.id === afterDamId && a.operationId === operationId);
    if (!dam) {
      logger.warn('calving-sync', 'dam not found', { damId: afterDamId, calfId: after.id });
      return { action: 'noop', calvingRecordId: null, aborted: false, reason: 'dam-not-found' };
    }
    const existing = getAll('animalCalvingRecords').find(
      r => r.damId === beforeDamId && r.calfId === after.id,
    );
    if (!existing) {
      // Legacy gap — fall through to A1.
      const record = CalvingEntity.create({
        operationId,
        damId: afterDamId,
        calfId: after.id,
        calvedAt: `${afterBirthDate}T12:00:00Z`,
        sireAnimalId: after.sireAnimalId || null,
        sireAiBullId: null,
        stillbirth: false,
        driedOffDate: null,
        notes: null,
      });
      add('animalCalvingRecords', record, CalvingEntity.validate,
        CalvingEntity.toSupabaseShape, 'animal_calving_records');
      return { action: 'create', calvingRecordId: record.id, aborted: false };
    }
    const changes = { damId: afterDamId };
    if (afterBirthDate !== beforeBirthDate) {
      changes.calvedAt = `${afterBirthDate}T12:00:00Z`;
    }
    update('animalCalvingRecords', existing.id, changes,
      CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
    return { action: 'move', calvingRecordId: existing.id, aborted: false };
  }

  // A3 — delete (dam cleared)
  if (beforeDamId && !afterDamId) {
    const existing = getAll('animalCalvingRecords').find(
      r => r.damId === beforeDamId && r.calfId === after.id,
    );
    if (!existing) {
      return { action: 'noop', calvingRecordId: null, aborted: false, reason: 'no-change' };
    }
    const dam = getAll('animals').find(a => a.id === beforeDamId);
    const damName = dam?.tagNum || dam?.name || `A-${beforeDamId.slice(0, 5)}`;
    const proceed = confirmDeleteHandler
      ? await confirmDeleteHandler(damName)
      : false;
    if (!proceed) {
      return { action: 'delete', calvingRecordId: existing.id, aborted: true };
    }
    remove('animalCalvingRecords', existing.id, 'animal_calving_records');
    return { action: 'delete', calvingRecordId: existing.id, aborted: false };
  }

  // A4 — birthdate changed, dam unchanged and non-null
  if (beforeDamId && afterDamId && beforeDamId === afterDamId && beforeBirthDate !== afterBirthDate) {
    const existing = getAll('animalCalvingRecords').find(
      r => r.damId === afterDamId && r.calfId === after.id,
    );
    if (!existing) {
      // Legacy gap — fall through to A1. Dam existence still enforced.
      const dam = getAll('animals').find(a => a.id === afterDamId && a.operationId === operationId);
      if (!dam) {
        logger.warn('calving-sync', 'dam not found', { damId: afterDamId, calfId: after.id });
        return { action: 'noop', calvingRecordId: null, aborted: false, reason: 'dam-not-found' };
      }
      const record = CalvingEntity.create({
        operationId,
        damId: afterDamId,
        calfId: after.id,
        calvedAt: `${afterBirthDate}T12:00:00Z`,
        sireAnimalId: after.sireAnimalId || null,
        sireAiBullId: null,
        stillbirth: false,
        driedOffDate: null,
        notes: null,
      });
      add('animalCalvingRecords', record, CalvingEntity.validate,
        CalvingEntity.toSupabaseShape, 'animal_calving_records');
      return { action: 'create', calvingRecordId: record.id, aborted: false };
    }
    update('animalCalvingRecords', existing.id, {
      calvedAt: `${afterBirthDate}T12:00:00Z`,
    }, CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
    return { action: 'update-date', calvingRecordId: existing.id, aborted: false };
  }

  return { action: 'noop', calvingRecordId: null, aborted: false, reason: 'no-change' };
}
