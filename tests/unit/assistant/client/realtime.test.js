import { describe, it, expect, vi } from 'vitest';
import { logger } from '../../../../src/utils/logger.js';
import { createXaiRealtimeDriver, endsWithOver, stripOver, CONNECT_ATTEMPTS, TURN_FINALIZE_TIMEOUT_MS } from '../../../../src/features/assistant/client/realtime.js';

class FakeSocket {
  static instances = [];
  static autoCreate = true;
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; this.readyState = 1; FakeSocket.instances.push(this); if (FakeSocket.autoCreate) queueMicrotask(() => this.emit({ type: 'session.created' })); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', sessionCapSeconds: 600, transcriptionModel: 'grok-transcribe' };
function timers() {
  const pending = new Map(); let id = 0;
  return { pending, setTimer: (fn, ms) => { pending.set(++id, { fn, ms }); return id; }, clearTimer: key => pending.delete(key), fire(ms) { for (const [key, timer] of [...pending]) if (timer.ms === ms) { pending.delete(key); timer.fn(); } } };
}
let idSeq = 0;
async function connected(overrides = {}, handlers = {}) {
  FakeSocket.instances = []; FakeSocket.autoCreate = true; idSeq = 0;
  const clock = timers();
  const driver = createXaiRealtimeDriver({
    config: { ...config, ...overrides },
    WebSocketImpl: FakeSocket,
    ...clock,
    onStatus: handlers.onStatus,
    randomId: () => `turn-${++idSeq}`,
  });
  const onTurn = vi.fn(), onAudio = vi.fn(), onDisconnect = vi.fn();
  const connection = await driver.connect({ authorization: { provider: 'xai', token: 'ephemeral', expiresAt: Date.now() + 60000 }, onTurn, onAudio, onDisconnect });
  return { driver, connection, socket: FakeSocket.instances.at(-1), onTurn, onAudio, onDisconnect, clock };
}

describe('xAI realtime driver', () => {
  it('connects with ?model= from server config and the client-secret subprotocol', async () => {
    const { socket } = await connected();
    expect(socket.url).toBe('wss://api.x.ai/v1/realtime?model=grok-voice-3.0');
    expect(socket.protocols).toEqual(['xai-client-secret.ephemeral']);
    expect(socket.sent[0]).toMatchObject({ type: 'session.update', session: { voice: 'eve', reasoning: { effort: 'none' }, turn_detection: { type: null } } });
  });
  it('always sends turn_detection null even when config asks for server_vad', async () => {
    const { socket } = await connected({ turnDetection: 'server_vad' });
    expect(socket.sent[0].session.turn_detection).toEqual({ type: null });
  });
  it('retries when session.created does not arrive within 5 s, up to 3 attempts', async () => {
    FakeSocket.instances = []; FakeSocket.autoCreate = false;
    const clock = timers();
    const driver = createXaiRealtimeDriver({ config, WebSocketImpl: FakeSocket, ...clock });
    const attempt = driver.connect({ authorization: { token: 't' }, onTurn() {}, onAudio() {}, onDisconnect() {} });
    for (let i = 0; i < CONNECT_ATTEMPTS; i++) { await Promise.resolve(); await Promise.resolve(); clock.fire(5000); }
    await expect(attempt).rejects.toThrow('session-created-timeout');
    expect(FakeSocket.instances).toHaveLength(3);
  });
  it('a tap commits, waits for finals, then emits one client-UUID turn (strips trailing over)', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1, 2]));
    expect(socket.sent.at(-1)).toEqual({ type: 'input_audio_buffer.append', audio: 'AQI=' });
    driver.endTurn();
    expect(socket.sent.at(-1)).toEqual({ type: 'input_audio_buffer.commit' });
    expect(onTurn).not.toHaveBeenCalled();
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'Move the heifers, over.' });
    expect(onTurn).not.toHaveBeenCalled();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn).toHaveBeenCalledWith({ id: 'turn-1', role: 'user', modality: 'voice', text: 'Move the heifers' });
  });
  it('saying "over" commits the buffer (manual only)', async () => {
    const { connection, socket } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'item-1', transcript: 'that is all over' });
    expect(socket.sent.filter(m => m.type === 'input_audio_buffer.commit')).toHaveLength(1);
  });
  it('speaks backend answers verbatim and cancels responses it did not request', async () => {
    const { driver, socket, onAudio } = await connected();
    socket.emit({ type: 'response.created' });
    expect(socket.sent.at(-1)).toEqual({ type: 'response.cancel' });
    driver.speak('Two open heifers.');
    expect(socket.sent.at(-2)).toEqual({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Two open heifers.' }] } });
    expect(socket.sent.at(-1).type).toBe('response.create');
    const before = socket.sent.length;
    socket.emit({ type: 'response.created' });
    expect(socket.sent).toHaveLength(before);
    socket.emit({ type: 'response.output_audio.delta', delta: 'AQI=' });
    expect(onAudio).toHaveBeenCalledWith(new Uint8Array([1, 2]));
  });
  it('hangs up at the 10-minute cap', async () => {
    const onStatus = vi.fn();
    const { socket, clock, onDisconnect } = await connected({}, { onStatus });
    clock.fire(600000);
    expect(socket.readyState).toBe(3);
    expect(onStatus).toHaveBeenCalledWith('session-cap');
    expect(onDisconnect).toHaveBeenCalled();
  });
  it('refuses floating models', () => {
    expect(() => createXaiRealtimeDriver({ config: { ...config, model: 'grok-voice-latest' } })).toThrow('pinned-voice-model-required');
  });
  it('sends the live transcription model from server config and refuses a floating one', async () => {
    const { socket } = await connected();
    expect(socket.sent[0].session.audio.input.transcription).toEqual({ model: 'grok-transcribe' });
    expect(() => createXaiRealtimeDriver({ config: { ...config, transcriptionModel: 'grok-transcribe-latest' } })).toThrow('pinned-transcription-model-required');
    expect(() => createXaiRealtimeDriver({ config: { ...config, transcriptionModel: undefined } })).toThrow('pinned-transcription-model-required');
  });
  it('detects and strips a trailing "over" only', () => {
    expect(endsWithOver('turn it over now')).toBe(false);
    expect(endsWithOver('Done. Over!')).toBe(true);
    expect(stripOver('Hand it over, over.')).toBe('Hand it over');
  });
});

describe('one user turn → one runtime turn', () => {
  it('joins multiple item_ids in order into one turn after the finalize timeout', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'I fed two' });
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'b', transcript: 'bales of grass hay' });
    expect(onTurn).not.toHaveBeenCalled();
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0]).toEqual({ id: 'turn-1', role: 'user', modality: 'voice', text: 'I fed two bales of grass hay' });
  });

  it('a revised completed for the same item_id keeps the latest text only', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two' });
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two bales of grass hay in the corral' });
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0].text).toBe('I fed two bales of grass hay in the corral');
    expect(onTurn.mock.calls[0][0].id).toBe('turn-1');
  });

  it('a late completed after the turn was sent does not produce a second turn or change the id/text', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two' });
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    const first = onTurn.mock.calls[0][0];
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two bales of grass hay' });
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0]).toEqual(first);
  });

  it('a retry replay re-sends the same id and identical text', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'Move the heifers over' });
    expect(socket.sent.some(m => m.type === 'input_audio_buffer.commit')).toBe(true);
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    const first = onTurn.mock.calls[0][0];
    expect(first).toEqual({ id: 'turn-1', role: 'user', modality: 'voice', text: 'Move the heifers' });
    driver.endTurn();
    expect(onTurn).toHaveBeenCalledTimes(2);
    expect(onTurn.mock.calls[1][0]).toEqual(first);
  });

  it('continuous PCM after emit opens a new turn; late revision of prior item stays dropped', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two' });
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    const first = onTurn.mock.calls[0][0];
    expect(first).toEqual({ id: 'turn-1', role: 'user', modality: 'voice', text: 'I fed two' });

    await connection.sendAudio(new Uint8Array([2]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two bales of grass hay in the corral' });
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-2', transcript: 'Move the heifers' });
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(2);
    const second = onTurn.mock.calls[1][0];
    expect(second.id).toBe('turn-2');
    expect(second.text).toBe('Move the heifers');
    expect(second.text).not.toContain('I fed two');
    expect(onTurn.mock.calls[0][0]).toEqual(first);
  });

  it('late updated ending in "over" for a finalized item does not commit the next turn', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two' });
    // Tap ends turn 1 and commits once.
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    const commitsBefore = socket.sent.filter(m => m.type === 'input_audio_buffer.commit').length;
    expect(commitsBefore).toBe(1);

    // Next turn PCM is buffered; a late "… over" revision of item-1 must not
    // finalize/commit against this new buffer.
    await connection.sendAudio(new Uint8Array([2]));
    socket.emit({
      type: 'conversation.item.input_audio_transcription.updated',
      item_id: 'item-1',
      transcript: 'I fed two bales of grass hay, over',
    });
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(socket.sent.filter(m => m.type === 'input_audio_buffer.commit')).toHaveLength(commitsBefore);
  });

  it('late completed ending in "over" for a finalized item does not commit the next turn', async () => {
    const { driver, connection, socket, onTurn, clock } = await connected();
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'I fed two' });
    driver.endTurn();
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    const commitsBefore = socket.sent.filter(m => m.type === 'input_audio_buffer.commit').length;

    await connection.sendAudio(new Uint8Array([2]));
    socket.emit({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      transcript: 'I fed two bales of grass hay over',
    });
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(socket.sent.filter(m => m.type === 'input_audio_buffer.commit')).toHaveLength(commitsBefore);
  });
});

describe('content-free voice milestones', () => {
  it('logs session-created, transcription-event and emitted-turn without text or a measured-audio settlement claim', async () => {
    const entries = [];
    const spy = vi.spyOn(logger, 'info').mockImplementation((category, message, context) => {
      if (category === 'assistant-voice') entries.push({ phase: message, context: { ...(context ?? {}) } });
    });
    const { driver, connection, socket, onTurn, clock } = await connected();
    expect(entries.some(entry => entry.phase === 'session-created')).toBe(true);
    await connection.sendAudio(new Uint8Array([1]));
    socket.emit({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'item-1', transcript: 'Move the heifers, over.' });
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'Move the heifers, over.' });
    clock.fire(TURN_FINALIZE_TIMEOUT_MS);
    expect(onTurn).toHaveBeenCalledTimes(1);
    const phases = entries.map(entry => entry.phase);
    expect(phases).toContain('transcription-event');
    expect(phases).toContain('emitted-turn');
    const transcribe = entries.filter(entry => entry.phase === 'transcription-event');
    expect(transcribe.some(entry => entry.context.event === 'updated')).toBe(true);
    expect(transcribe.some(entry => entry.context.event === 'completed')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/Move the heifers|measured audio|audio_minutes|worst-case settlement is measured/i);
    spy.mockRestore();
  });
});
