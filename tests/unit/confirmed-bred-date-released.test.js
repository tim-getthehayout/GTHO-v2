/**
 * @file Released schema 46 — animals.confirmed_bred_date is in shapes and restore proofs
 * at the real compiled ceiling 47.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import {
  RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_COLUMNS,
} from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';
import * as Animal from '../../src/entities/animal.js';
import { releasedColumns } from '../../src/data/schema-columns.js';

beforeEach(() => setLocale('en', en));

describe('confirmed_bred_date released at schema 47', () => {
  it('raises the ceiling to 47, clears the held set, and keeps the staged proof', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(47);
    expect(CURRENT_SCHEMA_VERSION).toBe(47);
    expect(HELD_SCHEMA_VERSIONS).toEqual([]);
    expect(STAGED_COLUMNS[46]).toEqual({ animals: ['confirmed_bred_date'] });
  });

  it('releasedColumns(46) includes null and a date', () => {
    expect(releasedColumns(46, { confirmed_bred_date: null })).toEqual({ confirmed_bred_date: null });
    expect(releasedColumns(46, { confirmed_bred_date: '2026-05-01' })).toEqual({ confirmed_bred_date: '2026-05-01' });
  });

  it('animal toSupabaseShape includes confirmed_bred_date', () => {
    const base = Animal.create({ operationId: 'op', sex: 'female' });
    expect(Animal.toSupabaseShape(base)).toMatchObject({ confirmed_bred_date: null });
    expect(Animal.toSupabaseShape({ ...base, confirmedBredDate: '2026-05-01' })).toMatchObject({
      confirmed_bred_date: '2026-05-01',
    });
  });

  it('animal create/fromSupabaseShape default confirmedBredDate to null', () => {
    expect(Animal.create({ operationId: 'op', sex: 'female' }).confirmedBredDate).toBeNull();
    expect(Animal.fromSupabaseShape({
      id: 'a', operation_id: 'op', sex: 'female', confirmed_bred: false,
    }).confirmedBredDate).toBeNull();
    expect(Animal.fromSupabaseShape({
      id: 'a', operation_id: 'op', sex: 'female', confirmed_bred: true, confirmed_bred_date: '2026-05-01',
    }).confirmedBredDate).toBe('2026-05-01');
  });

  it('backup 45→46 sets missing confirmed_bred_date to null and stamps 46', () => {
    const backup = {
      schema_version: 45,
      tables: {
        operations: [{ id: 'op', schema_version: 45 }],
        animals: [
          { id: 'a1', confirmed_bred: false },
          { id: 'a2', confirmed_bred: true, confirmed_bred_date: '2026-05-01' },
        ],
      },
    };
    const out = BACKUP_MIGRATIONS[45](structuredClone(backup));
    expect(out.schema_version).toBe(46);
    expect(out.tables.operations[0].schema_version).toBe(46);
    expect(out.tables.animals[0].confirmed_bred_date).toBeNull();
    expect(out.tables.animals[1].confirmed_bred_date).toBe('2026-05-01');
  });
});
