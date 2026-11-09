/** Header assistant sheet: the text/tap entry for feedback, farm questions and
 * how-to. Flag-gated (VITE_GTHO_ASSISTANT=1) by the header; hidden whenever the
 * backend answers 403. Voice for every intent launches from the global
 * push-to-talk; both use the same session, routing and review rules. */
import { el, clear } from '../../../ui/dom.js';
import { Sheet } from '../../../ui/sheet.js';
import { createOfflineNoteStore } from './offline-notes.js';
import { createAssistantSession } from './session.js';
import { renderNoteReview, recordNoteUse, settleNoteAfterSave, noteOrigin } from './offline-note-review.js';
import { createVoiceLog } from './voice-log.js';
export { CONSENT_TEXT, CONSENT_KEEP, CONSENT_DECLINE, askTestingConsent, resolveTestingConsent } from './consent.js';

export const OFFLINE_TEXT = 'You are offline. Tap the push-to-talk to record a voice note, or use the normal screens.';
export const PANEL_INTENTS = Object.freeze([['feedback', 'Leave feedback'], ['data-questions', 'Ask about my farm'], ['how-to', 'How do I…']]);

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

export function renderTranscript(container, transcript) {
  clear(container);
  for (const turn of transcript) container.appendChild(el('div', { className: `assistant-turn assistant-${turn.role}` }, [`${turn.role === 'user' ? 'You' : 'GTHO'}: ${turn.text}`]));
}

/**
 * deps: {api, scope(), persist, awaitServerRows, flush, getAll, getById, add, runDurableWrite,
 *  pullReviewRows, revisionIdFor, createFarmUiPorts, authorize, openFeedbackSheet, feedbackHost(),
 *  storage, buildStamp, online(), offlineNotes?}
 */
export function openAssistant(deps, config) {
  const { sheet, panel, wrap } = ensureSheet();
  clear(panel);
  const status = el('div', { className: 'auth-error', 'data-testid': 'assistant-status', role: 'status' });
  const transcript = el('div', { 'data-testid': 'assistant-transcript' });
  const body = el('div');
  panel.append(el('div', { className: 'sheet-handle' }), el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Assistant']), body, transcript, status);
  const say = text => { status.textContent = text; };
  const notes = deps.offlineNotes ?? createOfflineNoteStore({ onQuota: () => say('This device is out of storage. Your voice note was not saved; free up space and record it again.') });
  const voiceLog = deps.voiceLog ?? createVoiceLog({ operationId: deps.scope().operationId });
  let session = null;

  async function begin(intent, firstTurn, extra = {}, from = {}) {
    session = createAssistantSession({ deps, config, intent, say, onTranscript: turns => renderTranscript(transcript, turns), voiceLog, ...extra });
    await session.begin(firstTurn, undefined, from);
    clear(body);
    const input = el('input', { type: 'text', placeholder: 'Type instead…', 'data-testid': 'assistant-text' });
    body.append(
      // Text/tap only: the one voice entry point is the global push-to-talk.
      el('div', { className: 'btn-row' }, [
        el('button', { className: 'btn btn-outline', 'data-testid': 'assistant-end', onClick: async () => { await session.end(); sheet.close(); } }, ['End']),
      ]),
      el('div', { className: 'field' }, [input, el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-send', onClick: async () => {
        const text = input.value.trim(); if (!text) return; input.value = '';
        try { await session.text(text); } catch (error) { say(error.message); }
      } }, ['Send'])]),
    );
    return session;
  }
  async function renderNotes() {
    let list;
    try { list = await notes.list(); } catch { return; }
    if (!list.length) return;
    const section = el('div', { 'data-testid': 'assistant-offline-notes' }, [el('div', {}, ['Voice notes saved on this device'])]);
    for (const note of list) {
      section.appendChild(renderNoteReview(note, { deps, say, use: async (picked, text) => {
        // Deleted from the device only after a durable local save from this conversation.
        let record = null, settled = false;
        const started = await begin(picked.context?.intent ?? 'feedback', { id: crypto.randomUUID(), role: 'user', modality: 'voice', text }, { onDurableSave: async (outcome, conversation) => {
          if (settled) return;
          settled = true;
          await settleNoteAfterSave({ deps, notes, note: picked, record, conversation, outcome });
        } }, noteOrigin({ deps, note: picked }));
        record = await recordNoteUse({ deps, note: picked, conversation: started.conversation, attemptId: started.attempt?.id ?? null });
      } }));
    }
    body.appendChild(section);
  }
  for (const [intent, label] of PANEL_INTENTS) {
    body.appendChild(el('button', { className: 'btn btn-outline', 'data-testid': `assistant-intent-${intent}`, onClick: () => {
      // Offline voice notes are recorded from the push-to-talk, never here.
      if (!deps.online()) return say(OFFLINE_TEXT);
      begin(intent).catch(error => say(error.message));
    } }, [label]));
  }
  void renderNotes();
  wrap.querySelector('.sheet-backdrop').onclick = () => sheet.close();
  sheet.open();
  return { begin, get session() { return session; } };
}
