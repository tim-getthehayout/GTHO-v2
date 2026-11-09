/** Backend farm reads: service-role queries always scoped to the authenticated
 * operation and mapped through each entity's fromSupabaseShape. Unsynced local
 * edits are invisible here; the browser re-validates at apply. */
import { SYNC_REGISTRY } from '../../../data/sync-registry.js';

export const SERVER_FARM_ENTITIES = Object.freeze(['farms', 'groups', 'locations', 'events', 'eventPaddockWindows', 'eventGroupWindows', 'animals', 'animalClasses', 'animalBreedingRecords', 'animalHeatRecords', 'animalCalvingRecords']);

export function createServerFarmData({ client, operationId, pageSize = 1000 }) {
  if (!client || !operationId) throw new Error('server-farm-data-bindings-required');
  const cache = new Map();
  async function load(entity) {
    const registration = SYNC_REGISTRY[entity];
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await client.from(registration.table).select('*').eq('operation_id', operationId).range(from, from + pageSize - 1);
      if (error) throw new Error('farm-read-failed');
      rows.push(...(data || []).map(row => registration.from(row)));
      if (!data || data.length < pageSize) break;
    }
    // Defense in depth: never return a row from another operation.
    return rows.filter(row => row.operationId === operationId);
  }
  return async function getAll(entity) {
    if (!SERVER_FARM_ENTITIES.includes(entity) || !SYNC_REGISTRY[entity]) throw new Error('farm-read-entity-not-allowed');
    if (!cache.has(entity)) cache.set(entity, load(entity).catch(error => { cache.delete(entity); throw error; }));
    return globalThis.structuredClone(await cache.get(entity));
  };
}
