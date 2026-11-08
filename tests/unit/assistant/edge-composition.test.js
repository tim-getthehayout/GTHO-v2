import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGthoAssistantHandler, unconfiguredHandler } from '../../../supabase/functions/gtho-assistant/index.js';

describe('Edge composition, not a configured or deployed host backend', () => {
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
});
