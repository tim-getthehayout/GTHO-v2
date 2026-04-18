/** @file Tests for store.splitPaddockWindow / closePaddockWindow — OI-0095. */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  _reset, add, getAll, splitPaddockWindow, closePaddockWindow,
} from '../../src/data/store.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as EventEntity from '../../src/entities/event.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVENT_ID = '00000000-0000-0000-0000-0000000000e1';
const LOC_ID = '00000000-0000-0000-0000-0000000000l1';

function seedEvent() {
  add('events', EventEntity.create({ id: EVENT_ID, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}

function seedOpenPW(id, overrides = {}) {
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id,
    operationId: OP,
    eventId: EVENT_ID,
    locationId: LOC_ID,
    dateOpened: '2026-04-01',
    areaPct: 100,
    isStripGraze: false,
    stripGroupId: null,
    ...overrides,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

describe('closePaddockWindow', () => {
  beforeEach(() => { _reset(); seedEvent(); });

  it('stamps dateClosed / timeClosed on the open PW', () => {
    seedOpenPW('pw-1');
    const { closedId } = closePaddockWindow(LOC_ID, EVENT_ID, '2026-04-20', '14:30');
    expect(closedId).toBe('pw-1');
    const pw = getAll('eventPaddockWindows').find(w => w.id === 'pw-1');
    expect(pw.dateClosed).toBe('2026-04-20');
    expect(pw.timeClosed).toBe('14:30');
  });

  it('logs warn and returns {closedId: null} when no open window exists', () => {
    const { closedId } = closePaddockWindow(LOC_ID, EVENT_ID, '2026-04-20', null);
    expect(closedId).toBeNull();
  });
});

describe('splitPaddockWindow', () => {
  beforeEach(() => { _reset(); seedEvent(); });

  it('closes the current window and opens a new one with newState', () => {
    seedOpenPW('pw-1', { areaPct: 100 });
    const { closedId, newId } = splitPaddockWindow(LOC_ID, EVENT_ID, '2026-04-15', null, { areaPct: 50 });
    expect(closedId).toBe('pw-1');
    expect(newId).toBeTruthy();

    const windows = getAll('eventPaddockWindows').filter(w => w.eventId === EVENT_ID && w.locationId === LOC_ID);
    expect(windows).toHaveLength(2);
    const closed = windows.find(w => w.id === closedId);
    const opened = windows.find(w => w.id === newId);

    // Closed row: historical snapshot preserved (areaPct stays 100, dateClosed stamped).
    expect(closed.dateClosed).toBe('2026-04-15');
    expect(closed.areaPct).toBe(100);

    // New row: dateOpened at changeDate, new areaPct applied.
    expect(opened.dateOpened).toBe('2026-04-15');
    expect(opened.dateClosed).toBeNull();
    expect(opened.areaPct).toBe(50);
  });

  it('carries forward isStripGraze and stripGroupId when not overridden', () => {
    seedOpenPW('pw-1', { areaPct: 25, isStripGraze: true, stripGroupId: 'sg-1' });
    const { newId } = splitPaddockWindow(LOC_ID, EVENT_ID, '2026-04-15', null, { areaPct: 30 });
    const opened = getAll('eventPaddockWindows').find(w => w.id === newId);
    expect(opened.isStripGraze).toBe(true);
    expect(opened.stripGroupId).toBe('sg-1');
    expect(opened.areaPct).toBe(30);
  });

  it('overrides isStripGraze and stripGroupId when newState provides them', () => {
    seedOpenPW('pw-1', { areaPct: 25, isStripGraze: true, stripGroupId: 'sg-1' });
    const { newId } = splitPaddockWindow(LOC_ID, EVENT_ID, '2026-04-15', null, {
      areaPct: 100, isStripGraze: false, stripGroupId: null,
    });
    const opened = getAll('eventPaddockWindows').find(w => w.id === newId);
    expect(opened.isStripGraze).toBe(false);
    expect(opened.stripGroupId).toBeNull();
    expect(opened.areaPct).toBe(100);
  });

  it('logs warn and returns nulls when no open window exists', () => {
    const result = splitPaddockWindow(LOC_ID, EVENT_ID, '2026-04-15', null, { areaPct: 50 });
    expect(result).toEqual({ closedId: null, newId: null });
  });
});
