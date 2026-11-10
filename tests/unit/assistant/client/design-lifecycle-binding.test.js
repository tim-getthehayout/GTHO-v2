/** Real voice driver + VoiceTransport with fake capture/socket boundaries. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantSession } from '../../../../src/features/assistant/client/session.js';
import { openAssistant } from '../../../../src/features/assistant/client/panel.js';
import { createPcm16Resampler, startMicrophone, VOICE_CONNECT_BUDGET_MS, TURN_FINALIZE_TIMEOUT_MS } from '../../../../src/features/assistant/client/realtime.js';
import { createTestingRecorder } from '../../../../src/features/assistant/client/testing-audio.js';
import { sanitizeVoiceLogContext } from '../../../../src/features/assistant/client/voice-telemetry.js';
import { createAssistantConversation } from '../../../../src/features/assistant/client/conversation.js';

vi.mock('../../../../src/features/assistant/client/conversation.js', () => ({
  createAssistantConversation: vi.fn(), createFarmReviewFlow: vi.fn(),
  createFeedbackFiling: vi.fn(), feedbackSheetSession: vi.fn(),
}));
vi.mock('../../../../src/features/assistant/client/attempts.js', () => ({
  createAttemptTracker: () => ({ current: null, ensure: async () => { if (attemptGate) await attemptGate.promise; return { id: 'test-attempt' }; }, finish: async () => {} }),
}));

const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', sessionCapSeconds: 600, transcriptionModel: 'grok-transcribe', earlyTesting: false };
const deps = { api: {}, scope: () => ({ operationId: 'test-operation', actorId: 'test-actor' }), persist: vi.fn(), online: () => true, offlineNotes: { list: async () => [] } };
const gate = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
let sockets, tracks, contexts, conversation, entry, attemptGate;
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
  attemptGate = null; vi.useFakeTimers(); document.body.replaceChildren(); sockets = []; tracks = [{ stop: vi.fn() }]; contexts = []; entry = null;
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

const retryButton=()=>document.querySelector('[data-testid="assistant-retry"]');
function editDraft(value){input().value=value;input().dispatchEvent(new Event('input',{bubbles:true}));}
async function failed(path='send',mode='newer'){
 const held=gate(),next=replacement('explicit-next');conversation.turn.mockReturnValue(held.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 entry=path==='firstTurn'?openAssistant(deps,config,{firstTurn:{id:'original-id',role:'user',modality:'text',text:'EXACT ORIGINAL'}}):openAssistant(deps,config);
 if(path==='send')sendText('EXACT ORIGINAL');await flush();
 if(mode==='newer')editDraft('UNSENT NEWER');if(mode==='empty'){editDraft('changed');editDraft('');}
 await vi.advanceTimersByTimeAsync(20000);await flush();
 return {held,next};
}

it.each(['end','begin','voice'])('same-tick %s then stale Retry click cannot dispatch or change draft',async action=>{
 const {held,next}=await failed();const button=retryButton();const draft=input().value;let transition;
 if(action==='end')transition=entry.session.end();
 if(action==='begin')transition=entry.begin('data-entry');
 if(action==='voice')transition=entry.startVoice();
 button.click();await flush();if(action==='voice'){sockets[0].message({type:'session.created'});}
 await transition;expect(next.turn).not.toHaveBeenCalled();expect(input().value).toBe(draft);expect(button.hidden||button.disabled).toBe(true);held.resolve(null);await flush();
});
it('an obsolete Retry callback stays inert even if its detached button is programmatically re-enabled',async()=>{
 const {held,next}=await failed();const button=retryButton();await entry.session.end();button.remove();button.hidden=false;button.disabled=false;button.dispatchEvent(new MouseEvent('click',{bubbles:true}));await flush();
 expect(next.turn).not.toHaveBeenCalled();expect(input().value).toBe('UNSENT NEWER');held.resolve(null);await flush();
});
it('Retry waiting for startup must not dispatch after explicit end invalidates its generation',async()=>{
 const {held,next}=await failed();const begin=gate();next.begin.mockReturnValue(begin.promise);retryButton().click();await flush();expect(next.begin).toHaveBeenCalledTimes(1);
 await entry.session.end();expect(retryButton().hidden).toBe(true);begin.resolve();await flush();held.resolve(null);await flush();
 expect(next.turn).not.toHaveBeenCalled();expect(input().value).toBe('UNSENT NEWER');expect(retryButton().hidden).toBe(true);
});
it('already-dispatched Retry may settle on its original owner but never replay after end and replacement',async()=>{
 const {held,next}=await failed();const work=gate(),third=replacement('third-owner');next.turn.mockReturnValue(work.promise);retryButton().click();await flush();expect(next.turn).toHaveBeenCalledTimes(1);
 await entry.session.end();createAssistantConversation.mockReturnValue(third);await entry.begin('data-entry');
 work.resolve('old answer');held.reject(new Error('old original'));await flush();
 expect(next.turn).toHaveBeenCalledTimes(1);expect(third.turn).not.toHaveBeenCalled();expect(retryButton().hidden).toBe(true);expect(input().value).toBe('UNSENT NEWER');
});
it('late failed Retry never reintroduces recovery controls on a replacement session',async()=>{
 const {held,next}=await failed();const work=gate(),third=replacement('third-failure');next.turn.mockReturnValue(work.promise);retryButton().click();await flush();await entry.session.end();createAssistantConversation.mockReturnValue(third);await entry.begin('data-entry');
 work.reject(new Error('old retry rejected'));held.resolve(null);await flush();expect(retryButton().hidden).toBe(true);expect(third.turn).not.toHaveBeenCalled();expect(input().value).toBe('UNSENT NEWER');
});
it.each([14999,15000,19999,20000,20001])('typed firstTurn startup released at %d ms cannot buy a fresh budget',async delay=>{
 const begin=gate();conversation.begin.mockReturnValue(begin.promise);
 entry=openAssistant(deps,config,{firstTurn:{id:'boundary-first',role:'user',modality:'text',text:'BOUNDARY ORIGINAL'}});await flush();setTimeout(()=>begin.resolve(),delay);
 await vi.advanceTimersByTimeAsync(Math.max(20000,delay));await flush();await entry.ready;
 if(delay<15000){expect(conversation.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'boundary-first',text:'BOUNDARY ORIGINAL'}));expect(retryButton().hidden).toBe(true);}
 else{expect(conversation.turn).not.toHaveBeenCalled();expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(retryButton().hidden).toBe(false);expect(input().value).toBe('BOUNDARY ORIGINAL');}
});
it('Retry behind a retiring generation receives only remaining submission budget',async()=>{
 const {held,next}=await failed();const startup=gate(),work=gate();next.begin.mockReturnValue(startup.promise);next.turn.mockReturnValue(work.promise);retryButton().click();await flush();
 await vi.advanceTimersByTimeAsync(14999);startup.resolve();await flush();expect(next.turn).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(5001);expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(retryButton().hidden).toBe(false);expect(input().value).toBe('UNSENT NEWER');
 work.reject(new Error('late replacement'));held.resolve(null);await flush();expect(next.turn).toHaveBeenCalledTimes(1);
});

it('explicit end while Retry startup is pending must keep an unchanged restored draft',async()=>{
 const {held,next}=await failed('send','unchanged');const begin=gate();next.begin.mockReturnValue(begin.promise);retryButton().click();await flush();await entry.session.end();
 expect(input().value).toBe('EXACT ORIGINAL');begin.resolve();await flush();held.resolve(null);await flush();expect(input().value).toBe('EXACT ORIGINAL');
});
it('calling begin while a timed-out firstTurn startup is pending invalidates its existing Retry',async()=>{
 const begin=gate();conversation.begin.mockReturnValue(begin.promise);entry=openAssistant(deps,config,{firstTurn:{id:'timed-startup',role:'user',modality:'text',text:'ORIGINAL'}});await flush();await vi.advanceTimersByTimeAsync(15000);await entry.ready;
 expect(retryButton().hidden).toBe(false);const button=retryButton();const pending=entry.session.begin();await flush();const retryCleared=button.hidden||button.disabled;button.click();await flush();
 begin.resolve();await pending;await flush();expect({retryCleared,dispatches:conversation.turn.mock.calls.length}).toEqual({retryCleared:true,dispatches:0});
});

it('revoking Retry during attempt setup prevents the backend call after that await too', async () => {
 const {held,next}=await failed(); attemptGate=gate(); retryButton().click(); await flush(); expect(next.turn).not.toHaveBeenCalled();
 await entry.session.end(); attemptGate.resolve(); await flush(); held.resolve(null); await flush();
 expect(next.turn).not.toHaveBeenCalled(); expect(input().value).toBe('UNSENT NEWER'); expect(retryButton().hidden).toBe(true);
});
it('a rejected startup after revocation is observed without restoring Retry or changing the newer draft', async () => {
 const {held,next}=await failed(); const begin=gate(); next.begin.mockReturnValue(begin.promise); retryButton().click(); await flush(); await entry.session.end();
 begin.reject(new Error('late startup rejection')); held.resolve(null); await flush();
 expect(next.turn).not.toHaveBeenCalled(); expect(input().value).toBe('UNSENT NEWER'); expect(retryButton().hidden).toBe(true);
});
it('public begin adopts pending startup once while synchronously invalidating the old Retry', async () => {
 const begin=gate(); conversation.begin.mockReturnValue(begin.promise); entry=openAssistant(deps,config,{firstTurn:{id:'pending-first',role:'user',modality:'text',text:'ORIGINAL'}}); await flush(); await vi.advanceTimersByTimeAsync(15000); await entry.ready;
 const pending=entry.session.begin(); expect(retryButton().hidden).toBe(true); begin.resolve(); await pending; await flush();
 expect(createAssistantConversation).toHaveBeenCalledTimes(1); expect(conversation.begin).toHaveBeenCalledTimes(1); expect(conversation.turn).not.toHaveBeenCalled();
});
