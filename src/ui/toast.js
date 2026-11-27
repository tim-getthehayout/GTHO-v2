/** @file Shared toast helpers (#481: the one toast implementation for src/).
 *
 * First extracted from `src/features/animals/empty-group-prompt.js` (OI-0090);
 * #481 folded the remaining local copies in (settings export/import, members,
 * field mode, feed-check edit, cull and split undo, window-closed, invite).
 * Every variant keeps its original DOM: same element order, classes,
 * `data-testid`s, inline styles and timers.
 */
import { el } from './dom.js';

/** The default inline toast look (dark pill, bottom centre). */
const INLINE_STYLE = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 14px;border-radius:8px;font-size:13px;z-index:400;max-width:90%;';
/** Same look laid out as a row: message span plus an optional action button. */
const INLINE_ROW_STYLE = `${INLINE_STYLE}display:flex;align-items:center;gap:10px;`;

/**
 * Show a toast at the bottom of the page.
 *
 * A toast with a `data-testid` replaces any toast already showing with that
 * testid. Pass `testid: null` for a toast with no testid that stacks.
 *
 * @param {string} message
 * @param {string|null} [testid='toast'] — `data-testid` for selectability.
 * @param {object} [options]
 * @param {string} [options.className] — CSS class look (e.g. `export-toast`) instead of the inline style.
 * @param {object} [options.style] — inline style object instead of the default inline style.
 * @param {number} [options.duration=4000] — ms until the toast is removed.
 * @param {number} [options.fadeAfter] — ms until opacity drops to 0 (before removal).
 * @param {object} [options.messageStyle] — row layout: style for the message span.
 * @param {{label: string, onClick: () => void, className?: string, testid?: string, style?: object}} [options.action]
 *   — row layout: button after the message; a click removes the toast, then runs `onClick`.
 * @returns {HTMLElement|undefined} the toast element (undefined without a DOM).
 */
export function showToast(message, testid = 'toast', options = {}) {
  if (typeof document === 'undefined') return undefined;
  const { className, style, duration = 4000, fadeAfter, messageStyle, action } = options;
  if (testid) document.querySelector(`[data-testid="${testid}"]`)?.remove();
  const row = !!(action || messageStyle);
  const toast = document.createElement('div');
  if (className) toast.className = className;
  if (testid) toast.setAttribute('data-testid', testid);
  if (style) Object.assign(toast.style, style);
  else if (!className) toast.style.cssText = row ? INLINE_ROW_STYLE : INLINE_STYLE;
  if (row) {
    toast.appendChild(el('span', messageStyle ? { style: messageStyle } : {}, [message]));
    if (action) {
      toast.appendChild(el('button', {
        className: action.className,
        'data-testid': action.testid,
        style: action.style,
        onClick: () => { toast.remove(); action.onClick(); },
      }, [action.label]));
    }
  } else {
    toast.textContent = message;
  }
  document.body.appendChild(toast);
  if (fadeAfter != null) setTimeout(() => { toast.style.opacity = '0'; }, fadeAfter);
  setTimeout(() => toast.remove(), duration);
  return toast;
}

/**
 * Toast with the `.export-toast` CSS look (settings export/import, members, invite).
 * @param {string} message
 * @param {string} [testid='export-toast']
 * @returns {HTMLElement|undefined}
 */
export function showExportToast(message, testid = 'export-toast') {
  return showToast(message, testid, { className: 'export-toast' });
}

/** Locked message that stays until the user dismisses it with ×. Used when
 * empty-start cleanup fails after the assistant sheet has already closed. */
export function showDismissibleBanner(message, testid = 'assistant-cleanup-failure') {
  if (typeof document === 'undefined' || !message) return;
  document.querySelector(`[data-testid="${testid}"]`)?.remove();
  const banner = document.createElement('div');
  banner.setAttribute('data-testid', testid);
  banner.setAttribute('role', 'status');
  banner.className = 'export-toast';
  banner.style.animation = 'none';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.gap = '10px';
  const text = document.createElement('span');
  text.setAttribute('data-testid', `${testid}-text`);
  text.textContent = message;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.setAttribute('data-testid', `${testid}-dismiss`);
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => banner.remove());
  banner.append(text, dismiss);
  document.body.appendChild(banner);
  return banner;
}
