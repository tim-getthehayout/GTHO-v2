import { describe, it, expect } from 'vitest';
import { readConfig, FUNCTION_SECRETS, publicVoiceConfig, TECHNICAL_BUDGETS, PROVIDER_TIMEOUT_MS } from '../../../../src/features/assistant/server/config.js';
import { withCors, readJson, readBytes } from '../../../../src/features/assistant/server/http.js';
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
  it('needs platform database/service values but accepts the new secret-key format', () => {
    expect(readConfig(env({ SUPABASE_DB_URL: '' })).ok).toBe(false);
    const modern = readConfig(env({ SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_not_real' }) }));
    expect(modern.ok).toBe(true);
    expect(modern.config.serviceKey).toBe('sb_secret_not_real');
  });
  it('reads models and lists from secrets; public config exposes no secret', () => {
    const { config } = readConfig(env());
    expect(config.textModel).toBe('grok-4.20-0309-non-reasoning');
    expect(config.operations).toEqual([OP]);
    const shown = publicVoiceConfig(config);
    expect(shown).toMatchObject({ model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', sessionCapSeconds: 600, turnDetection: 'manual', bindSessionInClientSecret: false });
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
