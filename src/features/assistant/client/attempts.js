/** Voice-to-entry attempts (voice_entry_attempts), written through the existing
 * artifact store, i.e. the normal durable local write and sync queue. Columns are
 * exactly the existing table's: conversation, previous attempt, captured_at,
 * status, finished_at and purpose. */
import { INTENT_PURPOSE } from '../intent-routing.js';

/** Attempts superseded by a newer, non-discarded retry in their chain
 * (previous_attempt_id). Only the newest attempt of a chain counts; discarding
 * the retry makes its predecessor count again. */
export function supersededAttempts(attempts) {
  return new Set(attempts.filter(row => row.previousAttemptId && row.status !== 'discarded').map(row => row.previousAttemptId));
}

/** One tracker per assistant session; one row per entry an utterance starts.
 * getAll reads the local store so a finished retry can finish its predecessors. */
export function createAttemptTracker({ persist, scope, now = () => new Date().toISOString(), getAll = () => [] }) {
  let current = null;
  const save = async row => { current = await persist(scope, 'voiceEntryAttempts', row); return current; };
  return {
    get current() { return current; },
    /** Starts a new attempt unless one is still open in this session. */
    async ensure({ conversationRef, intent, capturedAt = now(), previousAttemptId = null }) {
      if (current?.status === 'unfinished') return current;
      return save({ operationId: scope.operationId, conversationId: conversationRef, previousAttemptId, capturedAt, status: 'unfinished', finishedAt: null, purpose: INTENT_PURPOSE[intent] ?? 'write' });
    },
    /** A reroute changes the same row's purpose; it never creates a second attempt. */
    async reroute(intent) {
      if (current?.status !== 'unfinished' || !INTENT_PURPOSE[intent] || current.purpose === INTENT_PURPOSE[intent]) return current;
      return save({ ...current, purpose: INTENT_PURPOSE[intent] });
    },
    /** Outcome reached: starts the 90-day finished countdown. */
    async finish() {
      if (current?.status !== 'unfinished') return current;
      const finishedAt = now();
      const done = await save({ ...current, status: 'finished', finishedAt });
      // The whole retry chain expires together: unfinished predecessors finish
      // with the same finished_at (discarded ones keep their status).
      const rows = getAll('voiceEntryAttempts').filter(row => row.operationId === scope.operationId);
      const seen = new Set([done.id]);
      for (let id = done.previousAttemptId; id && !seen.has(id);) {
        seen.add(id);
        const prior = rows.find(row => row.id === id);
        if (!prior) break;
        if (prior.status === 'unfinished') await persist(scope, 'voiceEntryAttempts', { ...prior, status: 'finished', finishedAt });
        id = prior.previousAttemptId;
      }
      return done;
    },
  };
}

/** A user discard: kept until user deletion, no finished countdown. */
export function discardAttempt({ persist, scope, attempt }) {
  if (attempt.status !== 'unfinished') return attempt;
  return persist(scope, 'voiceEntryAttempts', { ...attempt, status: 'discarded', finishedAt: null });
}

/** Unfinished chain heads plus the device notes not yet used in an attempt. */
export function unfinishedCount({ attempts, notes, noteRows }) {
  const used = new Set(noteRows.filter(row => row.attemptId).map(row => row.deviceLocalReference));
  const superseded = supersededAttempts(attempts);
  return attempts.filter(row => row.status === 'unfinished' && !superseded.has(row.id)).length + notes.filter(note => !used.has(note.id)).length;
}
