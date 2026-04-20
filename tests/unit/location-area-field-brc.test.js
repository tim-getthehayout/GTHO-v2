/**
 * @file OI-0124 Phase 1 — `paddockAcres` is wired correctly on four pre-graze
 * surfaces (Move All wizard, Event Detail §5, Edit Paddock Window, Pasture
 * Survey). Pre-fix these surfaces read `loc.areaHa` — which is `undefined` on
 * every Location entity — so BRC auto-fill was silently disabled.
 *
 * Proof of wiring: render each surface with a Location whose `areaHectares`
 * is set and assert the bale-ring helper text enters its "active" state,
 * which only happens when `paddockAcres && paddockAcres > 0` (see
 * `_shared.js:119,121`). The active text contains the ring diameter in feet
 * and the converted paddock acres — so matching `/12\.0 ft/` confirms the
 * prop reached the card.
 *
 * The fifth surface (sub-move Open) is covered by
 * `tests/unit/submove-brc-reactive.test.js` — it has been correct since
 * OI-0114 NC-1.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as SurveyEntity from '../../src/entities/survey.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
// Calc registrations — BRC-1 drives the helper active/inactive state.
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/capacity.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/survey-bale-ring.js';

import { openMoveWizard } from '../../src/features/events/move-wizard.js';
import { openEventDetailSheet } from '../../src/features/events/detail.js';
import { openEditPaddockWindowDialog } from '../../src/features/events/edit-paddock-window.js';
import { renderSurveysScreen } from '../../src/features/surveys/index.js';

const OP = '00000000-0000-0000-0000-000000000aa1';
const FARM = '00000000-0000-0000-0000-000000000bb1';
const SRC_LOC = '00000000-0000-0000-0000-000000000c11';
const DST_LOC = '00000000-0000-0000-0000-000000000c12';
const EVT = '00000000-0000-0000-0000-000000000d11';
const PW = '00000000-0000-0000-0000-000000000e11';
const GROUP = '00000000-0000-0000-0000-000000000f11';
const GW = '00000000-0000-0000-0000-000000000101';
const SURVEY = '00000000-0000-0000-0000-000000000201';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  vi.stubGlobal('confirm', () => true);
  // The surveys module uses a pre-existing draft-entry sheet wrapper; seed it
  // so openDraftEntrySheet's DOM queries resolve without a full route mount.
  document.body.appendChild(Object.assign(document.createElement('div'), {
    innerHTML: '<div class="sheet-wrap" id="draft-entry-sheet-wrap"><div class="sheet-backdrop"></div><div class="sheet-panel" id="draft-entry-sheet-panel"></div></div>',
  }));
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({
    farmId: FARM, operationId: OP,
    baleRingResidueDiameterCm: 365.76, // 12 ft exactly — v1 default.
  }), FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  // areaHectares = 1.0 → ~2.47 ac. `paddockAcres` null pre-fix, ~2.47 post-fix.
  for (const [id, name] of [[SRC_LOC, 'Source'], [DST_LOC, 'Dest']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name,
      type: 'land', landUse: 'pasture', areaHectares: 1.0,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-04-16', timeOpened: '08:30', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-16', timeJoined: '08:30', headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  // Animals + memberships so move-wizard's head-count check passes on Step 3.
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-0000000a0${i.toString().padStart(2, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP,
      dateJoined: '2026-04-16', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
});

describe('OI-0124 Phase 1 — paddockAcres wiring on pre-graze surfaces', () => {
  it('move-wizard Step 3 destination card is BRC-active (paddockAcres reached renderPreGrazeCard)', () => {
    const event = { id: EVT, dateIn: '2026-04-16', dateOut: null };
    openMoveWizard(event, OP, FARM, {});
    // Step 1: dest type "new" → next.
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    // Step 2: pick destination location → next. Picking the destination
    // updates state.locationId, which is read on Step 3 to resolve destLoc.
    document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    // Step 3 renders the close-and-move form with the destination pre-graze card.
    const helper = document.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    expect(helper, 'pre-graze helper should exist on Step 3').toBeTruthy();
    // Active text names the ring diameter and paddock acres; 1 ha → 2.47 ac.
    expect(helper.textContent).toMatch(/12\.0 ft/);
    expect(helper.textContent).toMatch(/2\.47 ac/);
  });

  it('Event Detail §5 open paddock window card is BRC-active', () => {
    openEventDetailSheet({ id: EVT }, OP, FARM);
    // §5 renders one pre-graze card per open paddock window.
    const helper = document.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    expect(helper, 'pre-graze helper should exist in §5').toBeTruthy();
    expect(helper.textContent).toMatch(/12\.0 ft/);
    expect(helper.textContent).toMatch(/2\.47 ac/);
  });

  it('Edit Paddock Window dialog pre-graze card is BRC-active', () => {
    const pw = getById('eventPaddockWindows', PW);
    const event = getById('events', EVT);
    openEditPaddockWindowDialog(pw, event, OP);
    const helper = document.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    expect(helper, 'pre-graze helper should exist in edit-pw dialog').toBeTruthy();
    expect(helper.textContent).toMatch(/12\.0 ft/);
    expect(helper.textContent).toMatch(/2\.47 ac/);
  });

  it('Pasture Survey draft-entry card is BRC-active when initialLoc has areaHectares', () => {
    add('surveys', SurveyEntity.create({
      id: SURVEY, operationId: OP, surveyDate: '2026-04-20',
      type: 'single', status: 'draft',
    }), SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderSurveysScreen(container);
    // Open the draft-entry sheet via the list's add-entry button — the click
    // path that surveys/index.js uses internally to render the survey card.
    const addBtn = container.querySelector(`[data-testid="surveys-add-entry-${SURVEY}"]`);
    expect(addBtn, 'add-entry button should render for draft survey').toBeTruthy();
    addBtn.click();
    // The draft-entry sheet picks the first location matching the farm; the
    // survey-card inherits paddockAcres via surveys/index.js:309.
    const helper = document.querySelector('[data-testid="obs-card-bale-ring-helper"]');
    expect(helper, 'pre-graze helper should exist in survey draft-entry sheet').toBeTruthy();
    expect(helper.textContent).toMatch(/12\.0 ft/);
    expect(helper.textContent).toMatch(/2\.47 ac/);
  });
});
