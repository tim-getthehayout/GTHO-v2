/** One conversation owns every outbound turn, regardless of voice transport.
 * A poisoned/retired generation can never dispatch into a replacement session.
 * The old two-stage 10s receipt/work budget is one bounded 20s queue wait. */
export const OUTBOUND_TURN_BUDGET_MS = 20000;
// Preserve the existing 10s finalization/backstop interleavings, while reserving
// the final 5s for recovery if predecessors or teardown still cannot complete.
export const OUTBOUND_PRE_DISPATCH_BUDGET_MS = OUTBOUND_TURN_BUDGET_MS * 3 / 4;
export const OUTBOUND_DROPPED_MESSAGE = 'A pending turn could not be sent. Please try again.';

export function createOutboundQueue({ conversation, generation, deliver, onDrop = () => {} }) {
  const jobs = new Map();
  let tail = Promise.resolve(), state = 'open', reservations = 0, finishRetirement, retirementTimer, retirementDeadline = Infinity, retiring = false, retirementFinished = false, closeReady = false;
  const retired = new Promise(resolve => { finishRetirement = resolve; });
  const pending = () => [...jobs.values()].filter(job => !job.finished);
  function finishIfDrained() {
    if (retiring && closeReady && !pending().length && !reservations) {
      globalThis.clearTimeout(retirementTimer); retirementFinished = true; finishRetirement();
    }
  }
  function complete(job, result) {
    if (job.finished) return;
    job.finished = true; globalThis.clearTimeout(job.timer); globalThis.clearTimeout(job.handoffTimer); job.resolve({ ...result, started: job.started });
    finishIfDrained();
  }
  function expire(reason) {
    state = 'expired'; closeReady = true;
    const lost = pending();
    for (const job of lost) complete(job, { status: 'dropped' });
    if (lost.length) onDrop({ reason, count: lost.length });
    finishIfDrained();
  }
  return {
    conversation, generation,
    get state() { return state; },
    get busy() { return pending().length > 0 || reservations > 0; },
    reserveText() {
      reservations++;
      let released = false;
      return () => {
        if (released) return; released = true; reservations--;
        finishIfDrained();
      };
    },
    enqueue(entry, { reserved = false, beforeDeliver = async () => {}, isCurrent = () => true, deadline = Date.now() + OUTBOUND_TURN_BUDGET_MS, handoffAt = deadline } = {}) {
      if (jobs.has(entry.id)) return jobs.get(entry.id).done;
      if (state === 'expired' || (state === 'retiring' && !reserved)) {
        onDrop({ reason: 'outbound-retired', count: 1 });
        return Promise.resolve({ status: 'dropped', started: false });
      }
      if (deadline <= Date.now()) {
        onDrop({ reason: 'outbound-timeout', count: 1 });
        return Promise.resolve({ status: 'dropped', started: false });
      }
      let resolve;
      const done = new Promise(finish => { resolve = finish; });
      const job = { entry: { ...entry }, conversation, generation, done, resolve, started: false, finished: false, deadline };
      jobs.set(entry.id, job);
      job.timer = globalThis.setTimeout(() => expire('outbound-timeout'), Math.max(0, job.deadline - Date.now()));
      if (handoffAt < deadline) job.handoffTimer = globalThis.setTimeout(() => {
        if (!job.finished && !job.started) expire('outbound-timeout');
      }, Math.max(0, handoffAt - Date.now()));
      tail = tail.then(async () => {
        if (job.finished) return;
        try {
          if (!isCurrent()) { complete(job, { status: 'invalidated' }); return; }
          await beforeDeliver();
          if (job.finished) return;
          if (!isCurrent()) { complete(job, { status: 'invalidated' }); return; }
          if (Date.now() >= job.deadline) { expire('outbound-timeout'); return; }
          job.started = true; globalThis.clearTimeout(job.handoffTimer);
          await deliver(job.entry, { conversation: job.conversation, generation: job.generation, isCurrent });
          complete(job, { status: 'delivered' });
        } catch { expire('outbound-failed'); }
      });
      return done;
    },
    retire({ closing, deadline = Date.now() + OUTBOUND_TURN_BUDGET_MS } = {}) {
      if (retirementFinished) return retired;
      // A waiting user send can tighten retirement, never restart its budget.
      if (deadline < retirementDeadline) {
        retirementDeadline = deadline;
        globalThis.clearTimeout(retirementTimer);
        retirementTimer = globalThis.setTimeout(() => expire('outbound-timeout'), Math.max(0, deadline - Date.now()));
      }
      if (retiring) return retired;
      retiring = true;
      closeReady = closing === undefined || state === 'expired';
      if (state === 'open') state = closeReady ? 'retiring' : 'closing';
      // Closing may still produce one collected final. Its queue remains on
      // this owner, and retirement as a whole has the same bounded budget.
      if (closing) void Promise.resolve(closing).catch(() => {}).then(() => {
        closeReady = true;
        if (state === 'closing') state = 'retiring';
        finishIfDrained();
      });
      finishIfDrained();
      return retired;
    },
  };
}
