/** The voice-to-entry log, opened as a panel from the push-to-talk control.
 * Unfinished: offline voice notes still on this device (retryable). All adds the
 * host events this device asked (kept out of the model transcript). */
import { el, clear } from '../../../ui/dom.js';
import { Sheet } from '../../../ui/sheet.js';
import { renderNoteReview } from './offline-note-review.js';

export const VOICE_LOG_PURPOSE_LABELS = Object.freeze({ write: 'Entry', question: 'Question', feedback: 'Feedback', 'how-to': 'How-to' });

function ensureSheet() {
  let wrap = document.getElementById('voice-log-sheet-wrap');
  if (!wrap) {
    wrap = el('div', { className: 'sheet-wrap', id: 'voice-log-sheet-wrap', style: { zIndex: '216' } }, [
      el('div', { className: 'sheet-backdrop' }),
      el('div', { className: 'sheet-panel', id: 'voice-log-sheet-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
    ]);
    document.body.appendChild(wrap);
  }
  return { sheet: new Sheet('voice-log-sheet-wrap'), panel: document.getElementById('voice-log-sheet-panel'), wrap };
}

/** {deps, notes, log, use(note, text), onChange()} -> {render(filter), close()} */
export function openVoiceLog({ deps, notes, log, use, onChange = () => {} }) {
  const { sheet, panel, wrap } = ensureSheet();
  const status = el('div', { className: 'auth-error', 'data-testid': 'voice-log-status', role: 'status' });
  const list = el('div', { 'data-testid': 'voice-log-list' });
  const say = text => { status.textContent = text; };
  let filter = 'unfinished', renders = 0;
  const tab = (value, label) => el('button', { className: 'btn btn-outline btn-xs', 'data-testid': `voice-log-filter-${value}`, onClick: () => { void render(value); } }, [label]);
  clear(panel);
  panel.append(el('div', { className: 'sheet-handle' }), el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Voice log']),
    el('div', { className: 'btn-row' }, [tab('unfinished', 'Unfinished'), tab('all', 'All')]), list, status);
  async function render(next = filter) {
    filter = next;
    const token = ++renders;
    let saved = [];
    try { saved = await notes.list(); } catch { say('Voice notes on this device could not be read.'); }
    if (token !== renders) return; // a later render owns the list
    clear(list);
    for (const note of saved) {
      list.appendChild(el('div', { 'data-testid': 'voice-log-item', 'data-status': 'unfinished' }, [
        el('div', {}, ['Unfinished · voice note on this device']),
        renderNoteReview(note, { deps, say, use: async (picked, text) => { await use(picked, text); await render(); onChange(); } }),
      ]));
    }
    if (filter === 'all') {
      for (const event of log.events().slice().reverse()) {
        list.appendChild(el('div', { 'data-testid': 'voice-log-item', 'data-status': 'host-event' }, [
          `${new Date(event.at).toLocaleString()} · ${VOICE_LOG_PURPOSE_LABELS[event.purpose] ?? 'Voice'} · GTHO asked: ${event.text}`,
        ]));
      }
    }
    if (!list.childNodes.length) list.appendChild(el('div', {}, [filter === 'unfinished' ? 'Nothing unfinished.' : 'Nothing yet.']));
  }
  wrap.querySelector('.sheet-backdrop').onclick = () => sheet.close();
  sheet.open();
  void render();
  return { render, close: () => sheet.close(), get filter() { return filter; } };
}
