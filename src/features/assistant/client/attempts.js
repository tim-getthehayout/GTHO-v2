/** Voice-to-entry attempts (voice_entry_attempts), written through the existing
 * artifact store, i.e. the normal durable local write and sync queue. Columns are
 * exactly the existing table's: conversation, previous attempt, captured_at,
 * status, finished_at and purpose. */
import { INTENT_PURPOSE } from '../intent-routing.js';

/** One tracker per assistant session; one row per entry an utterance starts. */
export function createAttemptTracker({ persist, scope, now = () => new Date().toISOString() }) {
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
      return save({ ...current, status: 'finished', finishedAt: now() });
    },
  };
}

/** A user discard: kept until user deletion, no finished countdown. */
export function discardAttempt({ persist, scope, attempt }) {
  if (attempt.status !== 'unfinished') return attempt;
  return persist(scope, 'voiceEntryAttempts', { ...attempt, status: 'discarded', finishedAt: null });
}

/** The operation's attempts plus the device notes not yet used in an attempt. */
export function unfinishedCount({ attempts, notes, noteRows }) {
  const used = new Set(noteRows.filter(row => row.attemptId).map(row => row.deviceLocalReference));
  return attempts.filter(row => row.status === 'unfinished').length + notes.filter(note => !used.has(note.id)).length;
}
