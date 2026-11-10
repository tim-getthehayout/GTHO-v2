/** Real voice driver + VoiceTransport with fake capture/socket boundaries. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createAssistantSession } from '../../../../src/features/assistant/client/session.js';
import { openAssistant } from '../../../../src/features/assistant/client/panel.js';
import { VOICE_CONNECT_BUDGET_MS, TURN_FINALIZE_TIMEOUT_MS } from '../../../../src/features/assistant/client/realtime.js';
import { createAssistantConversation } from '../../../../src/features/assistant/client/conversation.js';

vi.mock('../../../../src/features/assistant/client/conversation.js', () => ({
  createAssistantConversation: vi.fn(), createFarmReviewFlow: vi.fn(),
  createFeedbackFiling: vi.fn(), feedbackSheetSession: vi.fn(),
}));
vi.mock('../../../../src/features/assistant/client/attempts.js', () => ({
  createAttemptTracker: () => ({ current: null, ensure: async () => ({ id: 'test-attempt' }), finish: async () => {} }),
}));

const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', sessionCapSeconds: 600, transcriptionModel: 'grok-transcribe', earlyTesting: false };
const deps = { api: {}, scope: () => ({ operationId: 'test-operation', actorId: 'test-actor' }), persist: vi.fn(), online: () => true, offlineNotes: { list: async () => [] } };
const gate = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
let sockets, tracks, contexts, conversation, entry;
class Socket {
  constructor() { this.readyState = 1; this.sent = []; sockets.push(this); }
  send(json) { this.sent.push(JSON.parse(json)); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
class Audio {
  constructor() { this.state = 'running'; this.sampleRate = 24000; this.destination = {}; contexts.push(this); }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createScriptProcessor() {
    const processor = { connect() { processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(128) } }); }, disconnect() {} };
    this.processor = processor;
    return processor;
  }
}
function makeSession(options = {}) { return createAssistantSession({ deps, config: { ...config }, intent: 'data-entry', ...options }); }
async function connect(talking) {
  await flush();
  expect(sockets).toHaveLength(1);
  sockets[0].message({ type: 'session.created' });
  await flush();
  await expect(talking).resolves.toBe('listening');
}
beforeEach(() => {
  vi.useFakeTimers(); document.body.replaceChildren(); sockets = []; tracks = [{ stop: vi.fn() }]; contexts = []; entry = null;
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Audio);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) } });
  conversation = {
    ref: 'test-conversation', scope: deps.scope(), route: null,
    session: { conversationRef: 'test-conversation', intent: 'data-entry', phase: 'converse', transcript: [], capture: {} },
    begin: vi.fn(async () => {}), turn: vi.fn(async () => null), discardEmpty: vi.fn(async () => {}),
    voiceAuthorization: vi.fn(async () => ({ provider: 'xai', token: 'test-token', expiresAt: Date.now() + 60000 })),
  };
  createAssistantConversation.mockReturnValue(conversation);
});
afterEach(async () => { await entry?.close(); await flush(); vi.unstubAllGlobals(); vi.useRealTimers(); });


it('probe: disconnect while own delivery is queued must not hang typed takeover', async () => {
 const first=gate(); conversation.turn.mockImplementationOnce(()=>first.promise);
 const session=makeSession(); await connect(session.talk());
 sockets[0].message({type:'conversation.item.input_audio_transcription.updated',item_id:'first',transcript:'first over'});
 await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
 contexts[0].processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(128)}});
 sockets[0].message({type:'conversation.item.input_audio_transcription.updated',item_id:'second',transcript:'second'});
 let settled=false; const typing=session.text('typed').then(()=>{settled=true});
 await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
 sockets[0].close(); await flush(); first.resolve(null); await flush();
 await vi.advanceTimersByTimeAsync(10000); await flush();
 expect(settled).toBe(true);
 await typing;
});
it('probe: retry before timed-out begin settles must not delete retry conversation', async () => {
 const begin=gate(); conversation.begin.mockReturnValue(begin.promise);
 const session=makeSession(); const firstTalk=session.talk(); await flush();
 await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS); await expect(firstTalk).resolves.toBe('unavailable');
 const retry=session.talk(); await flush(); begin.resolve(); await flush();
 if(sockets.length) sockets[0].message({type:'session.created'});
 await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS); expect(await retry).toBe('listening');
});

it('probe: closing a socket during finalization releases the finalization waiter', async () => {
 const session=makeSession(); await connect(session.talk());
 sockets[0].message({type:'conversation.item.input_audio_transcription.updated',item_id:'one',transcript:'voice'});
 let settled=false; const typing=session.text('typed').then(()=>{settled=true}); await flush();
 sockets[0].close(); await flush(); expect(settled).toBe(true); await typing;
 expect(conversation.turn).toHaveBeenCalledWith(expect.objectContaining({text:'typed'}));
});
it('probe: declining recording consent still connects and never starts a recorder', async () => {
 const Recorder=vi.fn(); vi.stubGlobal('MediaRecorder',Recorder);
 entry=openAssistant(deps,{...config,earlyTesting:true},{mode:'voice'});
 document.querySelector('[data-testid="assistant-consent-decline"]').click(); await flush();
 sockets[0].message({type:'session.created'}); expect((await entry.ready).result).toBe('listening');
 expect(entry.session.listening).toBe(true); expect(Recorder).not.toHaveBeenCalled();
 expect(conversation.begin).toHaveBeenCalledWith(expect.objectContaining({consent:'declined'}));
});
