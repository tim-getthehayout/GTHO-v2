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
  // 017 → 018: Granular RLS policies (OI-0054). No backup shape change.
  17: (b) => { b.schema_version = 18; return b; },
  // 018 → 019: Add operation_id to 4 child tables (OI-0055). Backfill from parent.
  18: (backup) => {
    const tables = {
      event_feed_check_items: { parentTable: 'event_feed_checks', fkCol: 'feed_check_id' },
      harvest_event_fields:   { parentTable: 'harvest_events',    fkCol: 'harvest_event_id' },
      survey_draft_entries:   { parentTable: 'surveys',           fkCol: 'survey_id' },
      todo_assignments:       { parentTable: 'todos',             fkCol: 'todo_id' },
    };
    for (const [table, { parentTable, fkCol }] of Object.entries(tables)) {
      const parentRows = backup.tables[parentTable] || [];
      const parentMap = Object.fromEntries(parentRows.map(r => [r.id, r.operation_id]));
      const rows = backup.tables[table] || [];
      for (const row of rows) {
        row.operation_id = parentMap[row[fkCol]] || backup.operation_id;
      }
    }
    backup.schema_version = 19;
    return backup;
  },
  // 019 → 020: Fix operation_members RLS recursion (OI-0058). No backup shape change.
  19: (b) => { b.schema_version = 20; return b; },
};
