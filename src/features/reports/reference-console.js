/** @file Reference console — admin screen listing all registered calculations. */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAllCalcs, getCalcsByCategory } from '../../utils/calc-registry.js';

/**
 * Render the reference console section.
 * @returns {HTMLElement}
 */
export function renderReferenceConsole() {
  const calcs = getAllCalcs();
  const categories = [...new Set(calcs.map(c => c.category))].sort();

  const sections = categories.map(cat => {
    const catCalcs = getCalcsByCategory(cat);
    return el('div', { style: { marginBottom: 'var(--space-5)' } }, [
      el('div', {
        className: 'species-header',
        'data-testid': `ref-console-category-${cat}`,
      }, [cat.toUpperCase()]),
      ...catCalcs.map(calc =>
        el('div', {
          className: 'card',
          style: { padding: '10px 14px', marginBottom: 'var(--space-2)' },
          'data-testid': `ref-console-calc-${calc.name}`,
        }, [
          el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [`${calc.name}: ${calc.description}`]),
          el('div', { className: 'ft-row-detail' }, [calc.formula]),
          calc.source ? el('div', { className: 'ft-row-detail', style: { fontStyle: 'italic' } }, [calc.source]) : null,
          calc.example ? el('div', { className: 'ft-row-detail' }, [
            `Example: ${JSON.stringify(calc.example.inputs)} → ${JSON.stringify(calc.example.output)}`,
          ]) : null,
        ].filter(Boolean))
      ),
    ]);
  });

  return el('div', { 'data-testid': 'reference-console' }, [
    el('h2', { className: 'screen-heading' }, [t('reports.calcRefTitle', { count: calcs.length })]),
    ...sections,
  ]);
}
