/** @file OI-0146 (Settings + Header doorways) + OI-0147 Bug B (event-detail
 * Audit button) — gating + navigation tests for all three dev-mode entry
 * points.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as MemberEntity from '../../../src/entities/operation-member.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000c1';
const TIM = '00000000-0000-0000-0000-0000000000c2';
const NON_DEV = '00000000-0000-0000-0000-0000000000c3';

vi.mock('../../../src/features/auth/session.js', () => ({
  getUser: vi.fn(),
}));

import { getUser } from '../../../src/features/auth/session.js';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  window.location.hash = '';
  getUser.mockReset();

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
});

function flagDev(userId, isDev) {
  add('operationMembers', MemberEntity.create({
    operationId: OP, userId, displayName: 'X', email: 'x@y.com', role: 'owner', isDev,
  }), MemberEntity.validate, MemberEntity.toSupabaseShape, 'operation_members');
}

describe('OI-0146 Doorway A — Settings Tools "Dev tools" link', () => {
  it('renders the Dev tools button when the current user is_dev=true', async () => {
    getUser.mockReturnValue({ id: TIM });
    flagDev(TIM, true);

    const { renderToolsSection } = await import('../../../src/features/settings/tools-section.js');
    const card = renderToolsSection(OP);
    document.body.appendChild(card);
    expect(card.querySelector('[data-testid="settings-dev-tools-link"]')).toBeTruthy();
  });

  it('does NOT render the Dev tools button for non-dev members', async () => {
    getUser.mockReturnValue({ id: NON_DEV });
    flagDev(NON_DEV, false);

    const { renderToolsSection } = await import('../../../src/features/settings/tools-section.js');
    const card = renderToolsSection(OP);
    document.body.appendChild(card);
    expect(card.querySelector('[data-testid="settings-dev-tools-link"]')).toBeFalsy();
  });

  it('clicking Dev tools navigates to #/dev', async () => {
    getUser.mockReturnValue({ id: TIM });
    flagDev(TIM, true);

    const { renderToolsSection } = await import('../../../src/features/settings/tools-section.js');
    const card = renderToolsSection(OP);
    document.body.appendChild(card);
    card.querySelector('[data-testid="settings-dev-tools-link"]').click();
    expect(window.location.hash).toBe('#/dev');
  });
});

describe('OI-0146 Doorway B — Header [DEV] chip', () => {
  it('renders the chip in the header when current user is_dev=true', async () => {
    getUser.mockReturnValue({ id: TIM });
    flagDev(TIM, true);

    const { renderHeader } = await import('../../../src/ui/header.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderHeader(container);

    const chip = container.querySelector('[data-testid="header-dev-mode-chip"]');
    expect(chip).toBeTruthy();
    // Reuses renderDevModeBadge() — the inner span carries the dev-mode-badge testid.
    expect(chip.querySelector('[data-testid="dev-mode-badge"]')).toBeTruthy();
    // Tap-target sanity: button has the min-32px sizing inline.
    expect(chip.style.minWidth).toBe('32px');
    expect(chip.style.minHeight).toBe('32px');
  });

  it('does NOT render the chip for non-dev members', async () => {
    getUser.mockReturnValue({ id: NON_DEV });
    flagDev(NON_DEV, false);

    const { renderHeader } = await import('../../../src/ui/header.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderHeader(container);

    expect(container.querySelector('[data-testid="header-dev-mode-chip"]')).toBeFalsy();
  });

  it('clicking the chip navigates to #/dev', async () => {
    getUser.mockReturnValue({ id: TIM });
    flagDev(TIM, true);

    const { renderHeader } = await import('../../../src/ui/header.js');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderHeader(container);

    container.querySelector('[data-testid="header-dev-mode-chip"]').click();
    expect(window.location.hash).toBe('#/dev');
  });
});

describe('OI-0147 Bug B — event-detail Audit button', () => {
  beforeEach(() => {
    add('events', EventEntity.create({
      id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  });

  it('renders the Audit button when current user is_dev=true', async () => {
    getUser.mockReturnValue({ id: TIM });
    flagDev(TIM, true);

    const { openEventDetailSheet } = await import('../../../src/features/events/detail.js');
    openEventDetailSheet({ id: EVT }, OP, FARM);

    const btn = document.querySelector('[data-testid="event-detail-audit-button"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Audit');
  });

  it('does NOT render the Audit button for non-dev members', async () => {
    getUser.mockReturnValue({ id: NON_DEV });
    flagDev(NON_DEV, false);

    const { openEventDetailSheet } = await import('../../../src/features/events/detail.js');
    openEventDetailSheet({ id: EVT }, OP, FARM);

    expect(document.querySelector('[data-testid="event-detail-audit-button"]')).toBeFalsy();
  });

  it('clicking Audit navigates to #/dev/audit?id=<event.id>', async () => {
    getUser.mockReturnValue({ id: TIM });
    flagDev(TIM, true);

    const { openEventDetailSheet } = await import('../../../src/features/events/detail.js');
    openEventDetailSheet({ id: EVT }, OP, FARM);

    document.querySelector('[data-testid="event-detail-audit-button"]').click();
    expect(window.location.hash).toBe(`#/dev/audit?id=${EVT}`);
  });
});
