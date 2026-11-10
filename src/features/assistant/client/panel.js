/** Header assistant sheet: the text/tap entry for feedback, farm questions and
 * how-to. Flag-gated (VITE_GTHO_ASSISTANT=1) by the header; hidden whenever the
 * backend answers 403. Voice for every intent launches from the global
 * push-to-talk; both use the same session, routing and review rules. */
import { el, clear } from '../../../ui/dom.js';
import { showDismissibleBanner } from '../../../ui/toast.js';
import { Sheet } from '../../../ui/sheet.js';
import { createOfflineNoteStore } from './offline-notes.js';
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
  const transcript = el('div', { 'data-testid': 'assistant-transcript' });
  const body = el('div', { 'data-testid': 'assistant-body' });
  const cancel = el('button', { type: 'button', className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-cancel', onClick: () => { void close(); } }, ['Cancel']);
  panel.append(
    el('div', { className: 'sheet-handle' }),
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' } }, [
      el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Assistant']),
      cancel,
    ]),
    body, transcript, status,
  );
  const say = text => { status.textContent = text ?? ''; };
  const notes = deps.offlineNotes ?? createOfflineNoteStore({ onQuota: () => say('This device is out of storage. Your voice note was not saved; free up space and record it again.') });
  const voiceLog = deps.voiceLog ?? createVoiceLog({ operationId: deps.scope().operationId });
  let session = null;
  let closed = false;
  let starting = false;
  const owner = { handle: null };
  const stale = () => closed || activeEntry !== owner.handle;

  const input = el('input', { type: 'text', placeholder: COMPOSER_PLACEHOLDER, 'data-testid': 'assistant-text' });
  const send = el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-send', onClick: () => { void submit(); } }, ['Send']);
  const endTurn = el('button', { type: 'button', className: 'btn btn-outline btn-xs', 'data-testid': 'assistant-end', hidden: true, onClick: () => { void requestEndTurn(); } }, ['End']);
  body.append(el('div', { className: 'field' }, [input, send, endTurn]));

  const sessionOptions = (extra = {}) => ({
    deps, config, intent: 'data-entry', say: text => {
      if (!stale()) status.textContent = text ?? '';
      options.say?.(text);
    },
    onTranscript: turns => {
      if (!stale()) renderTranscript(transcript, turns);
      options.onTranscript?.(turns);
    },
    onListening: listening => {
      endTurn.hidden = !listening;
      input.hidden = listening;
      send.hidden = listening;
      options.onListening?.(listening);
    },
    onVoiceTerminal: message => {
      options.onVoiceTerminal?.(message);
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
    if (offline(deps)) { say(OFFLINE_TEXT); return { session: null, result: null }; }
    const current = bindSession(extra);
    try {
      const result = await current.talk();
      return { session: current, result };
    } catch (error) {
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
    session = null;
    endTurn.hidden = true;
    input.hidden = false;
    send.hidden = false;
    input.focus();
  }

  async function ensureSession(extra = {}, from = {}) {
    if (session) return session;
    if (offline(deps)) { say(OFFLINE_TEXT); return null; }
    starting = true;
    say('Starting…');
    session = createAssistantSession({
      deps, config, intent: 'data-entry', say,
      onTranscript: turns => { if (!stale()) renderTranscript(transcript, turns); },
      voiceLog, ...extra,
    });
    await session.begin(undefined, undefined, from);
    if (stale()) {
      try { await session.end(); } catch { /* late begin still cleans up once */ }
      session = null;
      return null;
    }
    say('');
    starting = false;
    return session;
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || starting) return;
    const kept = input.value;
    if (offline(deps)) { say(OFFLINE_TEXT); return; }
    starting = true;
    say('Starting…');
    try {
      const current = await ensureSession();
      if (!current) { input.value = kept; starting = false; return; }
      input.value = '';
      await current.text(text);
      if (!status.textContent) say('');
    } catch (error) {
      input.value = kept;
      say(error.message);
    } finally {
      starting = false;
    }
  }

  async function begin(intent, firstTurn, extra = {}, from = {}) {
    if (offline(deps)) { say(OFFLINE_TEXT); return session; }
    starting = true;
    say('Starting…');
    try {
      session = createAssistantSession({
        deps, config, intent: 'data-entry', say,
        onTranscript: turns => { if (!stale()) renderTranscript(transcript, turns); },
        voiceLog, ...extra,
      });
      await session.begin(firstTurn, undefined, from);
      if (stale()) {
        try { await session.end(); } catch { /* closed while starting */ }
        session = null;
        return null;
      }
      say('');
      return session;
    } catch (error) {
      say(error.message);
      throw error;
    } finally {
      starting = false;
    }
  }

  async function close() {
    if (closed) return;
    closed = true;
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
