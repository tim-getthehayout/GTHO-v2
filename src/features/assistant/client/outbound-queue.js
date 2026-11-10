/** One conversation owns every outbound turn, regardless of voice transport.
 * A poisoned/retired generation can never dispatch into a replacement session.
 * The old two-stage 10s receipt/work budget is one bounded 20s queue wait. */
export const OUTBOUND_TURN_BUDGET_MS = 20000;
export const OUTBOUND_DROPPED_MESSAGE = 'A pending turn could not be sent. Please try again.';

export function createOutboundQueue({ conversation, generation, deliver, onDrop = () => {} }) {
  const jobs = new Map();
  let tail = Promise.resolve(), state = 'open', reservations = 0, finishRetirement, retirementTimer, retiring = false, closeReady = false;
  const retired = new Promise(resolve => { finishRetirement = resolve; });
  const pending = () => [...jobs.values()].filter(job => !job.finished);
  function finishIfDrained() {
    if (retiring && closeReady && !pending().length && !reservations) {
      globalThis.clearTimeout(retirementTimer); finishRetirement();
    }
  }
  function complete(job, result) {
    if (job.finished) return;
    job.finished = true; globalThis.clearTimeout(job.timer); job.resolve({ ...result, started: job.started });
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
    enqueue(entry, { reserved = false, beforeDeliver = async () => {}, deadline = Date.now() + OUTBOUND_TURN_BUDGET_MS } = {}) {
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
      tail = tail.then(async () => {
        if (job.finished) return;
        try {
          await beforeDeliver();
          if (job.finished) return;
          if (Date.now() >= job.deadline) { expire('outbound-timeout'); return; }
          job.started = true;
          await deliver(job.entry, { conversation: job.conversation, generation: job.generation });
          complete(job, { status: 'delivered' });
        } catch { expire('outbound-failed'); }
      });
      return done;
    },
    retire({ closing } = {}) {
      if (retiring) return retired;
      retiring = true;
      closeReady = closing === undefined || state === 'expired';
      if (state === 'open') state = closeReady ? 'retiring' : 'closing';
      // Closing may still produce one collected final. Its queue remains on
      // this owner, and retirement as a whole has the same bounded budget.
      retirementTimer = globalThis.setTimeout(() => expire('outbound-timeout'), OUTBOUND_TURN_BUDGET_MS);
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
