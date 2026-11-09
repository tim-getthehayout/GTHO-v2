/** Caller identity: verified Supabase JWT -> auth user id; operation from the
 * caller's accepted memberships (X-GTHO-Operation only selects among them). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = (status, error) => ({ status, error });

export function createIdentity({ client, config }) {
  async function acceptedOperations(userId) {
    const { data, error } = await client.from('operation_members').select('operation_id').eq('user_id', userId).not('accepted_at', 'is', null);
    if (error) throw new Error('membership-lookup-failed');
    return [...new Set((data || []).map(row => String(row.operation_id).toLowerCase()))];
  }
  async function resolve(request) {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
    if (!match) return deny(401, 'unauthenticated');
    const { data, error } = await client.auth.getUser(match[1]);
    const actorId = data?.user?.id?.toLowerCase();
    if (error || !UUID.test(actorId ?? '')) return deny(401, 'unauthenticated');
    const operations = await acceptedOperations(actorId);
    const requested = request.headers.get('x-gtho-operation')?.trim().toLowerCase();
    let operationId;
    if (requested) {
      if (!operations.includes(requested)) return deny(403, 'operation-membership-required');
      operationId = requested;
    } else if (operations.length === 1) operationId = operations[0];
    else if (!operations.length) return deny(403, 'operation-membership-required');
    else return deny(400, 'operation-header-required');
    // Allowlist is checked before any reservation, provider call or session load.
    if (!config.operations.includes(operationId)) return deny(403, 'assistant-not-enabled');
    const scope = { operationId, actorId };
    let membership;
    return { status: 200, identity: { scope, canControlBilling: config.billingControlUsers.includes(actorId) },
      /** Port authorization: same verified scope, still an accepted member, still allowlisted. */
      async authorize(incoming) {
        if (incoming?.operationId !== scope.operationId || incoming?.actorId !== scope.actorId) return false;
        membership ??= acceptedOperations(actorId).then(ops => ops.includes(operationId) && config.operations.includes(operationId));
        return membership;
      } };
  }
  return { resolve };
}
