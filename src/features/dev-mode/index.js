/** @file OI-0138 — Dev Mode shelf home (3-tool MVP). Lists the three tools
 * with click handlers; each tool's full implementation lives in its own file.
 *
 * Routes use query-string params (e.g. `#/dev/audit?id=<uuid>`) since the
 * router strips `?` from the hash for routing but the renderFn can read the
 * full `window.location.hash` to extract params.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { navigate } from '../../ui/router.js';

/**
 * Render a "DEV MODE" badge that every Dev Mode page should append to its
 * header so users always know they're on a gated diagnostic surface.
 *
 * @returns {HTMLElement}
 */
export function renderDevModeBadge() {
  return el('span', {
    'data-testid': 'dev-mode-badge',
    style: {
      display: 'inline-block',
      padding: '2px 6px',
      marginLeft: '8px',
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '0.6px',
      textTransform: 'uppercase',
      background: 'var(--amber)',
      color: 'var(--bg)',
      borderRadius: '4px',
      verticalAlign: 'middle',
    },
  }, [t('dev.badge')]);
}

/**
 * Render the Dev Mode home page — three-tool list.
 * @param {HTMLElement} container
 */
export function renderDevHome(container) {
  clear(container);

  const wrapper = el('div', {
    className: 'dev-mode-home',
    'data-testid': 'dev-mode-home',
    style: { padding: 'var(--space-4)' },
  });

  wrapper.appendChild(el('div', {
    style: { display: 'flex', alignItems: 'center', marginBottom: 'var(--space-4)' },
  }, [
    el('h1', { className: 'screen-heading', style: { margin: 0 } }, [t('dev.homeTitle')]),
    renderDevModeBadge(),
  ]));

  wrapper.appendChild(el('p', { className: 'form-hint' }, [t('dev.homeSubtitle')]));

  const list = el('div', { className: 'dev-mode-tool-list', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'var(--space-3)' } });

  const tools = [
    { key: 'event-audit',   label: t('dev.toolEventAuditLabel'),   desc: t('dev.toolEventAuditDesc'),   hash: '#/dev/audit' },
    { key: 'logs',          label: t('dev.toolLogsLabel'),          desc: t('dev.toolLogsDesc'),          hash: '#/dev/logs' },
    { key: 'schema',        label: t('dev.toolSchemaLabel'),        desc: t('dev.toolSchemaDesc'),        hash: '#/dev/schema' },
  ];

  for (const tool of tools) {
    list.appendChild(el('button', {
      className: 'card',
      'data-testid': `dev-mode-tool-${tool.key}`,
      onClick: () => navigate(tool.hash),
      style: {
        textAlign: 'left',
        padding: 'var(--space-3)',
        cursor: 'pointer',
        border: '0.5px solid var(--border2)',
        background: 'var(--bg)',
        font: 'inherit',
        color: 'inherit',
      },
    }, [
      el('div', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '4px' } }, [tool.label]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [tool.desc]),
    ]));
  }

  wrapper.appendChild(list);
  container.appendChild(wrapper);
}
