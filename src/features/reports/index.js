/** @file Reports screen — CP-48+. Report tabs + reference console. */
import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { renderReferenceConsole } from './reference-console.js';

export function renderReportsScreen(container) {
  container.appendChild(el('h1', { className: 'screen-heading' }, [t('nav.reports')]));

  // Report tabs placeholder — each will be built in CP-48 through CP-51
  container.appendChild(el('p', { className: 'form-hint', style: { fontStyle: 'italic', marginBottom: 'var(--space-5)' } }, [
    'Report tabs coming in CP-48 through CP-51.',
  ]));

  // Reference console (always available — shows all registered formulas)
  container.appendChild(renderReferenceConsole());
}
