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
  // 020 → 021: Create event_observations table (OI-0063, SP-2). New table — old backups won't have it.
  20: (b) => { b.schema_version = 21; return b; },
  // 021 → 022: Add bale_ring_residue_count to event_observations + bale_ring_residue_diameter_ft to farm_settings (SP-9).
  21: (b) => { b.schema_version = 22; return b; },
  // 022 → 023: Add entry_type, destination_type, destination_event_id to event_feed_entries (SP-10 §8a).
  22: (b) => { b.schema_version = 23; return b; },
  // 023 → 024: OI-0090 / SP-11 Part 3 — groups.archived boolean → groups.archived_at timestamptz.
  23: (b) => {
    const rows = (b.tables && b.tables.groups) || b.groups || [];
    for (const g of rows) {
      if (g.archived === true) {
        g.archived_at = g.updated_at || b.exported_at || new Date().toISOString();
      } else {
        g.archived_at = null;
      }
      delete g.archived;
    }
    b.schema_version = 24;
    return b;
  },
  // 024 → 025: OI-0073 Part B — one-shot data cleanup (close orphan open event_group_windows).
  //            No backup shape change — data migration only.
  24: (b) => { b.schema_version = 25; return b; },
  // 025 → 026: OI-0099 Class B — animals.confirmed_bred boolean NOT NULL DEFAULT false.
  //            No-op: new column defaults to false, so backups from before this version
  //            (which have no confirmed_bred key on animals rows) resolve correctly when
  //            Supabase re-inserts them — the column default supplies the value.
  25: (b) => { b.schema_version = 26; return b; },
  // 026 → 027: OI-0111 — rename farm_settings.bale_ring_residue_diameter_ft →
  //            bale_ring_residue_diameter_cm and convert stored value (ft × 30.48).
  //            Part of the Settings UI unit-conversion sweep: the column was the
  //            single farm_settings holdout storing imperial natively; it now
  //            follows the metric-internal rule.
  26: (b) => {
    const rows = (b.tables && b.tables.farm_settings) || [];
    for (const fs of rows) {
      if (Object.prototype.hasOwnProperty.call(fs, 'bale_ring_residue_diameter_ft')) {
        const ft = fs.bale_ring_residue_diameter_ft;
        fs.bale_ring_residue_diameter_cm = ft != null
          ? Math.round(Number(ft) * 30.48 * 100) / 100
          : null;
        delete fs.bale_ring_residue_diameter_ft;
      }
    }
    b.schema_version = 27;
    return b;
  },
};
