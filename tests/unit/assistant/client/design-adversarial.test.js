/** Real voice driver + VoiceTransport with fake capture/socket boundaries. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createAssistantSession } from '../../../../src/features/assistant/client/session.js';
import { openAssistant } from '../../../../src/features/assistant/client/panel.js';
import { TURN_FINALIZE_TIMEOUT_MS } from '../../../../src/features/assistant/client/realtime.js';
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
  createAssistantConversation.mockReset().mockReturnValue(conversation);
});
afterEach(async () => { await entry?.close(); await flush(); vi.unstubAllGlobals(); vi.useRealTimers(); });



import { OUTBOUND_TURN_BUDGET_MS, OUTBOUND_DROPPED_MESSAGE } from '../../../../src/features/assistant/client/outbound-queue.js';
import { logger } from '../../../../src/utils/logger.js';
afterEach(()=>vi.restoreAllMocks());

const status=()=>document.querySelector('[data-testid="assistant-status"]').textContent;
const input=()=>document.querySelector('[data-testid="assistant-text"]');
function sendText(text){input().value=text;document.querySelector('[data-testid="assistant-send"]').click();}
function replacement(ref){return {...conversation,ref,session:{...conversation.session,conversationRef:ref,transcript:[]},begin:vi.fn(async()=>{}),turn:vi.fn(async()=>null),discardEmpty:vi.fn(async()=>{})};}
async function spoken(session,text='private spoken over'){
 await connect(session.talk()); sockets[0].message({type:'conversation.item.input_audio_transcription.completed',item_id:'private-item',transcript:text});
 await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
}
it('visible backend failure persists and composer accepts the next typed send',async()=>{
 conversation.turn.mockRejectedValueOnce(new Error('backend-refused'));
 entry=openAssistant(deps,config);sendText('private typed failure');await flush();
 expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(input().hidden).toBe(false);
 sendText('next typed');await flush();expect(conversation.turn.mock.calls.map(([e])=>e.text)).toEqual(['private typed failure','next typed']);
});
it('in-flight typed timeout clears UI busy state; late completion never replays it',async()=>{
 const held=gate();conversation.turn.mockImplementationOnce(()=>held.promise);
 entry=openAssistant(deps,config);sendText('once only');await flush();
 await vi.advanceTimersByTimeAsync(19999);expect(conversation.turn).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);await flush();expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);
 held.resolve('late answer');await flush();expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);
 sendText('new user send');await flush();expect(conversation.turn.mock.calls.map(([e])=>e.text)).toEqual(['once only','new user send']);
});
it('typed behind a hung final dispatches once in a fresh owner and late voice does not unlock successors',async()=>{
 const held=gate(),next=replacement('new-owner');conversation.turn.mockImplementationOnce(()=>held.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 const session=makeSession();await spoken(session);const typing=session.text('private typed successor');await flush();
 expect(next.turn).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);await typing;
 expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({text:'private typed successor'}));
 held.resolve('late');await flush();expect(conversation.turn).toHaveBeenCalledTimes(1);expect(next.turn).toHaveBeenCalledTimes(1);
});
it('two quick voice retries preserve three distinct owners and never dispatch old finals into new ones',async()=>{
 const held=gate(),second=replacement('owner-two'),third=replacement('owner-three');
 conversation.turn.mockImplementationOnce(()=>held.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValueOnce(second).mockReturnValue(third);
 const session=makeSession();await spoken(session);await session.end();
 const retry1=session.talk();await flush();await session.end();const retry2=session.talk();await flush();
 sockets.at(-1).message({type:'session.created'});await expect(retry2).resolves.toBe('listening');await retry1;
 held.resolve(null);await flush();expect(session.conversation).toBe(third);expect(second.turn).not.toHaveBeenCalled();expect(third.turn).not.toHaveBeenCalled();
 expect(conversation.begin).toHaveBeenCalledTimes(1);expect(second.begin).toHaveBeenCalledTimes(1);expect(third.begin).toHaveBeenCalledTimes(1);await session.end();
});
it('end during dispatched typed send does not replay it or disturb the replacement voice UI',async()=>{
 const held=gate(),next=replacement('next-after-end');conversation.turn.mockImplementationOnce(()=>held.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 const session=makeSession();const typing=session.text('already dispatched');await flush();await session.end();
 const talking=session.talk();await flush();sockets[0].message({type:'session.created'});await talking;
 await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);await typing;held.resolve('late');await flush();
 expect(conversation.turn).toHaveBeenCalledTimes(1);expect(next.turn).not.toHaveBeenCalled();expect(session.conversation).toBe(next);expect(session.listening).toBe(true);await session.end();
});
it('drop telemetry contains only fixed reason and count, never transcript, id or conversation',async()=>{
 const logged=vi.spyOn(logger,'info'),held=gate();conversation.turn.mockReturnValue(held.promise);
 const session=makeSession();const typing=session.text('SECRET-TEXT-XYZ');await flush();await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);await typing;
 const drops=logged.mock.calls.filter(([,phase])=>phase==='outbound-drop');expect(drops.length).toBeGreaterThan(0);
 for(const [category,phase,context] of drops){expect(category).toBe('assistant-voice');expect(Object.keys(context).sort()).toEqual(['eventCount','reason']);expect(context.reason).toMatch(/^outbound-(timeout|retired|failed)$/);expect(Number.isFinite(context.eventCount)).toBe(true);expect(JSON.stringify(context)).not.toContain('SECRET');}
 held.resolve(null);await flush();
});
it('one combined 20-second budget must not restart for fallback backend work',async()=>{
 const voice=gate(),typed=gate(),next=replacement('fallback');conversation.turn.mockImplementationOnce(()=>voice.promise);next.turn.mockReturnValue(typed.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 const session=makeSession();await spoken(session);const start=Date.now();let settledAt=null;const typing=session.text('fallback typed').then(()=>settledAt=Date.now()-start);await flush();
 await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);await flush();expect(next.turn).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);await typing;
 voice.resolve(null);typed.resolve(null);await flush();expect(conversation.turn).toHaveBeenCalledTimes(1);expect(next.turn).toHaveBeenCalledTimes(1);
 expect(settledAt).toBeLessThanOrEqual(OUTBOUND_TURN_BUDGET_MS);
});
it.each(['resume','begin','mint','socket'])('connect %s still fails at 10 seconds, not at the outbound 20-second deadline',async phase=>{
 const oldResume=Audio.prototype.resume;const hung=new Promise(()=>{});
 if(phase==='resume')Audio.prototype.resume=()=>hung;
 if(phase==='begin')conversation.begin.mockReturnValue(hung);
 if(phase==='mint')conversation.voiceAuthorization.mockReturnValue(hung);
 const session=makeSession();let done=false;const talking=session.talk().then(value=>{done=true;return value});await flush();
 await vi.advanceTimersByTimeAsync(9999);expect(done).toBe(false);await vi.advanceTimersByTimeAsync(1);
 await expect(talking).resolves.toBe('unavailable');expect(tracks[0].stop).toHaveBeenCalled();expect(session.listening).toBe(false);
 Audio.prototype.resume=oldResume;
});
it('text-first reused composer receives PTT callbacks and spoken over restores typing',async()=>{
 entry=openAssistant(deps,config);sendText('text first');await flush();const listening=vi.fn();
 openAssistant(deps,config,{mode:'voice',onListening:listening});expect(input().hidden).toBe(true);await flush();sockets[0].message({type:'session.created'});await entry.ready;
 sockets[0].message({type:'conversation.item.input_audio_transcription.completed',item_id:'over',transcript:'hello over'});
 expect(input().hidden).toBe(false);expect(entry.session.listening).toBe(false);expect(listening).toHaveBeenLastCalledWith(false);await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
});
it('a failed typed firstTurn must not erase its visible failure state',async()=>{
 const held=gate();conversation.turn.mockReturnValue(held.promise);
 entry=openAssistant(deps,config,{firstTurn:{id:'typed-first',role:'user',modality:'text',text:'private first turn'}});await flush();
 await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);await entry.ready;
 expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);held.resolve(null);await flush();
});
