/** Assistant control and sheet. Flag-gated (VITE_GTHO_ASSISTANT=1) by the header;
 * hidden whenever the backend answers 403 (operation not allowlisted). */
import { el, clear } from '../../../ui/dom.js';
import { Sheet } from '../../../ui/sheet.js';
import { VoiceTransport } from '../shared.js';
import { createAssistantConversation, createFarmReviewFlow, createFeedbackFiling, feedbackSheetSession } from './conversation.js';
import { createXaiRealtimeDriver, startMicrophone, createPcmPlayer } from './realtime.js';
import { createOfflineNoteStore, recordNote } from './offline-notes.js';
import { createTestingRecorder, uploadTestingAudio } from './testing-audio.js';

export const CONSENT_TEXT = 'During early testing, GTHO can keep recordings of what you say to the assistant so we can improve it. Keep my recordings? You can still use voice if you say no.';
export const CONSENT_KEEP = 'Keep recordings';
export const CONSENT_DECLINE = "Don't keep";
const INTENTS = [['feedback', 'Leave feedback'], ['data-questions', 'Ask about my farm'], ['how-to', 'How do I…']];

/** P7 popup; declining still allows full voice. */
export function askTestingConsent(root = document.body) {
  return new Promise(resolve => {
    const dialog = el('div', { className: 'sheet-wrap open', 'data-testid': 'assistant-consent', style: { zIndex: '320' } }, [
      el('div', { className: 'sheet-backdrop' }),
      el('div', { className: 'sheet-panel', role: 'dialog', 'aria-modal': 'true' }, [
        el('p', { 'data-testid': 'assistant-consent-text' }, [CONSENT_TEXT]),
        el('div', { className: 'btn-row' }, [
          el('button', { className: 'btn btn-green', 'data-testid': 'assistant-consent-keep', onClick: () => { dialog.remove(); resolve('accepted'); } }, [CONSENT_KEEP]),
          el('button', { className: 'btn btn-outline', 'data-testid': 'assistant-consent-decline', onClick: () => { dialog.remove(); resolve('declined'); } }, [CONSENT_DECLINE]),
        ]),
      ]),
    ]);
    root.appendChild(dialog);
  });
}

/** P7: asked once per tester per operation. A stored decision (read server-side,
 * scoped to the signed-in user and operation) is reused without a popup. */
export async function resolveTestingConsent(config, ask = askTestingConsent) {
  if (!config.earlyTesting) return null;
  if (!config.testingConsent) config.testingConsent = { decision: await ask(), decidedAt: new Date().toISOString() };
  return { ...config.testingConsent };
}

/** Reveals the control only when the backend returns config (not 403). */
export async function mountAssistantControl(button, deps) {
  button.hidden = true;
  let config = null;
  try { config = await deps.api.config(); } catch { config = null; }
  if (!config) return null;
  button.hidden = false;
  button.addEventListener('click', () => openAssistant(deps, config));
  return config;
}

function ensureSheet() {
  let wrap = document.getElementById('assistant-sheet-wrap');
  if (!wrap) {
    wrap = el('div', { className: 'sheet-wrap', id: 'assistant-sheet-wrap', style: { zIndex: '215' } }, [
      el('div', { className: 'sheet-backdrop' }),
      el('div', { className: 'sheet-panel', id: 'assistant-sheet-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
    ]);
    document.body.appendChild(wrap);
  }
  return { sheet: new Sheet('assistant-sheet-wrap'), panel: document.getElementById('assistant-sheet-panel'), wrap };
}

/**
 * deps: {api, scope(), persist, awaitServerRows, flush, getAll, getById, add, runDurableWrite,
 *  pullReviewRows, revisionIdFor, createFarmUiPorts, authorize, openFeedbackSheet, feedbackHost(),
 *  storage, buildStamp, online(), offlineNotes?, launchTarget?}
 */
export function openAssistant(deps, config) {
  const { sheet, panel, wrap } = ensureSheet();
  clear(panel);
  const status = el('div', { className: 'auth-error', 'data-testid': 'assistant-status', role: 'status' });
  const transcript = el('div', { 'data-testid': 'assistant-transcript' });
  const body = el('div');
  panel.append(el('div', { className: 'sheet-handle' }), el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Assistant']), body, transcript, status);
  const notes = deps.offlineNotes ?? createOfflineNoteStore({ onQuota: () => { status.textContent = 'This device is out of storage. Your voice note was not saved; free up space and record it again.'; } });
  let conversation, transport, driver, mic, player, recorder, consent, offlineRecording;
  const say = text => { status.textContent = text; };
  const showTranscript = () => {
    clear(transcript);
    for (const turn of conversation?.session?.transcript ?? []) transcript.appendChild(el('div', { className: `assistant-turn assistant-${turn.role}` }, [`${turn.role === 'user' ? 'You' : 'GTHO'}: ${turn.text}`]));
  };

  async function afterSession() {
    showTranscript();
    const session = conversation.session;
    if (session.phase !== 'review' || !session.reviewReady) return;
    if (session.intent === 'feedback') {
      const draftKey = `gtho-assistant-feedback-draft:${conversation.ref}`;
      const persistDraft = async snapshot => { globalThis.localStorage.setItem(draftKey, JSON.stringify(snapshot)); return { saved: true, savedAt: new Date().toISOString() }; };
      deps.openFeedbackSheet('feedback', conversation.scope.operationId, {
        feedbackSession: await feedbackSheetSession({ session, persistDraft }), persistDraft,
        fileConfirmed: createFeedbackFiling({ conversation, persist: deps.persist, awaitServerRows: deps.awaitServerRows, getAll: deps.getAll, runDurableWrite: deps.runDurableWrite, add: deps.add, flush: deps.flush, revisionIdFor: deps.revisionIdFor }),
      });
    } else if (session.intent === 'data-entry') {
      await createFarmReviewFlow({ conversation, createFarmUiPorts: deps.createFarmUiPorts, authorize: deps.authorize, awaitServerRows: deps.awaitServerRows, getById: deps.getById, flush: deps.flush, pullReviewRows: deps.pullReviewRows,
        onResult: () => { say('Saved.'); showTranscript(); }, onError: error => say(error.message) }).render(session.pending);
    }
  }
  async function turn(entry) {
    const answer = await conversation.turn(entry);
    if (answer && !driver?.speak(answer)) { /* text-only: the transcript shows it */ }
    await afterSession();
  }
  async function stopVoice() {
    await mic?.stop(); mic = null;
    if (recorder) {
      const recording = await recorder.stop(); const capturedAt = recorder.capturedAt; recorder = null;
      try { await uploadTestingAudio({ api: deps.api, storage: deps.storage, persist: deps.persist, scope: conversation.scope, conversationRef: conversation.ref, recording, capturedAt }); }
      catch (error) { say(`Recording not kept: ${error.message}`); }
    }
  }
  async function talk() {
    if (!deps.online()) return offlineNote();
    if (mic) { driver.endTurn(); say('Thinking…'); return; }
    player ??= createPcmPlayer();
    driver = createXaiRealtimeDriver({ config, onStatus: state => { if (state === 'session-cap') { say('Voice session ended at 10 minutes. Tap Talk to start a new one.'); void stopVoice(); } } });
    transport = new VoiceTransport({
      broker: () => conversation.voiceAuthorization(), driver,
      getSession: () => conversation.session,
      onTurn: entry => turn(entry).catch(error => say(error.message)),
      onAudio: bytes => player.play(bytes),
    });
    await transport.connect();
    if (transport.state !== 'connected') { say('Voice is unavailable right now; you can type instead.'); return; }
    mic = await startMicrophone({ onChunk: bytes => { void transport.stream(bytes); } });
    if (consent === 'accepted') recorder = createTestingRecorder({ stream: mic.stream });
    say(config.turnDetection === 'server_vad' ? 'Listening… say "over" or tap Talk to finish.' : 'Listening… say "over" or tap Talk again when done.');
  }
  async function offlineNote() {
    if (offlineRecording) { const blob = await offlineRecording.stop(); offlineRecording = null; await saveNote(blob); return; }
    const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
    offlineRecording = recordNote({ stream });
    offlineRecording.done.then(async blob => { stream.getTracks().forEach(track => track.stop()); if (offlineRecording) { offlineRecording = null; await saveNote(blob); } });
    say('Offline: recording a voice note (up to 3 minutes). Tap again to stop.');
  }
  async function saveNote(blob) {
    try { await notes.save({ blob, capturedAt: new Date().toISOString(), context: { intent: conversation?.session?.intent ?? null } }); say('Voice note saved on this device. Review its transcript when you are back online.'); }
    catch (error) { if (!/storage/.test(status.textContent)) say(`Voice note not saved: ${error.message}`); }
  }
  async function begin(intent, firstTurn) {
    const stored = await resolveTestingConsent(config);
    consent = stored?.decision ?? null;
    const context = intent === 'feedback' ? { feedbackHost: deps.feedbackHost() } : intent === 'data-entry' ? { target: deps.launchTarget } : {};
    conversation = createAssistantConversation({ api: deps.api, scope: deps.scope(), persist: deps.persist, awaitServerRows: deps.awaitServerRows, intent, buildStamp: deps.buildStamp, capture: { capturedAt: new Date().toISOString(), source: 'assistant', context } });
    say('Starting…');
    await conversation.begin(stored ? { consent: stored.decision, decidedAt: stored.decidedAt } : {});
    clear(body);
    const input = el('input', { type: 'text', placeholder: 'Type instead…', 'data-testid': 'assistant-text' });
    body.append(
      el('div', { className: 'btn-row' }, [
        el('button', { className: 'btn btn-green', 'data-testid': 'assistant-talk', onClick: () => talk().catch(error => say(error.message)) }, ['Talk']),
        el('button', { className: 'btn btn-outline', 'data-testid': 'assistant-end', onClick: async () => { await stopVoice(); await transport?.cancel(); await player?.close(); sheet.close(); } }, ['End']),
      ]),
      el('div', { className: 'field' }, [input, el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-send', onClick: async () => {
        const text = input.value.trim(); if (!text) return; input.value = '';
        try { if (transport) await transport.text(text); else await turn({ id: crypto.randomUUID(), role: 'user', modality: 'text', text }); } catch (error) { say(error.message); }
      } }, ['Send'])]),
    );
    say('');
    if (firstTurn) await turn(firstTurn);
    showTranscript();
  }
  async function renderNotes() {
    let list;
    try { list = await notes.list(); } catch { return; }
    if (!list.length) return;
    const section = el('div', { 'data-testid': 'assistant-offline-notes' }, [el('div', {}, ['Voice notes saved on this device'])]);
    for (const note of list) {
      const text = el('textarea', { rows: '3', 'data-testid': 'assistant-note-transcript', placeholder: 'Transcribe, then check the words before using them.' });
      section.appendChild(el('div', { className: 'field' }, [
        el('div', {}, [new Date(note.capturedAt).toLocaleString()]), text,
        el('button', { className: 'btn btn-outline btn-xs', onClick: async () => { if (!deps.online()) return say('Transcription needs a connection.'); try { text.value = (await deps.api.transcribe(note.blob)).text; } catch (error) { say(error.message); } } }, ['Transcribe']),
        // P9: the reviewed transcript becomes the first turn only after the user checks it.
        el('button', { className: 'btn btn-green btn-xs', onClick: async () => {
          if (!text.value.trim()) return say('Transcribe and review the note first.');
          try {
            await begin(note.context?.intent ?? 'feedback', { id: crypto.randomUUID(), role: 'user', modality: 'voice', text: text.value.trim() });
            await deps.persist(conversation.scope, 'offlineVoiceNotes', { operationId: conversation.scope.operationId, conversationId: conversation.ref, deviceLocalReference: note.id, originalContext: JSON.stringify(note.context ?? {}), capturedAt: note.capturedAt });
            await notes.remove(note.id);
          } catch (error) { say(error.message); }
        } }, ['Use reviewed transcript']),
      ]));
    }
    body.appendChild(section);
  }
  for (const [intent, label] of [...INTENTS, ...(deps.launchTarget ? [['data-entry', 'Enter data']] : [])]) {
    body.appendChild(el('button', { className: 'btn btn-outline', 'data-testid': `assistant-intent-${intent}`, onClick: () => {
      if (!deps.online()) { conversation = { session: { intent } }; return offlineNote().catch(error => say(error.message)); }
      begin(intent).catch(error => say(error.message));
    } }, [label]));
  }
  void renderNotes();
  wrap.querySelector('.sheet-backdrop').onclick = () => sheet.close();
  sheet.open();
  return { begin, talk, get conversation() { return conversation; } };
}
