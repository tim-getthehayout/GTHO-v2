/** @file Calendar state tests — CP-54. Reducers, URL round-trip, defaults. */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCalendarState,
  getViewMode,
  setZoom,
  setJump,
  addForecasterGroup,
  removeForecasterGroup,
  clearForecasterGroups,
  setPeriod,
  toggleConfinement,
  setView,
  readStateFromUrl,
  resetCalendarState,
} from '../../src/features/events/calendar-state.js';

describe('calendar-state', () => {
  beforeEach(() => {
    resetCalendarState();
    window.location.hash = '#/events';
  });

  describe('defaults', () => {
    it('returns correct first-load defaults', () => {
      const s = getCalendarState();
      expect(s.zoom).toBe('week');
      expect(s.anchor).toBe('today');
      expect(s.groups).toEqual([]);
      expect(s.period).toBeNull();
      expect(s.showConfinement).toBe(false);
      expect(s.view).toBe('calendar');
    });

    it('defaults to estimated view mode', () => {
      expect(getViewMode()).toBe('estimated');
    });
  });

  describe('setZoom', () => {
    it('accepts valid zoom values', () => {
      setZoom('day');
      expect(getCalendarState().zoom).toBe('day');
      setZoom('month');
      expect(getCalendarState().zoom).toBe('month');
      setZoom('last90');
      expect(getCalendarState().zoom).toBe('last90');
    });

    it('ignores invalid zoom values', () => {
      setZoom('month');
      setZoom('year'); // invalid — should keep 'month'
      expect(getCalendarState().zoom).toBe('month');
    });
  });

  describe('setJump', () => {
    it('accepts presets', () => {
      setJump('last30');
      expect(getCalendarState().anchor).toBe('last30');
      setJump('thisYear');
      expect(getCalendarState().anchor).toBe('thisYear');
    });

    it('accepts ISO date', () => {
      setJump('2026-01-15');
      expect(getCalendarState().anchor).toBe('2026-01-15');
    });

    it('ignores invalid anchor', () => {
      setJump('last30');
      setJump('bogus');
      expect(getCalendarState().anchor).toBe('last30');
    });
  });

  describe('forecaster groups', () => {
    it('addForecasterGroup adds unique IDs', () => {
      addForecasterGroup('g1');
      addForecasterGroup('g2');
      addForecasterGroup('g1'); // duplicate
      expect(getCalendarState().groups).toEqual(['g1', 'g2']);
    });

    it('removeForecasterGroup removes by ID', () => {
      addForecasterGroup('g1');
      addForecasterGroup('g2');
      removeForecasterGroup('g1');
      expect(getCalendarState().groups).toEqual(['g2']);
    });

    it('clearForecasterGroups resets groups and period', () => {
      addForecasterGroup('g1');
      setPeriod(3);
      clearForecasterGroups();
      expect(getCalendarState().groups).toEqual([]);
      expect(getCalendarState().period).toBeNull();
    });
  });

  describe('setPeriod', () => {
    it('accepts positive numbers', () => {
      setPeriod(3);
      expect(getCalendarState().period).toBe(3);
    });

    it('accepts string numbers', () => {
      setPeriod('7');
      expect(getCalendarState().period).toBe(7);
    });

    it('null clears period', () => {
      setPeriod(3);
      setPeriod(null);
      expect(getCalendarState().period).toBeNull();
    });
  });

  describe('toggleConfinement', () => {
    it('toggles on and off', () => {
      toggleConfinement();
      expect(getCalendarState().showConfinement).toBe(true);
      toggleConfinement();
      expect(getCalendarState().showConfinement).toBe(false);
    });
  });

  describe('setView', () => {
    it('switches between calendar and list', () => {
      setView('list');
      expect(getCalendarState().view).toBe('list');
      setView('calendar');
      expect(getCalendarState().view).toBe('calendar');
    });

    it('ignores invalid view', () => {
      setView('grid');
      expect(getCalendarState().view).toBe('calendar');
    });
  });

  describe('getViewMode', () => {
    it('returns estimated when no groups', () => {
      expect(getViewMode()).toBe('estimated');
    });

    it('returns estimated when groups but no period', () => {
      addForecasterGroup('g1');
      expect(getViewMode()).toBe('estimated');
    });

    it('returns forecast when groups + period', () => {
      addForecasterGroup('g1');
      setPeriod(3);
      expect(getViewMode()).toBe('forecast');
    });
  });

  describe('URL round-trip', () => {
    it('serializes non-default state to URL', () => {
      setZoom('month');
      setJump('2026-01-01');
      addForecasterGroup('id1');
      addForecasterGroup('id2');
      setPeriod(3);
      toggleConfinement();
      setView('list');

      const hash = window.location.hash;
      expect(hash).toContain('zoom=month');
      expect(hash).toContain('anchor=2026-01-01');
      expect(hash).toContain('groups=id1%2Cid2');
      expect(hash).toContain('period=3');
      expect(hash).toContain('showConfinement=1');
      expect(hash).toContain('view=list');
    });

    it('omits default values from URL', () => {
      // All defaults — URL should be clean
      resetCalendarState();
      setZoom('week'); // triggers syncUrl with default
      const hash = window.location.hash;
      expect(hash).toBe('#/events');
    });

    it('readStateFromUrl parses deep-link', () => {
      window.location.hash = '#/events?zoom=month&anchor=2026-01-01&groups=id1,id2&period=3&showConfinement=1&view=list';
      const s = readStateFromUrl();
      expect(s.zoom).toBe('month');
      expect(s.anchor).toBe('2026-01-01');
      expect(s.groups).toEqual(['id1', 'id2']);
      expect(s.period).toBe(3);
      expect(s.showConfinement).toBe(true);
      expect(s.view).toBe('list');
    });

    it('readStateFromUrl falls back to defaults for missing params', () => {
      window.location.hash = '#/events?zoom=day';
      const s = readStateFromUrl();
      expect(s.zoom).toBe('day');
      expect(s.anchor).toBe('today');
      expect(s.groups).toEqual([]);
      expect(s.period).toBeNull();
      expect(s.showConfinement).toBe(false);
      expect(s.view).toBe('calendar');
    });

    it('readStateFromUrl ignores invalid param values', () => {
      window.location.hash = '#/events?zoom=year&view=grid';
      const s = readStateFromUrl();
      expect(s.zoom).toBe('week'); // falls back
      expect(s.view).toBe('calendar'); // falls back
    });
  });
});
