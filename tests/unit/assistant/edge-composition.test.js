import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGthoAssistantHandler, unconfiguredHandler } from '../../../supabase/functions/gtho-assistant/index.js';

describe('Edge composition, gated until configured and never deployed from here', () => {
  it('fails closed without production bindings and disables caching', async () => {
    const response = unconfiguredHandler();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'gtho-host-bindings-required' });
  });
  it('delegates authentication rejection to the shared backend handler', async () => {
    const authenticate = vi.fn(async () => { throw new Error('not signed in'); });
    const handler = createGthoAssistantHandler({ authenticate }, { maxReadRounds: 0, maxBodyBytes: 1024 });
    const response = await handler(new Request('https://test.invalid', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
  });
  it('requires explicit technical budgets rather than inventing them', () => {
    expect(() => createGthoAssistantHandler({})).toThrow('backend-budgets-required');
  });
  it('imports the same obtained library as the frontend and keeps gateway JWT verification on', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const backend = readFileSync(resolve(root, 'supabase/functions/gtho-assistant/index.js'), 'utf8');
    const frontend = readFileSync(resolve(root, 'src/features/assistant/shared.js'), 'utf8');
    expect(backend).toContain("from '../../../vendor/conversation-runtime/src/index.js'");
    expect(frontend).toContain("from '../../../vendor/conversation-runtime/src/index.js'");
    expect(backend).toContain("from '../../../vendor/feedback-module/src/index.js'");
    expect(frontend).toContain("from '../../../vendor/feedback-module/src/index.js'");
    const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
    expect(config).toContain('verify_jwt = true');
    expect(config).not.toContain('project_id');
  });
  it('serves the live composition only through the gated, pinned entry and keeps JWT verification on every function', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const live = readFileSync(resolve(root, 'supabase/functions/_shared/live.js'), 'utf8');
    expect(live).toContain("from 'npm:postgres@3.4.9'");
    expect(live).toContain("from 'npm:@supabase/supabase-js@2.103.0'");
    expect(live).toContain('readConfig(Deno.env.toObject())');
    expect(live).toContain('max: 1');
    const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
    for (const name of ['gtho-assistant', 'gtho-assistant-apply', 'gtho-assistant-audio', 'gtho-assistant-transcribe']) {
      expect(config).toContain(`[functions.${name}]\nentrypoint = './functions/${name}/index.js'\nverify_jwt = true`);
      const entry = readFileSync(resolve(root, `supabase/functions/${name}/index.js`), 'utf8');
      expect(entry).toContain("await import('../_shared/live.js')");
      expect(entry).not.toMatch(/XAI_API_KEY|Deno\.env/);
    }
  });
});
