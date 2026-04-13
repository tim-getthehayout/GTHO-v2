/** @file Store tests — init, getters, actions, subscribers */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init, getAll, getById, getByField, add, update, remove,
  subscribe, setSyncAdapter, mergeRemote, _reset, ENTITY_TYPES,
} from '../../src/data/store.js';

// Simple entity helpers for testing
const validateOk = () => ({ valid: true, errors: [] });
const validateFail = () => ({ valid: false, errors: ['missing name'] });
const toSb = (r) => ({ ...r });

describe('store', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
  });

  describe('ENTITY_TYPES', () => {
    it('has 51 entity types', () => {
      expect(ENTITY_TYPES).toHaveLength(51);
    });
  });

  describe('init', () => {
    it('loads data from localStorage', () => {
      localStorage.setItem('gtho_v2_locations', JSON.stringify([
        { id: '1', name: 'Paddock A' },
      ]));
      init();
      expect(getAll('locations')).toHaveLength(1);
      expect(getAll('locations')[0].name).toBe('Paddock A');
    });

    it('starts empty when localStorage is empty', () => {
      init();
      expect(getAll('locations')).toEqual([]);
    });
  });

  describe('getters', () => {
    it('getAll returns a copy, not reference', () => {
      const record = { id: '1', name: 'Test' };
      add('locations', record, validateOk);
      const result = getAll('locations');
      result.push({ id: 'rogue' });
      expect(getAll('locations')).toHaveLength(1);
    });

    it('getById returns a copy', () => {
      const record = { id: '1', name: 'Test' };
      add('locations', record, validateOk);
      const result = getById('locations', '1');
      result.name = 'Modified';
      expect(getById('locations', '1').name).toBe('Test');
    });

    it('getById returns undefined for missing id', () => {
      expect(getById('locations', 'nope')).toBeUndefined();
    });

    it('getByField filters correctly', () => {
      add('locations', { id: '1', name: 'A', farmId: 'f1' }, validateOk);
      add('locations', { id: '2', name: 'B', farmId: 'f2' }, validateOk);
      add('locations', { id: '3', name: 'C', farmId: 'f1' }, validateOk);
      expect(getByField('locations', 'farmId', 'f1')).toHaveLength(2);
    });
  });

  describe('actions', () => {
    it('add validates before mutating', () => {
      expect(() => add('locations', { id: '1' }, validateFail)).toThrow('Validation failed');
      expect(getAll('locations')).toHaveLength(0);
    });

    it('add persists to localStorage', () => {
      add('locations', { id: '1', name: 'Test' }, validateOk);
      const stored = JSON.parse(localStorage.getItem('gtho_v2_locations'));
      expect(stored).toHaveLength(1);
    });

    it('add queues sync when adapter is set', () => {
      const pushMock = vi.fn().mockResolvedValue({ id: '1', success: true });
      setSyncAdapter({ push: pushMock });

      add('locations', { id: '1', name: 'Test' }, validateOk, toSb, 'locations');
      expect(pushMock).toHaveBeenCalledWith('locations', { id: '1', name: 'Test' });
    });

    it('update validates before mutating', () => {
      add('locations', { id: '1', name: 'Test' }, validateOk);
      expect(() => update('locations', '1', { name: '' }, validateFail)).toThrow('Validation failed');
    });

    it('update modifies record in place', () => {
      add('locations', { id: '1', name: 'Old' }, validateOk);
      update('locations', '1', { name: 'New' }, validateOk);
      expect(getById('locations', '1').name).toBe('New');
    });

    it('update throws for missing id', () => {
      expect(() => update('locations', 'nope', {}, validateOk)).toThrow('not found');
    });

    it('remove deletes record', () => {
      add('locations', { id: '1', name: 'Test' }, validateOk);
      remove('locations', '1');
      expect(getAll('locations')).toHaveLength(0);
    });

    it('remove persists to localStorage', () => {
      add('locations', { id: '1', name: 'Test' }, validateOk);
      remove('locations', '1');
      const stored = JSON.parse(localStorage.getItem('gtho_v2_locations'));
      expect(stored).toHaveLength(0);
    });
  });

  describe('subscribers', () => {
    it('subscribe is called on add', () => {
      const cb = vi.fn();
      subscribe('locations', cb);
      add('locations', { id: '1', name: 'Test' }, validateOk);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith([{ id: '1', name: 'Test' }]);
    });

    it('subscribe is called on update', () => {
      add('locations', { id: '1', name: 'Old' }, validateOk);
      const cb = vi.fn();
      subscribe('locations', cb);
      update('locations', '1', { name: 'New' }, validateOk);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('subscribe is called on remove', () => {
      add('locations', { id: '1', name: 'Test' }, validateOk);
      const cb = vi.fn();
      subscribe('locations', cb);
      remove('locations', '1');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith([]);
    });

    it('unsubscribe stops notifications', () => {
      const cb = vi.fn();
      const unsub = subscribe('locations', cb);
      unsub();
      add('locations', { id: '1', name: 'Test' }, validateOk);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('mergeRemote', () => {
    it('adds new records from remote', () => {
      const result = mergeRemote('locations', [
        { id: 'r1', name: 'Remote Paddock', updatedAt: '2026-04-12T10:00:00Z' },
      ]);
      expect(result).toEqual({ added: 1, updated: 0 });
      expect(getAll('locations')).toHaveLength(1);
      expect(getById('locations', 'r1').name).toBe('Remote Paddock');
    });

    it('updates existing record when remote is newer', () => {
      add('locations', { id: 'x1', name: 'Old', updatedAt: '2026-04-12T08:00:00Z' }, validateOk);
      const result = mergeRemote('locations', [
        { id: 'x1', name: 'Updated', updatedAt: '2026-04-12T10:00:00Z' },
      ]);
      expect(result).toEqual({ added: 0, updated: 1 });
      expect(getById('locations', 'x1').name).toBe('Updated');
    });

    it('keeps local record when local is newer', () => {
      add('locations', { id: 'x2', name: 'Local Newer', updatedAt: '2026-04-12T12:00:00Z' }, validateOk);
      const result = mergeRemote('locations', [
        { id: 'x2', name: 'Remote Older', updatedAt: '2026-04-12T08:00:00Z' },
      ]);
      expect(result).toEqual({ added: 0, updated: 0 });
      expect(getById('locations', 'x2').name).toBe('Local Newer');
    });

    it('notifies subscribers on merge', () => {
      const cb = vi.fn();
      subscribe('locations', cb);
      mergeRemote('locations', [
        { id: 'n1', name: 'New', updatedAt: '2026-04-12T10:00:00Z' },
      ]);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('does not notify when nothing changed', () => {
      const cb = vi.fn();
      subscribe('locations', cb);
      mergeRemote('locations', []);
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
