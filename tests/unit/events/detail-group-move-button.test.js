/** @file OI-0160 — per-group Move button in the event-detail sheet must
 * pass `{ scopedGroupWindowId: gw.id }` to `openMoveWizard`. Pre-OI-0160
 * the call was `openMoveWizard(event, op, farm)` with no opts, which made
 * the wizard run in full-event mode and close every group window + every
 * paddock window + stamp `events.date_out` on Save — even though the
 * farmer tapped Move next to a single group.
 *
 * Reference (correct call sites in src/features/dashboard/index.js):
 *   - line 919 (open-event card): `openMoveWizard(activeEvent, op, farm,
 *     { scopedGroupWindowId: activeGW?.id })`
 *   - line 1375 (group strip): `openMoveWizard(event, op, farm,
 *     { scopedGroupWindowId: gw.id })`
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
// Side-effect import — events/detail consumes ANI-AU from the calc registry.
import '../../../src/calcs/core.js';

// Stub the move-wizard module so we can spy on `openMoveWizard` without
// invoking the real wizard's `Sheet` machinery.
vi.mock('../../../src/features/events/move-wizard.js', () => ({
  openMoveWizard: vi.fn(),
}));

import { openEventDetailSheet } from '../../../src/features/events/detail.js';
import { openMoveWizard } from '../../../src/features/events/move-wizard.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000cc';
const EVT = '00000000-0000-0000-0000-0000000000c1';
const PW = '00000000-0000-0000-0000-0000000000d1';
const GROUP_A = '00000000-0000-0000-0000-0000000000e1';
const GROUP_B = '00000000-0000-0000-0000-0000000000e2';
const GW_A = '00000000-0000-0000-0000-0000000000f1';
const GW_B = '00000000-0000-0000-0000-0000000000f2';

beforeAll(() => setLocale('en', enLocale));

function seed({ multiGroup = true } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'G-5', type: 'land',
    landUse: 'pasture', areaHectares: 8,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM,
    type: 'graze', dateIn: '2026-05-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-05-01', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, name: 'Mixed Calves' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_A, operationId: OP, eventId: EVT, groupId: GROUP_A,
    dateJoined: '2026-05-01', headCount: 28, avgWeightKg: 250,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  if (multiGroup) {
    add('groups', GroupEntity.create({ id: GROUP_B, operationId: OP, name: 'Cow-Calf Herd' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_B, operationId: OP, eventId: EVT, groupId: GROUP_B,
      dateJoined: '2026-05-01', headCount: 40, avgWeightKg: 540,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
}

beforeEach(() => {
  openMoveWizard.mockReset();
});

describe('OI-0160 — per-group Move button passes scopedGroupWindowId', () => {
  it('clicking Move on the second group passes { scopedGroupWindowId: gw.id }', () => {
    seed({ multiGroup: true });
    openEventDetailSheet({ id: EVT }, OP, FARM);

    // The new data-testid added in OI-0160's fix.
    const moveBtn = document.querySelector(`[data-testid="detail-group-move-${GW_B}"]`);
    expect(moveBtn).toBeTruthy();
    moveBtn.click();

    expect(openMoveWizard).toHaveBeenCalledTimes(1);
    const args = openMoveWizard.mock.calls[0];
    expect(args.length).toBe(4);
    const [eventArg, opIdArg, farmIdArg, optsArg] = args;
    expect(eventArg.id).toBe(EVT);
    expect(opIdArg).toBe(OP);
    expect(farmIdArg).toBe(FARM);
    expect(optsArg).toEqual({ scopedGroupWindowId: GW_B });
  });

  it('clicking Move on the first group also passes the scoped opt (single-group event covers the lastGroupLeaving case)', () => {
    seed({ multiGroup: false });
    openEventDetailSheet({ id: EVT }, OP, FARM);

    // With only Mixed Calves on the event, this is effectively the
    // "scoped becomes full-event" path — but the button itself must
    // still pass the scoped opt. The wizard's lastGroupLeaving logic
    // handles the equivalence at line 716 of move-wizard.js.
    const moveBtn = document.querySelector(`[data-testid="detail-group-move-${GW_A}"]`);
    expect(moveBtn).toBeTruthy();
    moveBtn.click();

    expect(openMoveWizard).toHaveBeenCalledTimes(1);
    const optsArg = openMoveWizard.mock.calls[0][3];
    expect(optsArg).toEqual({ scopedGroupWindowId: GW_A });
  });
});
