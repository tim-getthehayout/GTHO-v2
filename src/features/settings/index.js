/** @file Settings placeholder screen */
import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';

export function renderSettingsScreen(container) {
  container.appendChild(el('h1', { className: 'screen-heading' }, [t('nav.settings')]));
}
