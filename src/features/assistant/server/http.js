/* global Headers */
/** Response and CORS helpers shared by GTHO assistant functions. */
export const ALLOWED_HEADERS = 'authorization, apikey, content-type, x-gtho-operation';

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export const unconfigured = () => json({ error: 'gtho-host-bindings-required' }, 503);
/** The unconfigured 503 (and OPTIONS) with the same origin-checked CORS headers as a configured function. */
export const unconfiguredWithCors = origins => withCors(origins, async () => unconfigured());

export function corsHeaders(request, origins) {
  const origin = request.headers.get('origin');
  if (!origin || !origins.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
}

/** Browser origins outside GTHO_ASSISTANT_ORIGINS get no CORS grant; a request
 * that names a disallowed Origin is refused outright. */
export function withCors(origins, handler) {
  return async request => {
    const cors = corsHeaders(request, origins);
    const named = request.headers.has('origin');
    if (request.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    if (named && !cors) return json({ error: 'origin-not-allowed' }, 403);
    const response = await handler(request);
    if (!cors) return response;
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

export const httpError = (status, error) => Object.assign(new Error(error), { status, code: error });

/** Reads at most maxBytes from the body stream; never buffers an oversized body. */
export async function readBytes(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw httpError(400, 'body-required');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw httpError(413, 'request-too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readJson(request, maxBytes) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw httpError(400, 'json-required');
  const bytes = await readBytes(request, maxBytes);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw httpError(400, 'invalid-json'); }
}
