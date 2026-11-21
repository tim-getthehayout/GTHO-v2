/**
 * @file Held-gate for schema 46 — animals.confirmed_bred_date, replayed at a mocked ceiling 45
 * (the state before 046/047 were released). The real ceiling is 47 now; see
 * confirmed-bred-date-released.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 45, HELD_SCHEMA_VERSIONS: [46, 47] }));
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

describe('confirmed_bred_date held at mocked ceiling 45', () => {
  it('at ceiling 45, 46 and 47 are held and staged animals.confirmed_bred_date is kept', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(45);
    expect(CURRENT_SCHEMA_VERSION).toBe(45);
    expect(HELD_SCHEMA_VERSIONS).toEqual([46, 47]);
    expect(STAGED_COLUMNS[46]).toEqual({ animals: ['confirmed_bred_date'] });
  });

  it('releasedColumns(46) omits null and throws on a non-null date while held', () => {
    expect(releasedColumns(46, { confirmed_bred_date: null })).toEqual({});
    expect(() => releasedColumns(46, { confirmed_bred_date: '2026-05-01' })).toThrow(/migration 46|unreleased/i);
  });

  it('animal toSupabaseShape omits confirmed_bred_date while held; non-null throws', () => {
    const base = Animal.create({ operationId: 'op', sex: 'female' });
    expect(Animal.toSupabaseShape(base)).not.toHaveProperty('confirmed_bred_date');
    expect(Animal.toSupabaseShape({ ...base, confirmedBredDate: null })).not.toHaveProperty('confirmed_bred_date');
    expect(() => Animal.toSupabaseShape({ ...base, confirmedBredDate: '2026-05-01' })).toThrow(/migration 46|unreleased/i);
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
    expect(BACKUP_MIGRATIONS[45]).toBeTypeOf('function');
  });
});
