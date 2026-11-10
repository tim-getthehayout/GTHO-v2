/**
 * @file Metric unit system must show hectares labelled "ha", not acres labelled
 * "ha" (or hardcoded "ac"). Six screens used to always convert toImperial and
 * then either flip the unit label with unitSys or hardcode "ac". Match Event
 * Detail: convert only when imperial; otherwise show hectares; label ac/ha.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import { setUnitSystem } from '../../src/utils/preferences.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as UserPrefEntity from '../../src/entities/user-preference.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';

vi.mock('../../src/features/auth/session.js', () => ({
  getUser: vi.fn(() => ({ id: '00000000-0000-0000-0000-00000000u001' })),
}));

import { renderLocationsScreen, openSurveySheet } from '../../src/features/locations/index.js';
import { openHarvestSheet } from '../../src/features/harvest/index.js';
import { renderFieldModeHome } from '../../src/features/field-mode/index.js';

const OP = '00000000-0000-0000-0000-00000000a198';
const FARM = '00000000-0000-0000-0000-00000000b198';
const LOC_PASTURE = '00000000-0000-0000-0000-00000000c198';
const LOC_PASTURE_B = '00000000-0000-0000-0000-00000000c199';
const LOC_CROP = '00000000-0000-0000-0000-00000000c19a';
const EVT = '00000000-0000-0000-0000-00000000d198';
const PW = '00000000-0000-0000-0000-00000000e198';
const GROUP = '00000000-0000-0000-0000-00000000f198';
const GW = '00000000-0000-0000-0000-000000001198';
const USER = '00000000-0000-0000-0000-00000000u001';
const PREF = '00000000-0000-0000-0000-00000000p198';

beforeAll(() => setLocale('en', enLocale));

function seed(unitSystem) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  vi.stubGlobal('confirm', () => true);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  // 1.0 ha → imperial 2.47 ac (toFixed 2) / 2.5 ac (toFixed 1); metric 1.00 / 1.0 ha
  add('locations', LocationEntity.create({
    id: LOC_PASTURE, operationId: OP, farmId: FARM, name: 'North',
    type: 'land', landUse: 'pasture', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_PASTURE_B, operationId: OP, farmId: FARM, name: 'South',
    type: 'land', landUse: 'pasture', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_CROP, operationId: OP, farmId: FARM, name: 'Crop Field',
    type: 'land', landUse: 'crop', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC_PASTURE,
    dateOpened: '2026-04-16', timeOpened: '08:30', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-16', timeJoined: '08:30', headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('userPreferences', UserPrefEntity.create({
    id: PREF, operationId: OP, userId: USER,
    fieldModeQuickActions: ['surveysingle', 'harvest'],
  }), UserPrefEntity.validate, UserPrefEntity.toSupabaseShape, 'user_preferences');
}

function clickButton(root, label) {
  const btn = [...(root || document).querySelectorAll('button')].find(b => b.textContent === label);
  expect(btn, `button "${label}"`).toBeTruthy();
  btn.click();
  return btn;
}

function freshContainer() {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('metric area display — six screens match Event Detail ac/ha', () => {
  beforeEach(() => seed('imperial'));

  it('1. Locations card: imperial acres / metric hectares', () => {
    let container = freshContainer();
    renderLocationsScreen(container);
    expect(container.textContent).toContain('2.47 ac');
    expect(container.textContent).not.toContain('2.47 ha');

    setUnitSystem('metric');
    container = freshContainer();
    renderLocationsScreen(container);
    expect(container.textContent).toContain('1.00 ha');
    expect(container.textContent).not.toContain('2.47 ha');
    expect(container.textContent).not.toContain('2.47 ac');
  });

  it('2. Survey sheet list: imperial acres / metric hectares', () => {
    openSurveySheet(null, OP);
    const panel = document.getElementById('survey-sheet-panel');
    expect(panel.textContent).toContain('2.47 ac');
    expect(panel.textContent).not.toContain('2.47 ha');

    setUnitSystem('metric');
    openSurveySheet(null, OP);
    const panel2 = document.getElementById('survey-sheet-panel');
    expect(panel2.textContent).toContain('1.00 ha');
    expect(panel2.textContent).not.toContain('2.47 ha');
    expect(panel2.textContent).not.toContain('2.47 ac');
  });

  it('3. Apply-input location picker: imperial acres / metric hectares', () => {
    let container = freshContainer();
    renderLocationsScreen(container);
    clickButton(container, 'Apply input');
    const panel = document.getElementById('amendment-sheet-panel');
    expect(panel.textContent).toContain('2.47 ac');
    expect(panel.textContent).not.toContain('2.47 ha');

    setUnitSystem('metric');
    container = freshContainer();
    renderLocationsScreen(container);
    clickButton(container, 'Apply input');
    const panel2 = document.getElementById('amendment-sheet-panel');
    expect(panel2.textContent).toContain('1.00 ha');
    expect(panel2.textContent).not.toContain('2.47 ha');
    expect(panel2.textContent).not.toContain('2.47 ac');
  });

  it('4. Harvest field picker: imperial acres / metric hectares', () => {
    openHarvestSheet(OP, { fieldMode: true });
    const panel = document.getElementById('harvest-sheet-panel');
    expect(panel.textContent).toMatch(/2\.5 ac/);
    expect(panel.textContent).not.toMatch(/2\.5 ha/);

    setUnitSystem('metric');
    openHarvestSheet(OP, { fieldMode: true });
    const panel2 = document.getElementById('harvest-sheet-panel');
    expect(panel2.textContent).toMatch(/1\.0 ha/);
    expect(panel2.textContent).not.toMatch(/2\.5 ha/);
    expect(panel2.textContent).not.toMatch(/2\.5 ac/);
  });

  it('5. Field-mode survey-single paddock picker: imperial acres / metric hectares', () => {
    let container = freshContainer();
    renderFieldModeHome(container);
    const tile = container.querySelector('[data-testid="field-mode-tile-surveysingle"]');
    expect(tile, 'surveysingle tile').toBeTruthy();
    tile.click();
    const panel = document.getElementById('fm-picker-panel');
    expect(panel.textContent).toMatch(/2\.5 ac/);
    expect(panel.textContent).not.toMatch(/2\.5 ha/);

    setUnitSystem('metric');
    container = freshContainer();
    renderFieldModeHome(container);
    const tile2 = container.querySelector('[data-testid="field-mode-tile-surveysingle"]');
    tile2.click();
    const panel2 = document.getElementById('fm-picker-panel');
    expect(panel2.textContent).toMatch(/1\.0 ha/);
    expect(panel2.textContent).not.toMatch(/2\.5 ha/);
    expect(panel2.textContent).not.toMatch(/2\.5 ac/);
  });

  it('6. Field-mode active-events total: imperial acres / metric hectares', () => {
    let container = freshContainer();
    renderFieldModeHome(container);
    const events = container.querySelector('[data-testid="field-mode-events"]');
    expect(events.textContent).toMatch(/2\.5 ac/);
    expect(events.textContent).not.toMatch(/2\.5 ha/);

    setUnitSystem('metric');
    container = freshContainer();
    renderFieldModeHome(container);
    const events2 = container.querySelector('[data-testid="field-mode-events"]');
    expect(events2.textContent).toMatch(/1\.0 ha/);
    expect(events2.textContent).not.toMatch(/2\.5 ha/);
    expect(events2.textContent).not.toMatch(/2\.5 ac/);
  });
});
