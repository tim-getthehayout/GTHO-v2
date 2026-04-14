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
  // No entries yet — CP-55 ships at schema_version = 14 (migration 015).
  // Future schema changes add entries here in lockstep per CLAUDE.md "Export/Import Spec Sync Rule."
};
