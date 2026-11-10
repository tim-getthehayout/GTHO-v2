/** Empty-start cleanup (mic failure / Type-instead? No): delete the conversation's
 * session checkpoint, session lock, and voice_entry_attempts only. Billing and
 * usage rows are never touched. Refuses when any transcript turn already exists.
 * GTHO-side only — does not change the vendor cancel() checkpoint behaviour. */
import { RuntimeError } from '../shared.js';

function requireData(result) {
  if (result?.error) throw new Error(result.error.message || 'assistant-persistence-failed');
  return result?.data;
}

/**
 * @param {object} client service-role (or membership-scoped) supabase-js client
 * @param {{ operationId: string, conversationRef: string }} args
 * @returns {Promise<{'outcome': 'discarded'}>}
 */
export async function discardEmptyStartRows(client, { operationId, conversationRef }) {
  if (!operationId || !conversationRef) throw new RuntimeError('discard-empty-args-required');

  const turns = requireData(await client
    .from('assistant_transcript_turns')
    .select('id')
    .eq('operation_id', operationId)
    .eq('conversation_id', conversationRef)
    .limit(1));
  if (turns?.length) throw new RuntimeError('discard-empty-refused-turns-exist');

  // Order: attempt rows (FK to conversation) → checkpoint → lock → conversation.
  requireData(await client.from('voice_entry_attempts').delete().eq('operation_id', operationId).eq('conversation_id', conversationRef));
  requireData(await client.from('assistant_session_checkpoints').delete().eq('operation_id', operationId).eq('conversation_id', conversationRef));
  requireData(await client.from('assistant_session_locks').delete().eq('operation_id', operationId).eq('conversation_ref', conversationRef));
  requireData(await client.from('assistant_conversations').delete().eq('operation_id', operationId).eq('id', conversationRef));

  return { outcome: 'discarded' };
}
