/** Client-safe typed artifacts use the existing validate/store/sync paths only. */
import * as Store from '../../data/store.js';
import { ASSISTANT_ENTITIES } from './entities.js';

export function createArtifactStore({ authorize, store = Store }) {
  return async (scope, entityType, data) => {
    if (await authorize(scope) !== true) throw new Error('unauthorized');
    const binding = ASSISTANT_ENTITIES[entityType];
    if (!binding || binding.serverOnly) throw new Error('backend-only-or-unknown-artifact');
    if (data.operationId !== scope.operationId) throw new Error('artifact-operation-mismatch');
    const record = binding.entity.create(data);
    const existing = store.getById(entityType, record.id);
    if (existing && existing.operationId !== scope.operationId) throw new Error('artifact-operation-mismatch');
    if (existing && ['assistantProposalRevisions','assistantFieldMappings','assistantReviewCards','assistantReviewConfirmations','assistantTranscriptTurns'].includes(entityType)) {
      const mutable = entityType === 'assistantProposalRevisions' ? ['supersededById','updatedAt'] : [];
      for (const field of Object.keys(record)) {
        if (!mutable.includes(field) && JSON.stringify(record[field]) !== JSON.stringify(existing[field])) throw new Error('immutable-artifact-content');
      }
    }
    return existing
      ? store.update(entityType, record.id, record, binding.entity.validate, binding.entity.toSupabaseShape, binding.table)
      : store.add(entityType, record, binding.entity.validate, binding.entity.toSupabaseShape, binding.table);
    // An add/update return is NOT a durable-local-save receipt: the existing
    // localStorage wrapper currently swallows persistence errors.
  };
}
