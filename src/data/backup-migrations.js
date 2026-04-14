/**
 * @file Backup migration chain registry — CP-55.
 * See V2_MIGRATION_PLAN.md §5.9.
 *
 * Each key is a `from_version` integer. The value is a function that receives
 * the backup JSON at that version and returns the backup JSON at the next version.
 * Applied in order during CP-56 import when backup.schema_version < current.
 *
 * Example (when migration 016 lands):
 *   15: (b) => { b.tables.new_table = []; b.schema_version = 16; return b; },
 */

export const BACKUP_MIGRATIONS = {
  // 014 → 015: schema_version column on operations (no backup shape change — column already in envelope)
  14: (b) => { b.schema_version = 15; return b; },
  // 015 → 016: invite_token on operation_members (CP-66). Not in backup (§5.4 excludes operation_members).
  15: (b) => { b.schema_version = 16; return b; },
  // 016 → 017: RLS policy fix (OI-0053). No backup shape change.
  16: (b) => { b.schema_version = 17; return b; },
};
