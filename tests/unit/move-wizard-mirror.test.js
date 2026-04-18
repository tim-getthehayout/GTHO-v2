/** @file Tests for the one-way dateIn/timeIn mirror in move-wizard Step 3 (OI-0101). */
import { describe, it, expect } from 'vitest';

/**
 * Pure reproduction of the mirror logic in src/features/events/move-wizard.js.
 * Three cases matter: (1) mirror cascades while untouched, (2) farmer touching
 * dateIn stops further cascades, (3) touching dateIn never writes back to dateOut.
 */
function makeState() {
  return {
    dateOut: '2026-04-18',
    timeOut: '',
    dateIn: '2026-04-18',
    timeIn: '',
    dateInTouched: false,
    timeInTouched: false,
  };
}

function onDateOutInput(state, value) {
  state.dateOut = value;
  if (!state.dateInTouched) state.dateIn = value;
}
function onTimeOutInput(state, value) {
  state.timeOut = value;
  if (!state.timeInTouched) state.timeIn = value;
}
function onDateInInput(state, value) {
  state.dateInTouched = true;
  state.dateIn = value;
}
function onTimeInInput(state, value) {
  state.timeInTouched = true;
  state.timeIn = value;
}

describe('move-wizard dateIn/timeIn mirror (OI-0101)', () => {
  it('dateOut edits cascade into dateIn while untouched', () => {
    const s = makeState();
    onDateOutInput(s, '2026-04-20');
    expect(s.dateOut).toBe('2026-04-20');
    expect(s.dateIn).toBe('2026-04-20');
    expect(s.dateInTouched).toBe(false);
  });

  it('timeOut edits cascade into timeIn while untouched', () => {
    const s = makeState();
    onTimeOutInput(s, '14:30');
    expect(s.timeOut).toBe('14:30');
    expect(s.timeIn).toBe('14:30');
  });

  it('touching dateIn stops further cascade from dateOut', () => {
    const s = makeState();
    onDateOutInput(s, '2026-04-20');
    expect(s.dateIn).toBe('2026-04-20');
    // Farmer manually edits dateIn.
    onDateInInput(s, '2026-04-22');
    expect(s.dateIn).toBe('2026-04-22');
    expect(s.dateInTouched).toBe(true);
    // Further dateOut edits no longer rewrite dateIn.
    onDateOutInput(s, '2026-04-25');
    expect(s.dateOut).toBe('2026-04-25');
    expect(s.dateIn).toBe('2026-04-22');
  });

  it('touching timeIn stops further cascade from timeOut (independent of dateIn)', () => {
    const s = makeState();
    onTimeInInput(s, '09:00');
    onTimeOutInput(s, '14:30');
    expect(s.timeIn).toBe('09:00');
    expect(s.timeOut).toBe('14:30');
    // dateIn mirror still active — only timeIn was touched.
    onDateOutInput(s, '2026-04-25');
    expect(s.dateIn).toBe('2026-04-25');
  });

  it('mirror never propagates the other direction (dateIn → dateOut)', () => {
    const s = makeState();
    onDateInInput(s, '2026-04-22');
    expect(s.dateOut).toBe('2026-04-18');
    onTimeInInput(s, '10:00');
    expect(s.timeOut).toBe('');
  });
});
