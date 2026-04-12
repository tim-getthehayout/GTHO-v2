/** @file localStorage wrapper tests */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveToStorage, loadFromStorage, clearStorage } from '../../src/data/local-storage.js';

describe('local-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('save/load round-trip', () => {
    it('saves and loads an array', () => {
      const data = [{ id: '1', name: 'Test' }, { id: '2', name: 'Test2' }];
      saveToStorage('events', data);
      expect(loadFromStorage('events')).toEqual(data);
    });

    it('saves empty array', () => {
      saveToStorage('events', []);
      expect(loadFromStorage('events')).toEqual([]);
    });
  });

  describe('loadFromStorage', () => {
    it('returns empty array for missing key', () => {
      expect(loadFromStorage('nonexistent')).toEqual([]);
    });
  });

  describe('clearStorage', () => {
    it('removes all gtho_v2_ keys', () => {
      saveToStorage('events', [{ id: '1' }]);
      saveToStorage('locations', [{ id: '2' }]);
      localStorage.setItem('unrelated_key', 'keep me');

      clearStorage();

      expect(loadFromStorage('events')).toEqual([]);
      expect(loadFromStorage('locations')).toEqual([]);
      expect(localStorage.getItem('unrelated_key')).toBe('keep me');
    });
  });
});
