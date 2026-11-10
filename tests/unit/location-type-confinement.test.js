/** @file Classify confinement by the location type, never an event type. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isConfinementLocation, isPureConfinementOnDate } from '../../src/calcs/location-type.js';

const pasture = { id: 'loc-pasture', type: 'pasture', name: 'E-1' };
const confinement = { id: 'loc-pen', type: 'confinement', name: 'Barn' };

describe('confinement classification uses loc.type', () => {
  it('isConfinementLocation reads only the location type, even when a fake event type is present', () => {
    const event = { id: 'evt-1', type: 'confinement' };
    expect(isConfinementLocation(pasture, event)).toBe(false);
    expect(isConfinementLocation({ ...pasture, eventType: 'confinement' })).toBe(false);
    expect(isConfinementLocation({ ...confinement, event: { type: 'pasture' } })).toBe(true);
    expect(isConfinementLocation({ id: 'loc-x', type: 'pasture' })).toBe(false);
    expect(isConfinementLocation({ id: 'loc-x', type: 'confinement' })).toBe(true);
  });

  it('isPureConfinementOnDate follows the open location type, ignoring event.type', () => {
    const windows = [{ eventId: 'evt-1', locationId: pasture.id, dateOpened: '2026-11-01', dateClosed: null }];
    const eventsLie = { id: 'evt-1', type: 'confinement' };
    expect(isPureConfinementOnDate({
      paddockWindows: windows,
      locations: [pasture],
      eventId: eventsLie.id,
      date: '2026-11-10',
    })).toBe(false);

    const confWindows = [{ eventId: 'evt-2', locationId: confinement.id, dateOpened: '2026-11-01', dateClosed: null }];
    expect(isPureConfinementOnDate({
      paddockWindows: confWindows,
      locations: [confinement],
      eventId: 'evt-2',
      date: '2026-11-10',
    })).toBe(true);
  });

  it('the calendar grid filters and marks forageInactive from loc.type, never event.type', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/loc\.type === 'confinement'/);
    expect(src).toMatch(/forageInactive:\s*loc\.type === 'confinement'/);
    expect(src).not.toMatch(/event\.type/);
    expect(src).not.toMatch(/locationType/);
  });
});
