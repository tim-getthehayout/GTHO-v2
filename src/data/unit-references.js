/** Unit-specific selectors; shared standards never enter outbound mutation paths. */
import { getAll, getOperation } from './store.js';
import { UNIT_ENTITIES, normalizeUnitName, foldUnitName } from '../utils/unit-standards.js';
import { t } from '../i18n/i18n.js';
export function unitsFor(entity, operationId = getOperation()?.id, { selectedId = null, includeArchived = false } = {}) {
  return getAll(entity).filter(row => (row.operationId == null || row.operationId === operationId) && (includeArchived || !row.archived || row.id === selectedId));
}
export function validateCustomUnitName(entity, name, operationId, id = null) {
  const normalized = normalizeUnitName(name);
  if (!normalized || unitsFor(entity, operationId, { includeArchived: true }).some(row => row.id !== id && foldUnitName(row.name) === foldUnitName(normalized))) throw new Error(t('unitCatalog.reserved'));
  return normalized;
}
export const isUnitEntity = entity => Object.hasOwn(UNIT_ENTITIES, entity);
