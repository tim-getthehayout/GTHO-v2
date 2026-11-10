/** One assistant conversation with realtime voice I/O, shared by the header panel
 * (feedback, questions, how-to) and the global push-to-talk (farm voice entry).
 * Voice is I/O only: final transcripts go to the backend turn; the backend answer
 * is spoken verbatim. Tapping again ends the turn, the same as saying "over". */
import { createOutboundQueue, OUTBOUND_DROPPED_MESSAGE } from './outbound-queue.js';
import { VoiceTransport } from '../shared.js';
import { createAssistantConversation, createFarmReviewFlow, createFeedbackFiling, feedbackSheetSession } from './conversation.js';
import { createXaiRealtimeDriver, startMicrophone, createPcmPlayer, acquireMicrophone, classifyMicError, createAudioChunkBuffer, voiceStartTap, voiceStartMark, prepareCaptureContext, closeCaptureContext, anySignal, waitForAbort, SAMPLE_RATE, VOICE_CONNECT_BUDGET_MS, OFFLINE_NO_MIC_MESSAGE, VOICE_UNAVAILABLE_MESSAGE } from './realtime.js';
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
export function createAssistantSession({ deps, config, intent, say = () => {}, onTranscript = () => {}, onListening = () => {}, onIntent = () => {}, voiceLog = null, onDurableSave = async () => {}, onVoiceTerminal = null, onVoiceState = () => {} }) {
  let conversation, transport, driver, mic, player, recorder, consent, attempts, origin = {};
  let outbound = null, outboundGeneration = 0;
  const retiringQueues = new Set();
  const visible = (owner = outbound) => (owner?.conversation?.session?.transcript ?? []).filter(entry => !owner.replays.has(entry.id));
  const speak = (text, owner) => { if (owner === outbound && owner.queue?.state !== 'expired') driver?.speak(text); };
  async function afterSession(owner) {
    if (owner !== outbound || owner.queue?.state === 'expired') return;
    const conversation = owner.conversation;
    onTranscript(visible(owner));
    const session = conversation.session;
    if (session.phase !== 'review' || !session.reviewReady) return;
    if (session.intent === 'feedback') {
      const draftKey = `gtho-assistant-feedback-draft:${conversation.ref}`;
      const persistDraft = async snapshot => { globalThis.localStorage.setItem(draftKey, JSON.stringify(snapshot)); return { saved: true, savedAt: new Date().toISOString() }; };
      deps.openFeedbackSheet('feedback', conversation.scope.operationId, {
        feedbackSession: await feedbackSheetSession({ session, persistDraft }), persistDraft, mountFeedbackReview,
        fileConfirmed: createFeedbackFiling({ conversation, persist: deps.persist, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, runDurableWrite: deps.runDurableWrite, add: deps.add, flush: deps.flush, revisionIdFor: deps.revisionIdFor, onLocalSave: outcome => settle(outcome, owner) }),
      });
    } else if (session.intent === 'data-entry') {
      // Opens the existing sheet populated from its own fields; saves through its existing path.
      await createFarmReviewFlow({ conversation, createFarmUiPorts: deps.createFarmUiPorts, authorize: deps.authorize, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, getById: deps.getById, flush: deps.flush, pullReviewRows: deps.pullReviewRows,
        onResult: outcome => { if (owner === outbound) { say('Saved.'); onTranscript(visible(owner)); } void settle(outcome, owner); }, onError: error => say(error.message) }).render(session.pending);
    }
  }
  async function settle(outcome, owner) {
    if (!durableLocalSave(outcome)) return;
    const { conversation, attempts } = owner;
    // The same point that deletes a used offline note finishes the attempt.
    try { await attempts?.finish(); await onDurableSave(outcome, conversation); } catch (error) { say(error.message); }
  }
  async function turn(entry, owner) {
    const { conversation, attempts, origin, replays } = owner;
    const live = () => owner === outbound && owner.queue?.state !== 'expired';
    try {
      // One attempt per entry an utterance starts (an offline note keeps its recording time).
      const first = !attempts.current, before = attempts.current;
      const attempt = await attempts.ensure({ conversationRef: conversation.ref, intent: conversation.session?.intent ?? intent, ...(first ? origin : {}) });
      if (owner.queue?.state === 'expired') return;
      if (attempt !== before) voiceLog?.setPreview?.(attempt.id, entry.text);
      let answer = await conversation.turn(entry);
      if (owner.queue?.state === 'expired') return;
      const route = conversation.route;
      if (route) {
        // One push-to-talk: switch through the runtime intent command, then send
        // the same words once under the routed intent (never more than one reroute).
        await conversation.switchIntent(route);
        if (live()) onIntent(route);
        await attempts.reroute(route);
        if (owner.queue?.state === 'expired') return;
        const replay = { ...entry, id: crypto.randomUUID() };
        replays.add(replay.id);
        voiceLog?.hostEvent({ conversationRef: conversation.ref, intent: route, type: 'reroute-replay', text: `Replayed turn ${entry.id} as ${replay.id}` });
        answer = await conversation.turn(replay, { replayOf: entry.id });
      }
      if (answer && live()) speak(answer, owner);
      // A question or how-to is finished once answered.
      if (answer && ['data-questions', 'how-to'].includes(conversation.session?.intent)) await attempts.finish();
      await afterSession(owner);
    } catch (error) {
      if (error.code !== 'entry-target-unresolved') throw error;
      // Never default: ask the host's plain-words missing-field question (fallback only if none).
      const ask = typeof error.question === 'string' && error.question.trim() ? error.question.trim() : UNRESOLVED_TARGET_QUESTION;
      if (live()) { say(ask); speak(ask, owner); }
      voiceLog?.hostEvent({ conversationRef: conversation.ref, intent: conversation.session?.intent ?? intent, type: 'entry-target-question', text: ask });
    }
  }
  function voiceState(state) {
    voiceReady = state === 'listening';
    onVoiceState(state);
    if (state !== 'connecting') onListening(voiceReady);
  }
  async function stopVoice() {
    const recordingConversation = conversation;
    const ownedMic = mic; mic = null;
    const ownedRecorder = recorder; recorder = null;
    voiceState('idle');
    // Stop capture before awaiting context close, upload or server-row cleanup.
    ownedMic?.stream?.getTracks().forEach(track => track.stop());
    const stopping = ownedMic?.stop();
    const recorded = ownedRecorder?.stop();
    if (ownedRecorder) {
      const recording = await recorded; const capturedAt = ownedRecorder.capturedAt;
      try { await uploadTestingAudio({ api: deps.api, storage: deps.storage, persist: deps.persist, scope: recordingConversation.scope, conversationRef: recordingConversation.ref, recording, capturedAt }); }
      catch (error) { say(`Recording not kept: ${error.message}`); }
    }
    await stopping;
  }
  /** Tear down any live voice I/O immediately (mic failure guard + session end). */
  async function abandonLiveVoice() {
    endingLive = true;
    liveTeardownArmed = false;
    voiceReady = false;
    pendingEndTurn = false;
    pcmBuffer?.discard();
    pcmBuffer = null;
    const ownedTransport = transport, ownedPlayer = player;
    transport = null; player = null; driver = null;
    await Promise.allSettled([stopVoice(), ownedTransport?.cancel(), ownedPlayer?.close()]);
  }
  /** Drop an empty conversation started in parallel with a mic that then failed.
   * Surfaces cleanup failure with the locked status-bubble copy; never claims
   * success by nulling on error. Local teardown is unchanged. */
  let emptyStartCleanup = null;
  function clearCurrent(owner) {
    if (owner !== outbound) return;
    outbound = null; conversation = null; attempts = null;
  }
  async function discardEmptyStart(owner = outbound) {
    if (!owner) return;
    if (owner.cleanup) return owner.cleanup;
    if (owner.queue?.busy) {
      const drained = retireOutbound(owner);
      clearCurrent(owner);
      return drained.then(() => discardEmptyStart(owner));
    }
    const cleanup = (async () => {
      try {
        if (typeof owner.conversation.discardEmpty === 'function') await owner.conversation.discardEmpty();
        else await owner.conversation.cancel();
        clearCurrent(owner);
        if (!outbound) discardEmptyFailed = false;
      } catch (error) {
        if (error?.code === 'discard-empty-refused-turns-exist') { clearCurrent(owner); return; }
        if (owner === outbound || !outbound) discardEmptyFailed = true;
        say(DISCARD_EMPTY_FAILED_MESSAGE); showDismissibleBanner(DISCARD_EMPTY_FAILED_MESSAGE);
      }
    })();
    owner.cleanup = cleanup;
    if (owner === outbound) emptyStartCleanup = cleanup;
    return cleanup;
  }
  function retireOutbound(owner) {
    if (!owner?.queue) return;
    const done = owner.queue.retire();
    retiringQueues.add(done);
    void done.then(() => { retiringQueues.delete(done); return discardEmptyStart(owner); }).catch(() => {});
    return done;
  }

  let micFailure = null;
  /** After a successful connect, unexpected transport drop must tear down like stop(). */
  let liveTeardownArmed = false;
  let endingLive = false;
  /** Bumped by end() / a new talk() so in-flight begin/auth/connect aborts. */
  let talkGeneration = 0;
  let liveVoiceGeneration = 0;
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
  function deliverVoiceTurn(entry, owner) {
    return owner.queue.enqueue(entry);
  }
  function makeQueue(owner) {
    return createOutboundQueue({
      conversation: owner.conversation, generation: owner.generation,
      deliver: (entry, identity) => {
        if (identity.conversation !== owner.conversation || identity.generation !== owner.generation) throw new Error('outbound-owner-mismatch');
        return turn(entry, owner);
      },
      onDrop: ({ reason, count }) => {
        logVoice('outbound-drop', { reason, eventCount: count });
        say(OUTBOUND_DROPPED_MESSAGE);
        if (owner === outbound && owner.queue?.state === 'expired') {
          // Do not let a later Talk adopt an uncertain/timed-out backend.
          void abandonLiveVoice().catch(() => {});
          retireOutbound(owner); clearCurrent(owner); emptyStartCleanup = null;
        }
      },
    });
  }
  let startupOwner = null;
  let beginWork = null;
  let consentWork = null;
  const getConsent = () => consentWork ??= resolveTestingConsent(config);
  const session = {
    get conversation() { return conversation; },
    get attempt() { return attempts?.current ?? null; },
    get listening() { return voiceReady && !!mic; },
    // Feedback host facts are captured before AI for every session, so a routed
    // switch to feedback can still open the pinned interview.
    // origin: {capturedAt, previousAttemptId} when the first turn is an offline note.
    async begin(firstTurn, context = typeof deps.feedbackHost === 'function' ? { feedbackHost: deps.feedbackHost() } : {}, from = {}) {
      if (beginWork) return beginWork;
      origin = { ...(from.capturedAt ? { capturedAt: from.capturedAt } : {}), ...(from.previousAttemptId ? { previousAttemptId: from.previousAttemptId } : {}) };
      const work = (async () => {
        const stored = await getConsent();
        consent = stored?.decision ?? null;
        const started = createAssistantConversation({ api: deps.api, scope: deps.scope(), persist: deps.persist, awaitServerRows: deps.awaitServerRows, intent, buildStamp: deps.buildStamp, capture: { capturedAt: new Date().toISOString(), source: 'assistant', context } });
        conversation = started;
        const owner = { conversation: started, generation: ++outboundGeneration, attempts: null, origin: { ...origin }, replays: new Set(), queue: null, cleanup: null };
        outbound = owner;
        // talk() already shows Connecting…; do not clobber it with Starting… or a blank status.
        if (!connectAbort) say('Starting…');
        await started.begin(stored ? { consent: stored.decision, decidedAt: stored.decidedAt } : {});
        // end() may have run while start was in flight. Clean up here so a
        // late start cannot use a nulled conversation, and End can return
        // without waiting on a gated start.
        if ((endingLive && !typedTakeover) || conversation !== started) {
          if (conversation === started) await discardEmptyStart(owner);
          return started;
        }
        attempts = createAttemptTracker({ persist: deps.persist, scope: started.scope, getAll: typeof deps.getAll === 'function' ? deps.getAll : () => [] });
        owner.attempts = attempts;
        owner.queue = makeQueue(owner);
        if (!connectAbort) say('');
        if (firstTurn) await owner.queue.enqueue(firstTurn);
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
          voiceState('idle');
          say('Thinking…');
          return 'turn-ended';
        }
        pendingEndTurn = true;
        say('Thinking…');
        return 'turn-ended';
      }
      const gen = ++talkGeneration;
      liveVoiceGeneration = gen;
      const abandonAttempt = () => liveVoiceGeneration === gen ? abandonLiveVoice() : Promise.resolve();
      pendingEndTurn = false;
      voiceReady = false;
      discardEmptyFailed = false;
      const retiringCleanup = emptyStartCleanup;
      startupOwner = gen;
      endingLive = false;
      typedTakeover = false;
      micFailure = null;
      const now = () => (typeof globalThis.performance !== 'undefined' ? globalThis.performance.now() : Date.now());
      const tapClock = now();
      const tapAt = voiceStartTap();
      const buffer = createAudioChunkBuffer();
      pcmBuffer = buffer;
      const budget = new globalThis.AbortController();
      connectAbort = budget;
      let budgetTimer;
      let abandoned = false;
      const aborted = () => gen !== talkGeneration || endingLive || typedTakeover;
      const budgetHit = () => budget.signal.aborted && !typedTakeover && gen === talkGeneration;
      logVoice('tap', {}, now, tapClock);

      voiceState('connecting');
      let capture;
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
        voiceState('idle');
        say(VOICE_UNAVAILABLE_MESSAGE);
        logVoice('teardown', { reason: 'audio-context' }, now, tapClock);
        return 'unavailable';
      }

      say('Connecting…');
      logVoice('connecting', {}, now, tapClock);

      // Consent is interactive and outside the connect budget. Context creation
      // and resume were still kicked synchronously in the original tap gesture.
      try { await getConsent(); } catch (error) {
        connectAbort = null; voiceState('idle');
        void closeCaptureContext(capture.context);
        throw error;
      }
      if (aborted()) { connectAbort = null; voiceState('idle'); void closeCaptureContext(capture.context); return 'aborted'; }
      let stream;
      budgetTimer = setTimeout(() => {
        if (gen !== talkGeneration) return;
        budget.abort();
        buffer.discard();
        stream?.getTracks().forEach(track => track.stop());
        // No startup promise, close(), or server cleanup can delay mic release.
        void abandonAttempt();
        void closeCaptureContext(capture.context);
      }, VOICE_CONNECT_BUDGET_MS);
      const withinBudget = work => Promise.race([work, waitForAbort(budget.signal)]);
      const cleanupStartup = () => startupOwner === gen && !typedTakeover ? discardEmptyStart() : undefined;
      const startup = (async () => {
        // A cleanup already in flight cannot be adopted; retire it before a
        // fresh begin. A pending begin, however, transfers to this generation.
        if (retiringCleanup) {
          await retiringCleanup;
          if (startupOwner !== gen) return;
          if (emptyStartCleanup === retiringCleanup) emptyStartCleanup = null;
        }
        if (beginWork) await beginWork;
        if (!conversation) await session.begin();
        // Typed send keeps the conversation so compose can use it.
        if (abandoned || aborted()) await cleanupStartup();
      })();
      // Capture may still be waiting; keep an early failed begin observed.
      void startup.catch(() => {});

      async function failUnavailable(reason = 'connect-budget') {
        buffer.discard();
        micFailure = { name: 'VoiceUnavailable', message: VOICE_UNAVAILABLE_MESSAGE };
        say(VOICE_UNAVAILABLE_MESSAGE);
        void abandonAttempt();
        void closeCaptureContext(capture.context);
        void startup.then(cleanupStartup, cleanupStartup).catch(() => {});
        logVoice('teardown', { reason }, now, tapClock);
        return 'unavailable';
      }

      try {
        stream = await acquireMicrophone({ signal: budget.signal });
        logVoice('mic-open', {}, now, tapClock);
      } catch (error) {
        if (gen !== talkGeneration) {
          clearTimeout(budgetTimer);
          if (connectAbort === budget) connectAbort = null;
          void abandonAttempt();
          void closeCaptureContext(capture.context);
          return 'aborted';
        }
        if (budgetHit() || error?.name === 'AbortError') {
          abandoned = true;
          clearTimeout(budgetTimer);
          connectAbort = null;
          return await failUnavailable('connect-budget');
        }
        abandoned = true;
        micFailure = classifyMicError(error);
        buffer.discard();
        void abandonAttempt();
        void closeCaptureContext(capture.context);
        void startup.then(cleanupStartup, cleanupStartup).catch(() => {});
        clearTimeout(budgetTimer);
        connectAbort = null;
        logVoice('teardown', { reason: 'no-mic' }, now, tapClock);
        return 'no-mic';
      }

      try {
        await withinBudget(capture.resumePromise);
        if (capture.context.state === 'suspended' && typeof capture.context.resume === 'function') {
          await withinBudget(capture.context.resume());
        }
        mic = await withinBudget(startMicrophone({ stream, context: capture.context, onChunk: bytes => buffer.onChunk(bytes), signal: budget.signal }));
        logVoice('capture-ready', {
          audioContextState: capture.context.state,
          sampleRate: capture.context.sampleRate,
          declaredRate: SAMPLE_RATE,
        }, now, tapClock);

        if (typedTakeover) {
          buffer.discard();
          await startup.catch(() => {});
          await abandonAttempt();
          return 'aborted';
        }
        if (aborted()) {
          buffer.discard();
          await startup.catch(() => {});
          await discardEmptyStart();
          await abandonAttempt();
          return 'aborted';
        }
        if (budgetHit()) return await failUnavailable();

        await withinBudget(startup);
        logVoice('begin-done', {}, now, tapClock);
        if (typedTakeover) {
          buffer.discard();
          await abandonAttempt();
          return 'aborted';
        }
        if (abandoned || aborted()) {
          buffer.discard();
          await discardEmptyStart();
          await abandonAttempt();
          return abandoned ? 'no-mic' : 'aborted';
        }
        if (budgetHit()) return await failUnavailable();

        player ??= createPcmPlayer();
        const voiceOwner = outbound;
        let voiceDriver;
        const terminal = message => {
          if (driver !== voiceDriver || outbound !== voiceOwner) return;
          void abandonAttempt();
          if (onVoiceTerminal) onVoiceTerminal(message);
          else say(message);
        };
        voiceDriver = createXaiRealtimeDriver({
          config,
          onStatus: state => { if (state === 'session-cap') terminal('Voice session ended at 10 minutes. Tap to start a new one.'); },
          now, tapAt: tapClock,
          onTurnEnd: () => { if (driver === voiceDriver && outbound === voiceOwner) { voiceState('idle'); say('Thinking…'); } },
          // Keep final voice turns in a host queue before handing them to the
          // vendor transport, whose queued callback may be dropped on close.
          onFinalTurn: entry => { void deliverVoiceTurn(entry, voiceOwner); },
        });
        driver = voiceDriver;
        // Fresh authorization every tap (no cross-tap cache / no mount prewarm).
        // Within one connect, the driver still reuses the token across its 3 attempts.
        transport = new VoiceTransport({
          broker: signal => {
            logVoice('mint-start', {}, now, tapClock);
            return voiceOwner.conversation.voiceAuthorization(anySignal(signal, budget.signal)).then(value => {
              logVoice('mint-done', { ok: true }, now, tapClock);
              return value;
            }, error => {
              logVoice('mint-fail', { ok: false }, now, tapClock);
              throw error;
            });
          }, driver,
          getSession: () => voiceOwner.conversation.session,
          onTurn: entry => deliverVoiceTurn(entry, voiceOwner),
          onAudio: bytes => { if (driver === voiceDriver && outbound === voiceOwner) player?.play(bytes); },
          // Unexpected socket close / transport error: VoiceTransport only flips
          // to text-fallback. Route that through the same terminal teardown as
          // session-cap so mic + End do not stay live (Design HOLD on PR #44).
          onState: state => {
            if (driver !== voiceDriver || outbound !== voiceOwner) return;
            if (!liveTeardownArmed || endingLive) return;
            if (state !== 'text-fallback' && state !== 'cancelled') return;
            terminal('Voice connection ended. Tap to start a new one.');
          },
        });
        try {
          await Promise.race([transport.connect(), waitForAbort(budget.signal)]);
        } catch (error) {
          if (typedTakeover || gen !== talkGeneration) {
            buffer.discard();
            void abandonAttempt();
            return 'aborted';
          }
          if (budgetHit() || error?.name === 'AbortError') {
            return failUnavailable();
          }
          throw error;
        }
        voiceStartMark('tap→WS ready', tapAt);
        if (typedTakeover) {
          buffer.discard();
          await abandonAttempt();
          return 'aborted';
        }
        if (aborted()) {
          buffer.discard();
          await abandonAttempt();
          await discardEmptyStart();
          return 'aborted';
        }
        if (budgetHit()) return await failUnavailable();
        if (transport.state !== 'connected') return await failUnavailable('connect-failed');
        liveTeardownArmed = true;
        endingLive = false;
        await withinBudget(buffer.flushTo(bytes => transport.stream(bytes)));
        logVoice('flush-done', { flushed: buffer.sentFirst ? 1 : 0 }, now, tapClock);
        await buffer.waitForFirstSend(budget.signal);
        logVoice('first-chunk-sent', {}, now, tapClock);
        if (typedTakeover) {
          buffer.discard();
          await abandonAttempt();
          return 'aborted';
        }
        if (aborted()) {
          buffer.discard();
          await abandonAttempt();
          await discardEmptyStart();
          return 'aborted';
        }
        if (budgetHit()) return await failUnavailable('first-chunk-timeout');

        if (consent === 'accepted') {
          recorder = createTestingRecorder({ stream: mic.stream, maxMs: (config.sessionCapSeconds ?? 600) * 1000 });
        }

        voiceState('listening');
        say('Listening… say "over" or tap again when done.');
        voiceStartMark('tap→Listening', tapAt);
        logVoice('voice-ready', {}, now, tapClock);
        if (pendingEndTurn) {
          pendingEndTurn = false;
          driver.endTurn();
          voiceState('idle');
          say('Thinking…');
          return 'turn-ended';
        }
        return 'listening';
      } catch (error) {
        buffer.discard();
        try { stream?.getTracks().forEach(track => track.stop()); } catch { /* ignore */ }
        if (typedTakeover) {
          await abandonAttempt();
          return 'aborted';
        }
        if (gen !== talkGeneration) {
          void abandonAttempt();
          void startup.then(cleanupStartup, cleanupStartup).catch(() => {});
          return 'aborted';
        }
        if (budgetHit() || error?.name === 'AbortError') {
          return failUnavailable();
        }
        return failUnavailable('connect-failed');
      } finally {
        clearTimeout(budgetTimer);
        if (connectAbort === budget) connectAbort = null;
      }
    },
    async text(text) {
      typedTakeover = true;
      talkGeneration += 1;
      startupOwner = talkGeneration;
      let owner = outbound?.queue?.state === 'open' ? outbound : null;
      let release = owner?.queue?.reserveText();
      const ownedTransport = transport, ownedDriver = driver, ownedBudget = connectAbort, ownedMic = mic;
      const closeOwnedVoice = async () => {
        if ((ownedTransport && transport === ownedTransport) || (ownedDriver && driver === ownedDriver) || (ownedBudget && connectAbort === ownedBudget) || (ownedMic && mic === ownedMic)) await abandonLiveVoice();
      };
      try {
        if (mic || transport || connectAbort) {
          try { connectAbort?.abort(); } catch { /* already aborted */ }
          if (driver) {
            // Finalization is independently bounded in the real driver. The
            // callback enqueues its final BEFORE this text, even after close.
            try { await driver.endTurn({ replay: false }); } catch { /* mid-teardown */ }
          }
          if (!ownedDriver) await closeOwnedVoice();
          say('');
        }
        if (beginWork) await beginWork;
        // A terminal end may have detached the old generation. Drain its
        // bounded jobs before starting text in a replacement conversation.
        if (!owner?.queue) {
          await Promise.all([...retiringQueues]);
          if (!outbound || outbound.queue?.state !== 'open') {
            clearCurrent(outbound);
            emptyStartCleanup = null;
            await session.begin();
          }
          owner = outbound;
          release?.(); release = owner?.queue?.reserveText();
        }
        if (!owner?.queue) return null;
        const result = await owner.queue.enqueue({ id: crypto.randomUUID(), role: 'user', modality: 'text', text }, { reserved: true, beforeDeliver: closeOwnedVoice });
        void closeOwnedVoice().catch(() => {});
        if (result.status === 'dropped' && !result.started) {
          // A hung predecessor poisoned its old generation. Do not append to
          // that uncertain backend; text can start fresh without replaying it.
          clearCurrent(owner); release?.(); release = null;
          emptyStartCleanup = null;
          if (!outbound) await session.begin();
          if (outbound?.queue && outbound.queue.state === 'open') await outbound.queue.enqueue({ id: crypto.randomUUID(), role: 'user', modality: 'text', text });
        }
        return undefined;
      } finally { release?.(); typedTakeover = false; }
    },
    async end() {
      const owner = outbound;
      talkGeneration += 1;
      pendingEndTurn = false;
      endingLive = true;
      connectAbort?.abort();
      const closing = abandonLiveVoice();
      if (beginWork) { void closing.catch(() => {}); return; }
      if (!owner?.queue) { void closing.catch(() => {}); return; }
      // Detach synchronously, so even an immediate retry cannot adopt a queue
      // being retired. Captured final callbacks still address their old owner.
      clearCurrent(owner); emptyStartCleanup = null;
      const retired = owner.queue.retire({ closing });
      retiringQueues.add(retired);
      void retired.then(() => { retiringQueues.delete(retired); return discardEmptyStart(owner); }).catch(() => {});
      if (owner.queue.busy) return;
      await retired;
      await discardEmptyStart(owner);
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
