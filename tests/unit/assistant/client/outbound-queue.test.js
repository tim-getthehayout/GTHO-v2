import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createOutboundQueue, OUTBOUND_TURN_BUDGET_MS, OUTBOUND_PRE_DISPATCH_BUDGET_MS } from '../../../../src/features/assistant/client/outbound-queue.js';
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

it('moving a never-dispatched entry carries its original remaining deadline', async () => {
  const held = gate(), nextHeld = gate(), nextDeliver = vi.fn(() => nextHeld.promise);
  const old = createOutboundQueue({ conversation: {}, generation: 8, deliver: () => held.promise });
  const next = createOutboundQueue({ conversation: {}, generation: 9, deliver: nextDeliver });
  const first = old.enqueue(entry('first')); await flush(); await vi.advanceTimersByTimeAsync(5000);
  const deadline = Date.now() + OUTBOUND_TURN_BUDGET_MS, typed = entry('typed', 'text');
  const pending = old.enqueue(typed, { deadline }); await vi.advanceTimersByTimeAsync(15000);
  expect(await pending).toEqual({ status: 'dropped', started: false });
  const moved = next.enqueue(typed, { deadline }); await flush();
  await vi.advanceTimersByTimeAsync(4999); expect(next.state).toBe('open');
  await vi.advanceTimersByTimeAsync(1); expect(await moved).toEqual({ status: 'dropped', started: true });
  expect(Date.now()).toBe(deadline); expect(nextDeliver).toHaveBeenCalledTimes(1);
  held.resolve(); nextHeld.resolve(); await first; await flush(); expect(nextDeliver).toHaveBeenCalledTimes(1);
});
it('an exhausted send deadline cannot dispatch or buy a new queue budget', async () => {
  const deliver = vi.fn(), onDrop = vi.fn(), queue = createOutboundQueue({ conversation: {}, generation: 10, deliver, onDrop });
  expect(await queue.enqueue(entry('expired', 'text'), { deadline: Date.now() })).toEqual({ status: 'dropped', started: false });
  await flush(); expect(deliver).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  expect(onDrop).toHaveBeenCalledWith({ reason: 'outbound-timeout', count: 1 });
});

it('pre-dispatch handoff leaves recovery time even when voice and text enqueue in the same tick', async () => {
  const voice = gate(), backend = gate(), deliver = vi.fn(() => backend.promise);
  const old = createOutboundQueue({ conversation: {}, generation: 11, deliver: () => voice.promise });
  const next = createOutboundQueue({ conversation: {}, generation: 12, deliver });
  const deadline = Date.now() + OUTBOUND_TURN_BUDGET_MS, typed = entry('same-tick', 'text');
  const first = old.enqueue(entry('voice')), waiting = old.enqueue(typed, { deadline, handoffAt: Date.now() + OUTBOUND_PRE_DISPATCH_BUDGET_MS });
  await vi.advanceTimersByTimeAsync(OUTBOUND_PRE_DISPATCH_BUDGET_MS - 1); expect(old.state).toBe('open');
  await vi.advanceTimersByTimeAsync(1); expect(await waiting).toEqual({ status: 'dropped', started: false });
  const moved = next.enqueue(typed, { deadline }); await flush(); expect(deliver).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS - OUTBOUND_PRE_DISPATCH_BUDGET_MS);
  expect(await moved).toEqual({ status: 'dropped', started: true }); expect(Date.now()).toBe(deadline);
  voice.resolve(); backend.resolve(); await first; await flush(); expect(deliver).toHaveBeenCalledTimes(1);
});
it('a dispatched send keeps the full deadline instead of the pre-dispatch handoff timer', async () => {
  const work = gate(), queue = createOutboundQueue({ conversation: {}, generation: 13, deliver: () => work.promise });
  const result = queue.enqueue(entry('dispatched', 'text'), { handoffAt: Date.now() + OUTBOUND_PRE_DISPATCH_BUDGET_MS }); await flush();
  await vi.advanceTimersByTimeAsync(OUTBOUND_PRE_DISPATCH_BUDGET_MS); expect(queue.state).toBe('open');
  await vi.advanceTimersByTimeAsync(OUTBOUND_TURN_BUDGET_MS - OUTBOUND_PRE_DISPATCH_BUDGET_MS);
  expect(await result).toEqual({ status: 'dropped', started: true }); work.resolve(); await flush();
});
