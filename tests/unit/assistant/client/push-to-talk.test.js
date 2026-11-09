import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessions = [];
vi.mock('../../../../src/features/assistant/client/session.js', () => ({
  createAssistantSession: vi.fn(options => {
    let live = false;
    const session = { options, talk: vi.fn(async () => { if (live) return 'turn-ended'; live = true; options.onListening(true); return 'listening'; }), end: vi.fn(async () => {}), begin: vi.fn(async firstTurn => ({ ref: 'c1', scope: { operationId: '00000000-0000-4000-8000-000000000001', actorId: 'u' }, firstTurn })) };
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

describe('voice log from the push-to-talk: offline notes stay unfinished and retryable', () => {
  const note = { id: 'n1', capturedAt: '2026-11-09T10:00:00Z', blob: new Blob(['x'], { type: 'audio/webm' }), context: { intent: null } };
  function noteDeps({ transcribe }) {
    const saved = [note];
    const offlineNotes = { list: vi.fn(async () => [...saved]), save: vi.fn(), remove: vi.fn(async id => { saved.splice(saved.findIndex(row => row.id === id), 1); }) };
    return { ...deps(true), offlineNotes, api: { transcribe }, persist: vi.fn(async (scope, type, data) => data) };
  }
  it('shows the unfinished count on the control and opens the log as a panel', async () => {
    const control = mountPushToTalk(noteDeps({ transcribe: vi.fn() }), {});
    expect(await control.refreshBadge()).toBe(1);
    const badge = document.querySelector('[data-testid="ptt-badge"]');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('1');
    document.querySelector('[data-testid="ptt-log"]').click();
    await vi.waitFor(() => expect(document.querySelectorAll('#voice-log-sheet-panel [data-testid="voice-log-item"][data-status="unfinished"]')).toHaveLength(1));
  });
  it('STT with no provider duration keeps the note on the device, unfinished and counted; Transcribe can be retried', async () => {
    const missing = Object.assign(new Error('provider-duration-missing'), { status: 400, code: 'provider-duration-missing' });
    const transcribe = vi.fn().mockRejectedValueOnce(missing).mockResolvedValueOnce({ text: 'Moved heifers to Hill', durationSeconds: 4 });
    const d = noteDeps({ transcribe });
    const control = mountPushToTalk(d, {});
    control.openLog();
    const panel = document.querySelector('#voice-log-sheet-panel');
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="offline-note-transcribe"]')).not.toBeNull());
    panel.querySelector('[data-testid="offline-note-transcribe"]').click();
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="voice-log-status"]').textContent).toContain('still saved on this device'));
    expect(d.offlineNotes.remove).not.toHaveBeenCalled();
    expect(await control.refreshBadge()).toBe(1);
    expect(panel.querySelectorAll('[data-testid="voice-log-item"][data-status="unfinished"]')).toHaveLength(1);
    expect(panel.querySelector('[data-testid="assistant-note-transcript"]').value).toBe('');
    panel.querySelector('[data-testid="offline-note-transcribe"]').click();
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="assistant-note-transcript"]').value).toBe('Moved heifers to Hill'));
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
  it('using a reviewed transcript starts the push-to-talk session with it, then clears the badge', async () => {
    const d = noteDeps({ transcribe: vi.fn(async () => ({ text: 'Moved heifers to Hill' })) });
    const control = mountPushToTalk(d, {});
    control.openLog();
    const panel = document.querySelector('#voice-log-sheet-panel');
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="offline-note-transcribe"]')).not.toBeNull());
    panel.querySelector('[data-testid="offline-note-transcribe"]').click();
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="assistant-note-transcript"]').value).toBe('Moved heifers to Hill'));
    panel.querySelector('[data-testid="offline-note-use"]').click();
    await vi.waitFor(() => expect(d.offlineNotes.remove).toHaveBeenCalledWith('n1'));
    expect(sessions.at(-1).options.intent).toBe('data-entry');
    expect(sessions.at(-1).begin.mock.calls[0][0]).toMatchObject({ role: 'user', modality: 'voice', text: 'Moved heifers to Hill' });
    expect(d.persist).toHaveBeenCalledWith(expect.anything(), 'offlineVoiceNotes', expect.objectContaining({ deviceLocalReference: 'n1', conversationId: 'c1' }));
    await vi.waitFor(() => expect(document.querySelector('[data-testid="ptt-badge"]').hidden).toBe(true));
  });
  it('the All filter shows what the device asked, from host events', async () => {
    localStorage.setItem(`gtho-voice-log:${OP}`, JSON.stringify([{ id: 'e', kind: 'host-event', conversationRef: 'c', purpose: 'write', type: 'entry-target-question', text: 'Which farm, paddock, group or animal did you mean?', at: '2026-11-09T10:00:00Z' }]));
    const control = mountPushToTalk(deps(), {});
    const log = control.openLog();
    await log.render('all');
    expect(document.querySelector('#voice-log-sheet-panel [data-status="host-event"]').textContent).toContain('GTHO asked: Which farm, paddock, group or animal did you mean?');
  });
});
