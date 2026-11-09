/** Function configuration. Exactly eight GTHO function secrets; platform-provided
 * SUPABASE_* values are read separately and are never set by GTHO. Values are
 * never logged or echoed. Any missing/invalid secret keeps every function at 503.
 */
export const FUNCTION_SECRETS = Object.freeze([
  'XAI_API_KEY', 'GTHO_XAI_TEXT_MODEL', 'GTHO_XAI_VOICE_MODEL', 'GTHO_ASSISTANT_ENABLED',
  'GTHO_ASSISTANT_OPERATIONS', 'GTHO_ASSISTANT_EARLY_TESTING', 'GTHO_ASSISTANT_ORIGINS', 'GTHO_BILLING_CONTROL_USERS',
]);

// Technical constants from the binding. Not secrets, not caller-controlled.
export const TECHNICAL_BUDGETS = Object.freeze({ maxReadRounds: 3, maxBodyBytes: 65536 });
export const PROVIDER_TIMEOUT_MS = 25_000;
export const CLIENT_SECRET_TTL_SECONDS = 60;
export const MAX_CLIENT_SECRET_LIFETIME_MS = 120_000;
export const VOICE_SESSION_CAP_SECONDS = 600;
export const VOICE_NAME = 'eve';
export const VOICE_REASONING = 'none';
/** Unverified: whether client_secrets accepts a session {model, reasoning}. Off by default;
 * the active path passes ?model= from this server's config to the realtime URL. */
export const BIND_SESSION_IN_CLIENT_SECRET = false;
/** Manual commit (turn_detection null) is the default; server_vad is unverified. */
export const TURN_DETECTION = 'manual';
export const STT_MODEL = 'grok-voice-transcribe-2.0';
export const OFFLINE_NOTE_MAX_SECONDS = 180;
export const TESTING_AUDIO_BUCKET = 'assistant-testing-audio';
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const AUDIO_MIME_TYPES = Object.freeze(['audio/webm', 'audio/mp4']);
export const XAI_BASE_URL = 'https://api.x.ai/v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = value => String(value).split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
const present = value => typeof value === 'string' && value.trim().length > 0;
const pinnedModel = value => present(value) && !/latest/i.test(value) && /^[A-Za-z0-9._-]+$/.test(value.trim());
function origin(value) {
  try {
    const url = new URL(value);
    if (url.origin !== value) return false;
    return url.protocol === 'https:' || url.origin === 'http://localhost:5173';
  } catch { return false; }
}
function serviceKey(env) {
  if (present(env.SUPABASE_SERVICE_ROLE_KEY)) return env.SUPABASE_SERVICE_ROLE_KEY.trim();
  if (!present(env.SUPABASE_SECRET_KEYS)) return null;
  try {
    const keys = JSON.parse(env.SUPABASE_SECRET_KEYS);
    const value = keys?.default ?? Object.values(keys ?? {})[0];
    return present(value) ? value.trim() : null;
  } catch { return null; }
}

/** The configured browser origins when GTHO_ASSISTANT_ORIGINS is valid, else [].
 * Lets an unconfigured (503) function still answer allowed origins with CORS. */
export function readOrigins(env = {}) {
  const origins = present(env.GTHO_ASSISTANT_ORIGINS) ? list(env.GTHO_ASSISTANT_ORIGINS) : [];
  return origins.length && origins.every(origin) ? Object.freeze(origins) : Object.freeze([]);
}

/** Returns {ok:true, config} or {ok:false, reason} with only a secret NAME as reason. */
export function readConfig(env = {}) {
  for (const name of FUNCTION_SECRETS) if (!present(env[name])) return { ok: false, reason: `missing:${name}` };
  if (env.GTHO_ASSISTANT_ENABLED.trim() !== 'true') return { ok: false, reason: 'disabled' };
  const early = env.GTHO_ASSISTANT_EARLY_TESTING.trim();
  if (!['true', 'false'].includes(early)) return { ok: false, reason: 'invalid:GTHO_ASSISTANT_EARLY_TESTING' };
  if (!pinnedModel(env.GTHO_XAI_TEXT_MODEL)) return { ok: false, reason: 'invalid:GTHO_XAI_TEXT_MODEL' };
  if (!pinnedModel(env.GTHO_XAI_VOICE_MODEL)) return { ok: false, reason: 'invalid:GTHO_XAI_VOICE_MODEL' };
  const operations = list(env.GTHO_ASSISTANT_OPERATIONS);
  if (!operations.length || !operations.every(id => UUID.test(id))) return { ok: false, reason: 'invalid:GTHO_ASSISTANT_OPERATIONS' };
  const billingControlUsers = list(env.GTHO_BILLING_CONTROL_USERS);
  if (!billingControlUsers.length || !billingControlUsers.every(id => UUID.test(id))) return { ok: false, reason: 'invalid:GTHO_BILLING_CONTROL_USERS' };
  const origins = list(env.GTHO_ASSISTANT_ORIGINS);
  if (!origins.length || !origins.every(origin)) return { ok: false, reason: 'invalid:GTHO_ASSISTANT_ORIGINS' };
  const key = serviceKey(env);
  if (!present(env.SUPABASE_URL) || !present(env.SUPABASE_DB_URL) || !key) return { ok: false, reason: 'missing:platform' };
  return { ok: true, config: Object.freeze({
    xaiApiKey: env.XAI_API_KEY.trim(),
    textModel: env.GTHO_XAI_TEXT_MODEL.trim(),
    voiceModel: env.GTHO_XAI_VOICE_MODEL.trim(),
    operations: Object.freeze(operations.map(id => id.toLowerCase())),
    earlyTesting: early === 'true',
    origins: Object.freeze(origins),
    billingControlUsers: Object.freeze(billingControlUsers.map(id => id.toLowerCase())),
    supabaseUrl: env.SUPABASE_URL.trim(),
    databaseUrl: env.SUPABASE_DB_URL.trim(),
    serviceKey: key,
  }) };
}

/** Public, non-secret realtime settings the PWA needs (used for ?model=). */
export function publicVoiceConfig(config) {
  return {
    provider: 'xai', model: config.voiceModel, voice: VOICE_NAME, reasoning: VOICE_REASONING,
    sessionCapSeconds: VOICE_SESSION_CAP_SECONDS, turnDetection: TURN_DETECTION,
    bindSessionInClientSecret: BIND_SESSION_IN_CLIENT_SECRET, earlyTesting: config.earlyTesting,
    offlineNoteMaxSeconds: OFFLINE_NOTE_MAX_SECONDS, maxAudioBytes: MAX_AUDIO_BYTES,
  };
}
