/** @file OI-0157-C — dashboard event cards stamp the full event UUID below
 * the action-button row when `isCurrentUserDev(operationId)` is true so
 * cross-tab audit (dashboard ↔ #/dev/audit?id=…) works in two clicks instead
 * of three.
 *
 * Tested at the open-event-card surface (`buildLocationCard` — exported);
 * the closed-event group card (`renderGroupCard` — module-private) mirrors
 * the same gate and insertion shape via the symmetric edit in this commit.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as EventPaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as MemberEntity from '../../../src/entities/operation-member.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';

vi.mock('../../../src/features/auth/session.js', () => ({
  getUser: vi.fn(),
}));
// The submove module opens sheets; stub it so the dashboard renderer doesn't
// pull in the real implementation during the buildLocationCard tree.
vi.mock('../../../src/features/events/submove.js', () => ({
  openSubmoveOpenSheet: vi.fn(),
  openSubmoveCloseSheet: vi.fn(),
}));

import { getUser } from '../../../src/features/auth/session.js';
import { buildLocationCard } from '../../../src/features/dashboard/index.js';

const OP_ID = '00000000-0000-0000-0000-0000000000aa';
const FARM_ID = '00000000-0000-0000-0000-0000000000bb';
const LOC_ID = '00000000-0000-0000-0000-0000000000cc';
const EVENT_ID = '00000000-0000-0000-0000-0000000000dd';
const PW_ID = '00000000-0000-0000-0000-0000000000ee';
const TIM = '00000000-0000-0000-0000-0000000000c1';

beforeAll(() => setLocale('en', enLocale));

function seedBaseFixture() {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP_ID, name: 'Test Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM_ID, operationId: OP_ID, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM_ID, operationId: OP_ID }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC_ID, operationId: OP_ID, farmId: FARM_ID,
    name: 'North 40', type: 'land', landUse: 'pasture', areaHectares: 8,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVENT_ID, operationId: OP_ID, farmId: FARM_ID,
    type: 'graze', dateIn: '2026-04-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', EventPaddockWindowEntity.create({
    id: PW_ID, operationId: OP_ID, eventId: EVENT_ID, locationId: LOC_ID,
    dateOpened: '2026-04-01', areaPct: 100,
  }), EventPaddockWindowEntity.validate, EventPaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function seedMember({ isDev }) {
  add('operationMembers', MemberEntity.create({
    operationId: OP_ID, userId: TIM, displayName: 'Tim', email: 't@x.com', role: 'owner', isDev,
  }), MemberEntity.validate, MemberEntity.toSupabaseShape, 'operation_members');
}

describe('dashboard event-id stamp (OI-0157-C)', () => {
  beforeEach(() => {
    seedBaseFixture();
    getUser.mockReset();
  });

  it('renders the dev-event-id stamp on the open-event card when current user is_dev=true', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ isDev: true });

    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');

    const stamp = card.querySelector(`[data-testid="dashboard-dev-event-id-${EVENT_ID}"]`);
    expect(stamp).toBeTruthy();
    expect(stamp.textContent).toBe(EVENT_ID);
    // Full UUID — must be a working URL fragment for the audit page.
    expect(stamp.textContent.length).toBe(36);
  });

  it('does NOT render the stamp when current user is_dev=false', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ isDev: false });

    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');

    const stamp = card.querySelector(`[data-testid="dashboard-dev-event-id-${EVENT_ID}"]`);
    expect(stamp).toBeFalsy();
  });

  it('does NOT render the stamp when the user is not authenticated (defensive)', () => {
    getUser.mockReturnValue(null);
    seedMember({ isDev: true }); // member row exists but no auth user

    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');

    const stamp = card.querySelector(`[data-testid="dashboard-dev-event-id-${EVENT_ID}"]`);
    expect(stamp).toBeFalsy();
  });

  it('stamp is text-selectable (userSelect: text overrides any inherited none)', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ isDev: true });

    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');

    const stamp = card.querySelector(`[data-testid="dashboard-dev-event-id-${EVENT_ID}"]`);
    expect(stamp.style.userSelect).toBe('text');
    // Visual treatment: monospace, muted, small.
    expect(stamp.style.fontFamily).toBe('monospace');
    expect(stamp.style.fontSize).toBe('10px');
    expect(stamp.style.color).toBe('var(--text2)');
  });
});
