/** @file Tests for one-time paddock-window orphan cleanup (OI-0095 Part B). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import { closePaddockWindowOrphans, _resetOneTimeFixFlags } from '../../src/data/one-time-fixes.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';

function seedEvent(id, { dateIn = '2026-04-01', dateOut = null, timeOut = null } = {}) {
  add('events', EventEntity.create({ id, operationId: OP, farmId: FARM, dateIn, dateOut, timeOut }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}
function seedPw(id, { eventId, locationId, dateOpened = '2026-04-01', dateClosed = null }) {
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id, operationId: OP, eventId, locationId, dateOpened, dateClosed,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

describe('closePaddockWindowOrphans', () => {
  beforeEach(() => {
    _reset();
    _resetOneTimeFixFlags();
  });

  it('closes a dangling PW whose parent event is closed (stamps event.dateOut)', () => {
    seedEvent('e1', { dateOut: '2026-04-10' });
    seedPw('pw1', { eventId: 'e1', locationId: 'L1', dateClosed: null });

    const result = closePaddockWindowOrphans();
    expect(result.closed).toBe(1);

    const pw = getAll('eventPaddockWindows').find(w => w.id === 'pw1');
    expect(pw.dateClosed).toBe('2026-04-10');
  });

  it('does not touch PWs whose parent event is still open', () => {
    seedEvent('e-open', { dateOut: null });
    seedPw('pw-on-open', { eventId: 'e-open', locationId: 'L1', dateClosed: null });

    closePaddockWindowOrphans();
    const pw = getAll('eventPaddockWindows').find(w => w.id === 'pw-on-open');
    expect(pw.dateClosed).toBeNull();
  });

  it('does not touch PWs that are already closed', () => {
    seedEvent('e1', { dateOut: '2026-04-10' });
    seedPw('pw-closed', { eventId: 'e1', locationId: 'L1', dateClosed: '2026-04-08' });

    closePaddockWindowOrphans();
    const pw = getAll('eventPaddockWindows').find(w => w.id === 'pw-closed');
    expect(pw.dateClosed).toBe('2026-04-08');
  });

  it('sets the flag and is a no-op on second run', () => {
    seedEvent('e1', { dateOut: '2026-04-10' });
    seedPw('pw1', { eventId: 'e1', locationId: 'L1', dateClosed: null });

    const first = closePaddockWindowOrphans();
    expect(first.closed).toBe(1);

    // Seed another orphan; a second run should not see it because the flag is set.
    seedPw('pw2', { eventId: 'e1', locationId: 'L2', dateClosed: null });
    const second = closePaddockWindowOrphans();
    expect(second.scanned).toBe(0);
    expect(second.closed).toBe(0);
    const pw2 = getAll('eventPaddockWindows').find(w => w.id === 'pw2');
    expect(pw2.dateClosed).toBeNull(); // untouched
  });

  it('force=true overrides the flag (test affordance)', () => {
    seedEvent('e1', { dateOut: '2026-04-10' });
    seedPw('pw1', { eventId: 'e1', locationId: 'L1', dateClosed: null });

    closePaddockWindowOrphans();              // sets flag
    seedPw('pw2', { eventId: 'e1', locationId: 'L2', dateClosed: null });

    const forced = closePaddockWindowOrphans({ force: true });
    expect(forced.closed).toBe(1);
    const pw2 = getAll('eventPaddockWindows').find(w => w.id === 'pw2');
    expect(pw2.dateClosed).toBe('2026-04-10');
  });
});
