# Live Supabase Schema Dump — 2026-04-17

Generated for the local-only fields audit (see `session_briefs/SESSION_BRIEF_2026-04-17_live-schema-dump.md`).

- Source: Supabase production database, queried via MCP at 2026-04-17.
- Latest migration file on disk: `supabase/migrations/023_feed_removal_columns.sql`.
- `operations.schema_version` from Q5: **23**.

## Q1 — Tables

```json
[
  {
    "table_name": "ai_bulls"
  },
  {
    "table_name": "amendment_locations"
  },
  {
    "table_name": "amendments"
  },
  {
    "table_name": "animal_bcs_scores"
  },
  {
    "table_name": "animal_breeding_records"
  },
  {
    "table_name": "animal_calving_records"
  },
  {
    "table_name": "animal_classes"
  },
  {
    "table_name": "animal_group_memberships"
  },
  {
    "table_name": "animal_heat_records"
  },
  {
    "table_name": "animal_notes"
  },
  {
    "table_name": "animal_treatments"
  },
  {
    "table_name": "animal_weight_records"
  },
  {
    "table_name": "animals"
  },
  {
    "table_name": "app_logs"
  },
  {
    "table_name": "batch_adjustments"
  },
  {
    "table_name": "batch_nutritional_profiles"
  },
  {
    "table_name": "batches"
  },
  {
    "table_name": "dose_units"
  },
  {
    "table_name": "event_feed_check_items"
  },
  {
    "table_name": "event_feed_checks"
  },
  {
    "table_name": "event_feed_entries"
  },
  {
    "table_name": "event_group_windows"
  },
  {
    "table_name": "event_observations"
  },
  {
    "table_name": "event_paddock_windows"
  },
  {
    "table_name": "events"
  },
  {
    "table_name": "farm_settings"
  },
  {
    "table_name": "farms"
  },
  {
    "table_name": "feed_types"
  },
  {
    "table_name": "forage_types"
  },
  {
    "table_name": "groups"
  },
  {
    "table_name": "harvest_event_fields"
  },
  {
    "table_name": "harvest_events"
  },
  {
    "table_name": "input_product_categories"
  },
  {
    "table_name": "input_product_units"
  },
  {
    "table_name": "input_products"
  },
  {
    "table_name": "locations"
  },
  {
    "table_name": "manure_batch_transactions"
  },
  {
    "table_name": "manure_batches"
  },
  {
    "table_name": "npk_price_history"
  },
  {
    "table_name": "operation_members"
  },
  {
    "table_name": "operations"
  },
  {
    "table_name": "paddock_observations"
  },
  {
    "table_name": "release_notes"
  },
  {
    "table_name": "soil_tests"
  },
  {
    "table_name": "spreaders"
  },
  {
    "table_name": "submissions"
  },
  {
    "table_name": "survey_draft_entries"
  },
  {
    "table_name": "surveys"
  },
  {
    "table_name": "todo_assignments"
  },
  {
    "table_name": "todos"
  },
  {
    "table_name": "treatment_categories"
  },
  {
    "table_name": "treatment_types"
  },
  {
    "table_name": "user_preferences"
  }
]
```

## Q2 — Columns

```json
[
  {
    "table_name": "ai_bulls",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "ai_bulls",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "ai_bulls",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "ai_bulls",
    "column_name": "breed",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "ai_bulls",
    "column_name": "tag",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "ai_bulls",
    "column_name": "reg_num",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "ai_bulls",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "ai_bulls",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "ai_bulls",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "amendment_locations",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "amendment_locations",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "amendment_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "qty",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "n_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "p_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "k_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "s_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "ca_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "mg_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "cu_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "fe_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "mn_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "mo_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "zn_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "b_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "cl_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "area_ha",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendment_locations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "amendment_locations",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "amendments",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "amendments",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "applied_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "source_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "input_product_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "manure_batch_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "spreader_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "total_qty",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "qty_unit_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "cost_override",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "amendments",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "amendments",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "scored_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "score",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "likely_cull",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_bcs_scores",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "bred_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "method",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "sire_animal_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "sire_ai_bull_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "semen_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "technician",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "expected_calving",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "confirmed_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_breeding_records",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "dam_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "calf_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "calved_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "sire_animal_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "sire_ai_bull_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "stillbirth",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "dried_off_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_calving_records",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_classes",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_classes",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "species",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "role",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "default_weight_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "dmi_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "dmi_pct_lactating",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "excretion_n_rate",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "excretion_p_rate",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "excretion_k_rate",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "weaning_age_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_classes",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "animal_classes",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_classes",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "group_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "date_joined",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "date_left",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_group_memberships",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "observed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_heat_records",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_notes",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_notes",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_notes",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_notes",
    "column_name": "noted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_notes",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_notes",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_notes",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_treatments",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_treatments",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "treatment_type_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "treated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "product",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "dose_amount",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "dose_unit_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "withdrawal_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_treatments",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_treatments",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "recorded_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "weight_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "source",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animal_weight_records",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animals",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "animals",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "class_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "tag_num",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "eid",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "sex",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "dam_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "sire_animal_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "sire_ai_bull_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "birth_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "weaned",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "weaned_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "active",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "true"
  },
  {
    "table_name": "animals",
    "column_name": "cull_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "cull_reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "cull_notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "animals",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "animals",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "app_logs",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "app_logs",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "session_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "level",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'error'::text"
  },
  {
    "table_name": "app_logs",
    "column_name": "source",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "message",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "stack",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "context",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "app_version",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "app_logs",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "batch_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "adjusted_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "previous_qty",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "new_qty",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "delta",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "reason",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_adjustments",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "batch_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "tested_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "source",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "dm_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "protein_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "adf_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "ndf_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "tdn_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "rfv",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "n_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "p_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "k_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "ca_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "mg_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "s_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "lab",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "batch_nutritional_profiles",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "batches",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "batches",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "feed_type_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "batch_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "source",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'purchase'::text"
  },
  {
    "table_name": "batches",
    "column_name": "quantity",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "remaining",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "unit",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "weight_per_unit_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "dm_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "cost_per_unit",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "purchase_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "batches",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "batches",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "batches",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "dose_units",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "dose_units",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "dose_units",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "dose_units",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "dose_units",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "feed_check_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "batch_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "remaining_quantity",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_feed_check_items",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "event_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "time",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "is_close_reading",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_feed_checks",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "event_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "batch_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "time",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "quantity",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "source_event_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "entry_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'delivery'::text"
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "destination_type",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_feed_entries",
    "column_name": "destination_event_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "event_group_windows",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "event_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "group_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "date_joined",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "time_joined",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "date_left",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "time_left",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "head_count",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "avg_weight_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_group_windows",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_group_windows",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_observations",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "event_observations",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "event_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "paddock_window_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "observation_phase",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "forage_height_cm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "forage_cover_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "forage_quality",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "forage_condition",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "stored_feed_only",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "event_observations",
    "column_name": "post_graze_height_cm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "recovery_min_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "recovery_max_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_observations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_observations",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_observations",
    "column_name": "bale_ring_residue_count",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "event_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "date_opened",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "time_opened",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "date_closed",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "time_closed",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "no_pasture",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "is_strip_graze",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "strip_group_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "area_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": "100"
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "event_paddock_windows",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "events",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "events",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "farm_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "date_in",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "time_in",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "date_out",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "time_out",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "events",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "events",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "events",
    "column_name": "source_event_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farm_settings",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "farm_settings",
    "column_name": "farm_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "farm_settings",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "farm_settings",
    "column_name": "default_au_weight_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "454"
  },
  {
    "table_name": "farm_settings",
    "column_name": "default_residual_height_cm",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "10"
  },
  {
    "table_name": "farm_settings",
    "column_name": "default_utilization_pct",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "65"
  },
  {
    "table_name": "farm_settings",
    "column_name": "recovery_required",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "table_name": "farm_settings",
    "column_name": "default_recovery_min_days",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "21"
  },
  {
    "table_name": "farm_settings",
    "column_name": "default_recovery_max_days",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "60"
  },
  {
    "table_name": "farm_settings",
    "column_name": "n_price_per_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1.21"
  },
  {
    "table_name": "farm_settings",
    "column_name": "p_price_per_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1.43"
  },
  {
    "table_name": "farm_settings",
    "column_name": "k_price_per_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "0.93"
  },
  {
    "table_name": "farm_settings",
    "column_name": "default_manure_rate_kg_per_day",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "27"
  },
  {
    "table_name": "farm_settings",
    "column_name": "feed_day_goal",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "90"
  },
  {
    "table_name": "farm_settings",
    "column_name": "forage_quality_scale_min",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "farm_settings",
    "column_name": "forage_quality_scale_max",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "100"
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_aud_target_pct",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "80"
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_aud_warn_pct",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "60"
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_rotation_target_pct",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "80"
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_rotation_warn_pct",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": "60"
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_npk_warn_per_ha",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_cost_per_day_target",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farm_settings",
    "column_name": "threshold_cost_per_day_warn",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farm_settings",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "farm_settings",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "farm_settings",
    "column_name": "bale_ring_residue_diameter_ft",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "farms",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "address",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "latitude",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "longitude",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "area_hectares",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "farms",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "farms",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "farms",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "feed_types",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "feed_types",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "category",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "unit",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "dm_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "n_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "p_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "k_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "default_weight_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "cutting_number",
    "data_type": "smallint",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "forage_type_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "feed_types",
    "column_name": "harvest_active",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "feed_types",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "feed_types",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "feed_types",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "forage_types",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "forage_types",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "dm_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "n_per_tonne_dm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "p_per_tonne_dm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "k_per_tonne_dm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "dm_kg_per_cm_per_ha",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "min_residual_height_cm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "utilization_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "forage_types",
    "column_name": "is_seeded",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "forage_types",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "forage_types",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "forage_types",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "groups",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "groups",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "groups",
    "column_name": "farm_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "groups",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "groups",
    "column_name": "color",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "groups",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "groups",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "groups",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "harvest_event_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "feed_type_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "quantity",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "weight_per_unit_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "dm_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "cutting_number",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "batch_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "harvest_event_fields",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_events",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "harvest_events",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_events",
    "column_name": "date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "harvest_events",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "harvest_events",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "harvest_events",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "input_product_categories",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "input_product_categories",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "input_product_categories",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "input_product_categories",
    "column_name": "is_default",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "input_product_categories",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "input_product_categories",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "input_product_categories",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "input_product_units",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "input_product_units",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "input_product_units",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "input_product_units",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "input_product_units",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "input_products",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "input_products",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "category_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "n_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "p_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "k_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "s_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "ca_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "mg_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "cu_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "fe_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "mn_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "mo_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "zn_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "b_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "cl_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "cost_per_unit",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "unit_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "input_products",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "input_products",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "input_products",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "locations",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "locations",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "farm_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "land_use",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "area_hectares",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "field_code",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "soil_type",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "forage_type_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "capture_percent",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "locations",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "locations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "locations",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "batch_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "transaction_date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "volume_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "source_event_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "amendment_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "manure_batch_transactions",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "manure_batches",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "manure_batches",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "label",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "source_location_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "estimated_volume_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "n_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "p_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "k_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "s_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "ca_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "mg_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "cu_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "fe_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "mn_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "mo_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "zn_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "b_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "cl_kg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "capture_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "manure_batches",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "manure_batches",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "npk_price_history",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "npk_price_history",
    "column_name": "farm_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "effective_date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "n_price_per_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "p_price_per_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "k_price_per_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "npk_price_history",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "npk_price_history",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "operation_members",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "operation_members",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "display_name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "email",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "role",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'team_member'::text"
  },
  {
    "table_name": "operation_members",
    "column_name": "invited_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "accepted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "operation_members",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "operation_members",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "operation_members",
    "column_name": "invite_token",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "operations",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "operations",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "operations",
    "column_name": "timezone",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "operations",
    "column_name": "currency",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'USD'::text"
  },
  {
    "table_name": "operations",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "operations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "operations",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "operations",
    "column_name": "schema_version",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "14"
  },
  {
    "table_name": "operations",
    "column_name": "unit_system",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'imperial'::text"
  },
  {
    "table_name": "paddock_observations",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "paddock_observations",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "observed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "source",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "source_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "forage_height_cm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "forage_cover_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "forage_quality",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "forage_condition",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "bale_ring_residue_count",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "residual_height_cm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "recovery_min_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "recovery_max_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "paddock_observations",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "paddock_observations",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "release_notes",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "release_notes",
    "column_name": "version",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "release_notes",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "release_notes",
    "column_name": "body",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "release_notes",
    "column_name": "published_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "soil_tests",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "soil_tests",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "tested_at",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "extraction_method",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "n",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "p",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "k",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "s",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "ca",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "mg",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "cu",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "fe",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "mn",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "mo",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "zn",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "b",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "cl",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "unit",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "ph",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "buffer_ph",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "cec",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "base_saturation",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "organic_matter",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "lab",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "soil_tests",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "soil_tests",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "spreaders",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "spreaders",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "spreaders",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "spreaders",
    "column_name": "capacity_kg",
    "data_type": "numeric",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "spreaders",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "spreaders",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "spreaders",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "submissions",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "submissions",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "submitter_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "app",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'gthy'::text"
  },
  {
    "table_name": "submissions",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "category",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "area",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "screen",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "priority",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'normal'::text"
  },
  {
    "table_name": "submissions",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'open'::text"
  },
  {
    "table_name": "submissions",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "version",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "thread",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": "'[]'::jsonb"
  },
  {
    "table_name": "submissions",
    "column_name": "dev_response",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "dev_response_ts",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "first_response_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "resolved_in_version",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "resolution_note",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "oi_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "linked_to",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "submissions",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "submissions",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "survey_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "forage_height_cm",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "forage_cover_pct",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "forage_quality",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "forage_condition",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "bale_ring_residue_count",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "recovery_min_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "recovery_max_days",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "survey_draft_entries",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "surveys",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "surveys",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "surveys",
    "column_name": "survey_date",
    "data_type": "date",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "surveys",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "surveys",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'draft'::text"
  },
  {
    "table_name": "surveys",
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "surveys",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "surveys",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "todo_assignments",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "todo_assignments",
    "column_name": "todo_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "todo_assignments",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "todo_assignments",
    "column_name": "assigned_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "todo_assignments",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "todos",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "description",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'open'::text"
  },
  {
    "table_name": "todos",
    "column_name": "note",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "location_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "animal_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "due_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "created_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "todos",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "todos",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "treatment_categories",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "treatment_categories",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "treatment_categories",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "treatment_categories",
    "column_name": "is_default",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "treatment_categories",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "treatment_categories",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "treatment_categories",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "treatment_types",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "treatment_types",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "treatment_types",
    "column_name": "name",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "treatment_types",
    "column_name": "category_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "treatment_types",
    "column_name": "archived",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "table_name": "treatment_types",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "treatment_types",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "user_preferences",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "user_preferences",
    "column_name": "operation_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "user_preferences",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "user_preferences",
    "column_name": "home_view_mode",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'groups'::text"
  },
  {
    "table_name": "user_preferences",
    "column_name": "default_view_mode",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'detail'::text"
  },
  {
    "table_name": "user_preferences",
    "column_name": "stat_period_days",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "14"
  },
  {
    "table_name": "user_preferences",
    "column_name": "field_mode_quick_actions",
    "data_type": "ARRAY",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "user_preferences",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "user_preferences",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "user_preferences",
    "column_name": "active_farm_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

## Q3 — Foreign Keys

```json
[
  {
    "child_table": "ai_bulls",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "amendment_locations",
    "child_column": "amendment_id",
    "parent_table": "amendments",
    "parent_column": "id"
  },
  {
    "child_table": "amendment_locations",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "amendment_locations",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "amendments",
    "child_column": "input_product_id",
    "parent_table": "input_products",
    "parent_column": "id"
  },
  {
    "child_table": "amendments",
    "child_column": "manure_batch_id",
    "parent_table": "manure_batches",
    "parent_column": "id"
  },
  {
    "child_table": "amendments",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "amendments",
    "child_column": "qty_unit_id",
    "parent_table": "input_product_units",
    "parent_column": "id"
  },
  {
    "child_table": "amendments",
    "child_column": "spreader_id",
    "parent_table": "spreaders",
    "parent_column": "id"
  },
  {
    "child_table": "animal_bcs_scores",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_bcs_scores",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_breeding_records",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_breeding_records",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_breeding_records",
    "child_column": "sire_ai_bull_id",
    "parent_table": "ai_bulls",
    "parent_column": "id"
  },
  {
    "child_table": "animal_breeding_records",
    "child_column": "sire_animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_calving_records",
    "child_column": "calf_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_calving_records",
    "child_column": "dam_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_calving_records",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_calving_records",
    "child_column": "sire_ai_bull_id",
    "parent_table": "ai_bulls",
    "parent_column": "id"
  },
  {
    "child_table": "animal_calving_records",
    "child_column": "sire_animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_classes",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_group_memberships",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_group_memberships",
    "child_column": "group_id",
    "parent_table": "groups",
    "parent_column": "id"
  },
  {
    "child_table": "animal_group_memberships",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_heat_records",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_heat_records",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_notes",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_notes",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_treatments",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_treatments",
    "child_column": "dose_unit_id",
    "parent_table": "dose_units",
    "parent_column": "id"
  },
  {
    "child_table": "animal_treatments",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animal_treatments",
    "child_column": "treatment_type_id",
    "parent_table": "treatment_types",
    "parent_column": "id"
  },
  {
    "child_table": "animal_weight_records",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animal_weight_records",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animals",
    "child_column": "class_id",
    "parent_table": "animal_classes",
    "parent_column": "id"
  },
  {
    "child_table": "animals",
    "child_column": "dam_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "animals",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "animals",
    "child_column": "sire_ai_bull_id",
    "parent_table": "ai_bulls",
    "parent_column": "id"
  },
  {
    "child_table": "animals",
    "child_column": "sire_animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "batch_adjustments",
    "child_column": "adjusted_by",
    "parent_table": "operation_members",
    "parent_column": "id"
  },
  {
    "child_table": "batch_adjustments",
    "child_column": "batch_id",
    "parent_table": "batches",
    "parent_column": "id"
  },
  {
    "child_table": "batch_adjustments",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "batch_nutritional_profiles",
    "child_column": "batch_id",
    "parent_table": "batches",
    "parent_column": "id"
  },
  {
    "child_table": "batch_nutritional_profiles",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "batches",
    "child_column": "feed_type_id",
    "parent_table": "feed_types",
    "parent_column": "id"
  },
  {
    "child_table": "batches",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_check_items",
    "child_column": "batch_id",
    "parent_table": "batches",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_check_items",
    "child_column": "feed_check_id",
    "parent_table": "event_feed_checks",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_check_items",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_check_items",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_checks",
    "child_column": "event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_checks",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_entries",
    "child_column": "batch_id",
    "parent_table": "batches",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_entries",
    "child_column": "destination_event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_entries",
    "child_column": "event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_entries",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_entries",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "event_feed_entries",
    "child_column": "source_event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_group_windows",
    "child_column": "event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_group_windows",
    "child_column": "group_id",
    "parent_table": "groups",
    "parent_column": "id"
  },
  {
    "child_table": "event_group_windows",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "event_observations",
    "child_column": "event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_observations",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "event_observations",
    "child_column": "paddock_window_id",
    "parent_table": "event_paddock_windows",
    "parent_column": "id"
  },
  {
    "child_table": "event_paddock_windows",
    "child_column": "event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "event_paddock_windows",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "event_paddock_windows",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "events",
    "child_column": "farm_id",
    "parent_table": "farms",
    "parent_column": "id"
  },
  {
    "child_table": "events",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "events",
    "child_column": "source_event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "farm_settings",
    "child_column": "farm_id",
    "parent_table": "farms",
    "parent_column": "id"
  },
  {
    "child_table": "farm_settings",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "farms",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "feed_types",
    "child_column": "forage_type_id",
    "parent_table": "forage_types",
    "parent_column": "id"
  },
  {
    "child_table": "feed_types",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "forage_types",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "groups",
    "child_column": "farm_id",
    "parent_table": "farms",
    "parent_column": "id"
  },
  {
    "child_table": "groups",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "harvest_event_fields",
    "child_column": "batch_id",
    "parent_table": "batches",
    "parent_column": "id"
  },
  {
    "child_table": "harvest_event_fields",
    "child_column": "feed_type_id",
    "parent_table": "feed_types",
    "parent_column": "id"
  },
  {
    "child_table": "harvest_event_fields",
    "child_column": "harvest_event_id",
    "parent_table": "harvest_events",
    "parent_column": "id"
  },
  {
    "child_table": "harvest_event_fields",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "harvest_event_fields",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "harvest_events",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "input_product_categories",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "input_products",
    "child_column": "category_id",
    "parent_table": "input_product_categories",
    "parent_column": "id"
  },
  {
    "child_table": "input_products",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "input_products",
    "child_column": "unit_id",
    "parent_table": "input_product_units",
    "parent_column": "id"
  },
  {
    "child_table": "locations",
    "child_column": "farm_id",
    "parent_table": "farms",
    "parent_column": "id"
  },
  {
    "child_table": "locations",
    "child_column": "forage_type_id",
    "parent_table": "forage_types",
    "parent_column": "id"
  },
  {
    "child_table": "locations",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "manure_batch_transactions",
    "child_column": "amendment_id",
    "parent_table": "amendments",
    "parent_column": "id"
  },
  {
    "child_table": "manure_batch_transactions",
    "child_column": "batch_id",
    "parent_table": "manure_batches",
    "parent_column": "id"
  },
  {
    "child_table": "manure_batch_transactions",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "manure_batch_transactions",
    "child_column": "source_event_id",
    "parent_table": "events",
    "parent_column": "id"
  },
  {
    "child_table": "manure_batches",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "manure_batches",
    "child_column": "source_location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "npk_price_history",
    "child_column": "farm_id",
    "parent_table": "farms",
    "parent_column": "id"
  },
  {
    "child_table": "npk_price_history",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "operation_members",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "paddock_observations",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "paddock_observations",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "soil_tests",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "soil_tests",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "spreaders",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "submissions",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "survey_draft_entries",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "survey_draft_entries",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "survey_draft_entries",
    "child_column": "survey_id",
    "parent_table": "surveys",
    "parent_column": "id"
  },
  {
    "child_table": "surveys",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "todo_assignments",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "todo_assignments",
    "child_column": "todo_id",
    "parent_table": "todos",
    "parent_column": "id"
  },
  {
    "child_table": "todo_assignments",
    "child_column": "user_id",
    "parent_table": "operation_members",
    "parent_column": "id"
  },
  {
    "child_table": "todos",
    "child_column": "animal_id",
    "parent_table": "animals",
    "parent_column": "id"
  },
  {
    "child_table": "todos",
    "child_column": "created_by",
    "parent_table": "operation_members",
    "parent_column": "id"
  },
  {
    "child_table": "todos",
    "child_column": "location_id",
    "parent_table": "locations",
    "parent_column": "id"
  },
  {
    "child_table": "todos",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "treatment_categories",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "treatment_types",
    "child_column": "category_id",
    "parent_table": "treatment_categories",
    "parent_column": "id"
  },
  {
    "child_table": "treatment_types",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  },
  {
    "child_table": "user_preferences",
    "child_column": "active_farm_id",
    "parent_table": "farms",
    "parent_column": "id"
  },
  {
    "child_table": "user_preferences",
    "child_column": "operation_id",
    "parent_table": "operations",
    "parent_column": "id"
  }
]
```

## Q4 — RLS Policies

```json
[
  {
    "schemaname": "public",
    "tablename": "ai_bulls",
    "policyname": "ai_bulls_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "ai_bulls",
    "policyname": "ai_bulls_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "ai_bulls",
    "policyname": "ai_bulls_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "ai_bulls",
    "policyname": "ai_bulls_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "amendment_locations",
    "policyname": "amendment_locations_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "amendment_locations",
    "policyname": "amendment_locations_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "amendment_locations",
    "policyname": "amendment_locations_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "amendment_locations",
    "policyname": "amendment_locations_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "amendments",
    "policyname": "amendments_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "amendments",
    "policyname": "amendments_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "amendments",
    "policyname": "amendments_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "amendments",
    "policyname": "amendments_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_bcs_scores",
    "policyname": "animal_bcs_scores_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_bcs_scores",
    "policyname": "animal_bcs_scores_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_bcs_scores",
    "policyname": "animal_bcs_scores_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_bcs_scores",
    "policyname": "animal_bcs_scores_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_breeding_records",
    "policyname": "animal_breeding_records_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_breeding_records",
    "policyname": "animal_breeding_records_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_breeding_records",
    "policyname": "animal_breeding_records_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_breeding_records",
    "policyname": "animal_breeding_records_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_calving_records",
    "policyname": "animal_calving_records_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_calving_records",
    "policyname": "animal_calving_records_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_calving_records",
    "policyname": "animal_calving_records_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_calving_records",
    "policyname": "animal_calving_records_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_classes",
    "policyname": "animal_classes_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_classes",
    "policyname": "animal_classes_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_classes",
    "policyname": "animal_classes_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_classes",
    "policyname": "animal_classes_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_group_memberships",
    "policyname": "animal_group_memberships_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_group_memberships",
    "policyname": "animal_group_memberships_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_group_memberships",
    "policyname": "animal_group_memberships_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_group_memberships",
    "policyname": "animal_group_memberships_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_heat_records",
    "policyname": "animal_heat_records_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_heat_records",
    "policyname": "animal_heat_records_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_heat_records",
    "policyname": "animal_heat_records_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_heat_records",
    "policyname": "animal_heat_records_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_notes",
    "policyname": "animal_notes_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_notes",
    "policyname": "animal_notes_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_notes",
    "policyname": "animal_notes_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_notes",
    "policyname": "animal_notes_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_treatments",
    "policyname": "animal_treatments_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_treatments",
    "policyname": "animal_treatments_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_treatments",
    "policyname": "animal_treatments_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_treatments",
    "policyname": "animal_treatments_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_weight_records",
    "policyname": "animal_weight_records_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_weight_records",
    "policyname": "animal_weight_records_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animal_weight_records",
    "policyname": "animal_weight_records_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animal_weight_records",
    "policyname": "animal_weight_records_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animals",
    "policyname": "animals_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animals",
    "policyname": "animals_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "animals",
    "policyname": "animals_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "animals",
    "policyname": "animals_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "app_logs",
    "policyname": "app_logs_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "app_logs",
    "policyname": "app_logs_select",
    "cmd": "SELECT",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batch_adjustments",
    "policyname": "batch_adjustments_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batch_adjustments",
    "policyname": "batch_adjustments_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "batch_adjustments",
    "policyname": "batch_adjustments_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batch_adjustments",
    "policyname": "batch_adjustments_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batch_nutritional_profiles",
    "policyname": "batch_nutritional_profiles_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batch_nutritional_profiles",
    "policyname": "batch_nutritional_profiles_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "batch_nutritional_profiles",
    "policyname": "batch_nutritional_profiles_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batch_nutritional_profiles",
    "policyname": "batch_nutritional_profiles_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batches",
    "policyname": "batches_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batches",
    "policyname": "batches_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "batches",
    "policyname": "batches_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "batches",
    "policyname": "batches_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_check_items",
    "policyname": "event_feed_check_items_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_check_items",
    "policyname": "event_feed_check_items_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_check_items",
    "policyname": "event_feed_check_items_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_check_items",
    "policyname": "event_feed_check_items_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_checks",
    "policyname": "event_feed_checks_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_checks",
    "policyname": "event_feed_checks_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_checks",
    "policyname": "event_feed_checks_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_checks",
    "policyname": "event_feed_checks_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_entries",
    "policyname": "event_feed_entries_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_entries",
    "policyname": "event_feed_entries_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_entries",
    "policyname": "event_feed_entries_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_feed_entries",
    "policyname": "event_feed_entries_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_group_windows",
    "policyname": "event_group_windows_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_group_windows",
    "policyname": "event_group_windows_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "event_group_windows",
    "policyname": "event_group_windows_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_group_windows",
    "policyname": "event_group_windows_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_observations",
    "policyname": "event_observations_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_observations",
    "policyname": "event_observations_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "event_observations",
    "policyname": "event_observations_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_observations",
    "policyname": "event_observations_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_paddock_windows",
    "policyname": "event_paddock_windows_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_paddock_windows",
    "policyname": "event_paddock_windows_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "event_paddock_windows",
    "policyname": "event_paddock_windows_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "event_paddock_windows",
    "policyname": "event_paddock_windows_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "events",
    "policyname": "events_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "events",
    "policyname": "events_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "events",
    "policyname": "events_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "events",
    "policyname": "events_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "farm_settings",
    "policyname": "farm_settings_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "farm_settings",
    "policyname": "farm_settings_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "farm_settings",
    "policyname": "farm_settings_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "farm_settings",
    "policyname": "farm_settings_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "farms",
    "policyname": "farms_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "farms",
    "policyname": "farms_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "farms",
    "policyname": "farms_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "farms",
    "policyname": "farms_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "feed_types",
    "policyname": "feed_types_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "feed_types",
    "policyname": "feed_types_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "feed_types",
    "policyname": "feed_types_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "feed_types",
    "policyname": "feed_types_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "forage_types",
    "policyname": "forage_types_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "forage_types",
    "policyname": "forage_types_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "forage_types",
    "policyname": "forage_types_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "forage_types",
    "policyname": "forage_types_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "groups_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "groups_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "groups_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "groups",
    "policyname": "groups_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "harvest_event_fields",
    "policyname": "harvest_event_fields_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "harvest_event_fields",
    "policyname": "harvest_event_fields_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "harvest_event_fields",
    "policyname": "harvest_event_fields_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "harvest_event_fields",
    "policyname": "harvest_event_fields_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "harvest_events",
    "policyname": "harvest_events_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "harvest_events",
    "policyname": "harvest_events_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "harvest_events",
    "policyname": "harvest_events_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "harvest_events",
    "policyname": "harvest_events_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "input_product_categories",
    "policyname": "input_product_categories_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "input_product_categories",
    "policyname": "input_product_categories_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "input_product_categories",
    "policyname": "input_product_categories_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "input_product_categories",
    "policyname": "input_product_categories_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "input_products",
    "policyname": "input_products_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "input_products",
    "policyname": "input_products_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "input_products",
    "policyname": "input_products_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "input_products",
    "policyname": "input_products_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "locations",
    "policyname": "locations_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "locations",
    "policyname": "locations_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "locations",
    "policyname": "locations_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "locations",
    "policyname": "locations_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "manure_batch_transactions",
    "policyname": "manure_batch_transactions_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "manure_batch_transactions",
    "policyname": "manure_batch_transactions_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "manure_batch_transactions",
    "policyname": "manure_batch_transactions_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "manure_batch_transactions",
    "policyname": "manure_batch_transactions_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "manure_batches",
    "policyname": "manure_batches_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "manure_batches",
    "policyname": "manure_batches_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "manure_batches",
    "policyname": "manure_batches_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "manure_batches",
    "policyname": "manure_batches_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "npk_price_history",
    "policyname": "npk_price_history_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "npk_price_history",
    "policyname": "npk_price_history_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "npk_price_history",
    "policyname": "npk_price_history_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "npk_price_history",
    "policyname": "npk_price_history_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "operation_members",
    "policyname": "operation_members_delete",
    "cmd": "DELETE",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "operation_members",
    "policyname": "operation_members_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(user_id = auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "operation_members",
    "policyname": "operation_members_select",
    "cmd": "SELECT",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "operation_members",
    "policyname": "operation_members_update",
    "cmd": "UPDATE",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "operations",
    "policyname": "operations_delete",
    "cmd": "DELETE",
    "qual": "(EXISTS ( SELECT 1\n   FROM operation_members\n  WHERE ((operation_members.operation_id = operations.id) AND (operation_members.user_id = auth.uid()) AND (operation_members.accepted_at IS NOT NULL) AND (operation_members.role = 'owner'::text))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "operations",
    "policyname": "operations_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "operations",
    "policyname": "operations_select",
    "cmd": "SELECT",
    "qual": "(EXISTS ( SELECT 1\n   FROM operation_members\n  WHERE ((operation_members.operation_id = operations.id) AND (operation_members.user_id = auth.uid()) AND (operation_members.accepted_at IS NOT NULL))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "operations",
    "policyname": "operations_update",
    "cmd": "UPDATE",
    "qual": "(EXISTS ( SELECT 1\n   FROM operation_members\n  WHERE ((operation_members.operation_id = operations.id) AND (operation_members.user_id = auth.uid()) AND (operation_members.accepted_at IS NOT NULL) AND (operation_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "paddock_observations",
    "policyname": "paddock_observations_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "paddock_observations",
    "policyname": "paddock_observations_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "paddock_observations",
    "policyname": "paddock_observations_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "paddock_observations",
    "policyname": "paddock_observations_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "soil_tests",
    "policyname": "soil_tests_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "soil_tests",
    "policyname": "soil_tests_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "soil_tests",
    "policyname": "soil_tests_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "soil_tests",
    "policyname": "soil_tests_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "spreaders",
    "policyname": "spreaders_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "spreaders",
    "policyname": "spreaders_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "spreaders",
    "policyname": "spreaders_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "spreaders",
    "policyname": "spreaders_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "submissions_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "submissions_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "submissions_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "submissions",
    "policyname": "submissions_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "survey_draft_entries",
    "policyname": "survey_draft_entries_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "survey_draft_entries",
    "policyname": "survey_draft_entries_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "survey_draft_entries",
    "policyname": "survey_draft_entries_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "survey_draft_entries",
    "policyname": "survey_draft_entries_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "surveys",
    "policyname": "surveys_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "surveys",
    "policyname": "surveys_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "surveys",
    "policyname": "surveys_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "surveys",
    "policyname": "surveys_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "todo_assignments",
    "policyname": "todo_assignments_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "todo_assignments",
    "policyname": "todo_assignments_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "todo_assignments",
    "policyname": "todo_assignments_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "todo_assignments",
    "policyname": "todo_assignments_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "todos",
    "policyname": "todos_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "todos",
    "policyname": "todos_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "todos",
    "policyname": "todos_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "todos",
    "policyname": "todos_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "treatment_categories",
    "policyname": "treatment_categories_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "treatment_categories",
    "policyname": "treatment_categories_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "treatment_categories",
    "policyname": "treatment_categories_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "treatment_categories",
    "policyname": "treatment_categories_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "treatment_types",
    "policyname": "treatment_types_delete",
    "cmd": "DELETE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "treatment_types",
    "policyname": "treatment_types_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "true"
  },
  {
    "schemaname": "public",
    "tablename": "treatment_types",
    "policyname": "treatment_types_select",
    "cmd": "SELECT",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "treatment_types",
    "policyname": "treatment_types_update",
    "cmd": "UPDATE",
    "qual": "(operation_id IN ( SELECT operation_members.operation_id\n   FROM operation_members\n  WHERE (operation_members.user_id = auth.uid())))",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "user_preferences",
    "policyname": "user_preferences_delete",
    "cmd": "DELETE",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "user_preferences",
    "policyname": "user_preferences_insert",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(user_id = auth.uid())"
  },
  {
    "schemaname": "public",
    "tablename": "user_preferences",
    "policyname": "user_preferences_select",
    "cmd": "SELECT",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  },
  {
    "schemaname": "public",
    "tablename": "user_preferences",
    "policyname": "user_preferences_update",
    "cmd": "UPDATE",
    "qual": "(user_id = auth.uid())",
    "with_check": null
  }
]
```

## Q5 — Schema Version

```json
[
  {
    "id": "ef11ee62-b720-4f0c-848a-18e1dd93de30",
    "schema_version": 23
  }
]
```

## Q6 — Row Counts

Captured via `pg_stat_user_tables.n_live_tup`. (PostgreSQL approximate live-tuple count — accurate for triage, may lag exact `COUNT(*)` slightly between autovacuum cycles.)

```json
[
  {
    "table_name": "ai_bulls",
    "row_count": 0
  },
  {
    "table_name": "amendment_locations",
    "row_count": 0
  },
  {
    "table_name": "amendments",
    "row_count": 0
  },
  {
    "table_name": "animal_bcs_scores",
    "row_count": 0
  },
  {
    "table_name": "animal_breeding_records",
    "row_count": 0
  },
  {
    "table_name": "animal_calving_records",
    "row_count": 0
  },
  {
    "table_name": "animal_classes",
    "row_count": 10
  },
  {
    "table_name": "animal_group_memberships",
    "row_count": 92
  },
  {
    "table_name": "animal_heat_records",
    "row_count": 0
  },
  {
    "table_name": "animal_notes",
    "row_count": 0
  },
  {
    "table_name": "animal_treatments",
    "row_count": 0
  },
  {
    "table_name": "animal_weight_records",
    "row_count": 78
  },
  {
    "table_name": "animals",
    "row_count": 79
  },
  {
    "table_name": "app_logs",
    "row_count": 0
  },
  {
    "table_name": "batch_adjustments",
    "row_count": 0
  },
  {
    "table_name": "batch_nutritional_profiles",
    "row_count": 0
  },
  {
    "table_name": "batches",
    "row_count": 6
  },
  {
    "table_name": "dose_units",
    "row_count": 6
  },
  {
    "table_name": "event_feed_check_items",
    "row_count": 0
  },
  {
    "table_name": "event_feed_checks",
    "row_count": 41
  },
  {
    "table_name": "event_feed_entries",
    "row_count": 2
  },
  {
    "table_name": "event_group_windows",
    "row_count": 39
  },
  {
    "table_name": "event_observations",
    "row_count": 0
  },
  {
    "table_name": "event_paddock_windows",
    "row_count": 24
  },
  {
    "table_name": "events",
    "row_count": 19
  },
  {
    "table_name": "farm_settings",
    "row_count": 1
  },
  {
    "table_name": "farms",
    "row_count": 1
  },
  {
    "table_name": "feed_types",
    "row_count": 3
  },
  {
    "table_name": "forage_types",
    "row_count": 8
  },
  {
    "table_name": "groups",
    "row_count": 6
  },
  {
    "table_name": "harvest_event_fields",
    "row_count": 0
  },
  {
    "table_name": "harvest_events",
    "row_count": 2
  },
  {
    "table_name": "input_product_categories",
    "row_count": 0
  },
  {
    "table_name": "input_product_units",
    "row_count": 5
  },
  {
    "table_name": "input_products",
    "row_count": 0
  },
  {
    "table_name": "locations",
    "row_count": 35
  },
  {
    "table_name": "manure_batch_transactions",
    "row_count": 0
  },
  {
    "table_name": "manure_batches",
    "row_count": 0
  },
  {
    "table_name": "npk_price_history",
    "row_count": 1
  },
  {
    "table_name": "operation_members",
    "row_count": 1
  },
  {
    "table_name": "operations",
    "row_count": 1
  },
  {
    "table_name": "paddock_observations",
    "row_count": 124
  },
  {
    "table_name": "release_notes",
    "row_count": 0
  },
  {
    "table_name": "soil_tests",
    "row_count": 0
  },
  {
    "table_name": "spreaders",
    "row_count": 0
  },
  {
    "table_name": "submissions",
    "row_count": 129
  },
  {
    "table_name": "survey_draft_entries",
    "row_count": 0
  },
  {
    "table_name": "surveys",
    "row_count": 3
  },
  {
    "table_name": "todo_assignments",
    "row_count": 0
  },
  {
    "table_name": "todos",
    "row_count": 5
  },
  {
    "table_name": "treatment_categories",
    "row_count": 1
  },
  {
    "table_name": "treatment_types",
    "row_count": 2
  },
  {
    "table_name": "user_preferences",
    "row_count": 1
  }
]
```

## Ghost-migration pre-check

After running Q5, compare `operations.schema_version` to the highest-numbered migration file in `supabase/migrations/`.

- `operations.schema_version` (Q5) = **23**
- Highest migration file on disk = **023_feed_removal_columns.sql**

**Result: match — no obvious ghost migrations.** Cowork audit continues normally.

## Reconcile Q5 against BACKUP_MIGRATIONS

Open `src/data/backup-migrations.js`. Confirm the migration chain covers 1 → `schema_version` from Q5.

Live `BACKUP_MIGRATIONS` map (keys observed):
- Has entries for from-versions: 14, 15, 16, 17, 18, 19, 20, 21, 22
- Each entry steps `schema_version` forward by 1, so the chain runs **14 → 23**
- Q5 `schema_version` = **23**

**Result: chain reaches the live `schema_version` (23). No CP-56 hole at or below 23.** Versions below 14 predate CP-55 (per `src/data/backup-export.js` and the comments in `backup-migrations.js`), so the absence of keys 1–13 is by design, not a hole.
