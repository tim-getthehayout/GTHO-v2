/** Content-free live-voice telemetry. Lands in app_logs via the existing logger flush.
 * Never include audio, transcript text, tokens, or ids in the logged context. */
import { logger } from '../../../utils/logger.js';

const ALLOWED_KEYS = Object.freeze([
  'ms', 'audioContextState', 'sampleRate', 'declaredRate', 'chunkCount', 'totalBytes',
  'attempt', 'reason', 'ok', 'event', 'eventCount', 'flushed', 'emitted',
]);
const ALLOWED = new Set(ALLOWED_KEYS);

/** Drop any field that is not a known numeric/state token. */
export function sanitizeVoiceLogContext(fields = {}) {
  const context = {};
  for (const key of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = fields[key];
    if (value == null) continue;
    const type = typeof value;
    if (type === 'number' || type === 'boolean' || type === 'string') context[key] = value;
  }
  return context;
}

/** @param {string} phase short token such as tap, connecting, mic-open, mint-start, voice-ready, teardown */
export function logVoice(phase, fields = {}, now, tapAt) {
  const context = sanitizeVoiceLogContext(fields);
  if (tapAt != null && context.ms == null) {
    const stamp = typeof now === 'function' ? now() : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    context.ms = Math.round(stamp - tapAt);
  }
  logger.info('assistant-voice', String(phase), context);
}

export { ALLOWED as VOICE_LOG_ALLOWED_KEYS };
