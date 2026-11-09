import { describe, it, expect, vi } from 'vitest';
import { createAssistantApi } from '../../../../src/features/assistant/client/api.js';
import { askTestingConsent, mountAssistantControl, CONSENT_TEXT } from '../../../../src/features/assistant/client/panel.js';
import { recordNote, isQuotaError, OFFLINE_NOTE_MAX_MS } from '../../../../src/features/assistant/client/offline-notes.js';

describe('assistant API client', () => {
  it('sends the session JWT, anon key, operation header and a fresh requestRef per command', async () => {
    const fetch = vi.fn(async () => Response.json({ session: {} }));
    let n = 0;
    const api = createAssistantApi({ supabaseUrl: 'https://p.invalid/', anonKey: 'anon', operationId: 'op', getAccessToken: async () => 'jwt', fetch, randomUUID: () => `r${++n}` });
    await api.command('conv', 'turn', { turn: { text: 'hi' } });
    await api.command('conv', 'turn', { turn: { text: 'again' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://p.invalid/functions/v1/gtho-assistant');
    expect(init.headers).toMatchObject({ authorization: 'Bearer jwt', apikey: 'anon', 'x-gtho-operation': 'op', 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ turn: { text: 'hi' }, command: 'turn', conversationRef: 'conv', requestRef: 'r1' });
    expect(JSON.parse(fetch.mock.calls[1][1].body).requestRef).toBe('r2');
    expect(JSON.stringify(fetch.mock.calls)).not.toMatch(/operationId|actorId/);
  });
  it('reports a non-allowlisted operation (403) as no config, and surfaces runtime codes', async () => {
    const api = createAssistantApi({ supabaseUrl: 'https://p.invalid', anonKey: 'a', getAccessToken: async () => 'jwt', fetch: async () => Response.json({ error: 'assistant-not-enabled' }, { status: 403 }) });
    expect(await api.config()).toBeNull();
    const pending = createAssistantApi({ supabaseUrl: 'https://p.invalid', anonKey: 'a', getAccessToken: async () => 'jwt', fetch: async () => Response.json({ error: 'client-apply-pending' }, { status: 400 }) });
    await expect(pending.command('c', 'confirm')).rejects.toMatchObject({ status: 400, code: 'client-apply-pending' });
  });
});

describe('assistant control and consent', () => {
  it('stays hidden when the backend refuses (403) and appears with config', async () => {
    const hidden = document.createElement('button');
    expect(await mountAssistantControl(hidden, { api: { config: async () => null } })).toBeNull();
    expect(hidden.hidden).toBe(true);
    const shown = document.createElement('button');
    await mountAssistantControl(shown, { api: { config: async () => ({ model: 'grok-voice-3.0' }) } });
    expect(shown.hidden).toBe(false);
  });
  it('asks with the exact early-testing wording and buttons; declining still resolves', async () => {
    const decision = askTestingConsent();
    expect(document.querySelector('[data-testid="assistant-consent-text"]').textContent).toBe('During early testing, GTHO can keep recordings of what you say to the assistant so we can improve it. Keep my recordings? You can still use voice if you say no.');
    expect(CONSENT_TEXT).toBe(document.querySelector('[data-testid="assistant-consent-text"]').textContent);
    expect(document.querySelector('[data-testid="assistant-consent-keep"]').textContent).toBe('Keep recordings');
    expect(document.querySelector('[data-testid="assistant-consent-decline"]').textContent).toBe("Don't keep");
    document.querySelector('[data-testid="assistant-consent-decline"]').click();
    expect(await decision).toBe('declined');
    expect(document.querySelector('[data-testid="assistant-consent"]')).toBeNull();
  });
});

describe('offline voice notes', () => {
  it('records with the native codec and stops at 3 minutes', async () => {
    class Recorder {
      static isTypeSupported(type) { return type === 'audio/mp4'; }
      constructor(stream, options) { this.options = options; this.state = 'inactive'; Recorder.last = this; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['x']) }); this.onstop(); }
    }
    let cap;
    const note = recordNote({ stream: {}, MediaRecorderImpl: Recorder, setTimer: (fn, ms) => { cap = { fn, ms }; return 1; }, clearTimer: () => {} });
    expect(Recorder.last.options.mimeType).toBe('audio/mp4');
    expect(cap.ms).toBe(OFFLINE_NOTE_MAX_MS);
    cap.fn();
    const blob = await note.done;
    expect(blob.type).toBe('audio/mp4');
  });
  it('recognizes quota failures so they are surfaced, not dropped', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
  });
});
