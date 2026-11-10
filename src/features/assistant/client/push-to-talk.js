/** The one global push-to-talk for farm entries, farm questions, spoken feedback
 * and how-to, on every screen. Prominent at the bottom center on mobile; a
 * floating button on desktop that starts at the bottom center and can be dragged.
 * Mounted only when the build flag is on and the backend returned config (403 =
 * never mounted). Tap to talk; tap again ends the turn, the same as saying "over".
 * Sessions start as data-entry and switch intent through the runtime intent
 * command when the request is a question, feedback or how-to. The voice log opens
 * as a panel from this control, which shows the unfinished count. */
import { el } from '../../../ui/dom.js';
import { createOfflineNoteStore } from './offline-notes.js';
import { createOfflineNoteRecorder, DISCARD_EMPTY_FAILED_MESSAGE } from './session.js';
import { createVoiceLog } from './voice-log.js';
import { openVoiceLog, voiceLogRows } from './voice-log-panel.js';
import { recordNoteUse, settleNoteAfterSave, noteOrigin } from './offline-note-review.js';
import { openAssistant } from './panel.js';
import { TYPE_INSTEAD_QUESTION } from './realtime.js';

export const PTT_ID = 'gtho-push-to-talk';
export const PTT_POSITION_KEY = 'gtho-ptt-position';
const DRAG_THRESHOLD_PX = 6;

/** Yes/No prompt after a mic failure. Dismiss (backdrop) counts as No. */
export function askTypeInstead({ message }, root = document.body) {
  return new Promise(resolve => {
    const finish = answer => { dialog.remove(); resolve(answer); };
    const dialog = el('div', { className: 'sheet-wrap open', 'data-testid': 'ptt-type-instead', style: { zIndex: '320' } }, [
      el('div', { className: 'sheet-backdrop', 'data-testid': 'ptt-type-instead-dismiss', onClick: () => finish('no') }),
      el('div', { className: 'sheet-panel', role: 'dialog', 'aria-modal': 'true' }, [
        el('p', { 'data-testid': 'ptt-no-mic-message' }, [message]),
        el('p', { 'data-testid': 'ptt-type-instead-question' }, [TYPE_INSTEAD_QUESTION]),
        el('div', { className: 'btn-row' }, [
          el('button', { className: 'btn btn-green', 'data-testid': 'ptt-type-instead-yes', onClick: () => finish('yes') }, ['Yes']),
          el('button', { className: 'btn btn-outline', 'data-testid': 'ptt-type-instead-no', onClick: () => finish('no') }, ['No']),
        ]),
      ]),
    ]);
    root.appendChild(dialog);
  });
}


export function isCompactScreen(win = globalThis.window) {
  return win?.matchMedia?.('(max-width: 899px)').matches === true;
}

const handles = new WeakMap();

export function unmountPushToTalk(root = document.body) {
  const existing = root.querySelector(`#${PTT_ID}`);
  if (!existing) return;
  handles.get(existing)?.cleanup();
  existing.remove();
}

/** deps as for the header panel. Returns the control handle, or null without config. */
export function mountPushToTalk(deps, config, { root = document.body, compact = isCompactScreen(), storage = globalThis.localStorage } = {}) {
  const operationId = deps?.scope?.().operationId ?? '';
  const existing = root.querySelector(`#${PTT_ID}`);
  // Re-rendering the header must not tear down a live voice entry.
  if (config && existing?.dataset.operation === operationId && handles.has(existing)) return handles.get(existing).handle;
  unmountPushToTalk(root);
  if (!config) return null;
  const statusText = el('span', { className: 'gtho-ptt-status-text', 'data-testid': 'ptt-status-text', role: 'status' });
  const dismiss = el('button', {
    type: 'button',
    className: 'gtho-ptt-status-dismiss',
    'data-testid': 'ptt-status-dismiss',
    'aria-label': 'Dismiss',
    hidden: true,
  }, ['×']);
  const status = el('div', { className: 'gtho-ptt-status', 'data-testid': 'ptt-status', hidden: true }, [statusText, dismiss]);
  const end = el('button', { className: 'gtho-ptt-end', 'data-testid': 'ptt-end', 'aria-label': 'End voice entry', hidden: true }, ['×']);
  const button = el('button', { className: 'gtho-ptt-button', 'data-testid': 'ptt-button', 'aria-label': 'Talk to GTHO', 'aria-pressed': 'false' }, ['\uD83C\uDF99']);
  const badge = el('span', { className: 'gtho-ptt-badge', 'data-testid': 'ptt-badge', hidden: true }, ['0']);
  const logButton = el('button', { className: 'gtho-ptt-log', 'data-testid': 'ptt-log', 'aria-label': 'Voice log' }, ['Log', badge]);
  const wrap = el('div', { id: PTT_ID, 'data-operation': operationId, className: `gtho-ptt ${compact ? 'gtho-ptt--compact' : 'gtho-ptt--floating'}`, 'data-testid': 'ptt' }, [status, el('div', { className: 'gtho-ptt-row' }, [logButton, button, end])]);
  // Show or hide the status bubble. Dismiss clears only this message; a later
  // say() brings the bubble back. Never ends a live turn or session.
  const say = message => {
    statusText.textContent = message || '';
    const show = !!message;
    status.hidden = !show;
    dismiss.hidden = !show;
  };
  const dismissStatus = () => { say(''); };
  const notes = deps.offlineNotes ?? createOfflineNoteStore({ onQuota: () => say('This device is out of storage. Your voice note was not saved; free up space and record it again.') });
  // Offline notes carry no intent: routing decides once the note is used online.
  const offline = createOfflineNoteRecorder({ notes, say, intent: null });
  const voiceLog = deps.voiceLog ?? createVoiceLog({ operationId, storage });
  let session = null;
  async function refreshBadge() {
    let count = 0;
    // Unfinished attempts plus device notes not yet used in an attempt.
    try { count = voiceLogRows({ deps, notes: await notes.list(), log: voiceLog }).unfinished; } catch { /* count unknown */ }
    badge.textContent = String(count);
    badge.hidden = count === 0;
    logButton.setAttribute('aria-label', count ? `Voice log, ${count} unfinished` : 'Voice log');
    return count;
  }
  function openLog() {
    return openVoiceLog({ deps, notes, log: voiceLog, onChange: () => { void refreshBadge(); },
      use: async (note, text) => {
        await stop();
        // The note stays on this device (unfinished, counted) until a confirmed
        // write or filing from this conversation has durably saved locally.
        let record = null, settled = false;
        const entry = openAssistant(deps, config, {
          firstTurn: { id: crypto.randomUUID(), role: 'user', modality: 'voice', text },
          from: noteOrigin({ deps, note }),
          extra: { onDurableSave: async (outcome, conversation) => {
            if (settled) return;
            settled = true;
            await settleNoteAfterSave({ deps, notes, note, record, conversation, outcome });
            await refreshBadge();
          } },
          focusText: true,
        });
        const started = await entry.ready;
        session = started ?? entry.session;
        end.hidden = false;
        const conversation = session?.conversation;
        if (conversation) record = await recordNoteUse({ deps, note, conversation, attemptId: session?.attempt?.id ?? null });
      } });
  }
  // Reusable terminal path (session cap, voice-ending errors; OI-0196 no-mic later).
  // Clears transport / mic / timer via session.end(), hides End, and optionally
  // leaves a terminal message for the status dismiss control.
  async function endLiveSession({ statusMessage } = {}) {
    const current = session ?? entry?.session;
    session = null;
    end.hidden = true;
    setListening(false);
    if (entry && !entry.isClosed()) await entry.close();
    else await current?.end();
    entry = null;
    if (statusMessage !== undefined) say(statusMessage);
    else say('');
  }
  const setListening = listening => {
    button.setAttribute('aria-pressed', String(listening));
    button.setAttribute('aria-label', listening ? 'End turn' : 'Talk to GTHO');
    button.classList.toggle('gtho-ptt-button--live', listening);
  };
  const onTranscript = turns => { const last = turns.filter(turn => turn.role === 'assistant').at(-1); if (last) say(last.text); void refreshBadge(); };

  let entry = null;
  async function handleVoiceFailure(result, fromSession) {
    if (result !== 'no-mic' && result !== 'unavailable') return result;
    const current = fromSession ?? session ?? entry?.session;
    const failure = current?.micFailure ?? { message: result === 'unavailable' ? 'Voice is unavailable right now; you can type instead.' : 'No microphone found.' };
    const discardFailed = current?.discardEmptyFailed === true;
    // talk() already ran empty-start cleanup. Drop the live session handle but
    // keep the shared sheet open so Type instead? does not flash a picker.
    session = null;
    end.hidden = true;
    setListening(false);
    if (discardFailed) {
      say(DISCARD_EMPTY_FAILED_MESSAGE);
      entry?.say?.(DISCARD_EMPTY_FAILED_MESSAGE);
    }
    const answer = await askTypeInstead({ message: failure.message });
    if (answer === 'yes') {
      entry = entry && !entry.isClosed() ? entry : openAssistant(deps, config, { focusText: true });
      entry.switchToTyping?.();
      entry.input?.focus();
    } else {
      await entry?.close();
      entry = null;
    }
    return result;
  }
  async function tap() {
    if (!deps.online()) { await offline.toggle(null); setListening(offline.recording); if (!offline.recording) await refreshBadge(); return; }
    // Second tap ends the current turn on the already-open shared sheet.
    if (entry && !entry.isClosed() && entry.session) {
      const result = await entry.session.talk();
      return handleVoiceFailure(result, entry.session);
    }
    entry = openAssistant(deps, config, {
      mode: 'voice',
      invoker: button,
      onListening: setListening,
      onTranscript,
      voiceLog,
      say,
      onVoiceTerminal: message => {
        const current = session ?? entry?.session;
        session = null;
        end.hidden = true;
        setListening(false);
        say(message);
        entry?.say?.(message);
        entry?.switchToTyping?.();
        void current?.end?.();
      },
    });
    const outcome = await entry.ready;
    session = entry.session ?? null;
    return handleVoiceFailure(outcome?.result, session);
  }
  async function stop() {
    await endLiveSession();
  }
  end.addEventListener('click', () => { stop().catch(error => say(error.message)); });
  dismiss.addEventListener('click', event => {
    event.stopPropagation();
    dismissStatus();
  });
  logButton.addEventListener('click', () => { openLog(); });

  // Desktop: drag to move, remembered on this device; a drag is never a tap.
  if (!compact) {
    try {
      const saved = JSON.parse(storage?.getItem(PTT_POSITION_KEY) ?? 'null');
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) place(saved.left, saved.top);
    } catch { /* bottom center */ }
  }
  function place(left, top) {
    wrap.classList.add('gtho-ptt--placed');
    Object.assign(wrap.style, { left: `${left}px`, top: `${top}px`, bottom: 'auto', transform: 'none' });
  }
  let drag = null, suppressClick = false;
  button.addEventListener('pointerdown', event => {
    if (compact) return;
    const rect = wrap.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
  });
  const onMove = event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    place(drag.left + dx, drag.top + dy);
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      const rect = wrap.getBoundingClientRect();
      try { storage?.setItem(PTT_POSITION_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })); } catch { /* position not kept */ }
    }
    drag = null;
  };
  globalThis.addEventListener?.('pointermove', onMove);
  globalThis.addEventListener?.('pointerup', onUp);
  button.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    tap().catch(error => say(error.message));
  });

  root.appendChild(wrap);
  const handle = { element: wrap, tap, stop, endLiveSession, openLog, refreshBadge, get session() { return session; }, clearStatus: dismissStatus };
  void refreshBadge();
  handles.set(wrap, { handle, cleanup: () => { globalThis.removeEventListener?.('pointermove', onMove); globalThis.removeEventListener?.('pointerup', onUp); void session?.end(); } });
  return handle;
}
