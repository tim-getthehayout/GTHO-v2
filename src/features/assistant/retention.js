/** GTHO's finished-at retention policy. This is a plan, not a deletion runner. */
const DAY_MS = 24 * 60 * 60 * 1000;
const attemptLinks = ['assistantProposals', 'assistantExecutionResults', 'assistantTestingAudio', 'offlineVoiceNotes'];

/**
 * Only finished attempts and their mapping/correction rows are removal targets.
 * Retained artifacts get nullable links detached, never cascaded away. A caller
 * must apply the plan atomically against current authorized data before deletion.
 * Discarded/unfinished recordings and attempts are never retention targets.
 */
export function planFinishedAttemptExpiry(data, { operationId, now }) {
  const nowMs = Date.parse(now);
  if (!operationId || !Number.isFinite(nowMs)) throw new Error('retention-scope-and-clock-required');
  const scoped = entity => (data[entity] || []).filter(row => row.operationId === operationId);
  const attempts = scoped('voiceEntryAttempts').filter(row => row.status === 'finished' && Number.isFinite(Date.parse(row.finishedAt)) && Date.parse(row.finishedAt) <= nowMs - 90 * DAY_MS);
  const attemptIds = new Set(attempts.map(row => row.id));
  const mappings = scoped('assistantFieldMappings').filter(row => attemptIds.has(row.attemptId));
  const mappingIds = new Set(mappings.map(row => row.id));
  const detach = [];
  for (const entityType of attemptLinks) {
    for (const row of scoped(entityType)) {
      if (attemptIds.has(row.attemptId)) detach.push({ entityType, id: row.id, changes: { attemptId: null } });
    }
  }
  // Clear self/predecessor links before the target rows go away, including links
  // from retained later attempts/mappings. Do not remove those retained rows.
  for (const row of scoped('voiceEntryAttempts')) {
    if (attemptIds.has(row.previousAttemptId)) detach.push({ entityType: 'voiceEntryAttempts', id: row.id, changes: { previousAttemptId: null } });
  }
  for (const row of scoped('assistantFieldMappings')) {
    if (mappingIds.has(row.correctionPredecessorId)) detach.push({ entityType: 'assistantFieldMappings', id: row.id, changes: { correctionPredecessorId: null } });
  }
  return {
    detach,
    remove: { assistantFieldMappings: [...mappingIds], voiceEntryAttempts: [...attemptIds] },
  };
}
