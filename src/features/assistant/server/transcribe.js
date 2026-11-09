/* global AbortSignal, FormData */
/** gtho-assistant-transcribe: reviewed-later transcript for an offline voice note.
 * Metered by reserve/finish; audio minutes come from xAI's reported duration. */
import { RuntimeError } from '../shared.js';
import { readBytes, json, httpError } from './http.js';
import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES, PROVIDER_TIMEOUT_MS, STT_MODEL, XAI_BASE_URL } from './config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createTranscribeHandler({ config, billing, fetch = globalThis.fetch, timeoutMs = PROVIDER_TIMEOUT_MS }) {
  return async (scope, request) => {
    const requestRef = new URL(request.url).searchParams.get('requestRef');
    if (!UUID.test(requestRef ?? '')) throw httpError(400, 'request-ref-required');
    const mimeType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!AUDIO_MIME_TYPES.includes(mimeType)) throw httpError(400, 'unsupported-audio-type');
    const audio = await readBytes(request, MAX_AUDIO_BYTES);
    if (!audio.byteLength) throw httpError(400, 'audio-required');
    // Caps refuse here, before any provider call (surfaces as 503 like the runtime).
    const lease = await billing.reserve(scope, 'offline-note', `transcribe:${requestRef}`, { kind: 'request' });
    const usage = { model: STT_MODEL, inputTokens: 0, outputTokens: 0, audioMinutes: 0, requestCount: 1 };
    let failed = true;
    try {
      const form = new FormData();
      form.append('model', STT_MODEL); // Option fields precede file per xAI docs.
      form.append('file', new Blob([audio], { type: mimeType }), mimeType === 'audio/mp4' ? 'note.mp4' : 'note.webm');
      const response = await fetch(`${XAI_BASE_URL}/stt`, { method: 'POST', body: form, signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)), headers: { Authorization: `Bearer ${config.xaiApiKey}` } });
      if (!response.ok) throw new RuntimeError('provider-request-failed');
      const body = await response.json();
      if (typeof body?.text !== 'string' || !Number.isFinite(body?.duration) || body.duration < 0) throw new RuntimeError('invalid-provider-output');
      usage.audioMinutes = body.duration / 60;
      failed = false;
      // Only the transcript; the user reviews it before it becomes the first turn.
      return json({ text: body.text, durationSeconds: body.duration });
    } finally {
      await billing.finish(scope, lease.lease, usage, lease.routing === 'shared', failed);
    }
  };
}
