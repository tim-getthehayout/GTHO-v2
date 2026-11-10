/** Persist runtime transcript artifacts to assistant_transcript_turns (existing
 * entity, no new shape). Idempotent on (operation, conversation, turn_index).
 * Used so a failed typed request still leaves attributable turns (OI-0206). */
import * as TranscriptTurns from '../../../entities/assistant-transcript-turns.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireData = ({ data, error }) => { if (error) throw new Error('assistant-persistence-failed'); return data; };

export async function persistTranscriptTurns({ client, scope, conversationRef, turns }) {
  if (!client || !scope?.operationId || !conversationRef || !Array.isArray(turns)) {
    throw new Error('transcript-persist-args-required');
  }
  const existing = requireData(await client.from('assistant_transcript_turns').select('id, turn_index').eq('operation_id', scope.operationId).eq('conversation_id', conversationRef)) ?? [];
  const haveIndex = new Set((existing || []).map(row => row.turn_index));
  for (let i = 0; i < turns.length; i++) {
    if (haveIndex.has(i)) continue;
    const turn = turns[i];
    if (!turn || !['user', 'assistant'].includes(turn.role) || !String(turn.text || '').trim()) continue;
    const record = TranscriptTurns.create({
      id: UUID.test(turn.id) ? turn.id : crypto.randomUUID(),
      operationId: scope.operationId,
      conversationId: conversationRef,
      turnIndex: i,
      speaker: turn.role,
      text: turn.text,
      inputMode: ['text', 'voice'].includes(turn.modality) ? turn.modality : 'text',
    });
    const validation = TranscriptTurns.validate(record);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const { error } = await client.from('assistant_transcript_turns').insert(TranscriptTurns.toSupabaseShape(record));
    if (error && error.code !== '23505') throw new Error('assistant-persistence-failed');
  }
}

/** After a failed turn, append the host question as an assistant transcript
 * entry on the existing trusted snapshot, then persist turns. Does not add
 * new snapshot keys. */
export async function recordUnresolvedClarification({ persistence, scope, conversationRef, question, modality = 'text', pendingClarification = undefined } = {}) {
  if (!persistence || !scope || !conversationRef || !String(question || '').trim()) return null;
  return persistence.withSession(scope, conversationRef, async snapshot => {
    if (!snapshot) return null;
    const text = String(question).trim();
    const already = snapshot.transcript?.some(turn => turn.role === 'assistant' && turn.text === text);
    const next = already ? { ...snapshot } : {
      ...snapshot,
      transcript: [
        ...(snapshot.transcript ?? []),
        { id: crypto.randomUUID(), role: 'assistant', modality: modality === 'voice' ? 'voice' : 'text', text },
      ],
    };
    // pendingClarification lives on the existing trusted snapshot (no new
    // checkpoint table). The key is host-only: capture is sent to the model
    // and snapshot.pending is the proposal-revision pointer.
    if (pendingClarification !== undefined) {
      if (pendingClarification) next.pendingClarification = pendingClarification;
      else delete next.pendingClarification;
    } else if (snapshot.pendingClarification) {
      next.pendingClarification = snapshot.pendingClarification;
    }
    await persistence.checkpoint(scope, next);
    return next;
  });
}
