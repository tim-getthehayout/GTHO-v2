import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createOutboundQueue, OUTBOUND_TURN_BUDGET_MS } from '../../../../src/features/assistant/client/outbound-queue.js';
const gate = () => { let resolve; const promise = new Promise(finish => { resolve = finish; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const entry = (id, modality = 'voice') => ({ id, role: 'user', modality, text: id });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('all turns serialize on immutable conversation/generation identity', async () => {
  const old = {}, next = {}, first = gate(), seen = []; let current = old;
  const queue = createOutboundQueue({ conversation: current, generation: 7, deliver: async (row, owner) => { seen.push([row.text, owner.conversation, owner.generation]); if (row.id === 'first') await first.promise; } });
  const one = queue.enqueue(entry('first')), original = entry('second'), two = queue.enqueue(original), text = queue.enqueue(entry('typed', 'text'));
  original.text = 'mutated'; current = next; await flush(); expect(seen).toEqual([['first', old, 7]]);
  first.resolve(); await Promise.all([one, two, text]);
  expect(seen).toEqual([['first', old, 7], ['second', old, 7], ['typed', old, 7]]); expect(vi.getTimerCount()).toBe(0);
});
it('repeated final callbacks join exactly one dispatch and receipt', async () => {
  const deliver = vi.fn(async () => {}); const queue = createOutboundQueue({ conversation: {}, generation: 1, deliver });
  const a = queue.enqueue(entry('same')), b = queue.enqueue(entry('same'));
  expect(a).toBe(b); expect(await a).toEqual({ status: 'delivered', started: true }); expect(deliver).toHaveBeenCalledTimes(1);
  expect(queue.enqueue(entry('same'))).toBe(a);
});
it('double retirement drains captured jobs once and visibly rejects new work', async () => {
  const first = gate(), seen = [], onDrop = vi.fn();
  const queue = createOutboundQueue({ conversation: {}, generation: 2, onDrop, deliver: async row => { seen.push(row.id); if (row.id === 'one') await first.promise; } });
  const one = queue.enqueue(entry('one')), two = queue.enqueue(entry('two'));
  const ended = queue.retire(); expect(queue.retire()).toBe(ended);
  await expect(queue.enqueue(entry('late private text'))).resolves.toEqual({ status: 'dropped', started: false });
  expect(onDrop).toHaveBeenCalledWith({ reason: 'outbound-retired', count: 1 });
  first.resolve(); await Promise.all([one, two, ended]); expect(seen).toEqual(['one', 'two']); expect(vi.getTimerCount()).toBe(0);
});
it('hung pre-dispatch teardown is bounded and cannot dispatch after its late completion', async () => {
  const before = gate(), deliver = vi.fn(async () => {}), onDrop = vi.fn();
  const queue = createOutboundQueue({ conversation: {}, generation: 3, deliver, onDrop });
  const result = queue.enqueue(entry('typed', 'text'), { beforeDeliver: () => before.promise }); await flush();
  await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);
  await expect(result).resolves.toEqual({ status: 'dropped', started: false });
  expect(onDrop).toHaveBeenCalledWith({ reason: 'outbound-timeout', count: 1 });
  before.resolve(); await flush(); expect(deliver).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('hung in-flight delivery visibly drops its queued successor and observes late completion', async () => {
  const held = gate(), deliver = vi.fn(() => held.promise), onDrop = vi.fn();
  const queue = createOutboundQueue({ conversation: {}, generation: 4, deliver, onDrop });
  const one = queue.enqueue(entry('one')), two = queue.enqueue(entry('two'));
  await flush(); await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS);
  expect(await one).toEqual({ status: 'dropped', started: true }); expect(await two).toEqual({ status: 'dropped', started: false });
  await queue.retire(); expect(onDrop).toHaveBeenCalledWith({ reason: 'outbound-timeout', count: 2 });
  held.resolve(); await flush(); expect(deliver).toHaveBeenCalledTimes(1);
});
it('a typed takeover reservation survives retirement but releases exactly once', async () => {
  const queue = createOutboundQueue({ conversation: {}, generation: 5, deliver: async () => {} });
  const release = queue.reserveText(); let retired = false; const ended = queue.retire().then(() => { retired = true; });
  await flush(); expect(retired).toBe(false);
  await queue.enqueue(entry('typed', 'text'), { reserved: true }); expect(retired).toBe(false);
  release(); release(); await ended; expect(retired).toBe(true); expect(queue.busy).toBe(false);
});
