import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAssistantSession, durableLocalSave, UNRESOLVED_TARGET_QUESTION } from '../../../../src/features/assistant/client/session.js';
import { createVoiceLog } from '../../../../src/features/assistant/client/voice-log.js';
import { CONTRACT_VERSION } from '../../../../src/features/assistant/feedback-facts.js';

const OP = '00000000-0000-4000-8000-000000000001';
const fact = value => ({ state: 'known', value, source: 'host' });
const feedbackHost = () => ({ itemId: crypto.randomUUID(), contractVersion: CONTRACT_VERSION, appId: 'gtho', screen: fact('dashboard'), buildStamp: fact('test'), capturedAt: '2026-11-09T11:00:00Z' });

function harness(script) {
  const calls = [];
  let capture = null;
  const api = { command: vi.fn(async (ref, command, payload = {}) => {
    calls.push({ command, payload });
    if (command === 'start') { capture = payload.capture; return { session: { intent: payload.intent, phase: 'converse', capture, transcript: [] } }; }
    const next = script.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(capture, payload) : next;
  }) };
  const deps = { api, scope: () => ({ operationId: OP, actorId: 'u' }), persist: vi.fn(async (scope, type, data) => ({ id: crypto.randomUUID(), ...data })), awaitServerRows: vi.fn(async () => true), buildStamp: 'test', feedbackHost, openFeedbackSheet: vi.fn() };
  return { api, calls, deps };
}
const user = text => ({ id: crypto.randomUUID(), role: 'user', modality: 'voice', text });
beforeEach(() => { localStorage.clear(); });

describe('one push-to-talk routes every intent through the runtime intent command', () => {
  it('a farm question starts as data-entry, switches to data-questions and is answered there', async () => {
    const { calls, deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'converse', capture, transcript: [user('How many open cows?'), { role: 'assistant', text: 'Let me check.' }] }, route: 'data-questions' }),
      capture => ({ session: { intent: 'data-questions', phase: 'converse', capture, transcript: [] }, value: { needsDraftDecision: false, intent: 'data-questions' } }),
      capture => ({ session: { intent: 'data-questions', phase: 'converse', capture, transcript: [{ role: 'assistant', text: 'Three open cows.' }] } }),
    ]);
    const onIntent = vi.fn();
    const session = createAssistantSession({ deps, config: { earlyTesting: false }, intent: 'data-entry', onIntent });
    await session.text('How many open cows?');
    expect(calls.map(call => call.command)).toEqual(['start', 'turn', 'intent', 'turn']);
    expect(calls[0].payload.intent).toBe('data-entry');
    expect(calls[2].payload).toEqual({ intent: 'data-questions' });
    expect(calls[3].payload.turn.text).toBe('How many open cows?');
    expect(calls[3].payload.turn.id).not.toBe(calls[1].payload.turn.id);
    expect(onIntent).toHaveBeenCalledWith('data-questions');
  });
  it('a review in progress is preserved through resolve-intent, never confirmed by the switch', async () => {
    const { calls, deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'review', capture, transcript: [] }, route: 'how-to' }),
      capture => ({ session: { intent: 'data-entry', phase: 'review', capture, transcript: [] }, value: { needsDraftDecision: true, choices: ['preserve', 'discard'], intent: 'how-to' } }),
      capture => ({ session: { intent: 'how-to', phase: 'converse', capture, transcript: [] } }),
      capture => ({ session: { intent: 'how-to', phase: 'converse', capture, transcript: [{ role: 'assistant', text: 'Open Feed.' }] } }),
    ]);
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry' });
    await session.text('How do I add feed?');
    expect(calls.map(call => call.command)).toEqual(['start', 'turn', 'intent', 'resolve-intent', 'turn']);
    expect(calls[3].payload).toEqual({ decision: 'preserve' });
    expect(calls.some(call => call.command === 'confirm')).toBe(false);
  });
  it('spoken feedback switches to feedback and opens the existing Feedback sheet from the pinned interview', async () => {
    const { calls, deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'converse', capture, transcript: [] }, route: 'feedback' }),
      capture => ({ session: { intent: 'feedback', phase: 'converse', capture, transcript: [] }, value: { needsDraftDecision: false } }),
      capture => ({ session: { intent: 'feedback', phase: 'review', reviewReady: true, capture, transcript: [user('The totals look wrong'), { role: 'assistant', text: 'Is this a bug?' }], pending: { id: 'p', revision: 1, intent: 'feedback', fields: {} } } }),
    ]);
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry' });
    await session.text('The totals look wrong');
    expect(calls[0].payload.capture.context.feedbackHost.appId).toBe('gtho');
    expect(deps.openFeedbackSheet).toHaveBeenCalledWith('feedback', OP, expect.objectContaining({ feedbackSession: expect.any(Object), fileConfirmed: expect.any(Function) }));
    expect(deps.openFeedbackSheet.mock.calls[0][2].feedbackSession.item.firstNote.value).toBe('The totals look wrong');
  });
  it('only one reroute per utterance', async () => {
    const { calls, deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'converse', capture, transcript: [] }, route: 'how-to' }),
      capture => ({ session: { intent: 'how-to', phase: 'converse', capture, transcript: [] }, value: { needsDraftDecision: false } }),
      capture => ({ session: { intent: 'how-to', phase: 'converse', capture, transcript: [] }, route: 'feedback' }),
    ]);
    await createAssistantSession({ deps, config: {}, intent: 'data-entry' }).text('help');
    expect(calls.map(call => call.command)).toEqual(['start', 'turn', 'intent', 'turn']);
  });
  it('the fallback entry question is a device host event in the voice log, not a transcript turn', async () => {
    const refused = Object.assign(new Error('entry-target-unresolved'), { code: 'entry-target-unresolved', status: 400 });
    const { calls, deps } = harness([refused]);
    const voiceLog = createVoiceLog({ operationId: OP });
    const say = vi.fn();
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry', say, voiceLog });
    await session.text('Treat Bessie');
    expect(say).toHaveBeenCalledWith(UNRESOLVED_TARGET_QUESTION);
    expect(voiceLog.events()).toEqual([expect.objectContaining({ kind: 'host-event', type: 'entry-target-question', purpose: 'write', text: UNRESOLVED_TARGET_QUESTION, conversationRef: session.conversation.ref })]);
    expect(calls.filter(call => call.command === 'turn')).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain(UNRESOLVED_TARGET_QUESTION);
  });
});

describe('durable local-save evidence', () => {
  it('needs the durable local receipt or a replayed outcome that records a local save', () => {
    expect(durableLocalSave({ receipt: { savedRecordId: 'r', localSavedAt: 'L' } })).toBe(true);
    expect(durableLocalSave({ result: { state: 'local-save', result: { savedRecordId: 'r' } } })).toBe(true);
    expect(durableLocalSave({ receipt: { savedRecordId: 'r' } })).toBe(false);
    expect(durableLocalSave({ result: { state: 'local-save', result: {} } })).toBe(false);
    expect(durableLocalSave(null)).toBe(false);
  });
});

describe('voice_entry_attempts rows (existing columns only, existing durable write path)', () => {
  const attemptsOf = deps => deps.persist.mock.calls.filter(call => call[1] === 'voiceEntryAttempts').map(call => call[2]);
  it('one row per entry; a reroute updates that row purpose; an answered question finishes it', async () => {
    const { deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'converse', capture, transcript: [] }, route: 'data-questions' }),
      capture => ({ session: { intent: 'data-questions', phase: 'converse', capture, transcript: [] }, value: { needsDraftDecision: false } }),
      capture => ({ session: { intent: 'data-questions', phase: 'converse', capture, transcript: [{ role: 'assistant', text: 'Three.' }] } }),
    ]);
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry' });
    await session.text('How many open cows?');
    const rows = attemptsOf(deps);
    expect(rows.map(row => [row.purpose, row.status])).toEqual([['write', 'unfinished'], ['question', 'unfinished'], ['question', 'finished']]);
    expect(new Set(rows.slice(1).map(row => row.id)).size).toBe(1);
    expect(rows[1].id).toBe(rows[2].id);
    expect(rows[0]).toMatchObject({ operationId: OP, conversationId: session.conversation.ref, previousAttemptId: null, finishedAt: null });
    expect(rows[2].finishedAt).toEqual(expect.any(String));
    expect(Object.keys(rows[0]).sort()).toEqual(['capturedAt', 'conversationId', 'finishedAt', 'operationId', 'previousAttemptId', 'purpose', 'status']);
  });
  it('a write stays unfinished until the confirmed write has durably saved locally', async () => {
    let hooks;
    const { deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'review', reviewReady: true, capture, transcript: [], pending: { id: 'p', revision: 1, intent: 'data-entry', destination: 'treatment', fields: {} } } }),
      capture => ({ session: { intent: 'data-entry', phase: 'completed', capture, transcript: [] }, value: { state: 'local-save', result: { savedRecordId: 'rec' } } }),
    ]);
    Object.assign(deps, {
      createFarmUiPorts: options => { hooks = options; return { renderReview: async () => {}, openSheet: () => null, recordConfirmation: async () => 'conf', applyConfirmedWrite: async () => ({}) }; },
      pullReviewRows: async () => {}, getById: () => ({ id: 'conf', cardId: 'card' }), flush: async () => {}, authorize: async () => true, getAll: () => [],
    });
    const onDurableSave = vi.fn();
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry', onDurableSave });
    await session.text('Treated tag 42');
    expect(attemptsOf(deps).at(-1)).toMatchObject({ purpose: 'write', status: 'unfinished' });
    await hooks.onConfirm({ evidence: {} });
    await vi.waitFor(() => expect(onDurableSave).toHaveBeenCalled());
    expect(attemptsOf(deps).at(-1)).toMatchObject({ purpose: 'write', status: 'finished', finishedAt: expect.any(String) });
  });
  it('an offline note keeps its recording time and links an explicit retry', async () => {
    const { deps } = harness([capture => ({ session: { intent: 'data-entry', phase: 'converse', capture, transcript: [] } })]);
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry' });
    await session.begin(user('Fed the cows'), undefined, { capturedAt: '2026-11-08T22:00:00.000Z', previousAttemptId: '00000000-0000-4000-8000-0000000000a1' });
    expect(attemptsOf(deps)[0]).toMatchObject({ capturedAt: '2026-11-08T22:00:00.000Z', previousAttemptId: '00000000-0000-4000-8000-0000000000a1', status: 'unfinished' });
  });
});

describe('attempt tracker', async () => {
  const { createAttemptTracker, discardAttempt, unfinishedCount } = await import('../../../../src/features/assistant/client/attempts.js');
  it('discard has no finished countdown; finish is idempotent; count adds unused device notes', async () => {
    const persist = vi.fn(async (scope, type, row) => ({ id: row.id ?? 'a1', ...row }));
    const tracker = createAttemptTracker({ persist, scope: { operationId: OP } });
    const row = await tracker.ensure({ conversationRef: 'c', intent: 'how-to' });
    expect(await tracker.ensure({ conversationRef: 'c', intent: 'how-to' })).toBe(row);
    expect(await discardAttempt({ persist, scope: { operationId: OP }, attempt: row })).toMatchObject({ status: 'discarded', finishedAt: null });
    await tracker.finish(); await tracker.finish();
    expect(persist.mock.calls.filter(call => call[2].status === 'finished')).toHaveLength(1);
    expect(unfinishedCount({ attempts: [{ status: 'unfinished' }, { status: 'finished' }], notes: [{ id: 'n1' }, { id: 'n2' }], noteRows: [{ deviceLocalReference: 'n1', attemptId: 'a1' }] })).toBe(2);
  });
});

describe('reroute replay is host-marked', () => {
  it('the resent utterance carries replayOf, is logged as a host event and is shown once', async () => {
    let replayId;
    const { calls, deps } = harness([
      capture => ({ session: { intent: 'data-entry', phase: 'converse', capture, transcript: [{ id: 'u1', role: 'user', text: 'How many open cows?' }] }, route: 'data-questions' }),
      capture => ({ session: { intent: 'data-questions', phase: 'converse', capture, transcript: [{ id: 'u1', role: 'user', text: 'How many open cows?' }] }, value: { needsDraftDecision: false } }),
      (capture, payload) => { replayId = payload.turn.id; return { session: { intent: 'data-questions', phase: 'converse', capture, transcript: [{ id: 'u1', role: 'user', text: 'How many open cows?' }, { id: replayId, role: 'user', text: 'How many open cows?' }, { id: 'a1', role: 'assistant', text: 'Three.' }] } }; },
    ]);
    const voiceLog = createVoiceLog({ operationId: OP });
    const onTranscript = vi.fn();
    const session = createAssistantSession({ deps, config: {}, intent: 'data-entry', voiceLog, onTranscript });
    await session.begin({ id: 'u1', role: 'user', modality: 'voice', text: 'How many open cows?' });
    expect(calls[3].payload).toMatchObject({ replayOf: 'u1', turn: { id: replayId } });
    expect(voiceLog.events()).toEqual([expect.objectContaining({ type: 'reroute-replay', purpose: 'question', conversationRef: session.conversation.ref })]);
    expect(voiceLog.events()[0].text).not.toContain('open cows');
    const shown = onTranscript.mock.calls.at(-1)[0];
    expect(shown.filter(turn => turn.role === 'user').map(turn => turn.id)).toEqual(['u1']);
  });
});

describe('retry chains (previous_attempt_id)', async () => {
  const { createAttemptTracker, unfinishedCount, supersededAttempts } = await import('../../../../src/features/assistant/client/attempts.js');
  const row = (id, status, previousAttemptId = null) => ({ id, operationId: OP, conversationId: `c-${id}`, capturedAt: '2026-11-09T10:00:00.000Z', status, finishedAt: status === 'finished' ? '2026-11-09T10:05:00.000Z' : null, purpose: 'write', previousAttemptId });
  it('the badge counts only the newest attempt of a chain', () => {
    const attempts = [row('a1', 'unfinished'), row('a2', 'unfinished', 'a1'), row('a3', 'unfinished', 'a2'), row('b1', 'unfinished')];
    expect([...supersededAttempts(attempts)].sort()).toEqual(['a1', 'a2']);
    expect(unfinishedCount({ attempts, notes: [], noteRows: [] })).toBe(2);
  });
  it('discarding the retry makes the predecessor count again', () => {
    expect(unfinishedCount({ attempts: [row('a1', 'unfinished'), row('a2', 'discarded', 'a1')], notes: [], noteRows: [] })).toBe(1);
  });
  it('finishing a retry finishes every unfinished predecessor with the same finished_at', async () => {
    const store = [row('a0', 'discarded'), row('a1', 'unfinished', 'a0'), row('a2', 'unfinished', 'a1'), row('other', 'unfinished')];
    const persist = vi.fn(async (scope, type, data) => { const id = data.id ?? 'a3'; const saved = { ...data, id }; const i = store.findIndex(r => r.id === id); if (i >= 0) store[i] = saved; else store.push(saved); return saved; });
    const tracker = createAttemptTracker({ persist, scope: { operationId: OP }, getAll: () => store, now: () => '2026-11-09T12:00:00.000Z' });
    await tracker.ensure({ conversationRef: 'c3', intent: 'data-entry', previousAttemptId: 'a2' });
    expect(unfinishedCount({ attempts: store, notes: [], noteRows: [] })).toBe(2);
    await tracker.finish();
    const byId = Object.fromEntries(store.map(r => [r.id, r]));
    for (const id of ['a3', 'a2', 'a1']) expect(byId[id]).toMatchObject({ status: 'finished', finishedAt: '2026-11-09T12:00:00.000Z' });
    expect(byId.a0).toMatchObject({ status: 'discarded', finishedAt: null });
    expect(byId.other.status).toBe('unfinished');
    expect(unfinishedCount({ attempts: store, notes: [], noteRows: [] })).toBe(1);
  });
});
