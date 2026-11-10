/** Empty-start cleanup (mic failure / Type-instead? No): route through the
 * atomic SECURITY DEFINER RPC `assistant_discard_empty_start`. Billing and
 * usage rows are never touched. Refuses when any transcript turn already
 * exists. GTHO-side only — does not change the vendor cancel() checkpoint
 * behaviour. */
import { RuntimeError } from '../shared.js';

/**
 * @param {object} client user-scoped (JWT) supabase-js client — auth.uid() must be set
 * @param {{ operationId: string, conversationRef: string }} args
 * @returns {Promise<{'outcome': 'discarded'}>}
 */
export async function discardEmptyStartRows(client, { operationId, conversationRef }) {
  if (!operationId || !conversationRef) throw new RuntimeError('discard-empty-args-required');

  const { data, error } = await client.rpc('assistant_discard_empty_start', {
    p_operation: operationId,
    p_conversation: conversationRef,
  });
  if (error) {
    const msg = String(error.message || error.code || 'discard-empty-failed');
    if (/discard-empty-refused-turns-exist/.test(msg)) throw new RuntimeError('discard-empty-refused-turns-exist');
    if (/discard-empty-auth-required/.test(msg)) throw new RuntimeError('discard-empty-auth-required');
    if (/discard-empty-membership-required/.test(msg)) throw new RuntimeError('discard-empty-membership-required');
    if (/assistant-restore-in-progress/.test(msg)) throw new RuntimeError('assistant-restore-in-progress');
    if (/discard-empty-args-required/.test(msg)) throw new RuntimeError('discard-empty-args-required');
    throw new RuntimeError(msg);
  }
  if (data !== 'discarded') throw new RuntimeError('discard-empty-unexpected-outcome');
  return { outcome: 'discarded' };
}
