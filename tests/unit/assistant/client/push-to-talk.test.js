import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessions = [];
vi.mock('../../../../src/features/assistant/client/session.js', () => ({
  createAssistantSession: vi.fn(options => {
    let live = false;
    const session = { options, talk: vi.fn(async () => { if (live) return 'turn-ended'; live = true; options.onListening(true); return 'listening'; }), end: vi.fn(async () => {}) };
    sessions.push(session);
    return session;
  }),
  createOfflineNoteRecorder: vi.fn(() => { let on = false; return { get recording() { return on; }, toggle: vi.fn(async () => { on = !on; }) }; }),
}));
const { mountPushToTalk, PTT_POSITION_KEY } = await import('../../../../src/features/assistant/client/push-to-talk.js');
const { openAssistant } = await import('../../../../src/features/assistant/client/panel.js');

const OP = '00000000-0000-4000-8000-000000000001';
const deps = (online = true) => ({ scope: () => ({ operationId: OP, actorId: 'u' }), online: () => online, offlineNotes: { list: async () => [], save: vi.fn() } });
beforeEach(() => { document.body.innerHTML = ''; sessions.length = 0; localStorage.clear(); });

describe('global push-to-talk', () => {
  it('is never mounted without backend config (403)', () => {
    expect(mountPushToTalk(deps(), null)).toBeNull();
    expect(document.querySelector('[data-testid="ptt"]')).toBeNull();
  });
  it('is prominent at the bottom center on mobile and floating on desktop', () => {
    mountPushToTalk(deps(), {}, { compact: true });
    expect(document.querySelector('[data-testid="ptt"]').className).toContain('gtho-ptt--compact');
    mountPushToTalk({ ...deps(), scope: () => ({ operationId: 'other' }) }, {}, { compact: false });
    expect(document.querySelectorAll('[data-testid="ptt"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="ptt"]').className).toContain('gtho-ptt--floating');
  });
  it('re-rendering keeps the same control (and any live session) for the same operation', () => {
    const first = mountPushToTalk(deps(), {});
    expect(mountPushToTalk(deps(), {})).toBe(first);
  });
  it('first tap starts a data-entry voice session; tapping again ends the turn', async () => {
    const control = mountPushToTalk(deps(), { earlyTesting: false });
    const button = document.querySelector('[data-testid="ptt-button"]');
    await control.tap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].options.intent).toBe('data-entry');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(await sessions[0].talk.mock.results[0].value).toBe('listening');
    await control.tap();
    expect(sessions).toHaveLength(1);
    expect(await sessions[0].talk.mock.results[1].value).toBe('turn-ended');
    document.querySelector('[data-testid="ptt-end"]').click();
    await Promise.resolve();
    expect(sessions[0].end).toHaveBeenCalled();
  });
  it('offline, a tap records a device-local voice note instead', async () => {
    const control = mountPushToTalk(deps(false), {});
    await control.tap();
    expect(sessions).toHaveLength(0);
    expect(document.querySelector('[data-testid="ptt-button"]').getAttribute('aria-pressed')).toBe('true');
  });
  it('desktop drag moves the control, remembers the spot and is not a tap', async () => {
    mountPushToTalk(deps(), {}, { compact: false });
    const button = document.querySelector('[data-testid="ptt-button"]');
    button.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }));
    globalThis.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 40 }));
    globalThis.dispatchEvent(new MouseEvent('pointerup', {}));
    button.click();
    await Promise.resolve();
    expect(sessions).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(PTT_POSITION_KEY))).toEqual({ left: expect.any(Number), top: expect.any(Number) });
    expect(document.querySelector('[data-testid="ptt"]').className).toContain('gtho-ptt--placed');
  });
});

describe('header assistant sheet', () => {
  it('offers feedback, farm questions and how-to only; no Enter data affordance', () => {
    openAssistant(deps(), {});
    expect([...document.querySelectorAll('[data-testid^="assistant-intent-"]')].map(node => node.dataset.testid)).toEqual(['assistant-intent-feedback', 'assistant-intent-data-questions', 'assistant-intent-how-to']);
    expect(document.body.textContent).not.toContain('Enter data');
  });
});
