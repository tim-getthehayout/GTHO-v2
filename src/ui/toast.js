/** @file Shared toast helper.
 *
 * Extracted from `src/features/animals/empty-group-prompt.js` (OI-0090) so
 * other surfaces can show user-visible toasts without duplicating the DOM
 * shape. OI-0162-B added the move-wizard's "save error" toast as the
 * second consumer.
 *
 * @param {string} message
 * @param {string} [testid='toast'] — `data-testid` for selectability.
 */
export function showToast(message, testid = 'toast') {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`[data-testid="${testid}"]`);
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.setAttribute('data-testid', testid);
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 14px;border-radius:8px;font-size:13px;z-index:400;max-width:90%;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
