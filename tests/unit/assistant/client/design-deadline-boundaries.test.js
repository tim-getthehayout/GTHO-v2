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
afterEach(()=>vi.restoreAllMocks());

const status=()=>document.querySelector('[data-testid="assistant-status"]').textContent;
const input=()=>document.querySelector('[data-testid="assistant-text"]');
function sendText(text){input().value=text;document.querySelector('[data-testid="assistant-send"]').click();}
function replacement(ref){return {...conversation,ref,session:{...conversation.session,conversationRef:ref,transcript:[]},begin:vi.fn(async()=>{}),turn:vi.fn(async()=>null),discardEmpty:vi.fn(async()=>{})};}
async function spoken(session,text='private spoken over'){
 await connect(session.talk()); sockets[0].message({type:'conversation.item.input_audio_transcription.completed',item_id:'private-item',transcript:text});
 await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
}

import { createOutboundQueue } from '../../../../src/features/assistant/client/outbound-queue.js';

it.each([14999,15000,15001])('same-tick voice/text with predecessor released at %d ms dispatches text once',async ms=>{
 const voice=gate(),oldCalls=[],nextCalls=[];const deadline=Date.now()+20000;
 const old=createOutboundQueue({conversation:{ref:'old'},generation:1,deliver:async e=>{oldCalls.push(e);if(e.modality==='voice')await voice.promise;}});
 const next=createOutboundQueue({conversation:{ref:'new'},generation:2,deliver:async e=>{nextCalls.push(e);}});
 const v=old.enqueue({id:'v',modality:'voice',text:'voice'});
 const e={id:'t',modality:'text',text:'typed'};const t=old.enqueue(e,{deadline,handoffAt:Date.now()+15000});
 setTimeout(()=>voice.resolve(),ms);await vi.advanceTimersByTimeAsync(ms);let result=await t;
 if(result.status==='dropped'&&!result.started)result=await next.enqueue(e,{deadline});
 await v;expect(result.status).toBe('delivered');expect([...oldCalls,...nextCalls].filter(e=>e.id==='t')).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(20000);expect([...oldCalls,...nextCalls].filter(e=>e.id==='t')).toHaveLength(1);
});
it.each([4999,5000,5001])('fallback begin finishing %d ms into its reserved 5 s cannot extend deadline',async delay=>{
 const voice=gate(),begin=gate(),next=replacement('reserved-five');conversation.turn.mockReturnValue(voice.promise);next.begin.mockReturnValue(begin.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 const session=makeSession();await spoken(session);const start=Date.now();let settledAt=null;
 const typing=session.text('boundary').then(r=>{settledAt=Date.now()-start;return r});await flush();
 await vi.advanceTimersByTimeAsync(15000);expect(next.begin).toHaveBeenCalledTimes(1);
 setTimeout(()=>begin.resolve(),delay);await vi.advanceTimersByTimeAsync(delay);await vi.advanceTimersByTimeAsync(Math.max(0,20000-(Date.now()-start)));const receipt=await typing;
 expect(settledAt).toBeLessThanOrEqual(20000);
 if(delay<5000){expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({text:'boundary'}));expect(receipt).toBeUndefined();}
 else{expect(next.turn).not.toHaveBeenCalled();expect(receipt.status).toBe('dropped');}
 voice.reject(new Error('late voice failure'));await flush();expect(next.turn.mock.calls.length).toBe(delay<5000?1:0);
});
it('already-dispatched work is not handed off at 15 s, then late rejection is handled once',async()=>{
 const held=gate();conversation.turn.mockReturnValue(held.promise);const session=makeSession();let done=false;
 const typing=session.text('once').then(r=>{done=true;return r});await flush();await vi.advanceTimersByTimeAsync(15000);
 expect(done).toBe(false);expect(createAssistantConversation).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(5000);expect((await typing).started).toBe(true);held.reject(new Error('late backend failure'));await flush();expect(conversation.turn).toHaveBeenCalledTimes(1);
});
it.each(['send','firstTurn'])('failed %s retains failure, draft and explicit retry without automatic replay',async path=>{
 const next=replacement('retry'),held=gate();conversation.turn.mockReturnValue(held.promise);createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 entry=path==='firstTurn'?openAssistant(deps,config,{firstTurn:{id:'initial',role:'user',modality:'text',text:'recover me'}}):openAssistant(deps,config);
 if(path==='send')sendText('recover me');await flush();await vi.advanceTimersByTimeAsync(20000);await flush();
 expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(input().value).toBe('recover me');expect(next.turn).not.toHaveBeenCalled();
 held.reject(new Error('late rejected send'));await flush();expect(input().value).toBe('recover me');
 document.querySelector('[data-testid="assistant-send"]').click();await flush();expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({text:'recover me'}));
});
it.each(['send','firstTurn'])('failed %s must not overwrite a newer unsent draft typed while backend is pending',async path=>{
 const held=gate();conversation.turn.mockReturnValue(held.promise);
 entry=path==='firstTurn'?openAssistant(deps,config,{firstTurn:{id:'initial',role:'user',modality:'text',text:'original submitted'}}):openAssistant(deps,config);
 if(path==='send')sendText('original submitted');await flush();
 expect(input().hidden).toBe(false);input().value='newer unsent instruction';
 await vi.advanceTimersByTimeAsync(20000);await flush();held.resolve(null);await flush();
 expect(input().value).toBe('newer unsent instruction');
});

it('post-end typed send includes retirement wait in its one 20 s pre-dispatch budget',async()=>{
 const old=gate(),newWork=gate(),next=replacement('after-retirement');conversation.turn.mockReturnValue(old.promise);next.turn.mockReturnValue(newWork.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
 const session=makeSession();await spoken(session);await session.end();const started=Date.now();let settledAt=null;
 const typing=session.text('after end').then(r=>{settledAt=Date.now()-started;return r});await flush();
 await vi.advanceTimersByTimeAsync(20000);await flush();expect(next.turn).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(20000);await typing;old.resolve(null);newWork.resolve(null);await flush();
 expect(next.turn).toHaveBeenCalledTimes(1);expect(settledAt).toBeLessThanOrEqual(20000);
});

it.each(['send', 'firstTurn'])('Retry after failed %s sends the original once and preserves a newer composer draft', async path => {
  const held = gate(), next = replacement('explicit-retry'); conversation.turn.mockReturnValue(held.promise);
  createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
  entry = path === 'firstTurn' ? openAssistant(deps, config, { firstTurn: { id: 'first', role: 'user', modality: 'text', text: 'original submitted' } }) : openAssistant(deps, config);
  if (path === 'send') sendText('original submitted'); await flush();
  input().value = 'newer unsent instruction'; input().dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(20000); await flush();
  const retry = document.querySelector('[data-testid="assistant-retry"]');
  expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE); expect(retry.hidden).toBe(false); expect(retry.textContent).toBe('Retry');
  expect(next.turn).not.toHaveBeenCalled(); retry.click(); await flush();
  expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'original submitted' }));
  expect(input().value).toBe('newer unsent instruction'); expect(retry.hidden).toBe(true);
  held.reject(new Error('late original failure')); await flush(); expect(input().value).toBe('newer unsent instruction');
});
it.each(['send', 'firstTurn'])('failed %s does not replace an intentionally edited empty draft', async path => {
  const held = gate(); conversation.turn.mockReturnValue(held.promise);
  entry = path === 'firstTurn' ? openAssistant(deps, config, { firstTurn: { id: 'first', role: 'user', modality: 'text', text: 'original' } }) : openAssistant(deps, config);
  if (path === 'send') sendText('original'); await flush();
  input().value = 'changed'; input().dispatchEvent(new Event('input', { bubbles: true }));
  input().value = ''; input().dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(20000); expect(input().value).toBe('');
  expect(document.querySelector('[data-testid="assistant-retry"]').hidden).toBe(false);
  held.resolve(null); await flush(); expect(input().value).toBe('');
});
it('initial Send startup counts inside the user budget and late begin cannot clear recovery or send abandoned text', async () => {
  const begin = gate(); conversation.begin.mockReturnValue(begin.promise); entry = openAssistant(deps, config); sendText('original'); await flush();
  expect(input().value).toBe('original'); await vi.advanceTimersByTimeAsync(10000);
  input().value = 'newer startup draft'; input().dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(10000); expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE); expect(input().value).toBe('newer startup draft');
  begin.resolve(); await flush(); expect(conversation.turn).not.toHaveBeenCalled(); expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);
  expect(input().value).toBe('newer startup draft');
});
it('a tightened retirement deadline never restarts and drops the old generation visibly once', async () => {
  const work = gate(), dropped = vi.fn(), deliver = vi.fn(() => work.promise), started = Date.now();
  const queue = createOutboundQueue({ conversation: {}, generation: 1, deliver, onDrop: dropped });
  const receipt = queue.enqueue({ id: 'voice', modality: 'voice' }); await flush();
  const retired = queue.retire(); queue.retire({ deadline: started + 15000 }); queue.retire({ deadline: started + 19000 });
  await vi.advanceTimersByTimeAsync(15000); await retired; expect((await receipt).status).toBe('dropped');
  expect(dropped).toHaveBeenCalledExactlyOnceWith({ reason: 'outbound-timeout', count: 1 });
  queue.retire({ deadline: started + 10000 }); work.reject(new Error('late')); await flush();
  await vi.advanceTimersByTimeAsync(20000); expect(deliver).toHaveBeenCalledTimes(1); expect(dropped).toHaveBeenCalledTimes(1);
});
