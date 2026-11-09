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
  it('has no voice control of its own: the global push-to-talk is the one voice entry point', async () => {
    const { createOfflineNoteRecorder } = await import('../../../../src/features/assistant/client/session.js');
    const before = createOfflineNoteRecorder.mock.calls.length;
    const sheet = openAssistant(deps(), {});
    const started = await sheet.begin('how-to');
    expect(document.querySelector('[data-testid="assistant-talk"]')).toBeNull();
    expect([...document.querySelectorAll('#assistant-sheet-panel button')].map(button => button.textContent)).not.toContain('Talk');
    expect(document.querySelector('[data-testid="assistant-text"]')).not.toBeNull();
    for (const button of document.querySelectorAll('#assistant-sheet-panel button')) button.click();
    expect(started.talk).not.toHaveBeenCalled();
    // Offline, the sheet points to the push-to-talk instead of recording.
    document.body.innerHTML = '';
    openAssistant(deps(false), {});
    document.querySelector('[data-testid="assistant-intent-how-to"]').click();
    expect(document.querySelector('[data-testid="assistant-status"]').textContent).toContain('push-to-talk');
    expect(createOfflineNoteRecorder.mock.calls.length).toBe(before);
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
  it('using a reviewed transcript keeps the note until a durable local save from that conversation, then links and deletes it', async () => {
    const d = noteDeps({ transcribe: vi.fn(async () => ({ text: 'Moved heifers to Hill' })) });
    const control = mountPushToTalk(d, {});
    control.openLog();
    const panel = document.querySelector('#voice-log-sheet-panel');
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="offline-note-transcribe"]')).not.toBeNull());
    panel.querySelector('[data-testid="offline-note-transcribe"]').click();
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="assistant-note-transcript"]').value).toBe('Moved heifers to Hill'));
    panel.querySelector('[data-testid="offline-note-use"]').click();
    await vi.waitFor(() => expect(d.persist).toHaveBeenCalledWith(expect.anything(), 'offlineVoiceNotes', expect.objectContaining({ deviceLocalReference: 'n1', conversationId: 'c1' })));
    const started = sessions.at(-1);
    expect(started.options.intent).toBe('data-entry');
    expect(started.begin.mock.calls[0][0]).toMatchObject({ role: 'user', modality: 'voice', text: 'Moved heifers to Hill' });
    // Starting the conversation does not delete it: still unfinished and counted.
    expect(d.offlineNotes.remove).not.toHaveBeenCalled();
    expect(await control.refreshBadge()).toBe(1);
    // A durable local save from that conversation links the execution result, then deletes the note.
    await started.options.onDurableSave({ receipt: { savedRecordId: 'evt', localSavedAt: 'L' }, applied: { state: 'local-save', executionResultId: '00000000-0000-4000-8000-0000000000aa' } }, { scope: { operationId: OP, actorId: 'u' }, ref: 'c1' });
    expect(d.persist).toHaveBeenLastCalledWith(expect.anything(), 'offlineVoiceNotes', expect.objectContaining({ deviceLocalReference: 'n1', confirmedExecutionResultId: '00000000-0000-4000-8000-0000000000aa' }));
    expect(d.offlineNotes.remove).toHaveBeenCalledWith('n1');
    expect(document.querySelector('[data-testid="ptt-badge"]').hidden).toBe(true);
  });
  it('an abandoned conversation leaves the note on the device, unfinished and retryable', async () => {
    const d = noteDeps({ transcribe: vi.fn(async () => ({ text: 'Fed the cows' })) });
    const control = mountPushToTalk(d, {});
    control.openLog();
    const panel = document.querySelector('#voice-log-sheet-panel');
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="offline-note-transcribe"]')).not.toBeNull());
    panel.querySelector('[data-testid="offline-note-transcribe"]').click();
    await vi.waitFor(() => expect(panel.querySelector('[data-testid="assistant-note-transcript"]').value).toBe('Fed the cows'));
    panel.querySelector('[data-testid="offline-note-use"]').click();
    await vi.waitFor(() => expect(sessions.at(-1).begin).toHaveBeenCalled());
    await control.stop();
    expect(d.offlineNotes.remove).not.toHaveBeenCalled();
    expect(await control.refreshBadge()).toBe(1);
    await control.openLog().render();
    expect(document.querySelectorAll('#voice-log-sheet-panel [data-testid="offline-note-use"]')).toHaveLength(1);
  });
  it('the All filter shows what the device asked, from host events', async () => {
    localStorage.setItem(`gtho-voice-log:${OP}`, JSON.stringify([{ id: 'e', kind: 'host-event', conversationRef: 'c', purpose: 'write', type: 'entry-target-question', text: 'Which farm, paddock, group or animal did you mean?', at: '2026-11-09T10:00:00Z' }]));
    const control = mountPushToTalk(deps(), {});
    const log = control.openLog();
    await log.render('all');
    expect(document.querySelector('#voice-log-sheet-panel [data-status="host-event"]').textContent).toContain('GTHO asked: Which farm, paddock, group or animal did you mean?');
  });
});

describe('voice log filters and rows', () => {
  const at = iso => iso;
  const attempts = [
    { id: 'a1', operationId: OP, conversationId: 'c1', capturedAt: at('2026-11-09T14:00:00.000Z'), status: 'unfinished', finishedAt: null, purpose: 'write' },
    { id: 'a2', operationId: OP, conversationId: 'c2', capturedAt: at('2026-11-09T15:00:00.000Z'), status: 'finished', finishedAt: '2026-11-09T15:01:00.000Z', purpose: 'question' },
    { id: 'a3', operationId: OP, conversationId: 'c3', capturedAt: at('2026-11-08T15:00:00.000Z'), status: 'finished', finishedAt: '2026-11-08T15:01:00.000Z', purpose: 'feedback' },
    // 2026-11-09 03:00 UTC is still 2026-11-08 in America/New_York.
    { id: 'a4', operationId: OP, conversationId: 'c4', capturedAt: at('2026-11-09T03:00:00.000Z'), status: 'discarded', finishedAt: null, purpose: 'how-to' },
    { id: 'x', operationId: 'other', conversationId: 'c5', capturedAt: at('2026-11-09T15:00:00.000Z'), status: 'unfinished', finishedAt: null, purpose: 'write' },
  ];
  const tables = { operations: [{ id: OP, timezone: 'America/New_York' }], voiceEntryAttempts: attempts, offlineVoiceNotes: [], assistantTranscriptTurns: [{ operationId: OP, conversationId: 'c2', speaker: 'user', turnIndex: 0, text: 'How many open cows?' }] };
  const logDeps = () => ({ ...deps(), getAll: table => tables[table] ?? [], persist: vi.fn(async (scope, type, row) => row), offlineNotes: { list: async () => [{ id: 'n9', capturedAt: '2026-11-09T16:00:00.000Z', blob: new Blob(['x']) }], save: vi.fn() } });
  const shown = () => [...document.querySelectorAll('#voice-log-sheet-panel [data-testid="voice-log-item"]')].map(item => item.dataset.kind === 'note' ? 'note' : item.dataset.purpose + ':' + item.dataset.status);
  it.each([
    ['unfinished', ['note', 'write:unfinished']],
    ['today', ['note', 'question:finished', 'write:unfinished']],
    ['write', ['write:unfinished']],
    ['question', ['question:finished']],
    ['feedback', ['feedback:finished']],
    ['how-to', ['how-to:discarded']],
    ['all', ['note', 'question:finished', 'write:unfinished', 'how-to:discarded', 'feedback:finished']],
  ])('%s', async (filter, expected) => {
    const { openVoiceLog } = await import('../../../../src/features/assistant/client/voice-log-panel.js');
    const d = logDeps();
    const log = openVoiceLog({ deps: d, notes: d.offlineNotes, log: { events: () => [], preview: () => null }, use: vi.fn(), now: () => new Date('2026-11-09T17:00:00.000Z') });
    await log.render(filter);
    expect(shown()).toEqual(expected);
  });
  it('rows show time, preview, status and type; the badge counts unfinished attempts plus unused notes; discard sets discarded', async () => {
    const { openVoiceLog } = await import('../../../../src/features/assistant/client/voice-log-panel.js');
    const d = logDeps();
    const control = mountPushToTalk(d, {});
    expect(await control.refreshBadge()).toBe(2);
    const log = openVoiceLog({ deps: d, notes: d.offlineNotes, log: { events: () => [], preview: () => null }, use: vi.fn(), now: () => new Date('2026-11-09T17:00:00.000Z') });
    await log.render('question');
    const item = document.querySelector('#voice-log-sheet-panel [data-testid="voice-log-item"]');
    expect(item.querySelector('[data-testid="voice-log-meta"]').textContent).toMatch(/Question · Finished$/);
    expect(item.querySelector('[data-testid="voice-log-meta"]').textContent).toContain(new Date('2026-11-09T15:00:00.000Z').toLocaleString());
    expect(item.querySelector('[data-testid="voice-log-preview"]').textContent).toBe('How many open cows?');
    await log.render('write');
    document.querySelector('#voice-log-sheet-panel [data-testid="voice-log-discard"]').click();
    await vi.waitFor(() => expect(d.persist).toHaveBeenCalledWith(expect.anything(), 'voiceEntryAttempts', expect.objectContaining({ id: 'a1', status: 'discarded', finishedAt: null })));
  });
});

describe('voice log Today uses the operation timezone', () => {
  const zoneDeps = timezone => ({ scope: () => ({ operationId: OP }), getAll: table => table === 'operations' ? [{ id: OP, timezone }, { id: 'other', timezone: 'Asia/Tokyo' }] : [] });
  it('uses the operation timezone when set and valid', async () => {
    const { operationTimezone, matchesFilter } = await import('../../../../src/features/assistant/client/voice-log-panel.js');
    expect(operationTimezone(zoneDeps('America/Denver'), () => 'Asia/Tokyo')).toBe('America/Denver');
    // 2026-11-09 05:00 UTC is still Nov 8 in Denver; "now" is Nov 9 there.
    const row = { capturedAt: '2026-11-09T05:00:00.000Z', status: 'finished' };
    expect(matchesFilter(row, 'today', operationTimezone(zoneDeps('America/Denver')), new Date('2026-11-09T18:00:00.000Z'))).toBe(false);
    expect(matchesFilter(row, 'today', 'UTC', new Date('2026-11-09T18:00:00.000Z'))).toBe(true);
  });
  it.each([[null], [''], ['Not/AZone'], ['EST5EDT-bogus']])('falls back to the device timezone when the operation timezone is %s', async zone => {
    const { operationTimezone } = await import('../../../../src/features/assistant/client/voice-log-panel.js');
    expect(operationTimezone(zoneDeps(zone), () => 'Asia/Tokyo')).toBe('Asia/Tokyo');
  });
  it('uses UTC only when the device timezone is also unusable', async () => {
    const { operationTimezone } = await import('../../../../src/features/assistant/client/voice-log-panel.js');
    expect(operationTimezone(zoneDeps(null), () => undefined)).toBe('UTC');
  });
});
