/** One assistant conversation with realtime voice I/O, shared by the header panel
 * (feedback, questions, how-to) and the global push-to-talk (farm voice entry).
 * Voice is I/O only: final transcripts go to the backend turn; the backend answer
 * is spoken verbatim. Tapping again ends the turn, the same as saying "over". */
import { VoiceTransport } from '../shared.js';
import { createAssistantConversation, createFarmReviewFlow, createFeedbackFiling, feedbackSheetSession } from './conversation.js';
import { createXaiRealtimeDriver, startMicrophone, createPcmPlayer } from './realtime.js';
import { recordNote } from './offline-notes.js';
import { createTestingRecorder, uploadTestingAudio } from './testing-audio.js';
import { resolveTestingConsent } from './consent.js';

/** True only with durable local-save evidence: the local receipt from the
 * existing durable write, or a replayed server outcome that records one. */
export function durableLocalSave(outcome) {
  if (outcome?.receipt?.savedRecordId && outcome.receipt.localSavedAt) return true;
  return ['local-save', 'sync-queue', 'acknowledged-delivery'].includes(outcome?.result?.state) && !!outcome.result.result?.savedRecordId;
}

/** Fallback when the backend refused an entry whose names did not resolve. */
export const UNRESOLVED_TARGET_QUESTION = 'Which farm, paddock, group or animal did you mean?';

/** intent is where the session starts; a route-intent suggestion switches it
 * through the runtime intent command (onIntent reports the new intent). */
/** onDurableSave(outcome, conversation): called only after a confirmed write or
 * filing from this conversation has durably saved on this device. */
export function createAssistantSession({ deps, config, intent, say = () => {}, onTranscript = () => {}, onListening = () => {}, onIntent = () => {}, voiceLog = null, onDurableSave = async () => {} }) {
  let conversation, transport, driver, mic, player, recorder, consent;
  const speak = text => driver?.speak(text);
  async function afterSession() {
    onTranscript(conversation.session?.transcript ?? []);
    const session = conversation.session;
    if (session.phase !== 'review' || !session.reviewReady) return;
    if (session.intent === 'feedback') {
      const draftKey = `gtho-assistant-feedback-draft:${conversation.ref}`;
      const persistDraft = async snapshot => { globalThis.localStorage.setItem(draftKey, JSON.stringify(snapshot)); return { saved: true, savedAt: new Date().toISOString() }; };
      deps.openFeedbackSheet('feedback', conversation.scope.operationId, {
        feedbackSession: await feedbackSheetSession({ session, persistDraft }), persistDraft,
        fileConfirmed: createFeedbackFiling({ conversation, persist: deps.persist, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, runDurableWrite: deps.runDurableWrite, add: deps.add, flush: deps.flush, revisionIdFor: deps.revisionIdFor, onLocalSave: outcome => settle(outcome) }),
      });
    } else if (session.intent === 'data-entry') {
      // Opens the existing sheet populated from its own fields; saves through its existing path.
      await createFarmReviewFlow({ conversation, createFarmUiPorts: deps.createFarmUiPorts, authorize: deps.authorize, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, getById: deps.getById, flush: deps.flush, pullReviewRows: deps.pullReviewRows,
        onResult: outcome => { say('Saved.'); onTranscript(conversation.session?.transcript ?? []); void settle(outcome); }, onError: error => say(error.message) }).render(session.pending);
    }
  }
  async function settle(outcome) {
    if (!durableLocalSave(outcome)) return;
    try { await onDurableSave(outcome, conversation); } catch (error) { say(error.message); }
  }
  async function turn(entry) {
    try {
      let answer = await conversation.turn(entry);
      const route = conversation.route;
      if (route) {
        // One push-to-talk: switch through the runtime intent command, then send
        // the same words once under the routed intent (never more than one reroute).
        await conversation.switchIntent(route);
        onIntent(route);
        answer = await conversation.turn({ ...entry, id: crypto.randomUUID() });
      }
      if (answer) speak(answer);
      await afterSession();
    } catch (error) {
      if (error.code !== 'entry-target-unresolved') throw error;
      // Never default: ask one question instead. A host event, not a transcript turn.
      say(UNRESOLVED_TARGET_QUESTION); speak(UNRESOLVED_TARGET_QUESTION);
      voiceLog?.hostEvent({ conversationRef: conversation.ref, intent: conversation.session?.intent ?? intent, type: 'entry-target-question', text: UNRESOLVED_TARGET_QUESTION });
    }
  }
  async function stopVoice() {
    await mic?.stop(); mic = null; onListening(false);
    if (recorder) {
      const recording = await recorder.stop(); const capturedAt = recorder.capturedAt; recorder = null;
      try { await uploadTestingAudio({ api: deps.api, storage: deps.storage, persist: deps.persist, scope: conversation.scope, conversationRef: conversation.ref, recording, capturedAt }); }
      catch (error) { say(`Recording not kept: ${error.message}`); }
    }
  }
  const session = {
    get conversation() { return conversation; },
    get listening() { return !!mic; },
    // Feedback host facts are captured before AI for every session, so a routed
    // switch to feedback can still open the pinned interview.
    async begin(firstTurn, context = typeof deps.feedbackHost === 'function' ? { feedbackHost: deps.feedbackHost() } : {}) {
      const stored = await resolveTestingConsent(config);
      consent = stored?.decision ?? null;
      conversation = createAssistantConversation({ api: deps.api, scope: deps.scope(), persist: deps.persist, awaitServerRows: deps.awaitServerRows, intent, buildStamp: deps.buildStamp, capture: { capturedAt: new Date().toISOString(), source: 'assistant', context } });
      say('Starting…');
      await conversation.begin(stored ? { consent: stored.decision, decidedAt: stored.decidedAt } : {});
      say('');
      if (firstTurn) await turn(firstTurn);
      onTranscript(conversation.session?.transcript ?? []);
      return conversation;
    },
    /** First tap starts listening; every later tap ends the current turn (same as "over"). */
    async talk() {
      if (mic) { driver.endTurn(); say('Thinking…'); return 'turn-ended'; }
      if (!conversation) await session.begin();
      player ??= createPcmPlayer();
      driver = createXaiRealtimeDriver({ config, onStatus: state => { if (state === 'session-cap') { say('Voice session ended at 10 minutes. Tap to start a new one.'); void stopVoice(); } } });
      transport = new VoiceTransport({
        broker: () => conversation.voiceAuthorization(), driver,
        getSession: () => conversation.session,
        onTurn: entry => turn(entry).catch(error => say(error.message)),
        onAudio: bytes => player.play(bytes),
      });
      await transport.connect();
      if (transport.state !== 'connected') { say('Voice is unavailable right now; you can type instead.'); return 'unavailable'; }
      mic = await startMicrophone({ onChunk: bytes => { void transport.stream(bytes); } });
      if (consent === 'accepted') recorder = createTestingRecorder({ stream: mic.stream });
      onListening(true);
      say('Listening… say "over" or tap again when done.');
      return 'listening';
    },
    async text(text) {
      if (!conversation) await session.begin();
      if (transport) return transport.text(text);
      return turn({ id: crypto.randomUUID(), role: 'user', modality: 'text', text });
    },
    async end() { await stopVoice(); await transport?.cancel(); await player?.close(); transport = null; player = null; },
  };
  return session;
}

/** P9 offline voice note: device-local, 3-minute cap; tap again to stop. */
export function createOfflineNoteRecorder({ notes, say = () => {}, intent }) {
  let recording;
  async function save(blob) {
    try { await notes.save({ blob, capturedAt: new Date().toISOString(), context: { intent } }); say('Voice note saved on this device. Review its transcript when you are back online.'); }
    catch (error) { say(`Voice note not saved: ${error.message}`); }
  }
  return {
    get recording() { return !!recording; },
    async toggle(noteIntent = intent) {
      if (recording) { const current = recording; recording = null; await save(await current.stop()); return 'saved'; }
      const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
      const current = recordNote({ stream });
      recording = current; intent = noteIntent;
      current.done.then(async blob => { stream.getTracks().forEach(track => track.stop()); if (recording === current) { recording = null; await save(blob); } });
      say('Offline: recording a voice note (up to 3 minutes). Tap again to stop.');
      return 'recording';
    },
  };
}
