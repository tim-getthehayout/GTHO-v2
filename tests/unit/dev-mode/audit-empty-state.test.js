/** @file OI-0147 Bug A — audit empty-state picker fix.
 *
 * The picker must render in BOTH the event-selected state AND the empty
 * state (when `events.length > 0`). Selecting an event from the empty-state
 * picker navigates to `#/dev/audit?id=<uuid>`. When `events.length === 0`,
 * a "no events for this operation yet" note renders instead of an empty
 * <select>.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as LocationEntity from '../../../src/entities/location.js';
import { renderEventAudit } from '../../../src/features/dev-mode/audit.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT_A = '00000000-0000-0000-0000-0000000000c1';
const EVT_B = '00000000-0000-0000-0000-0000000000c2';
const LOC = '00000000-0000-0000-0000-0000000000d1';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'F' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('locations', LocationEntity.create({ id: LOC, operationId: OP, farmId: FARM, name: 'P-1' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

function seedEvent(id, dateOpened) {
  add('events', EventEntity.create({ id, operationId: OP, farmId: FARM }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    operationId: OP, eventId: id, locationId: LOC, dateOpened,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function setHash(hash) {
  window.location.hash = hash;
}

function mountContainer() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

describe('audit empty-state picker (OI-0147 Bug A)', () => {
  it('renders the picker AND a placeholder option in empty state when events exist', () => {
    seedEvent(EVT_A, '2026-04-29');
    seedEvent(EVT_B, '2026-04-30');
    setHash('#/dev/audit'); // No id query string

    renderEventAudit(mountContainer());
    const picker = document.querySelector('[data-testid="dev-audit-event-picker"]');
    expect(picker).toBeTruthy();
    const options = picker.querySelectorAll('option');
    // 1 placeholder + 2 events = 3 options.
    expect(options.length).toBe(3);
    expect(options[0].disabled).toBe(true);
    expect(options[0].textContent).toBe('— select an event —');
  });

  it('does NOT render prev/next buttons in empty state', () => {
    seedEvent(EVT_A, '2026-04-29');
    setHash('#/dev/audit');

    renderEventAudit(mountContainer());
    expect(document.querySelector('[data-testid="dev-audit-prev"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="dev-audit-next"]')).toBeFalsy();
  });

  it('selecting an event from the empty-state picker navigates to that event', () => {
    seedEvent(EVT_A, '2026-04-29');
    seedEvent(EVT_B, '2026-04-30');
    setHash('#/dev/audit');

    renderEventAudit(mountContainer());
    const picker = document.querySelector('[data-testid="dev-audit-event-picker"]');
    picker.value = EVT_A;
    picker.dispatchEvent(new Event('change'));
    expect(window.location.hash).toBe(`#/dev/audit?id=${EVT_A}`);
  });

  it('renders the "no events" note when events.length === 0', () => {
    setHash('#/dev/audit');

    renderEventAudit(mountContainer());
    expect(document.querySelector('[data-testid="dev-audit-event-picker"]')).toBeFalsy();
    const note = document.querySelector('[data-testid="dev-audit-no-events-note"]');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('No events');
  });

  it('with an event selected, the picker still renders without a placeholder', () => {
    seedEvent(EVT_A, '2026-04-29');
    seedEvent(EVT_B, '2026-04-30');
    setHash(`#/dev/audit?id=${EVT_A}`);

    renderEventAudit(mountContainer());
    const picker = document.querySelector('[data-testid="dev-audit-event-picker"]');
    expect(picker).toBeTruthy();
    const options = picker.querySelectorAll('option');
    // Just the 2 events, no placeholder.
    expect(options.length).toBe(2);
    // Selected option matches EVT_A.
    expect(picker.value).toBe(EVT_A);
  });
});
