/** P7 early-testing recording consent: asked once per tester per operation. */
import { el } from '../../../ui/dom.js';

export const CONSENT_TEXT = 'During early testing, GTHO can keep recordings of what you say to the assistant so we can improve it. Keep my recordings? You can still use voice if you say no.';
export const CONSENT_KEEP = 'Keep recordings';
export const CONSENT_DECLINE = "Don't keep";

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
