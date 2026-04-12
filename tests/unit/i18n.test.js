/** @file i18n tests — key lookup, interpolation, missing key fallback */
import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale } from '../../src/i18n/i18n.js';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('en', {
      app: { name: 'Get The Hay Out' },
      nav: { dashboard: 'Dashboard', events: 'Events' },
      event: {
        status: { active: 'Active', closed: 'Closed' },
        daysOn: '{days} days on pasture',
      },
      action: { save: 'Save', cancel: 'Cancel' },
      multi: '{count} items in {place}',
    });
  });

  describe('t() — key lookup', () => {
    it('resolves top-level key', () => {
      expect(t('action.save')).toBe('Save');
    });

    it('resolves nested keys', () => {
      expect(t('event.status.active')).toBe('Active');
    });

    it('resolves deeply nested keys', () => {
      expect(t('app.name')).toBe('Get The Hay Out');
    });
  });

  describe('t() — interpolation', () => {
    it('replaces single placeholder', () => {
      expect(t('event.daysOn', { days: 14 })).toBe('14 days on pasture');
    });

    it('replaces multiple placeholders', () => {
      expect(t('multi', { count: 5, place: 'barn' })).toBe('5 items in barn');
    });

    it('replaces repeated placeholder', () => {
      setLocale('en', { repeat: '{x} and {x}' });
      expect(t('repeat', { x: 'hello' })).toBe('hello and hello');
    });
  });

  describe('t() — missing key fallback', () => {
    it('returns the key itself for missing key', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('returns the key for partially valid path', () => {
      expect(t('event.status.unknown')).toBe('event.status.unknown');
    });

    it('returns the key for completely unknown top-level', () => {
      expect(t('zzz')).toBe('zzz');
    });

    it('does not return undefined', () => {
      const result = t('missing.deeply.nested');
      expect(result).not.toBeUndefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('setLocale / getLocale', () => {
    it('getLocale returns current code', () => {
      expect(getLocale()).toBe('en');
    });

    it('setLocale changes active locale', () => {
      setLocale('fr', { greeting: 'Bonjour' });
      expect(getLocale()).toBe('fr');
      expect(t('greeting')).toBe('Bonjour');
    });
  });
});
