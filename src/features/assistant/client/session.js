/** One assistant conversation with realtime voice I/O, shared by the header panel
 * (feedback, questions, how-to) and the global push-to-talk (farm voice entry).
 * Voice is I/O only: final transcripts go to the backend turn; the backend answer
 * is spoken verbatim. Tapping again ends the turn, the same as saying "over". */
import { VoiceTransport } from '../shared.js';
import { createAssistantConversation, createFarmReviewFlow, createFeedbackFiling, feedbackSheetSession } from './conversation.js';
import { createXaiRealtimeDriver, startMicrophone, createPcmPlayer, acquireMicrophone, classifyMicError, createAudioChunkBuffer, voiceStartTap, voiceStartMark, prepareCaptureContext, anySignal, SAMPLE_RATE, VOICE_CONNECT_BUDGET_MS, OFFLINE_NO_MIC_MESSAGE, VOICE_UNAVAILABLE_MESSAGE } from './realtime.js';
import { logVoice } from './voice-telemetry.js';
import { recordNote } from './offline-notes.js';
import { createTestingRecorder, uploadTestingAudio } from './testing-audio.js';
import { resolveTestingConsent } from './consent.js';
import { createAttemptTracker } from './attempts.js';
import { showDismissibleBanner } from '../../../ui/toast.js';
import { mountFeedbackReview } from '../feedback-review.js';

/** True only with durable local-save evidence: the local receipt from the
 * existing durable write, or a replayed server outcome that records one. */
export function durableLocalSave(outcome) {
  if (outcome?.receipt?.savedRecordId && outcome.receipt.localSavedAt) return true;
  return ['local-save', 'sync-queue', 'acknowledged-delivery'].includes(outcome?.result?.state) && !!outcome.result.result?.savedRecordId;
}

/** Fallback when the backend refused an entry whose names did not resolve. */
export const UNRESOLVED_TARGET_QUESTION = 'Which farm, paddock, group or animal did you mean?';
/** Status-bubble copy when empty-start cleanup fails (RPC missing or refused). */
export const DISCARD_EMPTY_FAILED_MESSAGE = "Voice closed, but the empty session couldn't be removed.";

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
    voiceReady = false;
    pendingEndTurn = false;
    pcmBuffer?.discard();
    pcmBuffer = null;
    await stopVoice();
    await transport?.cancel();
    await player?.close();
    transport = null; player = null; driver = null;
  }
  /** Drop an empty conversation started in parallel with a mic that then failed.
   * Surfaces cleanup failure with the locked status-bubble copy; never claims
   * success by nulling on error. Local teardown is unchanged. */
  async function discardEmptyStart() {
    if (!conversation) return;
    // Design lock: delete empty conversation artifacts (consent/checkpoint/lock/attempt),
    // not vendor cancel()'s cancelled checkpoint. Billing/usage rows stay.
    try {
      if (typeof conversation.discardEmpty === 'function') await conversation.discardEmpty();
      else await conversation.cancel();
      conversation = null;
      attempts = null;
      discardEmptyFailed = false;
    } catch (error) {
      // A populated (or failed-but-traced) request must not be deleted; this is
      // not a cleanup failure (OI-0206 / OI-0207 populated path).
      if (error?.code === 'discard-empty-refused-turns-exist') {
        conversation = null;
        attempts = null;
        discardEmptyFailed = false;
        return;
      }
      discardEmptyFailed = true;
      say(DISCARD_EMPTY_FAILED_MESSAGE);
      showDismissibleBanner(DISCARD_EMPTY_FAILED_MESSAGE);
    }
  }
  let micFailure = null;
  /** After a successful connect, unexpected transport drop must tear down like stop(). */
  let liveTeardownArmed = false;
  let endingLive = false;
  /** Bumped by end() / a new talk() so in-flight begin/auth/connect aborts. */
  let talkGeneration = 0;
  /** Second tap while Listening but before connect+flush — endTurn when ready. */
  let pendingEndTurn = false;
  /** True only after transport is connected AND the PCM buffer has been flushed. */
  let voiceReady = false;
  /** Typed send arrived while voice was live; talk() must not discard the conversation. */
  let typedTakeover = false;
  /** AbortController for the current tap's connect budget; also cancelled on typed takeover. */
  let connectAbort = null;
  let pcmBuffer = null;
  /** True when discardEmptyStart failed; PTT keeps the locked bubble after No. */
  let discardEmptyFailed = false;
  let beginWork = null;
  const session = {
    get conversation() { return conversation; },
    get attempt() { return attempts?.current ?? null; },
    get listening() { return voiceReady && !!mic; },
    // Feedback host facts are captured before AI for every session, so a routed
    // switch to feedback can still open the pinned interview.
    // origin: {capturedAt, previousAttemptId} when the first turn is an offline note.
    async begin(firstTurn, context = typeof deps.feedbackHost === 'function' ? { feedbackHost: deps.feedbackHost() } : {}, from = {}) {
      origin = { ...(from.capturedAt ? { capturedAt: from.capturedAt } : {}), ...(from.previousAttemptId ? { previousAttemptId: from.previousAttemptId } : {}) };
      const work = (async () => {
        const stored = await resolveTestingConsent(config);
        consent = stored?.decision ?? null;
        const started = createAssistantConversation({ api: deps.api, scope: deps.scope(), persist: deps.persist, awaitServerRows: deps.awaitServerRows, intent, buildStamp: deps.buildStamp, capture: { capturedAt: new Date().toISOString(), source: 'assistant', context } });
        conversation = started;
        say('Starting…');
        await started.begin(stored ? { consent: stored.decision, decidedAt: stored.decidedAt } : {});
        // end() may have run while start was in flight. Clean up here so a
        // late start cannot use a nulled conversation, and End can return
        // without waiting on a gated start.
        if (endingLive || conversation !== started) {
          if (conversation === started) await discardEmptyStart();
          return started;
        }
        attempts = createAttemptTracker({ persist: deps.persist, scope: started.scope, getAll: typeof deps.getAll === 'function' ? deps.getAll : () => [] });
        say('');
        if (firstTurn) await turn(firstTurn);
        onTranscript(visible());
        return started;
      })();
      beginWork = work;
      try {
        return await work;
      } finally {
        if (beginWork === work) beginWork = null;
      }
    },
    /**
     * First tap starts connecting; Listening is shown only after the socket is
     * live and the first PCM chunk has been sent. Every later tap ends the
     * current turn (same as "over"). Mic still overlaps begin(); mint + WS wait
     * until the mic has settled (OI-0196). A 10s overall budget covers tap →
     * session.created plus the first chunk, including mint (AbortSignal).
     */
    async talk() {
      // Second tap ends the turn. During Connecting the driver may already
      // exist but endTurn is ignored until ready — always queue until the
      // connection is live AND the first chunk has been sent.
      if (mic || connectAbort) {
        if (voiceReady && driver) {
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
      voiceReady = false;
      discardEmptyFailed = false;
      endingLive = false;
      typedTakeover = false;
      micFailure = null;
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const tapClock = now();
      const tapAt = voiceStartTap();
      const buffer = createAudioChunkBuffer();
      pcmBuffer = buffer;
      const budget = new AbortController();
      connectAbort = budget;
      const budgetTimer = setTimeout(() => budget.abort(), VOICE_CONNECT_BUDGET_MS);
      let abandoned = false;
      const aborted = () => gen !== talkGeneration || endingLive || typedTakeover;
      const budgetHit = () => budget.signal.aborted && !typedTakeover && gen === talkGeneration;
      logVoice('tap', {}, now, tapClock);

      let capture = null;
      try {
        capture = prepareCaptureContext();
        logVoice('pcm-context', {
          audioContextState: capture.context.state,
          sampleRate: capture.context.sampleRate,
          declaredRate: SAMPLE_RATE,
        }, now, tapClock);
      } catch {
        clearTimeout(budgetTimer);
        connectAbort = null;
        micFailure = { name: 'VoiceUnavailable', message: VOICE_UNAVAILABLE_MESSAGE };
        logVoice('teardown', { reason: 'audio-context' }, now, tapClock);
        return 'unavailable';
      }

      say('Connecting…');
      logVoice('connecting', {}, now, tapClock);

      const beginWork = (async () => {
        if (!conversation) await session.begin();
        // Typed send keeps the conversation so compose can use it.
        if ((abandoned || aborted()) && !typedTakeover) await discardEmptyStart();
      })();

      async function failUnavailable(reason = 'connect-budget') {
        buffer.discard();
        micFailure = { name: 'VoiceUnavailable', message: VOICE_UNAVAILABLE_MESSAGE };
        await beginWork.catch(() => {});
        await abandonLiveVoice();
        await discardEmptyStart();
        logVoice('teardown', { reason }, now, tapClock);
        return 'unavailable';
      }

      let stream;
      try {
        stream = await acquireMicrophone({ signal: budget.signal });
        logVoice('mic-open', {}, now, tapClock);
      } catch (error) {
        if (budgetHit() || error?.name === 'AbortError') {
          abandoned = true;
          await beginWork.catch(() => {});
          await discardEmptyStart();
          await abandonLiveVoice();
          clearTimeout(budgetTimer);
          connectAbort = null;
          return failUnavailable(error?.name === 'AbortError' ? 'connect-budget' : 'connect-budget');
        }
        abandoned = true;
        micFailure = classifyMicError(error);
        await beginWork.catch(() => {});
        await discardEmptyStart();
        buffer.discard();
        await abandonLiveVoice();
        clearTimeout(budgetTimer);
        connectAbort = null;
        logVoice('teardown', { reason: 'no-mic' }, now, tapClock);
        return 'no-mic';
      }

      try {
        await capture.resumePromise;
        if (capture.context.state === 'suspended' && typeof capture.context.resume === 'function') {
          await capture.context.resume();
        }
        mic = await startMicrophone({ stream, context: capture.context, onChunk: bytes => buffer.onChunk(bytes), signal: budget.signal });
        logVoice('capture-ready', {
          audioContextState: capture.context.state,
          sampleRate: capture.context.sampleRate,
          declaredRate: SAMPLE_RATE,
        }, now, tapClock);

        if (typedTakeover) {
          buffer.discard();
          await beginWork.catch(() => {});
          await abandonLiveVoice();
          return 'aborted';
        }
        if (aborted()) {
          buffer.discard();
          await beginWork.catch(() => {});
          await discardEmptyStart();
          await abandonLiveVoice();
          return 'aborted';
        }
        if (budgetHit()) return await failUnavailable();

        await beginWork;
        logVoice('begin-done', {}, now, tapClock);
        if (typedTakeover) {
          buffer.discard();
          await abandonLiveVoice();
          return 'aborted';
        }
        if (abandoned || aborted()) {
          buffer.discard();
          await discardEmptyStart();
          await abandonLiveVoice();
          return abandoned ? 'no-mic' : 'aborted';
        }
        if (budgetHit()) return await failUnavailable();

        player ??= createPcmPlayer();
        const terminal = message => {
          if (onVoiceTerminal) onVoiceTerminal(message);
          else { say(message); void stopVoice(); }
        };
        driver = createXaiRealtimeDriver({
          config,
          onStatus: state => { if (state === 'session-cap') terminal('Voice session ended at 10 minutes. Tap to start a new one.'); },
          now, tapAt: tapClock,
        });
        // Fresh authorization every tap (no cross-tap cache / no mount prewarm).
        // Within one connect, the driver still reuses the token across its 3 attempts.
        transport = new VoiceTransport({
          broker: signal => {
            logVoice('mint-start', {}, now, tapClock);
            return conversation.voiceAuthorization(anySignal(signal, budget.signal)).then(value => {
              logVoice('mint-done', { ok: true }, now, tapClock);
              return value;
            }, error => {
              logVoice('mint-fail', { ok: false }, now, tapClock);
              throw error;
            });
          }, driver,
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
        if (typedTakeover) {
          buffer.discard();
          await abandonLiveVoice();
          return 'aborted';
        }
        if (aborted()) {
          buffer.discard();
          await abandonLiveVoice();
          await discardEmptyStart();
          return 'aborted';
        }
        if (budgetHit()) return await failUnavailable();
        if (transport.state !== 'connected') return await failUnavailable('connect-failed');
        liveTeardownArmed = true;
        endingLive = false;
        await buffer.flushTo(bytes => transport.stream(bytes));
        logVoice('flush-done', { flushed: buffer.sentFirst ? 1 : 0 }, now, tapClock);
        await buffer.waitForFirstSend(budget.signal);
        logVoice('first-chunk-sent', {}, now, tapClock);
        if (typedTakeover) {
          buffer.discard();
          await abandonLiveVoice();
          return 'aborted';
        }
        if (aborted()) {
          buffer.discard();
          await abandonLiveVoice();
          await discardEmptyStart();
          return 'aborted';
        }
        if (budgetHit()) return await failUnavailable('first-chunk-timeout');

        if (consent === 'accepted') {
          recorder = createTestingRecorder({ stream: mic.stream, maxMs: (config.sessionCapSeconds ?? 600) * 1000 });
        }

        voiceReady = true;
        onListening(true);
        say('Listening… say "over" or tap again when done.');
        voiceStartMark('tap→Listening', tapAt);
        logVoice('voice-ready', {}, now, tapClock);
        if (pendingEndTurn) {
          pendingEndTurn = false;
          driver.endTurn();
          say('Thinking…');
          return 'turn-ended';
        }
        return 'listening';
      } catch (error) {
        buffer.discard();
        try { stream?.getTracks().forEach(track => track.stop()); } catch { /* ignore */ }
        if (typedTakeover) {
          await abandonLiveVoice();
          return 'aborted';
        }
        if (budgetHit() || error?.name === 'AbortError') {
          await abandonLiveVoice();
          await discardEmptyStart();
          logVoice('teardown', { reason: 'connect-budget' }, now, tapClock);
          micFailure = { name: 'VoiceUnavailable', message: VOICE_UNAVAILABLE_MESSAGE };
          return 'unavailable';
        }
        await abandonLiveVoice();
        if (aborted()) return 'aborted';
        throw error;
      } finally {
        clearTimeout(budgetTimer);
        if (connectAbort === budget) connectAbort = null;
      }
    },
    async text(text) {
      if (mic || transport || connectAbort) {
        typedTakeover = true;
        talkGeneration += 1;
        try { connectAbort?.abort(); } catch { /* already aborted */ }
        if (voiceReady && driver) {
          try { driver.endTurn(); } catch { /* mid-teardown */ }
        }
        await abandonLiveVoice();
        say('');
      }
      if (!conversation) await session.begin();
      return turn({ id: crypto.randomUUID(), role: 'user', modality: 'text', text });
    },
    async end() {
      // Invalidate any in-flight talk() (begin / auth / connect). Await an
      // in-flight start first, then discard the empty conversation, so a late
      // start cannot run after cleanup or throw on a nulled conversation.
      talkGeneration += 1;
      pendingEndTurn = false;
      endingLive = true;
      await abandonLiveVoice();
      if (beginWork) return;
      await discardEmptyStart();
    },
    get micFailure() { return micFailure; },
    get discardEmptyFailed() { return discardEmptyFailed; },
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
