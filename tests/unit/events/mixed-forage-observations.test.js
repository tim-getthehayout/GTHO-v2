/** @file Mixed events grey confinement forage per location and do not write land observations there. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter } from '../../../src/data/store.js';
import { openCloseEventSheet } from '../../../src/features/events/close.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet } from '../../../src/features/events/submove.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC_LAND = '00000000-0000-0000-0000-0000000001a1';
const LOC_PEN = '00000000-0000-0000-0000-0000000001a2';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('locations', LocationEntity.create({ id: LOC_LAND, operationId: OP, farmId: FARM, name: 'E-1', type: 'land' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({ id: LOC_PEN, operationId: OP, farmId: FARM, name: 'Barn', type: 'confinement' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

function openWindow(id, locationId, dateOpened = '2026-04-01') {
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id, operationId: OP, eventId: EVT, locationId, dateOpened,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

describe('mixed-event forage is per location', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    setSyncAdapter(null);
    seed();
  });

  it('the close sheet greys only the confinement location and leaves land active', () => {
    openWindow('pw-land', LOC_LAND);
    openWindow('pw-pen', LOC_PEN);
    const evt = getAll('events').find(e => e.id === EVT);
    openCloseEventSheet(evt, OP);
    const wrap = document.querySelector('[data-testid="close-event-postgraze"]');
    const pen = document.querySelector(`[data-testid="close-event-postgraze-inactive-${LOC_PEN}"]`);
    expect(wrap).toBeTruthy();
    expect(pen).toBeTruthy();
    expect(pen.className).toContain('confinement-forage-inactive');
    expect(wrap.querySelector('.obs-post-graze-card')?.closest('.confinement-forage-inactive')).toBeNull();
    expect(pen.querySelector('input, select, textarea, button')?.disabled !== false || pen.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('closing mixed windows writes a land observation and skips confinement', () => {
    openWindow('pw-land', LOC_LAND);
    openWindow('pw-pen', LOC_PEN);
    const evt = getAll('events').find(e => e.id === EVT);
    openSubmoveCloseSheet(getAll('eventPaddockWindows').filter(w => w.eventId === EVT), OP);
    expect(document.querySelector(`[data-testid="submove-close-postgraze-inactive-${LOC_PEN}"]`)).toBeTruthy();
    expect(document.querySelector('[data-testid="submove-close-postgraze"] .obs-post-graze-card')?.closest('.confinement-forage-inactive')).toBeNull();
    document.querySelector('[data-testid="submove-close-save"]').click();
    const observations = getAll('paddockObservations');
    expect(observations.some(row => row.locationId === LOC_LAND && row.type === 'close')).toBe(true);
    expect(observations.some(row => row.locationId === LOC_PEN)).toBe(false);
  });
});
