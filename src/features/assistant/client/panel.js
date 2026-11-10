/** Header assistant sheet: the text/tap entry for feedback, farm questions and
 * how-to. Flag-gated (VITE_GTHO_ASSISTANT=1) by the header; hidden whenever the
 * backend answers 403. Voice for every intent launches from the global
 * push-to-talk; both use the same session, routing and review rules. */
import { el, clear } from '../../../ui/dom.js';
import { showDismissibleBanner } from '../../../ui/toast.js';
import { Sheet } from '../../../ui/sheet.js';
import { createOfflineNoteStore } from './offline-notes.js';
import { OUTBOUND_DROPPED_MESSAGE } from './outbound-queue.js';
import { createAssistantSession, DISCARD_EMPTY_FAILED_MESSAGE } from './session.js';
import { renderNoteReview, recordNoteUse, settleNoteAfterSave, noteOrigin } from './offline-note-review.js';
import { createVoiceLog } from './voice-log.js';
export { CONSENT_TEXT, CONSENT_KEEP, CONSENT_DECLINE, askTestingConsent, resolveTestingConsent } from './consent.js';

export const OFFLINE_TEXT = 'You are offline. Tap the push-to-talk to record a voice note, or use the normal screens.';
export const COMPOSER_PLACEHOLDER = 'Type here';
/** Historical labels only; the shared entry path no longer renders a picker. */
export const PANEL_INTENTS = Object.freeze([
  ['data-entry', 'Record a farm entry'],
  ['feedback', 'Leave feedback'],
  ['data-questions', 'Ask about my farm'],
  ['how-to', 'How do I…'],
]);

function offline(deps) {
  return typeof deps.online === 'function' && !deps.online();
}

let activeEntry = null;

function entryIsOpen(entry) {
  if (!entry || entry.isClosed()) return false;
  const wrap = document.getElementById('assistant-sheet-wrap');
  return !!wrap && wrap.classList.contains('open');
}

/** Reveals the control only when the backend returns config (not 403). */
export async function mountAssistantControl(button, deps) {
  button.hidden = true;
  let config = null;
  try { config = await deps.api.config(); } catch { config = null; }
  if (!config) return null;
  button.hidden = false;
  button.addEventListener('click', () => openAssistant(deps, config, { invoker: button, mode: 'text' }));
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
 * Shared assistant entry (option B). Every launcher skips the intent picker
 * and opens this composer with header Cancel. The internal seed is always
 * data-entry; opening the composer does not begin a session. Send, an
 * explicit voice request, or Use of a reviewed note starts once.
 */
export function openAssistant(deps, config, options = {}) {
  if (entryIsOpen(activeEntry)) {
    activeEntry.adoptOptions(options);
    if (options.focusText) activeEntry.input?.focus();
    if (options.firstTurn) {
      activeEntry.ready = activeEntry.begin('data-entry', options.firstTurn, options.extra ?? {}, options.from ?? {}).catch(error => { activeEntry.say(error.message); return null; });
    } else if (options.mode === 'voice') {
      activeEntry.ready = activeEntry.startVoice(options.extra ?? {});
    }
    return activeEntry;
  }
  const { sheet, panel, wrap } = ensureSheet();
  const invoker = options.invoker ?? null;
  clear(panel);
  const status = el('div', { className: 'auth-error', 'data-testid': 'assistant-status', role: 'status' });
  const retry = el('button', { type: 'button', className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-retry', 'aria-label': 'Retry failed submission', hidden: true, onClick: () => {
    const failed = failedSubmission;
    if (!retry.hidden && failed && recoveryIsCurrent(failed)) void submit(failed);
  } }, ['Retry']);
  const transcript = el('div', { 'data-testid': 'assistant-transcript' });
  const body = el('div', { 'data-testid': 'assistant-body' });
  const cancel = el('button', { type: 'button', className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-cancel', onClick: () => { void close(); } }, ['Cancel']);
  panel.append(
    el('div', { className: 'sheet-handle' }),
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' } }, [
      el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Assistant']),
      cancel,
    ]),
    body, transcript, status, retry,
  );
  const say = text => { status.textContent = text ?? ''; };
  const notes = deps.offlineNotes ?? createOfflineNoteStore({ onQuota: () => say('This device is out of storage. Your voice note was not saved; free up space and record it again.') });
  const voiceLog = deps.voiceLog ?? createVoiceLog({ operationId: deps.scope().operationId });
  let session = null;
  let closed = false;
  let starting = false;
  let failedSubmission = null, draftRevision = 0;
  const owner = { handle: null };
  const stale = () => closed || activeEntry !== owner.handle;

  const input = el('input', { type: 'text', placeholder: COMPOSER_PLACEHOLDER, 'data-testid': 'assistant-text' });
  input.addEventListener('input', () => { draftRevision++; });
  const send = el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-send', onClick: () => { void submit(); } }, ['Send']);
  const endTurn = el('button', { type: 'button', className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-end', hidden: true, onClick: () => { void requestEndTurn(); } }, ['End']);
  body.append(el('div', { className: 'field' }, [input, send, endTurn]));

  function setVoiceState(state) {
    const busy = state === 'connecting' || state === 'listening';
    endTurn.hidden = state !== 'listening';
    input.hidden = busy;
    send.hidden = busy;
  }
  const sessionOptions = (extra = {}) => ({
    deps, config, intent: 'data-entry', say: text => {
      if (!stale()) status.textContent = text ?? '';
      options.say?.(text);
    },
    onTranscript: turns => {
      if (!stale()) renderTranscript(transcript, turns);
      options.onTranscript?.(turns);
    },
    onVoiceState: setVoiceState,
    onRecoveryInvalidated: ({ session: changed, preserveSubmission }) => { if (changed === session) clearRecovery(preserveSubmission); },
    onListening: listening => {
      setVoiceState(listening ? 'listening' : 'idle');
      options.onListening?.(listening);
    },
    onVoiceTerminal: message => {
      setVoiceState('idle');
      if (options.onVoiceTerminal) options.onVoiceTerminal(message);
      else { say(message); void session?.end(); }
    },
    voiceLog, ...extra,
  });

  function bindSession(extra = {}) {
    if (session) return session;
    session = createAssistantSession(sessionOptions(extra));
    return session;
  }

  /** Start voice without begin()/xAI first: talk() checks the mic, then starts. */
  async function startVoice(extra = {}) {
    clearRecovery();
    if (offline(deps)) { say(OFFLINE_TEXT); return { session: null, result: null }; }
    const current = bindSession(extra);
    setVoiceState('connecting');
    try {
      const result = await current.talk();
      if (result !== 'listening') setVoiceState('idle');
      return { session: current, result };
    } catch (error) {
      setVoiceState('idle');
      say(error.message);
      return { session: current, result: null, error };
    }
  }

  function requestEndTurn() {
    if (!session || stale()) return Promise.resolve(null);
    return session.talk();
  }

  /** After a discarded empty voice start, stay on this composer for typing. */
  function switchToTyping() {
    clearRecovery();
    session = null;
    setVoiceState('idle');
    input.focus();
  }

  let recoveryToken = 0;
  function clearRecovery(preserveSubmission = false) { failedSubmission = null; retry.hidden = true; if (!preserveSubmission) { recoveryToken++; starting = false; } }
  function recoveryIsCurrent(recovery) {
    const identity = session?.recoveryIdentity;
    return !stale() && recovery.token === recoveryToken && recovery.session === session && recovery.generation === identity?.generation && recovery.conversation === identity?.conversation;
  }
  function recoverSubmission(text, kept, recovery, message) {
    if (!recoveryIsCurrent(recovery)) return;
    const { revision, expectedDraft, restoreAllowed } = recovery;
    const restored = restoreAllowed && draftRevision === revision && input.value === expectedDraft;
    if (restored) input.value = kept;
    failedSubmission = { text, kept, restored, revision: draftRevision, token: recovery.token, session: recovery.session, generation: recovery.generation, conversation: recovery.conversation };
    retry.hidden = false;
    setVoiceState('idle'); say(message);
  }

  async function submit(retrying = null) {
    const submittedAt = Date.now();
    const text = retrying?.text ?? input.value.trim();
    if (!text || starting || stale()) return;
    const kept = retrying?.kept ?? input.value;
    if (offline(deps)) { say(OFFLINE_TEXT); return; }
    // An unchanged restored draft follows Send clearing; edited drafts stay untouched.
    const preserveDraft = !!retrying && !(retrying.restored && retrying.revision === draftRevision && input.value === kept);
    const current = bindSession();
    const recovery = { revision: draftRevision, expectedDraft: input.value, restoreAllowed: !preserveDraft, session: current, ...current.recoveryIdentity };
    clearRecovery(); recovery.token = recoveryToken;
    const currentSubmission = () => !stale() && session === current && recovery.token === recoveryToken;
    starting = true; say('Starting…');
    try {
      // text() owns startup as well as queueing: no pre-submit begin wait outside its budget.
      const delivery = await current.text(text, { submittedAt, isCurrent: currentSubmission, onOwnership: identity => { if (currentSubmission()) Object.assign(recovery, identity); }, onEnqueued: () => {
        if (recoveryIsCurrent(recovery) && !preserveDraft && draftRevision === recovery.revision && input.value === recovery.expectedDraft) {
          input.value = ''; recovery.expectedDraft = '';
        }
      } });
      if (delivery?.status === 'dropped') recoverSubmission(text, kept, recovery, OUTBOUND_DROPPED_MESSAGE);
    } catch (error) {
      recoverSubmission(text, kept, recovery, error.message);
    } finally {
      if (currentSubmission()) starting = false;
    }
  }

  async function begin(intent, firstTurn, extra = {}, from = {}) {
    const submittedAt = Date.now();
    clearRecovery();
    if (offline(deps)) { say(OFFLINE_TEXT); return session; }
    const recovery = { revision: draftRevision, expectedDraft: input.value, restoreAllowed: input.value === '', token: recoveryToken };
    const currentSubmission = () => !stale() && session === recovery.session && recovery.token === recoveryToken;
    starting = true;
    say('Starting…');
    try {
      session = createAssistantSession(sessionOptions(extra));
      recovery.session = session; Object.assign(recovery, session.recoveryIdentity);
      const started = await session.begin(firstTurn, undefined, { ...from, submittedAt, isCurrent: currentSubmission, onOwnership: identity => { if (currentSubmission()) Object.assign(recovery, identity); } });
      if (!currentSubmission()) {
        if (stale()) {
          try { await recovery.session.end(); } catch { /* closed while starting */ }
          if (session === recovery.session) session = null;
        }
        return null;
      }
      if (firstTurn && started === null) {
        if (firstTurn.modality === 'text') recoverSubmission(firstTurn.text, firstTurn.text, recovery, OUTBOUND_DROPPED_MESSAGE);
        else { setVoiceState('idle'); say(OUTBOUND_DROPPED_MESSAGE); }
        return null;
      }
      say('');
      return session;
    } catch (error) {
      // Match ordinary Send: keep a dropped typed first turn for an explicit retry.
      if (!currentSubmission()) return null;
      if (firstTurn?.modality === 'text') recoverSubmission(firstTurn.text, firstTurn.text, recovery, error.message);
      if (currentSubmission()) { setVoiceState('idle'); say(error.message); }
      throw error;
    } finally {
      if (currentSubmission()) starting = false;
    }
  }

  async function close() {
    if (closed) return;
    closed = true;
    clearRecovery();
    setVoiceState('idle');
    options.onListening?.(false);
    const isActive = activeEntry === owner.handle;
    if (isActive) {
      wrap.querySelector('.sheet-backdrop').onclick = null;
      document.removeEventListener('keydown', onEscape, true);
      sheet.close();
      try { invoker?.focus?.(); } catch { /* invoker may be detached */ }
    }
    if (!session) {
      if (isActive && activeEntry === owner.handle) activeEntry = null;
      return;
    }
    const current = session;
    session = null;
    try {
      await current.end();
    } catch (error) {
      const message = current.discardEmptyFailed ? DISCARD_EMPTY_FAILED_MESSAGE : (error?.message || DISCARD_EMPTY_FAILED_MESSAGE);
      if (current.discardEmptyFailed) showDismissibleBanner(message);
      else if (isActive) say(message);
      if (isActive && activeEntry === owner.handle) activeEntry = null;
      return;
    }
    if (current.discardEmptyFailed) showDismissibleBanner(DISCARD_EMPTY_FAILED_MESSAGE);
    if (isActive && activeEntry === owner.handle) activeEntry = null;
  }

  function onEscape(event) {
    if (event.key === 'Escape' && !closed) {
      event.preventDefault();
      void close();
    }
  }

  async function renderNotes() {
    if (stale()) return;
    let list;
    try { list = await notes.list(); } catch { return; }
    if (stale() || !list.length) return;
    const section = el('div', { 'data-testid': 'assistant-offline-notes' }, [el('div', {}, ['Voice notes saved on this device'])]);
    for (const note of list) {
      section.appendChild(renderNoteReview(note, { deps, say, use: async (picked, text) => {
        if (stale()) return;
        let record = null, settled = false;
        const started = await begin('data-entry', { id: crypto.randomUUID(), role: 'user', modality: 'voice', text }, { onDurableSave: async (outcome, conversation) => {
          if (settled || stale()) return;
          settled = true;
          await settleNoteAfterSave({ deps, notes, note: picked, record, conversation, outcome });
        } }, noteOrigin({ deps, note: picked }));
        if (!started) return;
        record = await recordNoteUse({ deps, note: picked, conversation: started.conversation, attemptId: started.attempt?.id ?? null });
      } }));
    }
    if (!stale()) body.appendChild(section);
  }
  void renderNotes();
  wrap.querySelector('.sheet-backdrop').onclick = () => { void close(); };
  document.addEventListener('keydown', onEscape, true);
  sheet.open();
  if (offline(deps)) say(OFFLINE_TEXT);
  if (options.focusText) input.focus();
  let ready = Promise.resolve(null);
  if (options.firstTurn) {
    ready = begin('data-entry', options.firstTurn, options.extra ?? {}, options.from ?? {}).catch(error => { say(error.message); return null; });
  }
  if (options.mode === 'voice') {
    ready = startVoice(options.extra ?? {});
  }
  const handle = {
    begin, close, startVoice, switchToTyping, endTurn: requestEndTurn,
    adoptOptions(next) { options = { ...options, ...next }; },
    get ready() { return ready; },
    set ready(value) { ready = value; },
    isClosed: () => closed,
    get session() { return session; },
    get input() { return input; },
    say,
  };
  owner.handle = handle;
  activeEntry = handle;
  return handle;
}
