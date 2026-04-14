/** @file Invite system tests — CP-66. URL generation, token extraction, backup migration chain. */
import { describe, it, expect } from 'vitest';
import { generateInviteUrl } from '../../src/features/settings/member-management.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';

describe('CP-66: invite system', () => {
  describe('generateInviteUrl', () => {
    it('produces correct URL format', () => {
      const url = generateInviteUrl('abc-def-123');
      expect(url).toContain('#invite=abc-def-123');
    });

    it('includes the origin', () => {
      const url = generateInviteUrl('token-1');
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  describe('backup migration chain', () => {
    it('has migration for 14 → 15', () => {
      expect(typeof BACKUP_MIGRATIONS[14]).toBe('function');
      const backup = { schema_version: 14, tables: {} };
      const result = BACKUP_MIGRATIONS[14](backup);
      expect(result.schema_version).toBe(15);
    });

    it('has migration for 15 → 16', () => {
      expect(typeof BACKUP_MIGRATIONS[15]).toBe('function');
      const backup = { schema_version: 15, tables: {} };
      const result = BACKUP_MIGRATIONS[15](backup);
      expect(result.schema_version).toBe(16);
    });

    it('full chain migrates 14 → 16', () => {
      let backup = { schema_version: 14, tables: {} };
      backup = BACKUP_MIGRATIONS[14](backup);
      backup = BACKUP_MIGRATIONS[15](backup);
      expect(backup.schema_version).toBe(16);
    });
  });
});
