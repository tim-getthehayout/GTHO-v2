import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BACKUP_TABLES } from '../../src/data/backup-export.js';
import { FK_ORDER, CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';

describe('backup-sync invariants', () => {
  test('BACKUP_TABLES and FK_ORDER have the same length', () => {
    // If they diverge, a new table was added to one side of the backup pipeline
    // but not the other. Backups will silently drop data. See OI-0087.
    expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length);
  });

  test('every BACKUP_TABLES key is in FK_ORDER', () => {
    const exportKeys = Object.keys(BACKUP_TABLES).sort();
    const importOrder = [...FK_ORDER].sort();
    expect(exportKeys).toEqual(importOrder);
  });

  test('CURRENT_SCHEMA_VERSION matches latest migration file', () => {
    // If a migration lands without bumping this constant, current-version
    // backups are not round-trippable through the importer. See OI-0088.
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const nums = fs.readdirSync(migrationsDir)
      .map(f => parseInt(f.split('_')[0], 10))
      .filter(n => !Number.isNaN(n));
    expect(CURRENT_SCHEMA_VERSION).toBe(Math.max(...nums));
  });
});
