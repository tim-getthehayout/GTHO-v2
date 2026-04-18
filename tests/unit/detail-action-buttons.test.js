/**
 * @file Event Detail action buttons layout (OI-0074).
 *
 * Renders the detail sheet and asserts the three-tier v1 action layout:
 *   1. Primary row: "Save & recalculate" (green, flex:2) + "Cancel" (outline, flex:1)
 *   2. Warning row: amber full-width "Close this event & move groups" (active only)
 *   3. Destructive row: red-small "Delete event"
 *
 * Closed events: Cancel full-width + Delete. No Save & recalc, no amber warning.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as EventEntity from '../../src/entities/event.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openEventDetailSheet } from '../../src/features/events/detail.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT_OPEN = '00000000-0000-0000-0000-0000000000c1';
const EVT_CLOSED = '00000000-0000-0000-0000-0000000000c2';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('events', EventEntity.create({
    id: EVT_OPEN, operationId: OP, farmId: FARM,
    type: 'graze', dateIn: '2026-04-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('events', EventEntity.create({
    id: EVT_CLOSED, operationId: OP, farmId: FARM,
    type: 'graze', dateIn: '2026-04-01', dateOut: '2026-04-10',
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
});

describe('renderActions — OI-0074 three-tier v1 layout', () => {
  it('active event: Save & recalculate + Cancel primary row', () => {
    openEventDetailSheet({ id: EVT_OPEN }, OP, FARM);
    const saveBtn = document.querySelector('[data-testid="detail-save-recalc"]');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toBe('Save & recalculate');
    expect(saveBtn.className).toContain('btn-green');
    // jsdom expands `flex: '2'` shorthand — match flex-grow.
    expect(saveBtn.style.flexGrow).toBe('2');
    const cancelBtn = document.querySelector('[data-testid="detail-cancel"]');
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.className).toContain('btn-outline');
    expect(cancelBtn.style.flexGrow).toBe('1');
  });

  it('active event: amber warning row appears', () => {
    openEventDetailSheet({ id: EVT_OPEN }, OP, FARM);
    const closeMove = document.querySelector('[data-testid="detail-close-move"]');
    expect(closeMove).toBeTruthy();
    expect(closeMove.style.width).toBe('100%');
  });

  it('active event: Delete event small-red row appears', () => {
    openEventDetailSheet({ id: EVT_OPEN }, OP, FARM);
    const deleteBtn = document.querySelector('[data-testid="detail-delete"]');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.className).toContain('btn-red');
    expect(deleteBtn.className).toContain('btn-sm');
  });

  it('closed event: no Save & recalc, no amber warning; Cancel + Delete only', () => {
    openEventDetailSheet({ id: EVT_CLOSED }, OP, FARM);
    expect(document.querySelector('[data-testid="detail-save-recalc"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="detail-close-move"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="detail-cancel"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="detail-delete"]')).toBeTruthy();
  });
});
