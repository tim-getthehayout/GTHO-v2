/** One device-local offline note in review: Transcribe (retryable), check the
 * words, then use them. Shared by the header sheet and the push-to-talk voice log.
 * A failed transcription (including a provider reply with no duration, which is
 * unknown usage) never removes the note: it stays unfinished on this device. */
import { el } from '../../../ui/dom.js';

export const TRANSCRIBE_RETRY_TEXT = 'Transcription did not finish. The voice note is still saved on this device; tap Transcribe to try again.';

export function renderNoteReview(note, { deps, say, use }) {
  const text = el('textarea', { rows: '3', 'data-testid': 'assistant-note-transcript', placeholder: 'Transcribe, then check the words before using them.' });
  const row = el('div', { className: 'field', 'data-testid': 'offline-note', 'data-note': note.id }, [
    el('div', {}, [new Date(note.capturedAt).toLocaleString()]), text,
    el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'offline-note-transcribe', onClick: async () => {
      if (!deps.online()) return say('Transcription needs a connection.');
      try { text.value = (await deps.api.transcribe(note.blob)).text; say(''); }
      catch { say(TRANSCRIBE_RETRY_TEXT); }
    } }, ['Transcribe']),
    // P9: the reviewed transcript becomes the first turn only after the user checks it.
    el('button', { className: 'btn btn-green btn-xs', 'data-testid': 'offline-note-use', onClick: async () => {
      if (!text.value.trim()) return say('Transcribe and review the note first.');
      try { await use(note, text.value.trim()); } catch (error) { say(error.message); }
    } }, ['Use reviewed transcript']),
  ]);
  return row;
}

/** Persists the note's server record for the conversation it started, then removes the device copy. */
export async function useNoteInConversation({ deps, notes, note, conversation }) {
  await deps.persist(conversation.scope, 'offlineVoiceNotes', { operationId: conversation.scope.operationId, conversationId: conversation.ref, deviceLocalReference: note.id, originalContext: JSON.stringify(note.context ?? {}), capturedAt: note.capturedAt });
  await notes.remove(note.id);
}
