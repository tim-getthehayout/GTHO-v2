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



import { OUTBOUND_DROPPED_MESSAGE } from '../../../../src/features/assistant/client/outbound-queue.js';
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
it.each(['send','firstTurn'])('%s recovery retains unchanged, newer and deliberately empty drafts',async path=>{
 // One representative edited-empty case; other modes are tested on actual Retry below.
 const {held}=await failed(path,'empty');expect(input().value).toBe('');expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(retryButton().hidden).toBe(false);
 held.reject(new Error('late old failure'));await flush();expect(input().value).toBe('');
});
it.each([['send','newer'],['send','empty'],['firstTurn','newer'],['firstTurn','empty']])('Retry for %s with %s draft sends original once without changing composer',async(path,mode)=>{
 const {held,next}=await failed(path,mode);const expected=input().value;const retry=retryButton();
 expect(retry.tagName).toBe('BUTTON');expect(retry.type).toBe('button');expect(retry.getAttribute('aria-label')).toBe('Retry failed submission');expect(retry.classList.contains('btn-outline')).toBe(true);
 expect(next.turn).not.toHaveBeenCalled();retry.click();await flush();
 expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({text:'EXACT ORIGINAL'}));expect(retry.hidden).toBe(true);
 expect(input().value).toBe(expected);held.resolve(null);await flush();expect(next.turn).toHaveBeenCalledTimes(1);
});
it('rapid double Retry tap sends only once; hung retry releases UI at its own 20 s deadline',async()=>{
 const {held,next}=await failed();const newWork=gate();next.turn.mockReturnValue(newWork.promise);const retry=retryButton();
 retry.click();retry.click();await flush();expect(next.turn).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(19999);expect(retry.hidden).toBe(true);await vi.advanceTimersByTimeAsync(1);await flush();
 expect(retry.hidden).toBe(false);expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(input().value).toBe('UNSENT NEWER');
 newWork.reject(new Error('late Retry reject'));held.resolve(null);await flush();expect(next.turn).toHaveBeenCalledTimes(1);
});
it('Retry startup shares its submission deadline and late begin cannot dispatch',async()=>{
 const {held,next}=await failed();const begin=gate();next.begin.mockReturnValue(begin.promise);retryButton().click();await flush();
 await vi.advanceTimersByTimeAsync(20000);expect(retryButton().hidden).toBe(false);expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);
 begin.resolve();held.resolve(null);await flush();expect(next.turn).not.toHaveBeenCalled();expect(input().value).toBe('UNSENT NEWER');
});
it('end invalidates Retry so the old failed submission cannot send into a replacement conversation',async()=>{
 const {held,next}=await failed();const retry=retryButton();await entry.session.end();retry.click();await flush();
 expect(next.turn).not.toHaveBeenCalled();expect(retry.hidden||retry.disabled).toBe(true);held.resolve(null);await flush();
});
it('a new conversation invalidates Retry from the old failed submission',async()=>{
 const {held,next}=await failed();const retry=retryButton();await entry.begin('data-entry');retry.click();await flush();
 expect(next.turn).not.toHaveBeenCalled();expect(retry.hidden||retry.disabled).toBe(true);held.resolve(null);await flush();
});
it('starting a replacement voice conversation invalidates the old Retry button',async()=>{
 const {held,next}=await failed();const retry=retryButton();const voice=entry.startVoice();await flush();sockets[0].message({type:'session.created'});await voice;
 expect(entry.session.conversation).toBe(next);expect(retry.hidden||retry.disabled).toBe(true);held.resolve(null);await flush();
});
it('closed panel Retry cannot dispatch even after another panel opens',async()=>{
 const {held,next}=await failed();const oldRetry=retryButton();await entry.close();entry=openAssistant(deps,config);oldRetry.click();await flush();
 expect(next.turn).not.toHaveBeenCalled();expect(retryButton().hidden).toBe(true);held.resolve(null);await flush();
});
it.each(['send','firstTurn'])('initial %s includes hung startup in its 20 s submission deadline',async path=>{
 const begin=gate();conversation.begin.mockReturnValue(begin.promise);
 entry=path==='firstTurn'?openAssistant(deps,config,{firstTurn:{id:'initial',role:'user',modality:'text',text:'ORIGINAL'}}):openAssistant(deps,config);
 if(path==='send')sendText('ORIGINAL');await flush();await vi.advanceTimersByTimeAsync(20000);await flush();
 expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE);expect(retryButton().hidden).toBe(false);begin.resolve();await flush();expect(conversation.turn).not.toHaveBeenCalled();
});

it('the 20 s Send budget includes real-driver finalization before any queue work',async()=>{
 const old=gate(),newWork=gate(),next=replacement('after-finalization');conversation.turn.mockReturnValue(old.promise);next.turn.mockReturnValue(newWork.promise);
 createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);const session=makeSession();await connect(session.talk());
 sockets[0].message({type:'conversation.item.input_audio_transcription.updated',item_id:'partial',transcript:'voice partial'});
 const start=Date.now();let settledAt=null;const typing=session.text('typed').then(r=>{settledAt=Date.now()-start;return r});await flush();
 await vi.advanceTimersByTimeAsync(20000);const receipt=await typing;expect(settledAt).toBeLessThanOrEqual(20000);expect(receipt.status).toBe('dropped');
 expect(next.turn).toHaveBeenCalledTimes(1);old.reject(new Error('late voice'));newWork.reject(new Error('late typed'));await flush();expect(next.turn).toHaveBeenCalledTimes(1);
});
it('typed firstTurn cannot dispatch when its startup completes after the submission deadline',async()=>{
 const begin=gate();conversation.begin.mockReturnValue(begin.promise);
 entry=openAssistant(deps,config,{firstTurn:{id:'initial-late',role:'user',modality:'text',text:'EXPIRED FIRST'}});await flush();
 await vi.advanceTimersByTimeAsync(25000);begin.resolve();await flush();await entry.ready;
 expect(conversation.turn).not.toHaveBeenCalled();
});

it.each(['send', 'firstTurn'])('unchanged %s Retry follows ordinary Send clearing as Design permits', async path => {
  const { held, next } = await failed(path, 'unchanged'); expect(input().value).toBe('EXACT ORIGINAL');
  retryButton().click(); await flush(); expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'EXACT ORIGINAL' }));
  expect(input().value).toBe(''); held.reject(new Error('late old failure')); await flush(); expect(input().value).toBe('');
});
it('typed firstTurn startup stops at its original pre-dispatch ceiling and late begin cannot revive it', async () => {
  const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
  entry = openAssistant(deps, config, { firstTurn: { id: 'initial', role: 'user', modality: 'text', text: 'ORIGINAL' } }); await flush();
  await vi.advanceTimersByTimeAsync(14999); expect(status()).toBe('Starting…'); expect(conversation.turn).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await entry.ready; expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE); expect(retryButton().hidden).toBe(false);
  await vi.advanceTimersByTimeAsync(10000); begin.resolve(); await flush(); expect(conversation.turn).not.toHaveBeenCalled(); expect(input().value).toBe('ORIGINAL');
});
it('a firstTurn started just before the ceiling retains its id and has only the original remaining backend budget', async () => {
  const begin = gate(), backend = gate(); conversation.begin.mockReturnValue(begin.promise); conversation.turn.mockReturnValue(backend.promise);
  entry = openAssistant(deps, config, { firstTurn: { id: 'original-first-id', role: 'user', modality: 'text', text: 'ORIGINAL' } }); await flush();
  await vi.advanceTimersByTimeAsync(14999); begin.resolve(); await flush();
  expect(conversation.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'original-first-id', text: 'ORIGINAL' }));
  await vi.advanceTimersByTimeAsync(5001); await entry.ready; expect(status()).toBe(OUTBOUND_DROPPED_MESSAGE); expect(retryButton().hidden).toBe(false);
  backend.reject(new Error('late backend')); await flush(); expect(conversation.turn).toHaveBeenCalledTimes(1);
});
it('a pending old send cannot recreate Retry after an explicit end and replacement begin', async () => {
  const held = gate(), next = replacement('replacement'); conversation.turn.mockReturnValue(held.promise);
  createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next); entry = openAssistant(deps, config); sendText('old pending'); await flush();
  editDraft('new draft'); const old = entry.session; await old.end(); await entry.begin('data-entry');
  await vi.advanceTimersByTimeAsync(20000); await flush(); expect(retryButton().hidden).toBe(true); expect(input().value).toBe('new draft');
  retryButton().click(); await flush(); expect(next.turn).not.toHaveBeenCalled(); held.reject(new Error('late')); await flush(); expect(retryButton().hidden).toBe(true);
});

it.each([4999, 5000])('post-end replacement startup uses only the original reserved budget (%d ms)', async delay => {
  const oldWork = gate(), begin = gate(), next = replacement('after-retirement-startup');
  conversation.turn.mockReturnValue(oldWork.promise); next.begin.mockReturnValue(begin.promise);
  createAssistantConversation.mockReturnValueOnce(conversation).mockReturnValue(next);
  const session = makeSession(); await spoken(session); await session.end(); const started = Date.now();
  let settledAt; const sending = session.text('after end').then(receipt => { settledAt = Date.now() - started; return receipt; }); await flush();
  await vi.advanceTimersByTimeAsync(15000); expect(next.begin).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(delay); begin.resolve(); await flush();
  await vi.advanceTimersByTimeAsync(Math.max(0, 20000 - (Date.now() - started))); const receipt = await sending;
  expect(settledAt).toBeLessThanOrEqual(20000);
  if (delay < 5000) { expect(next.turn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'after end' })); expect(receipt).toBeUndefined(); }
  else { expect(next.turn).not.toHaveBeenCalled(); expect(receipt.status).toBe('dropped'); }
  oldWork.reject(new Error('late old voice')); await flush();
});
