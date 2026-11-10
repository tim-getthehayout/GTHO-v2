import { describe, it, expect } from 'vitest';
import { readConfig, readOrigins, FUNCTION_SECRETS, publicVoiceConfig, TECHNICAL_BUDGETS, PROVIDER_TIMEOUT_MS, LIVE_TRANSCRIPTION_MODEL, STT_MODEL } from '../../../../src/features/assistant/server/config.js';
import { withCors, readJson, readBytes, unconfiguredWithCors, ALLOWED_HEADERS } from '../../../../src/features/assistant/server/http.js';
import { env, OP } from './fake-supabase.js';

describe('function configuration (exactly eight GTHO secrets)', () => {
  it('names exactly the eight secrets and none starts with SUPABASE_', () => {
    expect(FUNCTION_SECRETS).toEqual(['XAI_API_KEY', 'GTHO_XAI_TEXT_MODEL', 'GTHO_XAI_VOICE_MODEL', 'GTHO_ASSISTANT_ENABLED', 'GTHO_ASSISTANT_OPERATIONS', 'GTHO_ASSISTANT_EARLY_TESTING', 'GTHO_ASSISTANT_ORIGINS', 'GTHO_BILLING_CONTROL_USERS']);
    expect(FUNCTION_SECRETS.some(name => name.startsWith('SUPABASE_'))).toBe(false);
    expect(TECHNICAL_BUDGETS).toEqual({ maxReadRounds: 3, maxBodyBytes: 65536 });
    expect(PROVIDER_TIMEOUT_MS).toBe(25000);
  });
  it.each(FUNCTION_SECRETS)('stays unconfigured without %s', name => {
    expect(readConfig(env({ [name]: '' }))).toEqual({ ok: false, reason: `missing:${name}` });
  });
  it('requires GTHO_ASSISTANT_ENABLED=true exactly', () => {
    for (const value of ['false', 'TRUE', '1', 'yes']) expect(readConfig(env({ GTHO_ASSISTANT_ENABLED: value })).ok).toBe(false);
    expect(readConfig(env()).ok).toBe(true);
  });
  it('rejects floating -latest models, malformed allowlists and origins', () => {
    expect(readConfig(env({ GTHO_XAI_VOICE_MODEL: 'grok-voice-latest' })).ok).toBe(false);
    expect(readConfig(env({ GTHO_ASSISTANT_OPERATIONS: 'not-a-uuid' })).ok).toBe(false);
    expect(readConfig(env({ GTHO_BILLING_CONTROL_USERS: 'tim' })).ok).toBe(false);
    expect(readConfig(env({ GTHO_ASSISTANT_ORIGINS: 'http://getthehayout.com' })).ok).toBe(false);
    expect(readConfig(env({ GTHO_ASSISTANT_ORIGINS: 'https://getthehayout.com,http://localhost:5173' })).ok).toBe(true);
    expect(readConfig(env({ GTHO_ASSISTANT_EARLY_TESTING: 'maybe' })).ok).toBe(false);
  });
  it('needs platform database/service/anon values but accepts the new secret-key format', () => {
    expect(readConfig(env({ SUPABASE_DB_URL: '' })).ok).toBe(false);
    expect(readConfig(env({ SUPABASE_ANON_KEY: '' }))).toEqual({ ok: false, reason: 'missing:platform' });
    const modern = readConfig(env({ SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_not_real' }) }));
    expect(modern.ok).toBe(true);
    expect(modern.config.serviceKey).toBe('sb_secret_not_real');
    expect(modern.config.anonKey).toBe('anon-not-real');
  });
  it('reads models and lists from secrets; public config exposes no secret', () => {
    const { config } = readConfig(env());
    expect(config.textModel).toBe('grok-4.20-0309-non-reasoning');
    expect(config.operations).toEqual([OP]);
    const shown = publicVoiceConfig(config);
    expect(shown).toMatchObject({ model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', sessionCapSeconds: 600, turnDetection: 'manual', bindSessionInClientSecret: false, transcriptionModel: 'grok-transcribe' });
    expect(shown.transcriptionModel).toBe(LIVE_TRANSCRIPTION_MODEL);
    expect(LIVE_TRANSCRIPTION_MODEL).toBe('grok-transcribe');
    expect(STT_MODEL).toBe('grok-voice-transcribe-2.0');
    expect(LIVE_TRANSCRIPTION_MODEL).not.toBe(STT_MODEL);
    expect(JSON.stringify(shown)).not.toContain('not-real');
  });
});

describe('CORS', () => {
  const handler = withCors(['https://getthehayout.com'], async () => Response.json({ ok: true }));
  it('answers an allowed preflight with 204 and the four allowed headers', async () => {
    const response = await handler(new Request('https://fn.invalid', { method: 'OPTIONS', headers: { origin: 'https://getthehayout.com' } }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://getthehayout.com');
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization, apikey, content-type, x-gtho-operation');
  });
  it('refuses other origins', async () => {
    expect((await handler(new Request('https://fn.invalid', { method: 'OPTIONS', headers: { origin: 'https://evil.invalid' } }))).status).toBe(403);
    expect((await handler(new Request('https://fn.invalid', { method: 'POST', headers: { origin: 'https://evil.invalid' } }))).status).toBe(403);
  });
  it('adds CORS to an allowed response', async () => {
    const response = await handler(new Request('https://fn.invalid', { method: 'POST', headers: { origin: 'https://getthehayout.com' } }));
    expect(response.headers.get('vary')).toBe('Origin');
  });
});

describe('bounded bodies', () => {
  it('rejects oversized bodies without buffering past the limit', async () => {
    const request = new Request('https://fn.invalid', { method: 'POST', body: 'x'.repeat(100) });
    await expect(readBytes(request, 10)).rejects.toMatchObject({ status: 413 });
  });
  it('requires JSON content type', async () => {
    await expect(readJson(new Request('https://fn.invalid', { method: 'POST', body: '{}' }), 10)).rejects.toMatchObject({ status: 400 });
  });
});

describe('unconfigured functions keep the configured CORS grant', () => {
  const ORIGIN = 'https://getthehayout.com';
  const handler = unconfiguredWithCors(readOrigins({ GTHO_ASSISTANT_ORIGINS: ORIGIN }));
  it('OPTIONS from an allowed origin gets the same CORS headers', async () => {
    const response = await handler(new Request('https://fn.invalid', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-headers')).toBe(ALLOWED_HEADERS);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
  });
  it('the 503 carries the CORS grant for an allowed origin and refuses others', async () => {
    const ok = await handler(new Request('https://fn.invalid', { method: 'POST', headers: { origin: ORIGIN } }));
    expect(ok.status).toBe(503);
    expect(await ok.json()).toEqual({ error: 'gtho-host-bindings-required' });
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('vary')).toBe('Origin');
    const other = await handler(new Request('https://fn.invalid', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(other.status).toBe(403);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('without valid origins there is no grant and the plain 503 stays', async () => {
    expect(readOrigins({})).toEqual([]);
    expect(readOrigins({ GTHO_ASSISTANT_ORIGINS: 'not a url' })).toEqual([]);
    const plain = await unconfiguredWithCors([])(new Request('https://fn.invalid', { method: 'POST' }));
    expect(plain.status).toBe(503);
    expect(plain.headers.get('access-control-allow-origin')).toBeNull();
  });
});
