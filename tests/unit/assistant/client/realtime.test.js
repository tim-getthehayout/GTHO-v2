import { describe, it, expect, vi } from 'vitest';
import { createXaiRealtimeDriver, endsWithOver, stripOver, CONNECT_ATTEMPTS } from '../../../../src/features/assistant/client/realtime.js';

class FakeSocket {
  static instances = [];
  static autoCreate = true;
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; this.readyState = 1; FakeSocket.instances.push(this); if (FakeSocket.autoCreate) queueMicrotask(() => this.emit({ type: 'session.created' })); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', sessionCapSeconds: 600 };
function timers() {
  const pending = new Map(); let id = 0;
  return { pending, setTimer: (fn, ms) => { pending.set(++id, { fn, ms }); return id; }, clearTimer: key => pending.delete(key), fire(ms) { for (const [key, timer] of [...pending]) if (timer.ms === ms) { pending.delete(key); timer.fn(); } } };
}
async function connected(overrides = {}, handlers = {}) {
  FakeSocket.instances = []; FakeSocket.autoCreate = true;
  const clock = timers();
  const driver = createXaiRealtimeDriver({ config: { ...config, ...overrides }, WebSocketImpl: FakeSocket, ...clock, onStatus: handlers.onStatus });
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
  it('retries when session.created does not arrive within 5 s, up to 3 attempts', async () => {
    FakeSocket.instances = []; FakeSocket.autoCreate = false;
    const clock = timers();
    const driver = createXaiRealtimeDriver({ config, WebSocketImpl: FakeSocket, ...clock });
    const attempt = driver.connect({ authorization: { token: 't' }, onTurn() {}, onAudio() {}, onDisconnect() {} });
    for (let i = 0; i < CONNECT_ATTEMPTS; i++) { await Promise.resolve(); await Promise.resolve(); clock.fire(5000); }
    await expect(attempt).rejects.toThrow('session-created-timeout');
    expect(FakeSocket.instances).toHaveLength(3);
  });
  it('a second tap commits the turn; the final transcript (minus trailing "over") becomes a voice turn', async () => {
    const { driver, connection, socket, onTurn } = await connected();
    await connection.sendAudio(new Uint8Array([1, 2]));
    expect(socket.sent.at(-1)).toEqual({ type: 'input_audio_buffer.append', audio: 'AQI=' });
    driver.endTurn();
    expect(socket.sent.at(-1)).toEqual({ type: 'input_audio_buffer.commit' });
    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'Move the heifers, over.' });
    expect(onTurn).toHaveBeenCalledWith({ id: 'item-1', role: 'user', modality: 'voice', text: 'Move the heifers' });
  });
  it('saying "over" ends the turn in manual and server_vad modes', async () => {
    for (const mode of ['manual', 'server_vad']) {
      const { connection, socket } = await connected({ turnDetection: mode });
      if (mode === 'server_vad') expect(socket.sent[0].session.turn_detection).toEqual({ type: 'server_vad' });
      await connection.sendAudio(new Uint8Array([1]));
      socket.emit({ type: 'conversation.item.input_audio_transcription.updated', transcript: 'that is all over' });
      expect(socket.sent.filter(m => m.type === 'input_audio_buffer.commit')).toHaveLength(1);
    }
  });
  it('tapping also ends the turn in server_vad mode', async () => {
    const { driver, connection, socket } = await connected({ turnDetection: 'server_vad' });
    await connection.sendAudio(new Uint8Array([1]));
    driver.endTurn();
    expect(socket.sent.at(-1)).toEqual({ type: 'input_audio_buffer.commit' });
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
  it('detects and strips a trailing "over" only', () => {
    expect(endsWithOver('turn it over now')).toBe(false);
    expect(endsWithOver('Done. Over!')).toBe(true);
    expect(stripOver('Hand it over, over.')).toBe('Hand it over');
  });
});
