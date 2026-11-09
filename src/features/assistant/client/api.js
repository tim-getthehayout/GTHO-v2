/** Browser client for the GTHO assistant functions. Sends the caller's Supabase
 * session JWT; never a provider key, operation in the body, or client totals. */
export class AssistantApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function createAssistantApi({ supabaseUrl, anonKey, getAccessToken, operationId, fetch = (...args) => globalThis.fetch(...args), randomUUID = () => crypto.randomUUID() }) {
  if (!supabaseUrl || !anonKey || typeof getAccessToken !== 'function') throw new Error('assistant-api-config-required');
  const base = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
  async function headers(extra = {}) {
    const token = await getAccessToken();
    if (!token) throw new AssistantApiError(401, 'unauthenticated');
    return { authorization: `Bearer ${token}`, apikey: anonKey, ...(operationId ? { 'x-gtho-operation': operationId } : {}), ...extra };
  }
  async function call(name, init, query = '') {
    const response = await fetch(`${base}/${name}${query}`, init);
    let body = null;
    try { body = await response.json(); } catch { /* empty body */ }
    if (!response.ok) throw new AssistantApiError(response.status, body?.error ?? 'request-failed');
    return body;
  }
  const postJson = async (name, body) => call(name, { method: 'POST', headers: await headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) });
  return {
    /** Non-secret realtime config; null when this operation is not allowlisted (403 hides the control). */
    async config() {
      try { return (await call('gtho-assistant', { method: 'GET', headers: await headers() })).config; }
      catch (error) { if (error.status === 403 || error.status === 401) return null; throw error; }
    },
    /** Every POST gets a fresh requestRef: each is its own metered reservation. */
    command(conversationRef, command, payload = {}) {
      return postJson('gtho-assistant', { ...payload, command, conversationRef, requestRef: randomUUID() });
    },
    apply(receipt) { return postJson('gtho-assistant-apply', receipt); },
    testingAudioUpload(conversationRef, mimeType) { return postJson('gtho-assistant-audio', { conversationRef, mimeType }); },
    async transcribe(blob, requestRef = randomUUID()) {
      const type = (blob.type || '').split(';')[0];
      return call('gtho-assistant-transcribe', { method: 'POST', headers: await headers({ 'content-type': type }), body: blob }, `?requestRef=${encodeURIComponent(requestRef)}`);
    },
  };
}
