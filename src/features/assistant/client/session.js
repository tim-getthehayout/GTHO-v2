/** One assistant conversation with realtime voice I/O, shared by the header panel
 * (feedback, questions, how-to) and the global push-to-talk (farm voice entry).
 * Voice is I/O only: final transcripts go to the backend turn; the backend answer
 * is spoken verbatim. Tapping again ends the turn, the same as saying "over". */
import { VoiceTransport } from '../shared.js';
import { createAssistantConversation, createFarmReviewFlow, createFeedbackFiling, feedbackSheetSession } from './conversation.js';
import { createXaiRealtimeDriver, startMicrophone, createPcmPlayer, acquireMicrophone, classifyMicError, createAudioChunkBuffer, voiceStartTap, voiceStartMark, OFFLINE_NO_MIC_MESSAGE, VOICE_UNAVAILABLE_MESSAGE } from './realtime.js';
import { recordNote } from './offline-notes.js';
import { createTestingRecorder, uploadTestingAudio } from './testing-audio.js';
import { resolveTestingConsent } from './consent.js';
import { createAttemptTracker } from './attempts.js';
import { mountFeedbackReview } from '../feedback-review.js';

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
export function createAssistantSession({ deps, config, intent, say = () => {}, onTranscript = () => {}, onListening = () => {}, onIntent = () => {}, voiceLog = null, onDurableSave = async () => {}, onVoiceTerminal = null }) {
  let conversation, transport, driver, mic, player, recorder, consent, attempts, origin = {};
  // Reroute replays are host-marked so the log shows the user's words once.
  const replays = new Set();
  const visible = () => (conversation?.session?.transcript ?? []).filter(entry => !replays.has(entry.id));
  const speak = text => driver?.speak(text);
  async function afterSession() {
    onTranscript(visible());
    const session = conversation.session;
    if (session.phase !== 'review' || !session.reviewReady) return;
    if (session.intent === 'feedback') {
      const draftKey = `gtho-assistant-feedback-draft:${conversation.ref}`;
      const persistDraft = async snapshot => { globalThis.localStorage.setItem(draftKey, JSON.stringify(snapshot)); return { saved: true, savedAt: new Date().toISOString() }; };
      deps.openFeedbackSheet('feedback', conversation.scope.operationId, {
        feedbackSession: await feedbackSheetSession({ session, persistDraft }), persistDraft, mountFeedbackReview,
        fileConfirmed: createFeedbackFiling({ conversation, persist: deps.persist, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, runDurableWrite: deps.runDurableWrite, add: deps.add, flush: deps.flush, revisionIdFor: deps.revisionIdFor, onLocalSave: outcome => settle(outcome) }),
      });
    } else if (session.intent === 'data-entry') {
      // Opens the existing sheet populated from its own fields; saves through its existing path.
      await createFarmReviewFlow({ conversation, createFarmUiPorts: deps.createFarmUiPorts, authorize: deps.authorize, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, getById: deps.getById, flush: deps.flush, pullReviewRows: deps.pullReviewRows,
        onResult: outcome => { say('Saved.'); onTranscript(visible()); void settle(outcome); }, onError: error => say(error.message) }).render(session.pending);
    }
  }
  async function settle(outcome) {
    if (!durableLocalSave(outcome)) return;
    // The same point that deletes a used offline note finishes the attempt.
    try { await attempts?.finish(); await onDurableSave(outcome, conversation); } catch (error) { say(error.message); }
  }
  async function turn(entry) {
    try {
      // One attempt per entry an utterance starts (an offline note keeps its recording time).
      const first = !attempts.current, before = attempts.current;
      const attempt = await attempts.ensure({ conversationRef: conversation.ref, intent: conversation.session?.intent ?? intent, ...(first ? origin : {}) });
      if (attempt !== before) voiceLog?.setPreview?.(attempt.id, entry.text);
      let answer = await conversation.turn(entry);
      const route = conversation.route;
      if (route) {
        // One push-to-talk: switch through the runtime intent command, then send
        // the same words once under the routed intent (never more than one reroute).
        await conversation.switchIntent(route);
        onIntent(route);
        await attempts.reroute(route);
        const replay = { ...entry, id: crypto.randomUUID() };
        replays.add(replay.id);
        voiceLog?.hostEvent({ conversationRef: conversation.ref, intent: route, type: 'reroute-replay', text: `Replayed turn ${entry.id} as ${replay.id}` });
        answer = await conversation.turn(replay, { replayOf: entry.id });
      }
      if (answer) speak(answer);
      // A question or how-to is finished once answered.
      if (answer && ['data-questions', 'how-to'].includes(conversation.session?.intent)) await attempts.finish();
      await afterSession();
    } catch (error) {
      if (error.code !== 'entry-target-unresolved') throw error;
      // Never default: ask the host's plain-words missing-field question (fallback only if none).
      const ask = typeof error.question === 'string' && error.question.trim() ? error.question.trim() : UNRESOLVED_TARGET_QUESTION;
      say(ask); speak(ask);
      voiceLog?.hostEvent({ conversationRef: conversation.ref, intent: conversation.session?.intent ?? intent, type: 'entry-target-question', text: ask });
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
  /** Tear down any live voice I/O immediately (mic failure guard + session end). */
  async function abandonLiveVoice() {
    endingLive = true;
    liveTeardownArmed = false;
    await stopVoice();
    await transport?.cancel();
    await player?.close();
    transport = null; player = null; driver = null;
  }
  /** Drop an empty conversation started in parallel with a mic that then failed.
   * Surfaces RPC/edge failure via say; never claims success by nulling on error. */
  async function discardEmptyStart() {
    if (!conversation) return;
    // Design lock: delete empty conversation artifacts (consent/checkpoint/lock/attempt),
    // not vendor cancel()'s cancelled checkpoint. Billing/usage rows stay.
    try {
      if (typeof conversation.discardEmpty === 'function') await conversation.discardEmpty();
      else await conversation.cancel();
      conversation = null;
      attempts = null;
    } catch (error) {
      const message = error?.message || error?.code || 'Could not discard empty start';
      say(String(message));
    }
  }
  let micFailure = null;
  /** After a successful connect, unexpected transport drop must tear down like stop(). */
  let liveTeardownArmed = false;
  let endingLive = false;
  /** Bumped by end() / a new talk() so in-flight begin/auth/connect aborts. */
  let talkGeneration = 0;
  /** Second tap while Listening but before driver exists — flush then endTurn when ready. */
  let pendingEndTurn = false;
  const session = {
    get conversation() { return conversation; },
    get attempt() { return attempts?.current ?? null; },
    get listening() { return !!mic; },
    // Feedback host facts are captured before AI for every session, so a routed
    // switch to feedback can still open the pinned interview.
    // origin: {capturedAt, previousAttemptId} when the first turn is an offline note.
    async begin(firstTurn, context = typeof deps.feedbackHost === 'function' ? { feedbackHost: deps.feedbackHost() } : {}, from = {}) {
      origin = { ...(from.capturedAt ? { capturedAt: from.capturedAt } : {}), ...(from.previousAttemptId ? { previousAttemptId: from.previousAttemptId } : {}) };
      const stored = await resolveTestingConsent(config);
      consent = stored?.decision ?? null;
      conversation = createAssistantConversation({ api: deps.api, scope: deps.scope(), persist: deps.persist, awaitServerRows: deps.awaitServerRows, intent, buildStamp: deps.buildStamp, capture: { capturedAt: new Date().toISOString(), source: 'assistant', context } });
      say('Starting…');
      await conversation.begin(stored ? { consent: stored.decision, decidedAt: stored.decidedAt } : {});
      attempts = createAttemptTracker({ persist: deps.persist, scope: conversation.scope, getAll: typeof deps.getAll === 'function' ? deps.getAll : () => [] });
      say('');
      if (firstTurn) await turn(firstTurn);
      onTranscript(visible());
      return conversation;
    },
    /**
     * First tap starts listening; every later tap ends the current turn (same as "over").
     * Faster start (OI-0204): mic runs concurrently with begin(); Listening and local
     * PCM buffering start as soon as the mic is live (not after awaitServerRows / WS).
     * Mint + WS wait until the mic has settled successfully (OI-0196): a mic failure
     * aborts any in-flight begin and never calls voiceAuthorization or opens a socket.
     */
    async talk() {
      // Second tap ends the turn. If Listening is already showing but the driver
      // is not ready yet, queue the end until connect finishes (never call
      // driver.endTurn on undefined).
      if (mic) {
        if (driver) {
          driver.endTurn();
          say('Thinking…');
          return 'turn-ended';
        }
        pendingEndTurn = true;
        say('Thinking…');
        return 'turn-ended';
      }
      const gen = ++talkGeneration;
      pendingEndTurn = false;
      endingLive = false;
      micFailure = null;
      const tapAt = voiceStartTap();
      const buffer = createAudioChunkBuffer();
      let abandoned = false;
      const aborted = () => gen !== talkGeneration || endingLive;
      // begin() does not mint; safe to overlap with mic. Mint stays gated on mic OK.
      const beginWork = (async () => {
        if (!conversation) await session.begin();
        if (abandoned || aborted()) await discardEmptyStart();
      })();

      let stream;
      try {
        stream = await acquireMicrophone();
      } catch (error) {
        abandoned = true;
        micFailure = classifyMicError(error);
        await beginWork.catch(() => {});
        // begin may have finished before the mic failed — always drop the empty start.
        await discardEmptyStart();
        buffer.discard();
        await abandonLiveVoice();
        return 'no-mic';
      }

      try {
        // Mic live → buffer + Listening immediately (does not wait on awaitServerRows).
        mic = await startMicrophone({ stream, onChunk: bytes => buffer.onChunk(bytes) });
        onListening(true);
        say('Listening… say "over" or tap again when done.');
        voiceStartMark('tap→Listening', tapAt);

        if (aborted()) {
          buffer.discard();
          await beginWork.catch(() => {});
          await discardEmptyStart();
          await abandonLiveVoice();
          return 'aborted';
        }

        await beginWork;
        if (abandoned || aborted()) {
          buffer.discard();
          await discardEmptyStart();
          await abandonLiveVoice();
          return abandoned ? 'no-mic' : 'aborted';
        }
        if (consent === 'accepted') recorder = createTestingRecorder({ stream: mic.stream });

        player ??= createPcmPlayer();
        const terminal = message => {
          if (onVoiceTerminal) onVoiceTerminal(message);
          else { say(message); void stopVoice(); }
        };
        driver = createXaiRealtimeDriver({ config, onStatus: state => { if (state === 'session-cap') terminal('Voice session ended at 10 minutes. Tap to start a new one.'); } });
        // Fresh authorization every tap (no cross-tap cache / no mount prewarm).
        // Within one connect, the driver still reuses the token across its 3 attempts.
        transport = new VoiceTransport({
          broker: () => conversation.voiceAuthorization(), driver,
          getSession: () => conversation.session,
          onTurn: entry => turn(entry).catch(error => say(error.message)),
          onAudio: bytes => player.play(bytes),
          // Unexpected socket close / transport error: VoiceTransport only flips
          // to text-fallback. Route that through the same terminal teardown as
          // session-cap so mic + End do not stay live (Design HOLD on PR #44).
          onState: state => {
            if (!liveTeardownArmed || endingLive) return;
            if (state !== 'text-fallback' && state !== 'cancelled') return;
            const message = 'Voice connection ended. Tap to start a new one.';
            if (onVoiceTerminal) onVoiceTerminal(message);
            else { say(message); void abandonLiveVoice(); }
          },
        });
        await transport.connect();
        voiceStartMark('tap→WS ready', tapAt);
        if (aborted()) {
          buffer.discard();
          await abandonLiveVoice();
          await discardEmptyStart();
          return 'aborted';
        }
        if (transport.state !== 'connected') {
          buffer.discard();
          micFailure = { name: 'VoiceUnavailable', message: VOICE_UNAVAILABLE_MESSAGE };
          await abandonLiveVoice();
          return 'unavailable';
        }
        liveTeardownArmed = true;
        endingLive = false;
        await buffer.flushTo(bytes => transport.stream(bytes));
        if (pendingEndTurn) {
          pendingEndTurn = false;
          driver.endTurn();
          say('Thinking…');
          return 'turn-ended';
        }
        return 'listening';
      } catch (error) {
        buffer.discard();
        try { stream.getTracks().forEach(track => track.stop()); } catch { /* ignore */ }
        await abandonLiveVoice();
        if (aborted()) return 'aborted';
        throw error;
      }
    },
    async text(text) {
      if (!conversation) await session.begin();
      if (transport) return transport.text(text);
      return turn({ id: crypto.randomUUID(), role: 'user', modality: 'text', text });
    },
    async end() {
      // Invalidate any in-flight talk() (begin / auth / connect). Discards the
      // PCM buffer via abandonLiveVoice's mic stop + transport cancel, and drops
      // an empty conversation (minted reservation settles under existing rules).
      talkGeneration += 1;
      pendingEndTurn = false;
      await abandonLiveVoice();
      await discardEmptyStart();
    },
    get micFailure() { return micFailure; },
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
      let stream;
      try {
        stream = await acquireMicrophone();
      } catch {
        // Offline has no typed assistant: message only, no Type-instead? prompt.
        say(OFFLINE_NO_MIC_MESSAGE);
        return 'no-mic';
      }
      const current = recordNote({ stream });
      recording = current; intent = noteIntent;
      current.done.then(async blob => { stream.getTracks().forEach(track => track.stop()); if (recording === current) { recording = null; await save(blob); } });
      say('Offline: recording a voice note (up to 3 minutes). Tap again to stop.');
      return 'recording';
    },
  };
}
