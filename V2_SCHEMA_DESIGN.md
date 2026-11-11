# GTHO v2 — Schema Design

**Status:** In Progress
**Date started:** 2026-04-11
**Source:** GTHO_V1_FEATURE_AUDIT.md + interactive design sessions
**Purpose:** Define every Supabase table for the v2 rebuild. This document is the authoritative schema spec. When complete and approved, it replaces the entity specs in GTHO-v2/ARCHITECTURE.md.

## Design Principles

These were established during the audit and confirmed in design sessions:

1. **UUID everywhere** — All IDs are native `uuid` via `crypto.randomUUID()`. No bigint, no prefixed strings.
2. **Metric internal** — All measurements stored metric (kg, hectares, cm). Display layer converts.
3. **camelCase JS / snake_case Supabase** — Entity files handle mapping via shape functions.
4. **Compute on read** — Derived values (DMI, NPK, cost, status) are never stored. Exception: point-in-time snapshots on group windows (head_count, avg_weight_kg) are raw facts captured at join time.
5. **No name snapshots** — Link by FK only. Display names resolved from entity cache at render time.
6. **No JSONB bags** — Normalize into proper child tables. JSONB only for truly unstructured data (conversation threads, etc.).
7. **Consistent timestamps** — Every table gets `created_at` and `updated_at` with `DEFAULT now()`.
8. **RLS by operation_id** — Every operation-scoped user-data table carries `operation_id uuid NOT NULL` directly, including child and junction tables, so RLS and scoped queries need no parent joins. Units are the explicit nullable-scope exception: `dose_units` and `input_product_units` use NULL for read-only standards and a non-null operation FK for custom units, with member RLS and immutable ownership (044, §8.2/§9.4). They are not unprotected global write tables. Global `release_notes` has RLS enabled and authenticated SELECT only (§11.5).
9. **Windows, not anchors** — Events have no anchor paddock. All paddock and group participation is tracked via time windows. An event is open while any paddock window + group window overlap is open.
10. **Feed delivered to paddocks** — Every feed entry has a location_id (paddock within the event), never dangling at event level.

---

## Document Structure

Each domain section contains:
- Table name and purpose
- Column spec (name, type, constraints, notes)
- Design decisions and rationale (linking back to audit entries where relevant)
- SQL CREATE TABLE statement

Domains are ordered by dependency — tables referenced as FKs come before tables that reference them.

---

## Domain 1: Operation & Farm Setup

The root entities that everything else FKs into. Design priority: keep `operations` lean (it's the most-referenced table), push all config to `farm_settings` (per-farm, not per-operation), and separate user access from user preferences.

### 1.1 operations

**Purpose:** The top-level account/org entity. Every other user-data table references this via `operation_id` for RLS scoping. Kept deliberately lean — only identity and the single truly operation-wide setting (currency).
**Audit refs:** SET-01, SET-02, SET-03

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| name | text | NOT NULL | Operation name (v1: herdName) |
| timezone | text | NULL | IANA timezone (e.g. 'America/Chicago'). New in v2 — needed for window model date math. |
| currency | text | NOT NULL, DEFAULT 'USD' | ISO 4217 code. Truly operation-wide — all farms share one currency. |
| unit_system | text | NOT NULL, DEFAULT 'imperial', CHECK (unit_system IN ('metric','imperial')) | Display unit preference. Operation-wide (A44) — same rationale as currency. Storage is always metric (§1.1 V2_INFRASTRUCTURE.md); this column only controls display conversion. |
| archived | boolean | DEFAULT false | Soft delete |
| geojson | jsonb | NULL | Polygon ring. Added in migration 034 (2026-10-04). |
| centroid_lat | numeric | NULL | Center of the ring. Migration 034. |
| centroid_lng | numeric | NULL | Center of the ring. Migration 034. |
| map_source | text | NULL | `drawn` or `imported`. Migration 034. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **No herd_type:** V1 had a single herd_type field ('cattle', 'sheep', etc.). Dropped because an operation can have multiple species — the species mix is defined by which `animal_classes` rows exist (A14). Onboarding UX can ask "what do you run?" to pre-populate classes.
- **Currency on operations, not farms:** An operation doesn't run one farm in USD and another in NZD. All NPK prices, costs, and values share one currency. The prices themselves can differ per farm (freight differentials), but the currency is the same.
- **Unit system on operations (A44):** Same rationale as currency. A user doesn't think in acres at the home farm and hectares at the leased place — it's one measurement convention across the whole operation. Storage is always metric (V2_INFRASTRUCTURE.md §1.1); `unit_system` only controls the display layer. Default `'imperial'` matches v1's behavior so migrated operations read unchanged.
- **Timezone:** The window model (A1) makes date boundaries matter. UTC timestamps are converted to local dates for display and calculation using the operation's timezone.

```sql
CREATE TABLE operations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  timezone    text,
  currency    text NOT NULL DEFAULT 'USD',
  unit_system text NOT NULL DEFAULT 'imperial' CHECK (unit_system IN ('metric','imperial')),
  archived    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### 1.2 farms

**Purpose:** Physical property groupings within an operation. If you own a home place and lease two other properties, each is a farm. Locations (paddocks) FK to a farm.
**Audit refs:** PAS-07

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| name | text | NOT NULL | "Home Farm", "Smith Lease", etc. |
| address | text | NULL | Physical/mailing address |
| latitude | numeric | NULL | Decimal degrees for future map features |
| longitude | numeric | NULL | Decimal degrees |
| area_hectares | numeric | NULL | Total property area |
| notes | text | NULL | Free-form |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Lat/lng:** Nullable — optional until the user sets it. Enables future map features and distance calculations between properties.
- **No feed_day_goal here:** Moved to `farm_settings` with all other per-farm config. Keeps the farm identity table clean.
- **Migration:** V1's `migrateHomeFarm()` creates a default "Home Farm" if none exist. V2 migration should do the same.

```sql
CREATE TABLE farms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  latitude        numeric,
  longitude       numeric,
  area_hectares   numeric,
  notes           text,
  archived        boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 1.3 farm_settings

**Purpose:** All operational configuration, scoped per-farm. Replaces v1's `operation_settings` JSONB bag. Every setting is a typed column with a sensible default. For multi-farm operations, each farm has its own settings. "Copy settings from Farm A to Farm B" is a UX feature.
**Audit refs:** SET-01

This table is a 1:1 child of `farms` (one row per farm, enforced by UNIQUE on farm_id).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| farm_id | uuid | NOT NULL, UNIQUE, FK → farms | 1:1 relationship |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope (denormalized for query convenience) |
| | | | |
| **Grazing management** | | | *Tier 3 fallbacks for A17 3-tier config* |
| default_au_weight_kg | numeric | NOT NULL, DEFAULT 454 | Base animal unit weight for stocking rate calcs |
| default_residual_height_cm | numeric | NOT NULL, DEFAULT 10 | Target post-grazing height. Fallback when forage_type lacks its own (A15). |
| default_utilization_pct | numeric | NOT NULL, DEFAULT 65 | % of available forage consumed. Fallback when forage_type lacks its own (A15). |
| recovery_required | boolean | NOT NULL, DEFAULT false | Whether app enforces rest periods between grazing events on same paddock |
| default_recovery_min_days | integer | NOT NULL, DEFAULT 21 | Minimum rest period (if recovery_required) |
| default_recovery_max_days | integer | NOT NULL, DEFAULT 60 | Maximum rest before under-grazed flag |
| | | | |
| **Economics** | | | *Per-farm — prices can differ due to freight* |
| n_price_per_kg | numeric | NOT NULL, DEFAULT 1.21 | Current nitrogen price per kg |
| p_price_per_kg | numeric | NOT NULL, DEFAULT 1.43 | Current phosphorus price per kg |
| k_price_per_kg | numeric | NOT NULL, DEFAULT 0.93 | Current potassium price per kg |
| | | | |
| **Manure** | | | |
| default_manure_rate_kg_per_day | numeric | NOT NULL, DEFAULT 27 | Daily manure per AU. Fallback — per-class rates on animal_classes override (A14). |
| | | | |
| **Feed planning** | | | |
| feed_day_goal | integer | NOT NULL, DEFAULT 90 | Planning horizon days (7-365). "Do I have enough feed for N days?" |
| | | | |
| **Survey scales** | | | *Configurable assessment ranges* |
| forage_quality_scale_min | numeric | NOT NULL, DEFAULT 1 | Lower bound of forage quality scale (e.g., 1 for default, 0 for RFQ) |
| forage_quality_scale_max | numeric | NOT NULL, DEFAULT 100 | Upper bound of forage quality scale (e.g., 100 for default, 200+ for RFQ) |
| bale_ring_residue_diameter_cm | numeric | DEFAULT 365.76 | Bale-ring residue diameter for BRC-1 cover-% auto-fill. Migration 022 added as `_ft`; OI-0111 / migration 027 renamed to `_cm` per the metric-internal rule. Settings UI displays in user's unit system (imperial shows ft, not inches). |
| | | | |
| **Thresholds** | | | *Dashboard color coding — green/yellow/red* |
| threshold_aud_target_pct | numeric | NOT NULL, DEFAULT 80 | AUD usage target (green above this) |
| threshold_aud_warn_pct | numeric | NOT NULL, DEFAULT 60 | AUD usage warning level |
| threshold_rotation_target_pct | numeric | NOT NULL, DEFAULT 80 | Rotation completion target |
| threshold_rotation_warn_pct | numeric | NOT NULL, DEFAULT 60 | Rotation completion warning |
| threshold_npk_warn_per_ha | numeric | NULL | NPK loading warning per hectare |
| threshold_cost_per_day_target | numeric | NULL | Daily cost target |
| threshold_cost_per_day_warn | numeric | NULL | Daily cost warning |
| | | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Per-farm, not per-operation:** An operation's farms may have very different contexts — a developed home place vs. a new lease. Settings that were global in v1 are now per-farm. For single-farm operations, behavior is identical.
- **Eliminates operation_settings:** V1's `operation_settings` was a JSONB bag (flagged as anti-pattern). V2 doesn't just fix the JSONB — it moves the settings to the farm level entirely.
- **3-tier config integration (A17):** Grazing fields here are the Tier 3 (global) fallbacks. Tier 2 is per-forage-type on `forage_types` (A15) and per-class on `animal_classes` (A14). Tier 1 is per-location overrides where applicable.
- **default_dm_per_aud_kg removed:** DMI lives on `animal_classes.dmi_pct` (seeded with NRCS industry standards at onboarding, editable per class). No Tier 3 fallback needed — every class will have `dmi_pct` populated. DM-per-AUD for display can be derived: `default_au_weight_kg × dmi_pct / 100`.
- **NPK prices per-farm:** Freight differentials mean the same fertilizer costs more on a remote lease. Prices live here, not on operations.
- **Spreader equipment:** V1 had a single `manure_load_kg` for spreader capacity. V2 replaces this with a proper equipment/spreaders reference table (designed in D8) since farms have multiple spreaders of different sizes.
- **Forage quality scale configurable (A41):** Different operations use different assessment systems. Default 1–100 handles most cases. Operations using Relative Forage Quality (RFQ) can set 0–200+. The survey UI reads these bounds and renders the input accordingly. `forage_condition` (poor/fair/good/excellent) is a separate categorical assessment that doesn't depend on this scale.
- **Copy settings UX:** The app should provide a "copy settings from another farm" action when creating a new farm. This is a UX concern, not a schema concern.

```sql
CREATE TABLE farm_settings (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                         uuid NOT NULL UNIQUE REFERENCES farms(id) ON DELETE CASCADE,
  operation_id                    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,

  -- Grazing management (Tier 3 fallbacks for A17)
  default_au_weight_kg            numeric NOT NULL DEFAULT 454,
  default_residual_height_cm      numeric NOT NULL DEFAULT 10,
  default_utilization_pct         numeric NOT NULL DEFAULT 65,
  recovery_required               boolean NOT NULL DEFAULT false,
  default_recovery_min_days       integer NOT NULL DEFAULT 21,
  default_recovery_max_days       integer NOT NULL DEFAULT 60,

  -- Economics (per-farm — freight differentials)
  n_price_per_kg                  numeric NOT NULL DEFAULT 1.21,
  p_price_per_kg                  numeric NOT NULL DEFAULT 1.43,
  k_price_per_kg                  numeric NOT NULL DEFAULT 0.93,

  -- Manure
  default_manure_rate_kg_per_day  numeric NOT NULL DEFAULT 27,

  -- Feed planning
  feed_day_goal                   integer NOT NULL DEFAULT 90,

  -- Survey scales (configurable per-farm)
  forage_quality_scale_min        numeric NOT NULL DEFAULT 1,
  forage_quality_scale_max        numeric NOT NULL DEFAULT 100,
  bale_ring_residue_diameter_cm   numeric DEFAULT 365.76, -- OI-0111 / migration 027 (renamed from _ft)

  -- Thresholds (dashboard color coding)
  threshold_aud_target_pct        numeric NOT NULL DEFAULT 80,
  threshold_aud_warn_pct          numeric NOT NULL DEFAULT 60,
  threshold_rotation_target_pct   numeric NOT NULL DEFAULT 80,
  threshold_rotation_warn_pct     numeric NOT NULL DEFAULT 60,
  threshold_npk_warn_per_ha       numeric,
  threshold_cost_per_day_target   numeric,
  threshold_cost_per_day_warn     numeric,

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
```

### 1.4 operation_members

**Purpose:** Binds Supabase auth users to operations. Controls who can access what. RLS policies trace through this table. Also handles pending invites (user_id = NULL until accepted).
**Audit refs:** SET-03

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | Which operation |
| user_id | uuid | NULL, FK → auth.users | NULL = pending invite |
| display_name | text | NOT NULL | Shown in UI |
| email | text | NOT NULL | For invites and display |
| phone | text | NULL | Cell number for future SMS/auth |
| role | text | NOT NULL, DEFAULT 'team_member' | 'owner', 'admin', 'team_member' |
| invited_at | timestamptz | NULL | When invite was sent |
| accepted_at | timestamptz | NULL | When user linked their auth account |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Invite mechanism:** Create row with email + display_name, user_id = NULL. When they sign up and accept, user_id gets populated and accepted_at is set.
- **Roles:** owner (full control + billing), admin (full control), team_member (use the app, limited settings access). V1 used 'member' — renamed for clarity.
- **Phone:** New in v2. Supports future SMS-based auth (OTP to phone) and notification features.
- **No S.users:** V1's `S.users` local array is deprecated and fully eliminated in v2. `operation_members` is the sole source of truth.

```sql
CREATE TABLE operation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id),
  display_name    text NOT NULL,
  email           text NOT NULL,
  phone           text,
  role            text NOT NULL DEFAULT 'team_member'
                    CHECK (role IN ('owner', 'admin', 'team_member')),
  invited_at      timestamptz,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 1.5 user_preferences

**Purpose:** Per-user UI preferences, scoped to an operation. Separated from operation_members to keep access control clean. A user's preferences might differ between operations if they're a member of multiple.
**Audit refs:** SET-01 (homeViewMode, statPeriodDays, field mode selections)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| user_id | uuid | NOT NULL, FK → auth.users | Which user |
| active_farm_id | uuid | NULL, FK → farms ON DELETE SET NULL | Currently-selected farm for this user. NULL = "All farms" mode (aggregate across all farms in the operation). Set by the farm picker in the app header. |
| home_view_mode | text | NOT NULL, DEFAULT 'groups' | 'groups' or 'locations' — home screen layout |
| default_view_mode | text | NOT NULL, DEFAULT 'detail' | 'field' or 'detail' — mobile users in the paddock set to 'field' |
| stat_period_days | integer | NOT NULL, DEFAULT 14 | Dashboard stat period (7, 14, 30, 365) |
| field_mode_quick_actions | text[] | NULL | Ordered array of module keys for quick access buttons in field mode. NULL = system defaults. E.g. `{'move','feed','survey','health'}` |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Per-operation scoping:** UNIQUE on (operation_id, user_id). A user who belongs to two operations can have different preferences for each.
- **Separate from operation_members:** Members table is about access control (who can see what). Preferences are about UI personalization. Different concerns, different tables.
- **field_mode_quick_actions as text[]:** A small ordered list of UI shortcuts, not relational data. Array position = button order. Postgres native array, not JSONB.
- **NULL quick_actions = system defaults:** The app defines a default button set. Users only get a row value when they customize.
- **active_farm_id is per-user, not per-device:** A user's farm selection syncs across their phone and tablet. Decided 2026-04-13 alongside OI-0015 resolution. `NULL` is a valid value meaning "All farms" (aggregate mode). `ON DELETE SET NULL` so deleting a farm doesn't orphan the user; store falls back to the first available farm at read time.
- **Active farm scopes display, not permissions:** RLS is unchanged by this column. The app uses it as a UI filter. Wizards whose destination is farm-scoped (move wizard, etc.) include a farm chip so users can target other farms without changing `active_farm_id`.

```sql
CREATE TABLE user_preferences (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id              uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  user_id                   uuid NOT NULL REFERENCES auth.users(id),
  active_farm_id            uuid REFERENCES farms(id) ON DELETE SET NULL,
  home_view_mode            text NOT NULL DEFAULT 'groups'
                              CHECK (home_view_mode IN ('groups', 'locations')),
  default_view_mode         text NOT NULL DEFAULT 'detail'
                              CHECK (default_view_mode IN ('field', 'detail')),
  stat_period_days          integer NOT NULL DEFAULT 14,
  field_mode_quick_actions  text[],
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, user_id)
);
```

### 1.6 operation_settings → ELIMINATED

V1's `operation_settings` was a JSONB bag (flagged as anti-pattern). In v2, all settings are typed columns on `farm_settings` (per-farm). The only truly operation-wide setting (currency) lives on `operations` itself. This eliminates the confusion of "which level am I setting this at?" — everything is per-farm, and a "copy settings" UX action handles multi-farm consistency.

---

## Domain 2: Locations

Replaces v1's `pastures` table. The key insight: every place animals can be is a "location." Locations are either confinement (barn, drylot) or land (pasture, mixed-use, crop). This eliminates the v1 confusion between `locationType` and `landUse` fields.

### 2.1 locations

**Replaces:** v1 `pastures`
**Audit refs:** GRZ-01, PST-01, PST-02

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| farm_id | uuid | NOT NULL, FK → farms | |
| name | text | NOT NULL | User-facing name |
| type | text | NOT NULL | `'confinement'` or `'land'` |
| land_use | text | NULL | Only for type='land': `'pasture'`, `'mixed_use'`, `'crop'` |
| area_hectares | numeric | NULL | Land area; NULL for confinement |
| field_code | text | NULL | Optional short code for field ID |
| soil_type | text | NULL | Soil classification |
| forage_type_id | uuid | NULL, FK → forage_types | Default forage for this location |
| capture_percent | numeric | NULL | Manure capture % (100 for confinement, partial for mixed) |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Type taxonomy:** `type` is the top-level split. If it captures manure, it's confinement. If animals graze on it, it's land.
- **land_use:** Only populated when type='land'. Pasture = all grass. Mixed_use = has both grazing and stored feed areas. Crop = harvested, no grazing.
- **capture_percent:** Confinement locations default to 100%. Land locations can have partial capture (e.g., feeding pad on a pasture). This drives the manure/nutrient calculations.
- **No residual_graze_height_cm here** — that belongs on the forage_type, not the location. A location's target residual height depends on what's growing there.

```sql
CREATE TABLE locations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  farm_id           uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('confinement', 'land')),
  land_use          text CHECK (land_use IN ('pasture', 'mixed_use', 'crop') OR land_use IS NULL),
  area_hectares     numeric,
  field_code        text,
  soil_type         text,
  forage_type_id    uuid REFERENCES forage_types(id),
  capture_percent   numeric,
  archived          boolean DEFAULT false,
  geojson           jsonb,
  centroid_lat      numeric,
  centroid_lng      numeric,
  map_source        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 2.2 forage_types

**Purpose:** Reference table for forage species and cultivars. Carries per-type grazing parameters that serve as Tier 2 defaults in the 3-tier config cascade (A17). Locations reference a forage type to inherit its grazing defaults; feed types (harvest batches) reference a forage type to link cut forage back to its species.
**Audit refs:** PAS-08, M7-E
**Architecture decisions:** A15 (per-forage-type utilization), A17 (3-tier config fallback)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping |
| name | text | NOT NULL | e.g. "Perennial Ryegrass", "Tall Fescue" |
| dm_pct | numeric | NULL | Dry matter % of standing forage |
| n_per_tonne_dm | numeric | NULL | kg N per tonne DM |
| p_per_tonne_dm | numeric | NULL | kg P per tonne DM |
| k_per_tonne_dm | numeric | NULL | kg K per tonne DM |
| dm_kg_per_cm_per_ha | numeric | NULL | Height-to-yield conversion (metric). V1: dm_lbs_per_inch_per_acre |
| min_residual_height_cm | numeric | NULL | Minimum grazing height before exit. Tier 2 default for locations using this forage type. |
| utilization_pct | numeric | NULL | Target grazing utilization %. V1 had this as a single global setting; v2 moves it per-forage-type (A15). Ryegrass and native range have very different utilization rates. |
| notes | text | NULL | Free text |
| is_seeded | boolean | DEFAULT false | True for system-provided starter types (pre-populated at onboarding) |
| archived | boolean | DEFAULT false | Soft delete. New in v2 — v1 used hard delete with in-use guard. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Per-type utilization (A15):** V1 stored a single `forageUtilPct` in global settings. V2 moves this to the forage type level because utilization varies significantly by species — improved ryegrass can sustain 70-80% utilization while native range might only handle 40-50%. The global default in `farm_settings.default_utilization_pct` serves as the Tier 3 fallback.
- **3-tier cascade (A17):** For grazing parameters (min residual height, utilization %), the config resolution is: Location override (Tier 1) → Forage type default (Tier 2) → farm_settings global (Tier 3). The app checks each tier in order and uses the first non-null value.
- **Metric internal:** `dm_kg_per_cm_per_ha` replaces v1's `dm_lbs_per_inch_per_acre`. Display layer converts for imperial users. Same conversion pattern as all other measurement fields.
- **Archived instead of hard delete:** V1 allowed hard-deleting forage types (with a guard against in-use types). V2 uses soft delete for consistency with all other reference tables and to preserve historical integrity.
- **NPK per tonne DM:** These rates drive the NPK value calculation when forage is grazed. When an event closes with a height-in and height-out, the app computes DM consumed via dm_kg_per_cm_per_ha, then applies these rates to estimate NPK removed. Stored on the forage type because different species have different nutrient profiles.

**Referenced by:**
- `locations.forage_type_id` — location's default forage type (Tier 2 source)
- `feed_types.forage_type_id` — links harvested feed back to its forage species

```sql
CREATE TABLE forage_types (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id          uuid NOT NULL REFERENCES operations(id),
  name                  text NOT NULL,
  dm_pct                numeric,
  n_per_tonne_dm        numeric,
  p_per_tonne_dm        numeric,
  k_per_tonne_dm        numeric,
  dm_kg_per_cm_per_ha   numeric,
  min_residual_height_cm numeric,
  utilization_pct       numeric,
  notes                 text,
  is_seeded             boolean DEFAULT false,
  archived              boolean DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 3: Animals & Groups

The core livestock domain. Animal classes are the reference layer — system-defined roles per species with user-defined labels. Animals are the central entity that everything else FKs into. Groups are farm-scoped operational labels for animals moving together. The membership ledger tracks complete group history over time, and dovetails with the event window model (A1): membership tells you who's in a group, event_group_windows tells you that group was on a pasture during a time period.

### 3.1 animal_classes

**Purpose:** Reference table for livestock categories. Each class maps to a system-defined `role` that drives business logic (action gating, weaning transitions, breeding eligibility) and a user-defined `name` for operational labeling. Tier 2 in the 3-tier config cascade (A14, A17) — per-class rates override farm_settings globals.
**Audit refs:** ANI-03, ANI-11

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| name | text | NOT NULL | User-facing label ("Spring Heifers", "Mature Cows") |
| species | text | NOT NULL | 'beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other'. App-managed list. Split cattle into beef/dairy for distinct lactation logic, DMI rates, and weaning defaults. |
| role | text | NOT NULL | System key driving business logic. See role list below. |
| default_weight_kg | numeric | | Class default weight |
| dmi_pct | numeric | | Tier 2 — % body weight/day. Overrides farm_settings.default_dmi_pct |
| dmi_pct_lactating | numeric | | Tier 2 — % body weight/day while lactating. Applied when animal is determined to be lactating via calving/weaning timeline. |
| excretion_n_rate | numeric | | Tier 2 nitrogen excretion rate (kg/1000kg BW/day, NRCS standard) |
| excretion_p_rate | numeric | | Tier 2 phosphorus excretion rate (kg/1000kg BW/day, NRCS standard) |
| excretion_k_rate | numeric | | Tier 2 potassium excretion rate (kg/1000kg BW/day, NRCS standard) |
| weaning_age_days | integer | | Tier 2 — overrides species default |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Standard roles by species:**

| Species | Roles | Notes |
|---------|-------|-------|
| Beef Cattle | cow, heifer, bull, steer, calf | Calf is sex-neutral at birth. Lactation ends at calf weaning (class reassignment). |
| Dairy Cattle | cow, heifer, bull, steer, calf | Same roles as beef. Lactation ends at explicit dry-off date (dried_off_date on calving record). Higher baseline DMI rates. |
| Sheep | ewe, ram, wether, lamb | |
| Goat | doe, buck, wether, kid | Goat and sheep share 'wether' role |
| Other | female, male, castrate, young | Generic fallback |

**Role-based action gating:**
- **Can calve/lamb/kid:** cow, heifer, ewe, doe, female
- **Can breed (female):** cow, heifer, ewe, doe, female
- **Can breed (male / sire):** bull, ram, buck, male
- **Shows in heat picker:** cow, heifer, ewe, doe, female
- **Weaning transition (female):** calf→heifer, lamb→ewe, kid→doe, young→female
- **Weaning transition (male, castrated):** calf→steer, lamb→wether, kid→wether, young→castrate
- **Weaning transition (male, intact):** calf→bull, lamb→ram, kid→buck, young→male

**Design decisions:**
- **Role + name model (A27):** Roles are system-defined and drive all action gating. Class names are user labels mapped to exactly one role. Users can have multiple classes per role ("Spring Heifers" and "Fall Heifers" both role=heifer). The app reasons about the role; the user sees their name.
- **Calving class reassignment is prompted, not automatic (A27):** When a calving event is recorded on a heifer-role animal, the app prompts the user to reassign class (e.g., to a "First-Calf Heifer" or "Cow" class). Not forced — user decides. Most operations use "First-Calf Heifer" as an intermediate step before "Cow."
- **No herd_type on operations (A19):** Species mix defined by which animal_classes rows exist. Onboarding seeds default classes based on species selection. Species list: beef_cattle, dairy_cattle, sheep, goat, other.
- **Beef/dairy cattle split:** Cattle split into two species because they have fundamentally different lactation cycles (beef: ends at calf weaning; dairy: ends at explicit dry-off), different baseline DMI rates, and different weaning defaults. Same roles for both.
- **Lactation-aware DMI:** `dmi_pct_lactating` stores the higher DMI rate applied during lactation. Lactation status is derived (A2), not stored — see V2_CALCULATION_SPEC.md DMI-2 for logic.
- **Per-class rates (A14):** DMI%, excretion rates, weaning age are Tier 2 overrides. Tier 1 is per-location where applicable; Tier 3 is farm_settings global defaults.

```sql
CREATE TABLE animal_classes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  name              text NOT NULL,
  species           text NOT NULL CHECK (species IN ('beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other')),
  role              text NOT NULL,
  default_weight_kg numeric,
  dmi_pct           numeric,
  dmi_pct_lactating numeric,
  excretion_n_rate  numeric,
  excretion_p_rate  numeric,
  excretion_k_rate  numeric,
  weaning_age_days  integer,
  archived          boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 3.2 animals

**Purpose:** Core livestock entity. Every animal belongs to an operation, has a class (which determines its role and species), and optionally has lineage links (dam, sire). Weight, group membership, and weaning target date are all derived — not stored on this table (A2). `confirmed_bred` is stored directly (see OI-0099 for the 2026-04-18 decision to reverse the original "derived from breeding records" design).
**Audit refs:** ANI-01, ANI-02, ANI-10, ANI-11, ANI-12, ANI-13

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| class_id | uuid | FK → animal_classes | Drives role-based action gating. Nullable for imports/drafts. |
| tag_num | text | | Ear tag — unique per operation if provided |
| eid | text | | Electronic ID |
| name | text | | Optional |
| sex | text | NOT NULL | 'male' or 'female'. Normalized from v1 legacy values. |
| dam_id | uuid | FK → animals | Self-referential. Nullable. |
| sire_animal_id | uuid | FK → animals | Herd bull lineage. Nullable. (A28) |
| sire_ai_bull_id | uuid | FK → ai_bulls | AI sire lineage. Nullable. (A28) |
| birth_date | date | | Drives weaning target calc (birth_date + class.weaning_age_days) |
| weaned | boolean | | null=unknown, false=not weaned, true=weaned |
| weaned_date | date | | When marked weaned |
| confirmed_bred | boolean | NOT NULL, DEFAULT false | Stored Edit Animal checkbox (OI-0099), not derived. NOT NULL false default is not sufficient alone to define the open set; cow/heifer female active eligibility applies. Birth must explicitly clear this field (2026-11-08 lock). Migration 026. |
| notes | text | | |
| active | boolean | DEFAULT true | false = culled |
| cull_date | date | | Flattened from v1 cullRecord object |
| cull_reason | text | | |
| cull_notes | text | | |
| is_bulk | boolean | NOT NULL, DEFAULT false | True when this row is a group composite (many head, one record). False for an individual. Default false keeps every existing row an individual. Migration 039. |
| bulk_head_count | integer | | Head represented by a composite. Null on individual animals. Non-negative integer on composites. Migration 039 / schema stamp 39. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Derived fields (not stored — A2):**
- **Current weight:** Latest record from `animal_weight_records` (D9)
- **Wean target date:** `birth_date + animal_classes.weaning_age_days`
- **Current group:** Open membership from `animal_group_memberships` (date_left IS NULL)

**Design decisions:**
- **Sire linkage via FKs, not free text (A28):** V1's sireTag (free text) replaced by two FKs: `sire_animal_id` for herd bulls, `sire_ai_bull_id` for AI sires. At most one populated. Lineage on the animal record; breeding history details on `animal_breeding_records` (D9). Edit Animal's sire picker writes these two FKs directly with mutual exclusivity (OI-0099 Class B B1). Inline "Add AI bull" from the picker creates `ai_bulls` rows for historical / external / non-AI bulls that predate the app — the table name is a v1-era artifact retained for now; rename/split is a future OI.
- **Confirmed bred stored, not derived (A29 — reversed by OI-0099 on 2026-04-18):** V1 stored `confirmedBred` on the animal; v2 originally planned to derive from breeding records ("most recent confirmed breeding with no subsequent calving"). Deriving turned out to block the Edit Animal UI (farmer can confirm pregnancy months before any calving record exists) and required rules that were never implemented. Migration 026 adds `confirmed_bred boolean NOT NULL DEFAULT false`; the Edit Animal checkbox writes directly. If a richer breeding-status model is ever needed (palpation dates, methods, repro history) that's a new `animal_breeding_status` table (see OI-0099 "Option B6" — deferred).
- **Open-set definition (Tim, 2026-11-08):** active (not culled) females in cow or heifer classes with `confirmed_bred === false`; calves are excluded. Counts and named-animal reproductive evidence use this same data definition. A calf, male or inactive/culled animal is not called an open cow. `confirmed_bred` is NOT NULL DEFAULT false, written by the Edit Animal checkbox (OI-0099), and must now also be cleared on any recorded birth (Domain 9). No separate confirmed-open column. “Open” needed a domain definition because the unchecked default alone would otherwise include calves or other ineligible animals. Missing authorized animal/class evidence is not a definitive negative.
- **Birth clears stored checkbox (Tim, 2026-11-08):** every path creating an `animal_calving_records` row for a dam must explicitly set her `confirmed_bred` / `confirmedBred` to false. Existing Calving and calving-sync paths do not currently do this. This required side effect includes normal Calving, voice through its save, and calf-to-dam linking that creates the calving row.

- **Cull fields flattened:** V1's `cullRecord` JSONB object ({date, reason, notes}) promoted to three proper columns for queryability.
- **No healthEvents[], calvingRecords[], weightHistory[]:** All moved to their own tables in D9 and weight records table. No JSONB arrays on the animal record.
- **One row can stand for many head (migration 039, schema stamp 39):** `is_bulk` is true for a group composite and false for an individual. Default false keeps every existing row an individual. `bulk_head_count` is the head represented by a composite (non-negative integer) and null on individuals. CHECK `animals_bulk_head_count_check`: `(is_bulk = false AND bulk_head_count IS NULL) OR (is_bulk = true AND bulk_head_count IS NOT NULL AND bulk_head_count >= 0)`. Total weight stays on `animal_weight_records` (no new weight column). Weight input is per head; stored as lot total (PRs #66, #67, #68).

```sql
CREATE TABLE animals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  class_id         uuid REFERENCES animal_classes(id),
  tag_num          text,
  eid              text,
  name             text,
  sex              text NOT NULL,
  dam_id           uuid REFERENCES animals(id),
  sire_animal_id   uuid REFERENCES animals(id),
  sire_ai_bull_id  uuid REFERENCES ai_bulls(id),
  birth_date       date,
  weaned           boolean,
  weaned_date      date,
  confirmed_bred   boolean NOT NULL DEFAULT false,
  notes            text,
  active           boolean DEFAULT true,
  cull_date        date,
  cull_reason      text,
  cull_notes       text,
  is_bulk          boolean NOT NULL DEFAULT false,
  bulk_head_count  integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT animals_bulk_head_count_check CHECK (
    (is_bulk = false AND bulk_head_count IS NULL)
    OR (is_bulk = true AND bulk_head_count IS NOT NULL AND bulk_head_count >= 0)
  )
);
```

### 3.3 groups

**Purpose:** Operation-scoped operational label for animals currently moving together. A group is just a name — which animals are in it is derived from the membership ledger, and which farm it's currently on is derived at read time from the latest open `event_group_window → event.farm_id`. Same operation can have multiple groups (e.g., "Bred Heifers", "Cow Herd", "Cull") and the same name can appear on multiple farms at different times as the group moves.
**Audit refs:** ANI-04, ANI-05, ANI-06

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| name | text | NOT NULL | |
| color | text | | Hex color for UI badges |
| archived_at | timestamptz | NULL | Soft-delete timestamp. NULL = active. Set to `now()` when the group is archived. Replaces an earlier `archived boolean` column (migration 024 / OI-0090, SP-11 Part 3): a timestamp lets the UI show *when* a group was archived in the management list and lets analytics query "groups archived in the last 30 days" without a separate audit table. The partial index `idx_groups_active ON groups WHERE archived_at IS NULL` keeps active-group queries fast. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Operation-scoped with derived current farm (OI-0133):** The group record itself has no `farm_id`. The group's current farm is derived at read time by taking the latest open `event_group_window` (one with `date_left IS NULL`, sorted by `date_joined DESC, time_joined DESC`) and reading that window's parent event's `farm_id`. A group with no open window has no current farm — it appears only in "All farms" view. This removes the drift class where a cross-farm move updated the destination event but left `groups.farm_id` pointing at the source farm. Helper: `getGroupCurrentFarm(groupId)` in `src/data/store.js`. Prior design stored `farm_id` on the group and required the move wizard to keep it in sync; migration 032 dropped the column. See CLAUDE.md §"Known Traps" for the grep contracts that prevent re-introduction.
- **Soft-delete via timestamp, not boolean (SP-11 Part 3, OI-0090):** Migration 024 upgraded `archived boolean` to `archived_at timestamptz`. The trigger was the empty-group archive cascade (UI_SPRINT_SPEC SP-11): when the last animal leaves a group, the management UI prompts the user to archive it, and we want to display "archived 3 days ago" in the list. A boolean lost that information. Existing `archived = true` rows were backfilled with `archived_at = updated_at` during the migration. CP-55/CP-56 backup migration handles the upgrade for older backups.
- **No animalIds[] array:** V1 derived `group.animalIds` from the membership ledger at load time. V2 does the same — the group record never stores a list of animals.

```sql
CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  color         text,
  archived_at   timestamptz,                                     -- NULL = active. Migration 024 (SP-11 / OI-0090) replaced earlier `archived boolean`.
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Migration 024 (SP-11) created `idx_groups_active ON groups(farm_id) WHERE archived_at IS NULL`.
-- Migration 032 (OI-0133) dropped `farm_id`, which auto-dropped that index. No replacement
-- index exists today — group lookups currently filter by `archived_at IS NULL` after RLS scopes
-- by `operation_id`. If active-group query volume becomes a hot path, consider re-creating the
-- partial index on `(operation_id) WHERE archived_at IS NULL`. Tracked separately if needed.
```

### 3.4 animal_group_memberships

**Purpose:** Membership ledger — complete history of which animal was in which group and when. An open membership (date_left IS NULL) means the animal is currently in that group. Dovetails with event_group_windows (A1): membership says who's in the group, event windows say that group was on a pasture during a time period.
**Audit refs:** ANI-04, ANI-05, ANI-06, ANI-10, ANI-13

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| animal_id | uuid | FK → animals, NOT NULL | |
| group_id | uuid | FK → groups, NOT NULL | |
| date_joined | date | NOT NULL | When animal entered this group |
| date_left | date | | NULL = currently in this group |
| reason | text | | 'initial', 'move', 'split', 'calving', 'weaning', 'cull', etc. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Key queries:**
- "Animals in Group X now" → `WHERE group_id = X AND date_left IS NULL`
- "Current group for Animal Y" → `WHERE animal_id = Y AND date_left IS NULL`
- "Group history for Animal Y" → `WHERE animal_id = Y ORDER BY date_joined`
- "Who was in Group X on date D" → `WHERE group_id = X AND date_joined <= D AND (date_left IS NULL OR date_left > D)`

**Design decisions:**
- **One open membership at a time:** App-enforced, not a DB constraint. Moving an animal always closes the old membership before opening a new one. Offline sync could create momentary overlaps — resolved at sync reconciliation.
- **Reason field is free text, not enum:** New reasons may emerge (e.g., 'purchase', 'import') without schema changes.
- **Connection to event windows:** To calculate DMI for an event_group_window, the app looks at the window (which group, time period, head_count snapshot) then pulls animals via the membership ledger to get classes and Tier 2 rates.

```sql
CREATE TABLE animal_group_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  group_id      uuid NOT NULL REFERENCES groups(id),
  date_joined   date NOT NULL,
  date_left     date,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 4: Feed Inventory

Feed types define the product catalog (what kinds of feed exist). Batches are specific inventory deliveries or harvests of a feed type. Batch adjustments track every inventory correction for auditability.

### 4.1 feed_types

**Purpose:** Reference catalog for stored feed products. Each type defines the template that batches inherit from — DM%, NPK composition, default weight, unit. Also controls harvest tile visibility via `harvest_active` flag.
**Audit refs:** FED-02
**Architecture decisions:** A8 (harvest creates batch — forage_type_id links harvest feed back to species)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping |
| name | text | NOT NULL | e.g. "1st Cut Timothy Hay", "Corn Silage" |
| category | text | NOT NULL | hay, silage, haylage, balage, grain, supplement. App-managed list, no DB constraint. |
| unit | text | NOT NULL | "bale", "ton", "bag", etc. |
| dm_pct | numeric | NULL | Default DM% — pre-fills on batch creation |
| n_pct | numeric | NULL | Default N% composition |
| p_pct | numeric | NULL | Default P% composition |
| k_pct | numeric | NULL | Default K% composition |
| default_weight_kg | numeric | NULL | Default weight per unit. V1: default_weight_lbs. Pre-fills batch. |
| cutting_number | smallint | NULL | 1st, 2nd, 3rd cut. Part of the product template identity — "2nd Cut Timothy Hay" is a different product than "1st Cut Timothy Hay" with different DM%, NPK, weight defaults. |
| forage_type_id | uuid | NULL, FK → forage_types | Links to forage species for harvest traceability |
| harvest_active | boolean | DEFAULT false | Eligible for harvest tile display. When it's 2nd cutting season, farmer toggles this on for "2nd Cut Timothy" and off for "1st Cut Timothy" — reduces clicks in the field. |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Category as app-managed text.** Categories (hay, silage, haylage, balage, grain, supplement) are industry-standard and unlikely to need user customization. No DB constraint — the list is defined in app code. Adding a category is a one-line code change, no migration. V1 had: hay, silage, grain, stored feed. V2 adds haylage and balage, renames "stored feed" to "supplement".
- **cost_per_unit dropped.** V1 had this on feed_types but it's really batch-level — the price you paid for a specific delivery. Moved to batches only.
- **cutting_number kept.** This is product template identity, not harvest event data. "1st Cut Timothy Hay" and "2nd Cut Timothy Hay" are genuinely different products with different DM%, NPK, and weight defaults. The harvest_active toggle pairs with it — at 2nd cutting season, flip "2nd Cut Timothy" active, flip "1st Cut" off. harvest_event_fields.cutting_number is a separate concern (which cut of which field in which season).
- **NPK on feed type vs forage type.** Feed type NPK (n_pct, p_pct, k_pct) describes the nutrient content of the stored feed product. Forage type NPK (n_per_tonne_dm, etc.) describes standing forage in the paddock. Different numbers, different use cases.

**Referenced by:**
- `batches.feed_type_id` — inventory deliveries of this type
- Harvest tile grid (filtered by harvest_active = true)

```sql
CREATE TABLE feed_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  name                text NOT NULL,
  category            text NOT NULL,
  unit                text NOT NULL,
  dm_pct              numeric,
  n_pct               numeric,
  p_pct               numeric,
  k_pct               numeric,
  default_weight_kg   numeric,
  cutting_number      smallint,
  forage_type_id      uuid REFERENCES forage_types(id),
  harvest_active      boolean DEFAULT false,
  archived            boolean DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

### 4.2 batches

**Purpose:** Feed inventory records. Each batch is a discrete delivery (purchase) or harvest of a feed type. Quantity depletes as feed is delivered to locations via events. Harvest batches are auto-created by D7 harvest flow (A8).
**Audit refs:** FED-03, FED-08, FED-10

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping |
| feed_type_id | uuid | NOT NULL, FK → feed_types | What kind of feed |
| name | text | NOT NULL | V1: label. e.g. "Alfalfa-20Jan2026-500kg" |
| batch_number | text | NULL | Organic feed lot tracking number for traceability. Assigned at harvest or batch creation. Follows the feed through to feeding events. |
| source | text | NOT NULL, DEFAULT 'purchase' | 'purchase' or 'harvest'. Harvest batches auto-created by D7 (A8). |
| quantity | numeric | NOT NULL | Original quantity in units |
| remaining | numeric | NOT NULL | Current quantity. Decremented by feed entries, adjusted by batch_adjustments. |
| unit | text | NOT NULL | Inherited from feed type at creation |
| weight_per_unit_kg | numeric | NULL | V1: wt (lbs). Weight per bale/bag/unit. |
| dm_pct | numeric | NULL | Inherited from feed type, can be overridden per batch |
| cost_per_unit | numeric | NULL | Price paid per unit for this specific batch. Moved from feed_types — cost is batch-level. |
| purchase_date | date | NULL | When acquired or harvested |
| notes | text | NULL | |
| archived | boolean | DEFAULT false | Soft delete — retired batch |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **batch_number for organic traceability.** Text field for feed lot tracking numbers used in organic certification. Follows the feed from harvest through inventory to feeding events. Resolved via FK at display time (principle #5) — not duplicated onto event_feed_entries.
- **cost_per_unit on batch, not feed type.** The same feed type bought from different suppliers at different times has different prices. Cost is inherently per-delivery.
- **remaining tracks current inventory.** Decremented when feed entries are saved (Quick Feed, event feed). Adjusted by batch_adjustments for corrections. The full audit trail lives in batch_adjustments.

**Referenced by:**
- `event_feed_entries.batch_id` — feed delivered from this batch
- `harvest_event_fields.batch_id` — harvest that created this batch (A8)
- `batch_nutritional_profiles.batch_id` (D10) — lab results
- `batch_adjustments.batch_id` — inventory corrections

```sql
CREATE TABLE batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  feed_type_id        uuid NOT NULL REFERENCES feed_types(id),
  name                text NOT NULL,
  batch_number        text,
  source              text NOT NULL DEFAULT 'purchase',
  quantity            numeric NOT NULL,
  remaining           numeric NOT NULL,
  unit                text NOT NULL,
  weight_per_unit_kg  numeric,
  dm_pct              numeric,
  cost_per_unit       numeric,
  purchase_date       date,
  notes               text,
  archived            boolean DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

### 4.3 batch_adjustments

**Purpose:** Inventory correction history. Each row is one adjustment to a batch's remaining quantity. Normalized from v1's JSONB `adjustments[]` array on the batch record (A23).
**Audit refs:** FED-08

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| batch_id | uuid | NOT NULL, FK → batches ON DELETE CASCADE | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping |
| adjusted_by | uuid | NULL, FK → operation_members | Who made the correction. New in v2 — v1 didn't track this. |
| previous_qty | numeric | NOT NULL | Quantity before adjustment |
| new_qty | numeric | NOT NULL | Quantity after adjustment |
| delta | numeric | NOT NULL | Change amount (positive = added, negative = removed). Stored for query convenience — "total shrinkage this month" without computing diffs. Self-check: previous_qty + delta must equal new_qty. |
| reason | text | NULL | e.g. "Miscounted", "Found extra in barn", "Spoilage" |
| adjustment_date | date | NULL | User-settable effective date. Added in migration 036 (2026-11-03). |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Normalized from JSONB (A23).** V1 stored adjustments as an inline array on the batch. V2 normalizes for: user tracking (adjusted_by), cross-batch queries (monthly shrinkage), and consistency with principle #6.
- **delta stored despite being derived.** Exception to compute-on-read (A2) because it enables direct aggregation queries and serves as an integrity check alongside previous_qty and new_qty.
- **No updated_at.** Adjustments are write-once records. Once recorded, they're immutable history.
- **adjustment_date (migration 036, 2026-11-03).** Nullable `date`. User-settable effective date for the adjustment.

```sql
CREATE TABLE batch_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  operation_id    uuid NOT NULL REFERENCES operations(id),
  adjusted_by     uuid REFERENCES operation_members(id),
  previous_qty    numeric NOT NULL,
  new_qty         numeric NOT NULL,
  delta           numeric NOT NULL,
  reason          text,
  adjustment_date date,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 5: Event System

This is the core of the app. Every grazing event, every feed delivery, every paddock move flows through this system. The event system was redesigned from scratch in the interactive design sessions to use a window-based model instead of v1's anchor-paddock model.

### Key concepts

**Window model:** An event doesn't have a single paddock or a single group. Instead, paddocks and groups join and leave the event over time via "windows." A paddock window is open from date_opened to date_closed. A group window is open from date_joined to date_left. The event is active as long as at least one paddock window and one group window overlap.

**No sub-moves:** v1 had a separate sub-move concept that duplicated paddock window functionality. In v2, adding/removing a paddock from an event is just opening/closing a paddock window. Sub-moves are eliminated.

**No anchor paddock:** v1 locked the first paddock as an immovable "anchor." In v2, all paddock windows are equal. The event is open while any window combination is open.

### 5.1 events

**Audit refs:** GRZ-01, GRZ-02, GRZ-03, GRZ-04

The event parent record. Deliberately thin — most detail lives in child tables (windows, feed, observations).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| farm_id | uuid | NOT NULL, FK → farms | An event belongs to exactly one farm — no event straddles farms. Cross-farm moves produce **two** linked events (see `source_event_id`). |
| date_out | date | NULL | NULL = event still open |
| time_out | text | NULL | |
| source_event_id | uuid | NULL, FK → events ON DELETE SET NULL | When this event was created by a cross-farm move, points back to the (now-closed) source event on the other farm. NULL for regular within-farm events. Enables event cards to render "← Moved from {farm}" / "→ Moved to {farm}" markers on each side of the move pair. |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **No `date_in` / `time_in` (OI-0117, migration 028):** The event start datetime is **derived at read time** from the earliest child window — `MIN(event_paddock_windows.date_opened, event_group_windows.date_joined)`. Migration 028 dropped the previously-stored `date_in` / `time_in` columns. Reads go through `getEventStart(eventId)` / `getEventStartDate(eventId)` in `src/features/events/event-start.js`; the hero-line edit writes through to the earliest child window via `setEventStart()`. The drop closed the OI-0115 drift class: a phantom `change` event on a teardown-replaced date input could overwrite the stored `date_in` while the child windows held the true start, leaving every downstream calc reading stale state. CLAUDE.md "Known Traps" carries the grep contracts that prevent re-introduction. **General rule for v2:** if a value is derivable from child rows at read time, derive it on read — do not also store it on the parent.
- **No pastureId** — paddock participation is in event_paddock_windows
- **No groupId, animalCount, avgWeight** — group participation is in event_group_windows, with point-in-time snapshots there
- **No status column** — status is derived: `date_out IS NULL` → active, otherwise closed
- **No noPasture flag** — inferred from location type (if all paddock windows point to confinement locations, it's a confinement event)
- **date_out** set by the close/move sequence, not editable directly
- **No events straddle farms:** `farm_id NOT NULL` enforces this at the schema level. All `event_paddock_windows` for a given event must reference locations on the same farm as `events.farm_id`. A whole-group cross-farm move closes the source event on Farm 1 (sets `date_out`) and opens a **new** event on Farm 2 with `source_event_id` pointing back. Individual animal cross-farm moves are membership edits only (`animal_group_memberships`) and do not create or close any event.
- **source_event_id is one-directional:** The destination event points to the source. To find the destination from the source, query `events WHERE source_event_id = :this_id`. A source event can have at most one destination (a split-plus-cross-farm produces one split + one move pair). `ON DELETE SET NULL` preserves the destination event's history if the source is ever deleted.

```sql
CREATE TABLE events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  farm_id           uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  -- date_in / time_in dropped in migration 028 (OI-0117) — derived at read time from
  -- the earliest child window via getEventStart() / getEventStartDate().
  date_out          date,
  time_out          text,
  source_event_id   uuid REFERENCES events(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 5.2 event_paddock_windows

**Replaces:** v1 `event_paddock_windows` + `event_sub_moves`
**Audit refs:** GRZ-01, GRZ-02, GRZ-05

Each row represents a paddock's participation in an event. Opening a window = animals can access this paddock. Closing a window = animals leave. Multiple windows can be open simultaneously (multi-paddock grazing).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| event_id | uuid | NOT NULL, FK → events ON DELETE CASCADE | Parent event |
| location_id | uuid | NOT NULL, FK → locations | Which paddock |
| date_opened | date | NOT NULL | When animals gained access |
| time_opened | text | NULL | |
| date_closed | date | NULL | NULL = window still open |
| time_closed | text | NULL | |
| no_pasture | boolean | DEFAULT false | Override: 100% stored feed even on a land location |
| is_strip_graze | boolean | DEFAULT false | Marks this window as part of a strip grazing sequence |
| strip_group_id | uuid | NULL | Shared across all strips in the same sequence |
| area_pct | numeric | DEFAULT 100, CHECK (> 0 AND ≤ 100) | Percentage of paddock area this window covers |
| open_cohort_id | uuid | NULL | OI-0102. Shared by windows opened in the same Save. Null = opened alone. Not an anchor. Migration 035, not yet applied. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **All paddock windows are equal** — no anchor concept. First opened is just first opened.
- **no_pasture override** — normally inherited from location type, but can be set per-window for mixed-use locations where you want to track as stored-feed-only for a particular visit.
- **Closing a window triggers a paddock observation** (recorded in paddock_observations with source='event').
- **Opening a window also triggers a paddock observation** (pre-graze reading).
- **Open cohort (OI-0102, specified 2026-10-04, migration 035 not yet applied):** windows opened in one Save share `open_cohort_id`. Null means opened alone. The cohort is a label, not a lock: any member can close early. It is not an anchor. Strip graze still uses `strip_group_id`. See `github/issues/OI-0102_multi-paddock-open.md`.
- **Strip grazing** — when `is_strip_graze = true`, the window represents a portion of a paddock (sized by `area_pct`). All strips in the same sequence share a `strip_group_id`. UI shows strip-specific controls (advance strip, progress indicator). Calculation layer uses `area_pct` for effective area in stocking density and NPK. Each strip gets its own pre/post-graze observations via the standard window open/close mechanism. See spec: `github/issues/strip-grazing-paddock-windows.md`.

```sql
CREATE TABLE event_paddock_windows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  location_id       uuid NOT NULL REFERENCES locations(id),
  date_opened       date NOT NULL,
  time_opened       text,
  date_closed       date,
  time_closed       text,
  no_pasture        boolean DEFAULT false,
  is_strip_graze    boolean DEFAULT false,
  strip_group_id    uuid,
  area_pct          numeric DEFAULT 100 CHECK (area_pct > 0 AND area_pct <= 100),
  open_cohort_id    uuid,  -- OI-0102, migration 035, not yet applied
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 5.3 event_group_windows

**New in v2** — v1 tracked group membership on events via `event_group_memberships` with snapshot fields. v2 uses a proper window model.
**Audit refs:** GRZ-01, GRZ-02, ANI-03

Each row represents a group's participation in an event. When a group joins, we snapshot head_count and avg_weight_kg as raw facts at that moment. If group composition changes mid-event (e.g., weaning), the window closes and a new one opens with updated snapshots.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| event_id | uuid | NOT NULL, FK → events ON DELETE CASCADE | Parent event |
| group_id | uuid | NOT NULL, FK → groups | Which group |
| date_joined | date | NOT NULL | When group joined the event |
| time_joined | text | NULL | |
| date_left | date | NULL | NULL = group still on event |
| time_left | text | NULL | |
| head_count | integer | NOT NULL | Snapshot at join time — raw fact, not computed |
| avg_weight_kg | numeric | NOT NULL | Snapshot at join time — raw fact, not computed |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **head_count and avg_weight_kg are snapshots, not computed values.** They record what the group looked like when it joined this event. This is the one exception to "compute on read" — you can't go back and ask "how many head were in this group on March 5th" without a snapshot.
- **Composition change = close + reopen.** If a farmer moves an animal from Group A to Group B mid-graze (weaning), Group A's window closes and a new Group A window opens with updated head_count/avg_weight_kg. Group B's window on its event also closes and reopens. This keeps DMI calculations accurate per window.

```sql
CREATE TABLE event_group_windows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id          uuid NOT NULL REFERENCES groups(id),
  date_joined       date NOT NULL,
  time_joined       text,
  date_left         date,
  time_left         text,
  head_count        integer NOT NULL,
  avg_weight_kg     numeric NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 5.4 event_feed_entries

**Replaces:** v1 `event_feed_deliveries`
**Audit refs:** FED-01, FED-02, FED-03, FED-04, GRZ-04

Records every feed delivery, transfer-in, or transfer-out on an event. Feed is always delivered to a specific paddock within the event (location_id is NOT NULL). The `entry_type` column distinguishes incoming deliveries from outgoing removals.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| event_id | uuid | NOT NULL, FK → events ON DELETE CASCADE | Parent event the entry belongs to. For removals, this is the *source* event the feed left from. |
| batch_id | uuid | NOT NULL, FK → batches | Which feed batch |
| location_id | uuid | NOT NULL, FK → locations | Which paddock the feed left from (for removals) or arrived at (for deliveries) |
| date | date | NOT NULL | Entry date |
| time | text | NULL | |
| quantity | numeric | NOT NULL, CHECK (quantity > 0) | Amount in batch units. Always positive — direction is encoded by `entry_type`, not sign. |
| entry_type | text | NOT NULL, DEFAULT 'delivery', CHECK in ('delivery','removal') | Direction of the entry. `delivery` = feed arrived on this event; `removal` = feed left this event for somewhere else. Added in migration 023 (SP-10 §8a Move Feed Out). |
| destination_type | text | NULL, CHECK in ('batch','event') | Where a `removal` went. `batch` = returned to inventory (creates/credits a batch row). `event` = transferred to another open event. Required when `entry_type = 'removal'` (CHECK `chk_removal_has_destination`); must be NULL when `entry_type = 'delivery'`. Added in migration 023. |
| destination_event_id | uuid | NULL, FK → events ON DELETE SET NULL | Set when `destination_type = 'event'`; FK to the destination event. Enforced by CHECK `chk_dest_event_consistency`: must be NOT NULL when `destination_type = 'event'`, NULL otherwise. Added in migration 023. |
| source_event_id | uuid | NULL, FK → events | Pre-SP-10 transfer-in marker — kept for backward compatibility with delivery rows that came from another event. NULL = fresh delivery. SP-10's `removal` rows on the source event are now the canonical record of an event-to-event transfer; the destination event's matching `delivery` row points back via `source_event_id` so historical UIs continue to work. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Always positive quantity, direction in `entry_type` (SP-10).** Pre-SP-10, only "delivery" rows existed; transfers were modeled by adding a delivery row on the destination event and pointing its `source_event_id` back. SP-10's "Move Feed Out" flow added the `removal` direction so the source event has an explicit record of feed leaving (without resorting to negative quantities, which v1 used and which were error-prone). The calculation layer reads both `entry_type = 'delivery'` (in) and `entry_type = 'removal'` (out) for any consumption / remaining calculation.
- **Destination model — batch or event.** A `removal` either goes back to inventory (`destination_type = 'batch'`) — useful when a farmer pulls bales off a paddock and returns them to the stack — or transfers to another open event (`destination_type = 'event'` with `destination_event_id` set). The check constraints enforce that the right destination columns are populated for each case.
- **location_id NOT NULL.** Feed is always tied to a specific paddock. For bale grazing, knowing which paddock got the bales is essential for nutrient and residue tracking. For removals, this is the paddock the feed *left from*.
- **Pre-SP-10 `source_event_id` retained for compatibility.** The original v2 transfer model used a single `delivery` row on the destination with `source_event_id` pointing to the source event. SP-10 adds the explicit `removal` row on the source for symmetry, but the `source_event_id` column on delivery rows is preserved so historical data and the destination-side of new transfers both render correctly.
- **No unit column.** Unit comes from the batch (`batch.quantity_unit`). All feed entries for a batch use the same unit.
- **No transfer_pair_id.** Transfer pairs are linked by walking `event_feed_entries WHERE entry_type = 'removal' AND destination_event_id = :dest` from the source side, or `WHERE entry_type = 'delivery' AND source_event_id = :source` from the destination side. A pair_id would be a third source of truth; keeping it implicit avoids drift.

**CP-55/CP-56 export-spec impact:** New persisted columns `entry_type`, `destination_type`, `destination_event_id` must be included in CP-55 export and CP-56 import. CP-56 must default `entry_type = 'delivery'` and the two destination columns to NULL when reading backups from schema_version ≤ 22 — that matches migration 023's `DEFAULT 'delivery'` and gives older backups the same shape as the pre-SP-10 model. Tracked in OPEN_ITEMS.

```sql
CREATE TABLE event_feed_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id          uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id              uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  batch_id              uuid NOT NULL REFERENCES batches(id),
  location_id           uuid NOT NULL REFERENCES locations(id),
  date                  date NOT NULL,
  time                  text,
  quantity              numeric NOT NULL CHECK (quantity > 0),
  entry_type            text NOT NULL DEFAULT 'delivery',                     -- migration 023 (SP-10)
  destination_type      text,                                                 -- migration 023 (SP-10)
  destination_event_id  uuid REFERENCES events(id) ON DELETE SET NULL,        -- migration 023 (SP-10)
  source_event_id       uuid REFERENCES events(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Migration 023 check constraints (SP-10 Move Feed Out)
  CONSTRAINT chk_entry_type_enum
    CHECK (entry_type IN ('delivery', 'removal')),
  CONSTRAINT chk_destination_type_enum
    CHECK (destination_type IS NULL OR destination_type IN ('batch', 'event')),
  CONSTRAINT chk_removal_has_destination
    CHECK (entry_type = 'delivery' OR destination_type IS NOT NULL),
  CONSTRAINT chk_dest_event_consistency
    CHECK (
      (destination_type = 'event' AND destination_event_id IS NOT NULL)
      OR (destination_type = 'batch' AND destination_event_id IS NULL)
      OR (destination_type IS NULL AND destination_event_id IS NULL)
    )
);
```

### 5.5 event_feed_checks

**Replaces:** v1 `event_feed_residual_checks` (parent portion)
**Audit refs:** FED-07, FED-08, GRZ-04

A feed check is a field observation of how much feed remains. The parent record captures when and why. The per-batch/per-paddock detail is in event_feed_check_items (5.6).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| event_id | uuid | NOT NULL, FK → events ON DELETE CASCADE | Parent event |
| date | date | NOT NULL | Check date |
| time | text | NULL | |
| is_close_reading | boolean | DEFAULT false | True = taken when closing event/paddock |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Normalized, not JSONB.** v1 crammed per-type check data into a JSONB column. v2 splits into parent (event_feed_checks) and child (event_feed_check_items) for proper querying and validation.
- **is_close_reading** marks checks taken during the close/move sequence. These are special because they establish the "final remaining" for transfer calculations.
- **A feed transfer bakes in a feed check.** When feed is moved to a new event, the remaining feed on the source paddock is recorded as a close reading. This eliminates the v1 bug where feed checks after a transfer didn't account for the transferred amount.

```sql
CREATE TABLE event_feed_checks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date              date NOT NULL,
  time              text,
  is_close_reading  boolean DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 5.6 event_feed_check_items

**New in v2** — v1 stored this as JSONB inside the check record.
**Audit refs:** FED-07, FED-08

One row per batch per paddock observed in a feed check. Records the absolute remaining quantity — the calculation layer uses total delivered history to compute consumption.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping (Design Principle #8) |
| feed_check_id | uuid | NOT NULL, FK → event_feed_checks ON DELETE CASCADE | Parent check |
| batch_id | uuid | NOT NULL, FK → batches | Which feed batch |
| location_id | uuid | NOT NULL, FK → locations | Which paddock |
| remaining_quantity | numeric | NOT NULL | Absolute remaining (not a percentage) |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Absolute remaining, not percentage.** v1 stored both remainingPct and remainingUnits. v2 stores only the absolute quantity. Percentage is derived (remaining / total delivered to this paddock).
- **Per-batch per-paddock.** A single feed check can observe multiple batches across multiple paddocks. Each combination gets its own row.
- **operation_id** carried directly for RLS and operation-scoped queries (backup delete, parity check). Matches parent's operation_id — set by app code at insert time. Added in migration 019 (OI-0055).
- **No updated_at** — check items are immutable once created. To change a reading, delete and recreate.
- **Calculation layer uses full delivery history.** To compute "started with": sum all deliveries (including transfers in) for this batch at this paddock up through the check date. Subtract remaining_quantity = consumed. This fixes the v1 bug where feed checks only looked at the initial transferred amount and missed subsequent deliveries.

```sql
CREATE TABLE event_feed_check_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  feed_check_id       uuid NOT NULL REFERENCES event_feed_checks(id) ON DELETE CASCADE,
  batch_id            uuid NOT NULL REFERENCES batches(id),
  location_id         uuid NOT NULL REFERENCES locations(id),
  remaining_quantity  numeric NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

### 5.7 paddock_observations

**Redesigned from v1** — v1 had a `paddock_observations` table but it was incomplete.
**Audit refs:** PST-03, PST-04, GRZ-01, GRZ-03

Unified ledger of paddock condition observations from all sources. Every paddock open, close, and survey creates a row here. The calculation engine queries this one table for the latest paddock state.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| location_id | uuid | NOT NULL, FK → locations | Which paddock |
| observed_at | timestamptz | NOT NULL | When the observation was taken |
| type | text | NOT NULL | `'open'` or `'close'` |
| source | text | NOT NULL | `'event'` or `'survey'` |
| source_id | uuid | NULL | FK to the source record (event_paddock_window id or survey id) |
| forage_height_cm | numeric | NULL | Average forage height |
| forage_cover_pct | numeric | NULL | Percent of paddock with usable forage (0-100) |
| forage_quality | numeric | NULL | Relative forage quality (1-100 scale) |
| forage_condition | text | NULL | `'poor'`, `'fair'`, `'good'`, `'excellent'` |
| bale_ring_residue_count | integer | NULL | Count of bale ring residues — helps calculate cover % and track nutrient cycling since last bale graze |
| residual_height_cm | numeric | NULL | Post-graze residual height (typically on close) |
| recovery_min_days | integer | NULL | Estimated minimum recovery days (typically on close) |
| recovery_max_days | integer | NULL | Estimated maximum recovery days (typically on close) |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **type = 'open' or 'close'.** Open observations capture pre-graze state (height, cover, quality, condition, bale ring count). Close observations capture post-graze state (residual height, recovery days). Both can have notes.
- **source = 'event' or 'survey'.** Events create observations automatically when paddock windows open/close. Surveys create observations from manual walk-throughs. source_id links back to the originating record.
- **forage_quality** uses a numeric 1-100 scale (relative forage quality). This is distinct from forage_condition which is a simple categorical assessment. Different practitioners use different scales — the 1-100 range accommodates both the fine-grained relative scale and the simpler 1-5 scale (just multiply by 20).
- **bale_ring_residue_count** is new in v2. Bale rings left from previous bale grazing sessions affect forage cover calculations and track nutrient cycling over time. The user can count residue rings during observation and the calculation layer uses it to adjust cover estimates.
- **Last observation wins.** For most purposes, the most recent observation for a location is the relevant one. Queries sort by observed_at DESC and take the first row.

```sql
CREATE TABLE paddock_observations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id              uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  location_id               uuid NOT NULL REFERENCES locations(id),
  observed_at               timestamptz NOT NULL,
  type                      text NOT NULL CHECK (type IN ('open', 'close')),
  source                    text NOT NULL CHECK (source IN ('event', 'survey')),
  source_id                 uuid,
  forage_height_cm          numeric,
  forage_cover_pct          numeric,
  forage_quality            numeric,
  forage_condition          text CHECK (forage_condition IN ('poor', 'fair', 'good', 'excellent') OR forage_condition IS NULL),
  bale_ring_residue_count   integer,
  residual_height_cm        numeric,
  recovery_min_days         integer,
  recovery_max_days         integer,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
```

### 5.8 event_observations — **REMOVED** (OI-0113, migration 029, 2026-04-20)

The `event_observations` table was dropped in migration 029 after OI-0112 (2026-04-18) migrated every writer and OI-0119 (2026-04-20) migrated the last reader (DMI-8 chart) to `paddock_observations` (§5.7). Pre-graze and post-graze event observations now live in `paddock_observations` with `source = 'event'` and `type = 'open' | 'close'`; `source_id` references the originating `event_paddock_windows.id`.

Do not reintroduce an event-scoped observations table. If a future feature needs event-window observations that cannot be expressed in `paddock_observations` with `source = 'event'`, start from a fresh design rather than resurrecting this shape. The pre-OI-0112 table + its design decisions are in git history (last full spec in commit predating the OI-0113 ship; migration files 021 and 022 remain in `supabase/migrations/` for history).

---

## Domain 6: Surveys

Surveys are standalone paddock assessment sessions — a farmer walks the farm rating paddocks. They can be bulk (all paddocks in one session) or single (one paddock from the pasture list). Draft surveys hold work-in-progress; committing a survey writes paddock_observations.

### 6.1 surveys

**Redesigned from v1** — v1 surveys were a single table per paddock. v2 splits into parent (surveys) + children (survey_draft_entries). Committed survey data flows into paddock_observations (5.7).
**Audit refs:** PST-03, PST-04

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| survey_date | date | NOT NULL | Date of the survey |
| type | text | NOT NULL | `'bulk'` or `'single'` |
| status | text | NOT NULL, DEFAULT 'draft' | `'draft'` or `'committed'` |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **The surveys table is a container for drafts.** It exists primarily to hold open/closed draft bulk surveys (walking around the farm doing all pastures) vs. one-off single-paddock entries.
- **status = 'draft' or 'committed'.** While draft, entries are editable. On commit, each entry creates a paddock_observation and the survey status flips to 'committed'. Committed surveys are read-only.
- **No farm_id.** A bulk survey can span multiple farms within an operation. The farm context comes from the individual location_ids in survey_draft_entries.

```sql
CREATE TABLE surveys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  survey_date       date NOT NULL,
  type              text NOT NULL CHECK (type IN ('bulk', 'single')),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 6.2 survey_draft_entries

**New in v2** — v1 stored draft ratings as JSONB blob on the survey record.
**Audit refs:** PST-03, PST-04

One row per paddock in a draft survey. These are the working entries that the farmer fills in as they walk the farm. On commit, each entry becomes a paddock_observation.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping (Design Principle #8) |
| survey_id | uuid | NOT NULL, FK → surveys ON DELETE CASCADE | Parent survey |
| location_id | uuid | NOT NULL, FK → locations | Which paddock |
| forage_height_cm | numeric | NULL | |
| forage_cover_pct | numeric | NULL | |
| forage_quality | numeric | NULL | 1-100 scale |
| forage_condition | text | NULL | poor/fair/good/excellent |
| bale_ring_residue_count | integer | NULL | |
| recovery_min_days | integer | NULL | |
| recovery_max_days | integer | NULL | |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Same observation fields as paddock_observations.** When committed, each entry maps 1:1 to a paddock_observation with source='survey'.
- **operation_id** carried directly for RLS and operation-scoped queries. Matches parent survey's operation_id — set by app code at insert time. Added in migration 019 (OI-0055).
- **Editable while draft.** Entries can be added, updated, or removed as the farmer walks paddocks. Once the parent survey is committed, entries are frozen.

```sql
CREATE TABLE survey_draft_entries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id              uuid NOT NULL REFERENCES operations(id),
  survey_id                 uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  location_id               uuid NOT NULL REFERENCES locations(id),
  forage_height_cm          numeric,
  forage_cover_pct          numeric,
  forage_quality            numeric,
  forage_condition          text CHECK (forage_condition IN ('poor', 'fair', 'good', 'excellent') OR forage_condition IS NULL),
  bale_ring_residue_count   integer,
  recovery_min_days         integer,
  recovery_max_days         integer,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 7: Harvest

Harvest events record hay/silage cutting from fields. A harvest session can span multiple fields. Each field's harvest creates a batch of feed inventory — the batch inherits DM% and weight attributes from the harvest record.

### 7.1 harvest_events

**Audit refs:** XCT-05, FED-01

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| date | date | NOT NULL | Harvest date |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Thin parent record.** Like events, the detail is in the children (harvest_event_fields).
- **No farm_id on parent.** A harvest session can span locations across farms. Farm context comes from the location_id on each field record.

```sql
CREATE TABLE harvest_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  date              date NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 7.2 harvest_event_fields

**Audit refs:** XCT-05, FED-01

One row per field harvested. Each row creates an associated batch for feed inventory tracking. The batch inherits dm_pct and weight_per_unit_kg from this record.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping (Design Principle #8) |
| harvest_event_id | uuid | NOT NULL, FK → harvest_events ON DELETE CASCADE | Parent harvest |
| location_id | uuid | NOT NULL, FK → locations | Which field was harvested |
| feed_type_id | uuid | NOT NULL, FK → feed_types | What was harvested (hay, silage, etc.) |
| quantity | numeric | NOT NULL | Amount harvested |
| weight_per_unit_kg | numeric | NULL | kg per bale/unit |
| dm_pct | numeric | NULL | Dry matter percentage |
| cutting_number | integer | NULL | 1st cutting, 2nd cutting, etc. |
| batch_id | uuid | NULL, FK → batches | Auto-created batch for inventory. Set after batch creation. |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **batch_id links to the inventory batch created from this harvest.** The harvest is the source event; the batch is the inventory record. When the harvest field record is saved, a batch is created with source='harvest', and batch_id is set here for traceability.
- **Batch inherits dm_pct and weight_per_unit_kg.** These are recorded at harvest time and flow into the batch. If lab results come back later, the batch's values can be updated without changing the harvest record.
- **cutting_number** tracks first, second, third cutting for the same field in a season. Important for yield tracking and forage quality differences between cuttings.
- **operation_id** carried directly for RLS and operation-scoped queries. Matches parent harvest event's operation_id — set by app code at insert time. Added in migration 019 (OI-0055).

```sql
CREATE TABLE harvest_event_fields (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  harvest_event_id    uuid NOT NULL REFERENCES harvest_events(id) ON DELETE CASCADE,
  location_id         uuid NOT NULL REFERENCES locations(id),
  feed_type_id        uuid NOT NULL REFERENCES feed_types(id),
  quantity            numeric NOT NULL,
  weight_per_unit_kg  numeric,
  dm_pct              numeric,
  cutting_number      integer,
  batch_id            uuid REFERENCES batches(id),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 8: Nutrients & Amendments

The nutrient and amendment domain covers everything related to soil health, fertilizer application, and manure management. It replaces v1's partial nutrient tracking (N/P/K only) with a full 13-element nutrient panel (A36) across soil tests, input products, amendment applications, and manure batches. This enables fertilizer planning against soil test gaps — users can see what their soil needs and what each amendment delivers across all nutrients, not just the big three.

Three reference tables support the domain: `input_product_categories` (user-extensible product grouping), `input_product_units` (read-only standards and operation-owned custom measurement units), and `input_products` (commercial amendment catalog with full nutrient composition). A `spreaders` table replaces v1's single global manure load size (A22).

### 8.1 input_product_categories

**Purpose:** User-extensible reference table for grouping input products. System seeds defaults ('Fertilizer', 'Compost', 'Lime', 'Other') at onboarding; users add their own without code changes.
**Audit refs:** NUT-02

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| name | text | NOT NULL | 'Fertilizer', 'Compost', 'Lime', 'Other' |
| is_default | boolean | DEFAULT false | System-seeded categories |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **User-extensible reference table (A35):** Same pattern as treatment_categories (A31). V1's implicit categories replaced by a proper table for clean filtering and user customization.

```sql
CREATE TABLE input_product_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  is_default    boolean DEFAULT false,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 8.2 input_product_units

**Purpose:** Read-only standard and operation-owned custom input product purchase/application units. Migration 044 is merged at `6d5893ab` (PR #55, 2026-11-11), written but **not applied**; production is at stamp 43 and the compiled ceiling on main remains 41. Tim's 2026-11-10 5:46 PM ET decision: “Yes let's fix it properly.” Apply still needs Tim's explicit yes at the time plus a backup; coordinate apply and compatible client publish in one session (§9.4).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | Fixed UUIDv5 for standards; custom identity preserved |
| operation_id | uuid | Nullable, DEFAULT NULL, FK → operations | NULL = standard; non-null = custom; immutable |
| name | text | NOT NULL; scoped folded uniqueness | Standards: 'ton', 'bag', 'lb', 'kg', 'gallon' |
| archived | boolean | Nullable, DEFAULT false | Soft archive; name remains reserved |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:** The existing input-product-unit section remains read-only; no new product-unit editor was added in 044. Pickers show standards plus current-operation customs, hide archived choices and preserve already-selected archived references read-only where editing exists. Onboarding no longer seeds either unit table. The common RLS/grants and reference guards are specified in §9.4. The authoritative DDL is `supabase/migrations/044_unit_reference_rls.sql`, not the retired global UNIQUE-name table definition.

### 8.3 input_products

**Purpose:** Commercial amendment catalog — fertilizer, compost, lime, poultry litter, custom blends. Stores full nutrient composition percentages (A36) so amendment applications can compute what actually hits the ground across all 13 elements. Operation-scoped, managed in Settings.
**Audit refs:** NUT-02

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| name | text | NOT NULL | Product name |
| category_id | uuid | FK → input_product_categories, NOT NULL | User-extensible (A35) |
| n_pct | numeric | | Nitrogen % |
| p_pct | numeric | | Phosphorus % |
| k_pct | numeric | | Potassium % |
| s_pct | numeric | | Sulfur % |
| ca_pct | numeric | | Calcium % |
| mg_pct | numeric | | Magnesium % |
| cu_pct | numeric | | Copper % |
| fe_pct | numeric | | Iron % |
| mn_pct | numeric | | Manganese % |
| mo_pct | numeric | | Molybdenum % |
| zn_pct | numeric | | Zinc % |
| b_pct | numeric | | Boron % |
| cl_pct | numeric | | Chlorine % |
| cost_per_unit | numeric | | Cost per purchase unit |
| unit_id | uuid | FK → input_product_units | Shared reference table |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Full 13-element nutrient panel (A36):** V1 only tracked N/P/K percentages. V2 adds S, Ca, Mg, Cu, Fe, Mn, Mo, Zn, B, Cl. All nullable — a simple fertilizer might only have N/P/K, but tested poultry litter or custom blends can capture everything. Supports fertilizer planning against soil test gaps.

```sql
CREATE TABLE input_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  category_id   uuid NOT NULL REFERENCES input_product_categories(id),
  n_pct         numeric,
  p_pct         numeric,
  k_pct         numeric,
  s_pct         numeric,
  ca_pct        numeric,
  mg_pct        numeric,
  cu_pct        numeric,
  fe_pct        numeric,
  mn_pct        numeric,
  mo_pct        numeric,
  zn_pct        numeric,
  b_pct         numeric,
  cl_pct        numeric,
  cost_per_unit numeric,
  unit_id       uuid REFERENCES input_product_units(id),
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 8.4 spreaders

**Purpose:** Equipment reference table for manure spreaders. Replaces v1's single global `manure_load_kg` setting (A22) — farms have multiple spreaders of different sizes. Used in manure spread workflow for volume-to-loads conversion.
**Audit refs:** NUT-04

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS — shared across farms |
| name | text | NOT NULL | "Old Spreader", "New Holland 185" |
| capacity_kg | numeric | NOT NULL | Load capacity in kg (metric internal) |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Operation-scoped (A22):** Spreaders shared across farms — ranches typically move equipment between farms. If per-farm scoping is needed in future, add an optional `farm_id` FK (non-breaking additive change).

```sql
CREATE TABLE spreaders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  capacity_kg   numeric NOT NULL,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 8.5 soil_tests

**Purpose:** Soil lab results for a paddock/field. Full 13-element nutrient panel (A36) plus soil properties (pH, buffer pH, CEC, base saturation, organic matter). Supports extraction method tracking (Mehlich I vs Mehlich III) since the same PPM reading means different things under different methods.
**Audit refs:** PAS-06

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| location_id | uuid | FK → locations, NOT NULL | Paddock/field tested |
| tested_at | date | NOT NULL | Date of test |
| extraction_method | text | | 'mehlich_i', 'mehlich_iii', 'other' |
| n | numeric | | Nitrogen |
| p | numeric | | Phosphorus |
| k | numeric | | Potassium |
| s | numeric | | Sulfur |
| ca | numeric | | Calcium |
| mg | numeric | | Magnesium |
| cu | numeric | | Copper |
| fe | numeric | | Iron |
| mn | numeric | | Manganese |
| mo | numeric | | Molybdenum |
| zn | numeric | | Zinc |
| b | numeric | | Boron |
| cl | numeric | | Chlorine |
| unit | text | NOT NULL | 'ppm' or 'lbs_per_acre' |
| ph | numeric | | Soil pH |
| buffer_ph | numeric | | Buffer pH — lime requirement indicator |
| cec | numeric | | Cation Exchange Capacity |
| base_saturation | numeric | | Base saturation % |
| organic_matter | numeric | | Organic matter % |
| lab | text | | Lab name/source |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Full nutrient panel (A36):** V1 only tracked N/P/K + pH + organic matter. V2 adds the complete set: primary (N, P, K), secondary (S, Ca, Mg), and micronutrients (Cu, Fe, Mn, Mo, Zn, B, Cl). Plus buffer pH, CEC, and base saturation. All nullable — labs don't always test everything.
- **`extraction_method` tracked:** Mehlich I and Mehlich III produce different reference ranges for the same soil. Recording the method ensures correct interpretation of results.
- **`tested_at` as date, not timestamptz:** Lab results are date-level — no meaningful time component.

```sql
CREATE TABLE soil_tests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  location_id       uuid NOT NULL REFERENCES locations(id),
  tested_at         date NOT NULL,
  extraction_method text,
  n                 numeric,
  p                 numeric,
  k                 numeric,
  s                 numeric,
  ca                numeric,
  mg                numeric,
  cu                numeric,
  fe                numeric,
  mn                numeric,
  mo                numeric,
  zn                numeric,
  b                 numeric,
  cl                numeric,
  unit              text NOT NULL,
  ph                numeric,
  buffer_ph         numeric,
  cec               numeric,
  base_saturation   numeric,
  organic_matter    numeric,
  lab               text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 8.6 amendments

**Purpose:** Amendment application events — when a user applies a commercial product or manure to paddocks. Links to the source (product or manure batch), optionally to a spreader (for manure), and to per-paddock nutrient delivery via amendment_locations.
**Audit refs:** NUT-03

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| applied_at | timestamptz | NOT NULL | When the amendment was applied |
| source_type | text | NOT NULL | 'product' or 'manure' |
| input_product_id | uuid | FK → input_products | If source_type='product'. Nullable. |
| manure_batch_id | uuid | FK → manure_batches | If source_type='manure'. Nullable. |
| spreader_id | uuid | FK → spreaders | Which spreader was used. Nullable. |
| total_qty | numeric | | Total quantity applied across all locations |
| qty_unit_id | uuid | FK → input_product_units | Unit of quantity |
| cost_override | numeric | | User override of calculated cost. Nullable. |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

```sql
CREATE TABLE amendments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  applied_at       timestamptz NOT NULL,
  source_type      text NOT NULL,
  input_product_id uuid REFERENCES input_products(id),
  manure_batch_id  uuid REFERENCES manure_batches(id),
  spreader_id      uuid REFERENCES spreaders(id),
  total_qty        numeric,
  qty_unit_id      uuid REFERENCES input_product_units(id),
  cost_override    numeric,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

### 8.7 amendment_locations

**Purpose:** Per-paddock nutrient delivery from an amendment application. Full 13-element nutrient panel (A36) — stored as point-in-time facts about what actually hit the ground. Computed from product composition or manure batch nutrient content at application time. Historical values never change even if product percentages are updated later.
**Audit refs:** NUT-03

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| amendment_id | uuid | FK → amendments, NOT NULL | Parent record |
| location_id | uuid | FK → locations, NOT NULL | Which paddock received application |
| qty | numeric | | Amount applied to this paddock |
| n_kg | numeric | | Nitrogen applied |
| p_kg | numeric | | Phosphorus applied |
| k_kg | numeric | | Potassium applied |
| s_kg | numeric | | Sulfur applied |
| ca_kg | numeric | | Calcium applied |
| mg_kg | numeric | | Magnesium applied |
| cu_kg | numeric | | Copper applied |
| fe_kg | numeric | | Iron applied |
| mn_kg | numeric | | Manganese applied |
| mo_kg | numeric | | Molybdenum applied |
| zn_kg | numeric | | Zinc applied |
| b_kg | numeric | | Boron applied |
| cl_kg | numeric | | Chlorine applied |
| area_ha | numeric | | Area treated (hectares, metric internal) |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Full nutrient panel, stored as point-in-time facts (A36):** Nutrient values are computed at application time and stored. If someone later edits the product's N%, historical applications keep their original values. These are facts about what hit the ground.
- **All kg (metric internal):** Consistent with design principle #2. Display layer converts.

```sql
CREATE TABLE amendment_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  amendment_id  uuid NOT NULL REFERENCES amendments(id),
  location_id   uuid NOT NULL REFERENCES locations(id),
  qty           numeric,
  n_kg          numeric,
  p_kg          numeric,
  k_kg          numeric,
  s_kg          numeric,
  ca_kg         numeric,
  mg_kg         numeric,
  cu_kg         numeric,
  fe_kg         numeric,
  mn_kg         numeric,
  mo_kg         numeric,
  zn_kg         numeric,
  b_kg          numeric,
  cl_kg         numeric,
  area_ha       numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 8.8 manure_batches

**Purpose:** Manure batch lifecycle tracking — from capture at a confinement location through spreading on paddocks. Full 13-element nutrient panel (A36) for tested manure. Remaining volume is derived (A2): estimated_volume_kg minus sum of application transaction volumes.
**Audit refs:** NUT-04

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| label | text | NOT NULL | User label ("Lot 3 — Spring 2026") |
| source_location_id | uuid | FK → locations | Confinement location. Nullable for imported manure. |
| estimated_volume_kg | numeric | | Total estimated volume in kg (metric internal) |
| n_kg | numeric | | Nitrogen content |
| p_kg | numeric | | Phosphorus content |
| k_kg | numeric | | Potassium content |
| s_kg | numeric | | Sulfur |
| ca_kg | numeric | | Calcium |
| mg_kg | numeric | | Magnesium |
| cu_kg | numeric | | Copper |
| fe_kg | numeric | | Iron |
| mn_kg | numeric | | Manganese |
| mo_kg | numeric | | Molybdenum |
| zn_kg | numeric | | Zinc |
| b_kg | numeric | | Boron |
| cl_kg | numeric | | Chlorine |
| capture_date | date | | When batch was captured/created |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Full nutrient panel (A36):** Consistent with soil tests, input products, and amendment locations. Tested manure (or imported poultry litter) can capture all 13 elements for accurate nutrient planning.
- **`source_location_id` FK replaces v1's `locationName` text:** Proper link to the confinement location. Auto-created batches from closing a confinement event get this populated automatically. Nullable for imported manure that didn't originate on-farm.
- **Remaining volume derived (A2):** `estimated_volume_kg` minus sum of `manure_batch_transactions` application volumes. Not stored.
- **Fixes v1 known issue (OI-0181):** V1's JS model didn't match its Supabase schema. V2 starts clean.

```sql
CREATE TABLE manure_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id        uuid NOT NULL REFERENCES operations(id),
  label               text NOT NULL,
  source_location_id  uuid REFERENCES locations(id),
  estimated_volume_kg numeric,
  n_kg                numeric,
  p_kg                numeric,
  k_kg                numeric,
  s_kg                numeric,
  ca_kg               numeric,
  mg_kg               numeric,
  cu_kg               numeric,
  fe_kg               numeric,
  mn_kg               numeric,
  mo_kg               numeric,
  zn_kg               numeric,
  b_kg                numeric,
  cl_kg               numeric,
  capture_date        date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

### 8.9 manure_batch_transactions

**Purpose:** Volume ledger for manure batches. Tracks inputs (manure entering the batch from confinement events) and applications (manure leaving the batch via amendment spreading). Links the manure system to the event system (source_event_id) and amendment system (amendment_id).
**Audit refs:** NUT-04

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| batch_id | uuid | FK → manure_batches, NOT NULL | Which batch |
| type | text | NOT NULL | 'input' or 'application' |
| transaction_date | date | NOT NULL | When it happened |
| volume_kg | numeric | NOT NULL | Amount in kg (metric internal) |
| source_event_id | uuid | FK → events | For 'input' — which confinement event produced this. Nullable. |
| amendment_id | uuid | FK → amendments | For 'application' — which amendment used this. Nullable. |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **No NPK on transactions:** Nutrient content lives on the batch. When a portion is applied, the amendment_locations row captures what landed (proportional to volume). No duplication.
- **V1's `pastureNames[]` JSONB dropped:** Destination paddocks tracked via proper relational chain: transaction → amendment → amendment_locations → location. No name snapshots (principle #5), no JSONB arrays (principle #6).
- **`source_event_id`** links inputs to the confinement event that generated the manure, closing the loop between the event system (D5) and the manure system.
- **`amendment_id`** links applications to the amendment record, closing the loop between the manure system and the amendment system.

```sql
CREATE TABLE manure_batch_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  batch_id         uuid NOT NULL REFERENCES manure_batches(id),
  type             text NOT NULL,
  transaction_date date NOT NULL,
  volume_kg        numeric NOT NULL,
  source_event_id  uuid REFERENCES events(id),
  amendment_id     uuid REFERENCES amendments(id),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

### 8.10 npk_price_history

**Purpose:** Tracks NPK fertilizer price changes over time, per-farm. Enables accurate historical valuation of grazing events — each event uses the prices in effect at event time, not current prices. Resolves v1 bug where price changes retroactively altered historical event valuations.
**Audit refs:** NPK-2, CST-3
**Architecture decisions:** A16 (NPK price date-stamping)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| farm_id | uuid | NOT NULL, FK → farms | Per-farm (freight differentials, A20) |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| effective_date | date | NOT NULL | When this price took effect. Query: latest effective_date ≤ event date. |
| n_price_per_kg | numeric | NOT NULL | Nitrogen price per kg at this effective date |
| p_price_per_kg | numeric | NOT NULL | Phosphorus price per kg at this effective date |
| k_price_per_kg | numeric | NOT NULL | Potassium price per kg at this effective date |
| notes | text | NULL | e.g., "Spring 2026 fertilizer price increase" |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Query pattern:** For any event, find the price row with the latest `effective_date ≤ event_date` for that event's farm. If no history row exists before the event date, fall back to the earliest available row (covers events before price tracking started).

**Relationship to farm_settings:** The N/P/K price columns on `farm_settings` remain as the quick-lookup for current prices (displayed in Settings UI). When the farmer updates prices in Settings, the app creates a new `npk_price_history` row with today's `effective_date` and updates `farm_settings` to match. Calculation engine reads from `npk_price_history`; Settings UI reads/writes `farm_settings`.

**Design decisions:**
- **History table over event snapshots (A16 resolution):** Snapshot-on-event was considered but rejected. A price history table means one update when prices change, not N snapshots across N events. Also enables retroactive price corrections by editing a history row.
- **Per-farm, not per-operation:** Same reasoning as farm_settings NPK prices (A20) — freight differentials mean the same fertilizer costs more on a remote lease.
- **All three prices in one row:** N, P, K prices tend to change together (same supplier, same order). Separate rows per nutrient would complicate queries for minimal benefit.

```sql
CREATE TABLE npk_price_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  operation_id     uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  effective_date   date NOT NULL,
  n_price_per_kg   numeric NOT NULL,
  p_price_per_kg   numeric NOT NULL,
  k_price_per_kg   numeric NOT NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 9: Livestock Health

The livestock health domain replaces v1's mega `healthEvents[]` array on each animal with proper normalized tables. Each record type — BCS scores, treatments, breeding, heat observations, calving — gets its own table with appropriate columns and FKs. This eliminates the v1 anti-pattern of storing structurally different event types in a single JSONB array.

Three reference tables support the record tables: `ai_bulls` (AI sire catalog), `treatment_categories` (user-extensible grouping), and `treatment_types` (specific treatments linked to categories). `dose_units` provides read-only standards and operation-owned custom treatment units (§9.4).

### 9.1 ai_bulls

**Purpose:** AI sire catalog. Reference table for artificial insemination bulls used in breeding. Operation-scoped (shared across all farms in the operation). Referenced by `animals.sire_ai_bull_id` (A28) and `animal_breeding_records.sire_ai_bull_id`.
**Audit refs:** ANI-15

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS — shared across all farms in the operation |
| name | text | NOT NULL | Bull name |
| breed | text | | Breed description |
| tag | text | | AI company tag/code |
| reg_num | text | | Registration number |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Operation-scoped, not farm-scoped:** AI bull catalogs are shared across farms within an operation. A rancher with multiple farms uses the same AI sires everywhere. Scoping to operation (not farm) means one catalog, no duplication.

```sql
CREATE TABLE ai_bulls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  breed         text,
  tag           text,
  reg_num       text,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 9.2 treatment_categories

**Purpose:** User-extensible reference table for grouping treatment types. System seeds defaults ('Antibiotic', 'Parasiticide', 'Reproductive', 'Other') at onboarding; users add their own (e.g., 'Vaccine', 'Supplement', 'Topical') without code changes. Reports filter by category for clean aggregation.
**Audit refs:** ANI-14

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| name | text | NOT NULL | 'Antibiotic', 'Parasiticide', 'Vaccine', etc. |
| is_default | boolean | DEFAULT false | True for system-seeded categories. Prevents deletion but not rename. |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **User-extensible reference table (A31):** V1 used a hardcoded 4-value enum ('antibiotic', 'parasiticide', 'reproductive', 'other'). V2 promotes this to a proper table so users can add categories without code changes. Reports filter on `category_id` which is always a clean FK — no string matching.
- **Consistent with animal_classes pattern:** System seeds defaults, users customize. Same UX concept.

```sql
CREATE TABLE treatment_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  is_default    boolean DEFAULT false,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 9.3 treatment_types

**Purpose:** Specific treatment definitions (e.g., "Ivermectin", "Lutalyse") linked to a category. Operation-scoped, managed in Settings.
**Audit refs:** ANI-14

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| name | text | NOT NULL | Treatment name |
| category_id | uuid | FK → treatment_categories, NOT NULL | Links to user-extensible category (A31) |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

```sql
CREATE TABLE treatment_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  category_id   uuid NOT NULL REFERENCES treatment_categories(id),
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 9.4 dose_units

**Purpose:** Read-only standard and operation-owned custom treatment dosage units. Migration 044 is merged at `6d5893ab` (PR #55, 2026-11-11), written but **not applied**; production is at stamp 43 and the compiled ceiling on main remains 41. Tim's 2026-11-10 5:46 PM ET decision: “Yes let's fix it properly.” Apply still needs Tim's explicit yes at the time plus a backup; coordinate apply and compatible client publish in one session (§9.4).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | Fixed UUIDv5 for standards; custom identity preserved |
| operation_id | uuid | Nullable, DEFAULT NULL, FK → operations | NULL = standard; non-null = custom; immutable |
| name | text | NOT NULL; scoped folded uniqueness | Standards: 'ml', 'cc', 'mg', 'tablet', 'capsule', 'pump' |
| archived | boolean | Nullable, DEFAULT false | Soft archive; name remains reserved |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**044 scope and integrity (OI-0216):** Accepted members can SELECT standards plus their operation's customs, and INSERT/UPDATE only non-null-scope customs. Unit `operation_id` is immutable, including privileged writes. There is no unit DELETE. Anon has no table access; authenticated has SELECT/INSERT/UPDATE only, with DELETE/TRUNCATE/REFERENCES/TRIGGER revoked. Names are NFC-normalized in the app; DB uniqueness is `lower(btrim(name))` within standard and per-operation scopes, with a cross-namespace guard preventing custom/standard collisions. Archived names stay reserved. NFC is not a DB normalization guarantee. The private serialized name guard requires READ COMMITTED; stronger isolation fails closed. Real multi-backend contention remains unproven by the disposable single-backend tests.

**References:** Existing single-ID child FKs remain. BEFORE INSERT/UPDATE guards on `animal_treatments.dose_unit_id`, `amendments.qty_unit_id` and `input_products.unit_id` recheck both the unit FK and child operation: a non-null reference must exist and be a standard or belong to the child's operation. Cross-farm/unknown references fail even for service-role writes. Scope is the operation, not a separate farm-id column.

**Standards and apply:** Standard IDs are fixed UUIDv5 in the URL namespace `https://getthehayout.com/units/<table>/<name>`. Migration 044 locks unit and child tables and aborts unless all three reference columns have zero non-null references and the nonempty catalog is exactly the eleven legacy ID+name pairs. Only then are legacy IDs rewritten; a completely empty catalog gets fixed standards. No name-based identity remapping. This is a once-only transactional migration, not an idempotent script.

**Client behavior:** Onboarding does not seed units. The dose-unit editor labels standards Standard/read-only and supports add, rename and archive for the current operation's customs. No input-product-unit editor is introduced. Pickers use standards plus current-operation customs and hide archived options while retaining an already-selected archived reference read-only where editing exists. Store/sync never mutate standards or delete units. Push All sends only current-operation custom units, none without a current operation. Queued/dead-letter replay keeps each action's original operation; it never retags to current selection. Legacy unscoped cache/queue entries are discarded with count-only logs; known fixed standard IDs remain safe read-only cache entries. Custom writes stay fail-closed behind the compiled ceiling.

**Release and backup:** PR #56 raises the compiled ceiling from 41 to 44 only after applies are verified. Apply 044 and publish the compatible client in one session: the old client's unit seeds/editor break after 044. CP-55 exports operation customs only, not standards; CP-56 performs typed preflight and custom-only UPSERT/no-delete (including accepted bounded N2 disclosure), per `V2_MIGRATION_PLAN.md` §5.7b. FA-30's guarded server write function is cancelled; the read-only preflight RPC is not that function. Full transactional restore is a later unscheduled item (OI-0217).

### 9.5 animal_bcs_scores

**Purpose:** Body condition score records. Split from v1's mega `healthEvents[]` array. Each record captures a single BCS observation for one animal.
**Audit refs:** ANI-08 (BCS type)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| animal_id | uuid | FK → animals, NOT NULL | |
| scored_at | timestamptz | NOT NULL | Date/time of scoring |
| score | numeric | NOT NULL | Species-dependent scale: cattle 1–9, sheep/goat 1–5 (A32) |
| likely_cull | boolean | DEFAULT false | Red flag for cull candidate |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Species-dependent BCS scale, app-enforced (A32):** Cattle and horses use 1–9, sheep and goats use 1–5. The DB stores the raw numeric value; the app validates the correct range based on the animal's class species at input time. No DB constraint on range — keeps it flexible for edge cases.
- **`scored_at` as single timestamptz:** V1 stored date and time as separate fields. V2 combines them — simpler, sorts naturally.
- **`score` as numeric, not integer:** Allows half-scores (5.5, 6.5) which are common in practice, without schema changes.

```sql
CREATE TABLE animal_bcs_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  scored_at     timestamptz NOT NULL,
  score         numeric NOT NULL,
  likely_cull   boolean DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 9.6 animal_treatments

**Purpose:** Treatment/medication records. Split from v1's mega `healthEvents[]` array. Links to treatment_types (which links to treatment_categories) for clean reporting.
**Audit refs:** ANI-08 (treatment type), ANI-14

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| animal_id | uuid | FK → animals, NOT NULL | |
| treatment_type_id | uuid | FK → treatment_types | Links to type → category |
| treated_at | timestamptz | NOT NULL | Date/time of treatment |
| product | text | | Product/brand name |
| dose_amount | numeric | | Numeric portion of dosage (A33) |
| dose_unit_id | uuid | FK → dose_units | Unit from shared reference table (A33) |
| withdrawal_date | date | | End of withdrawal period |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Structured dose (A33):** V1's freeform `dose` text field split into `dose_amount` (numeric) and `dose_unit_id` (FK to dose_units). Enables clean reporting: "How much Ivermectin did we use this year?" is a sum query, not string parsing.
- **`treatmentName` dropped:** V1 snapshot the treatment type name at recording time. V2 follows design principle #5 (no name snapshots) — display name comes from the treatment_types FK at render time.

```sql
CREATE TABLE animal_treatments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id),
  animal_id         uuid NOT NULL REFERENCES animals(id),
  treatment_type_id uuid REFERENCES treatment_types(id),
  treated_at        timestamptz NOT NULL,
  product           text,
  dose_amount       numeric,
  dose_unit_id      uuid REFERENCES dose_units(id),
  withdrawal_date   date,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

### 9.7 animal_breeding_records

**Purpose:** Breeding event records (AI or natural service). Carries the `confirmed_date` that drives the "currently confirmed bred" derivation (A29). Sire linked via proper FKs (A28), not free text.
**Audit refs:** ANI-08 (breeding type)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| animal_id | uuid | FK → animals, NOT NULL | The female being bred |
| bred_at | timestamptz | NOT NULL | Date/time of breeding |
| method | text | NOT NULL | 'ai' or 'bull' (A34 — heat observations split to own table) |
| sire_animal_id | uuid | FK → animals | Herd bull. Nullable. |
| sire_ai_bull_id | uuid | FK → ai_bulls | AI sire. Nullable. |
| semen_id | text | | Straw/lot identifier for AI |
| technician | text | | AI tech name |
| expected_calving | date | | Auto-default: bred_at + species gestation. User can override (e.g., vet preg check). |
| confirmed_date | date | | When pregnancy confirmed. NULL = unconfirmed. (A29) |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Derived status (A29):**
- "Currently confirmed bred" = this record has a `confirmed_date` AND no calving record exists for this animal after the `bred_at` date
- Resets naturally when calving is recorded — no field to clear, no state to manage

**Design decisions:**
- **Method is 'ai' or 'bull' only (A34):** Heat observations split to `animal_heat_records`. Breeding records are actual breedings — always have a sire (or at least a method).
- **Sire FKs match animal table pattern (A28):** `sire_animal_id` for herd bulls, `sire_ai_bull_id` for AI sires. At most one populated. These are the breeding event sire — separate from the lineage sire on the animal record.
- **`expected_calving` stored with auto-default:** App auto-populates `bred_at + species gestation days` (cattle ~283, sheep ~150, goats ~150) but user can override. Vets often give adjusted dates from preg checks.
- **`confirmed_date` drives A29:** Most recent breeding record with confirmed_date and no subsequent calving = currently confirmed bred. Complete history of confirmations preserved over time.

```sql
CREATE TABLE animal_breeding_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  animal_id        uuid NOT NULL REFERENCES animals(id),
  bred_at          timestamptz NOT NULL,
  method           text NOT NULL,
  sire_animal_id   uuid REFERENCES animals(id),
  sire_ai_bull_id  uuid REFERENCES ai_bulls(id),
  semen_id         text,
  technician       text,
  expected_calving date,
  confirmed_date   date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

### 9.8 animal_heat_records

**Purpose:** Estrus observation records. Split from v1's breeding events (where heat was subtype='heat') into its own table. Heat observations are structurally different from breeding records — no sire, no expected calving, different query patterns ("days since last heat").
**Audit refs:** ANI-09

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| animal_id | uuid | FK → animals, NOT NULL | |
| observed_at | timestamptz | NOT NULL | When estrus was observed |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Split from breeding records (A34):** V1 stored heats as breeding events with subtype='heat'. V2 gives them their own table — different data shape (no sire fields), different query patterns ("last heat date per animal"), consistent with splitting the v1 mega health events array.
- **Heat picker batch mode:** V1's `openHeatPickerSheet()` batch recording UX writes individual records here — one per animal observed.

```sql
CREATE TABLE animal_heat_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  observed_at   timestamptz NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 9.9 animal_calving_records

**Purpose:** Birth event records. Links the dam to the newly created calf animal record. Sire linked via FKs (A28). The calf's own data (sex, tag, weight, class, group) lives on the calf's animal record and related tables — not duplicated here.
**Audit refs:** ANI-10

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| dam_id | uuid | FK → animals, NOT NULL | The mother |
| calf_id | uuid | FK → animals | The created calf record. Nullable for stillbirths where no record desired. |
| calved_at | timestamptz | NOT NULL | Date/time of birth |
| sire_animal_id | uuid | FK → animals | Herd bull if known |
| sire_ai_bull_id | uuid | FK → ai_bulls | AI sire if known |
| stillbirth | boolean | DEFAULT false | |
| dried_off_date | date | NULL | Date dam stopped lactating. Required for dairy_cattle species (lactation continues past calf weaning). Beef species derive lactation end from calf weaning instead. |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**App-level mutations when calving is recorded:**
1. Create calf animal record (sex, tag, birth_date, class based on sex + species, dam_id, sire FKs)
2. Record birth weight as weight record on calf (source='calving') if provided
3. Auto-assign calf to dam's current group via membership ledger
4. Prompt class reassignment on dam if heifer/ewe/doe role (A27) — e.g., heifer → "First-Calf Heifer" class
5. **Locked 2026-11-08:** recording a birth must explicitly set the dam’s `confirmed_bred` / `confirmedBred` to false. This is stored state, not a natural/derived reset (A29 was reversed by OI-0099). Every path creating an `animal_calving_records` row must do this, including the Calving sheet, voice using the same save, and linking a calf to a dam to create a calving record. Implemented: the live Calving save (`src/features/health/calving.js`) and `src/features/animals/calving-sync.js` clear it (verified in the PR #38 review, 2026-11-09).

**UI/entity authority for voice (2026-11-08).** Populate the live Calving sheet (§14.7), not a parallel questionnaire. Entity-required fields are operationId, damId and calvedAt. Dried-off remains optional in the sheet/entity; the older dairy-required prose above is not a voice/UI requirement. The live sheet defaults calf sex to female and creates a calf iff `!stillbirthCheck.checked || calfTagInput.value.trim()`; do not invent a different stillbirth rule from older UX prose. Date-only calving uses the sheet’s `new Date(dateInput.value + 'T12:00:00Z')`; other surfaces use their own date/time defaults. Device-local calendar dates remain per OI-0189. Existing calf, optional calving-weight, group membership, calving record and optional A27 class prompt side effects remain, plus the explicit dam clear above. DMI-2 is not rewritten by this lock.

**Design decisions:**
- **Sire FKs on calving record:** Same pattern as breeding records and animal table (A28). Sire at calving may come from the breeding record or be entered fresh.
- **`calf_id` links to animal record:** All calf data lives on the calf's own animal record. Birth weight is a weight record. Class, group, tag — all on the calf. The calving record is the link between dam and offspring.
- **Birth weight not on this table:** Stored as a weight record on the calf's animal (source='calving'). Consistent with v1's `S.animalWeightRecords` pattern and keeps weight history in one place.
- **`dried_off_date` for dairy lactation tracking:** Dairy cattle continue lactating past calf weaning (~305 day lactation cycle). This field marks when the dam was dried off. For beef species, lactation end is derived from calf weaning (class reassignment) and this field is unused. See V2_CALCULATION_SPEC.md DMI-2.

```sql
CREATE TABLE animal_calving_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     uuid NOT NULL REFERENCES operations(id),
  dam_id           uuid NOT NULL REFERENCES animals(id),
  calf_id          uuid REFERENCES animals(id),
  calved_at        timestamptz NOT NULL,
  sire_animal_id   uuid REFERENCES animals(id),
  sire_ai_bull_id  uuid REFERENCES ai_bulls(id),
  stillbirth       boolean DEFAULT false,
  dried_off_date   date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

### 9.10 animal_weight_records

**Purpose:** Weight measurement records for individual animals. Current weight is derived (A2) from the latest record by `recorded_at`. Sources include manual entry, batch group updates, birth weights from calving, and scale imports (matched by EID).
**Audit refs:** ANI-12

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| animal_id | uuid | FK → animals, NOT NULL | Matched by EID on import, stored as FK |
| recorded_at | timestamptz | NOT NULL | When weight was taken |
| weight_kg | numeric | NOT NULL | Metric internal (principle #2). App converts for display. |
| source | text | NOT NULL | 'manual', 'group_update', 'calving', 'import' |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Derived fields (A2):**
- "Current weight" for any animal = latest record from this table by `recorded_at`

**Design decisions:**
- **`weight_kg` replaces v1's `weightLbs`:** Design principle #2 — metric internal. V1 stored pounds; v2 stores kilograms and the display layer converts based on user preferences.
- **`source` as app-managed text:** Four system-generated values documenting provenance. Not user-facing, not worth a reference table.
- **Scale import workflow:** Scales register animals by EID. Import reads EID + weight pairs, matches EID against `animals.eid` to resolve `animal_id`, creates records with `source = 'import'`. No EID stored on the weight record — `animal_id` FK is the link.
- **No `animal.weightHistory[]`:** V1's legacy array kept empty; actual data was already in `S.animalWeightRecords`. V2 drops the array entirely — this table is the single source of truth.

```sql
CREATE TABLE animal_weight_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  recorded_at   timestamptz NOT NULL,
  weight_kg     numeric NOT NULL,
  source        text NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### 9.11 animal_notes

**New in v2** — added by migration 012 as a "Domain 9 amendment" (OI-0003 resolution). Documented retroactively per OI-0089.
**Audit refs:** ANI-09

Per-animal free-form notes, timestamped. Sibling to the other per-animal time-series tables in Domain 9 (weights, BCS, treatments, breeding, heats, calving) — same shape, same grain, one row per observation. Notes are not derived from any other record and are not consumed by any calculation; they exist for the farmer's own record-keeping and display on the animal detail screen.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS scope |
| animal_id | uuid | FK → animals, NOT NULL | Which animal |
| noted_at | timestamptz | NOT NULL | When the note applies to (may differ from created_at if back-dated) |
| note | text | NOT NULL | Free-form body |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Why its own table, not a column on `animals`.** A single `notes` column would only hold the latest note and would lose history. Notes are time-series data — the farmer often wants to see that "off feed, watching" was logged on the 12th and "ate normally today" was logged on the 15th. Same reasoning as §9.5 `animal_bcs_scores` and §9.10 `animal_weight_records`.
- **`noted_at` separate from `created_at`.** `noted_at` is the observation timestamp the farmer is asserting (can be edited, can be back-dated). `created_at` is when the row hit the database. Needed because farmers often enter notes from memory after the fact.
- **No `source` column** (unlike §9.10). All notes are manual entries; there is no scale-import or derived-source case to disambiguate.

```sql
CREATE TABLE animal_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  noted_at      timestamptz NOT NULL,
  note          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 10: Feed Quality

Feed quality data links lab test results to feed batches (D4). A batch can have multiple profiles over time (e.g., initial harvest estimate, then a lab test, then a retest). The starting schema covers common forage analysis fields across beef, sheep, and dairy operations. Additional fields (e.g., RFQ, milk production metrics) can be added as nullable columns based on field tester feedback — non-breaking.

### 10.1 batch_nutritional_profiles

**Purpose:** Lab test results or estimates for a feed batch's nutritional composition. Each record is a point-in-time profile — a batch can have multiple (e.g., harvest estimate then lab test). The latest by `tested_at` is the current profile used in calculations.
**Audit refs:** FED-08 (feed test recording)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | FK → operations, NOT NULL | RLS |
| batch_id | uuid | FK → batches, NOT NULL | Which feed batch was tested |
| tested_at | date | NOT NULL | Date of feed test |
| source | text | NOT NULL | 'feed_test', 'harvest', 'estimate' |
| dm_pct | numeric | | Dry matter % |
| protein_pct | numeric | | Crude protein % |
| adf_pct | numeric | | Acid detergent fiber % |
| ndf_pct | numeric | | Neutral detergent fiber % |
| tdn_pct | numeric | | Total digestible nutrients % |
| rfv | numeric | | Relative feed value (index, not %) |
| n_pct | numeric | | Nitrogen % |
| p_pct | numeric | | Phosphorus % |
| k_pct | numeric | | Potassium % |
| ca_pct | numeric | | Calcium % |
| mg_pct | numeric | | Magnesium % |
| s_pct | numeric | | Sulfur % |
| lab | text | | Lab name/source |
| notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Multiple profiles per batch:** A batch can have an initial 'harvest' estimate and then a 'feed_test' from a lab. The latest profile by `tested_at` is what calculations use. History preserved.
- **`source` documents provenance:** 'feed_test' = lab result, 'harvest' = auto-created from harvest event (D7), 'estimate' = user's manual estimate.
- **Mineral columns (Ca, Mg, S) added beyond v1:** V1 only tracked N/P/K. Ca, Mg, and S are common on forage analysis reports and relevant for mineral balancing. Trace micronutrients (Cu, Fe, Mn, Zn, etc.) omitted for now — uncommon on standard forage tests. Can be added as nullable columns based on field tester feedback.
- **Schema designed for extensibility:** Dairy, beef, and sheep operations have different feed quality priorities. Starting set covers common ground. Additional fields (RFQ, milk production metrics, etc.) are non-breaking additive changes.

```sql
CREATE TABLE batch_nutritional_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  batch_id      uuid NOT NULL REFERENCES batches(id),
  tested_at     date NOT NULL,
  source        text NOT NULL,
  dm_pct        numeric,
  protein_pct   numeric,
  adf_pct       numeric,
  ndf_pct       numeric,
  tdn_pct       numeric,
  rfv           numeric,
  n_pct         numeric,
  p_pct         numeric,
  k_pct         numeric,
  ca_pct        numeric,
  mg_pct        numeric,
  s_pct         numeric,
  lab           text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain 11: App Infrastructure

Non-farm-data tables that support the app itself: diagnostics, user feedback, task management, and release communication. These tables have different sync and scoping rules than farm data.

> **Host-adoption design (2026-11-08): HOST-ADAPTER DESIGN SPECIFIED — unimplemented, not handed to Build.** The shared conversation and feedback contracts exist with released adoption targets. Chief of Staff owns both contracts; GTHO is first host adopter, not either module’s owner. Do not grow reusable runtime or interview behavior in GTHO-v2 or alter either CONTRACT. The physical design in §11.2a–b is design DDL, not an applied schema. Testing-end audio disposal and later-rollout consent remain deferred/non-blocking. The April training/script/confidence table list remains superseded. See `V2_INFRASTRUCTURE.md` §8 and the OI-0195 session brief.

### 11.1 app_logs

**Purpose:** Application diagnostics and error logging. Direct-write to Supabase — no sync queue dependency. Logs are most valuable when sync itself is broken, so they bypass the normal queue. Primary scoping by user_id + session_id; operation_id included as best-effort context when available.
**Audit refs:** XCT-04 (error logging)
**Architecture decisions:** A24 (direct-write to Supabase)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| user_id | uuid | NULL | auth.users FK. Nullable — user might not be signed in. |
| operation_id | uuid | NULL, no FK | Best-effort context. Populated when the current operation is known, null during login/onboarding errors. No FK constraint — must work even if operation record is corrupt or deleted. |
| session_id | text | NULL | Browser session identifier for grouping related log entries |
| level | text | NOT NULL, DEFAULT 'error' | error, warn, info |
| source | text | NOT NULL | e.g. "supabase-load", "sync-queue", "render" |
| message | text | NOT NULL | Truncated to reasonable length in app code (v1 uses 300 chars) |
| stack | text | NULL | Stack trace if available |
| context | jsonb | NULL | Structured metadata — shape varies by log type. Dead letters include: table, record_id, original_record, error, retry_count, first_attempt_at, last_attempt_at, dead_lettered_at. Regular errors may include screen, function name, related record IDs. |
| app_version | text | NULL | Build stamp at time of error |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **operation_id is nullable, best-effort.** Logs are primarily diagnostic data scoped by user_id + session_id. But when the current operation is known (95%+ of the time), operation_id provides valuable filtering — especially for isolating issues to a specific farm. Nullable with no FK constraint ensures logging never blocks, even during login errors or if the operation record is corrupt.
- **context jsonb for structured metadata.** Dead letters (failed sync writes after 5 retries) need structured data: which table, which record, how many retries, full timeline. Regular errors benefit from screen context and related record IDs. A single text field can't support filtering or querying on these dimensions. Stack trace remains in its own `stack` column since it's always the same shape.
- **No updated_at.** Logs are write-once. V1's dedup/repeat-count pattern can be handled in app code before insert.
- **Direct-write, not queued (A24).** Bypasses the sync adapter entirely. If Supabase is unreachable, the log insert silently fails — acceptable for diagnostics. The alternative (queuing logs) creates a dependency loop: if the queue is broken, you can't log that it's broken.
- **RLS by user_id** (not operation_id). Users see their own log entries regardless of operation context. Admin/support roles can see all logs for troubleshooting.

```sql
CREATE TABLE app_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  operation_id    uuid,
  session_id      text,
  level           text NOT NULL DEFAULT 'error',
  source          text NOT NULL,
  message         text NOT NULL,
  stack           text,
  context         jsonb,
  app_version     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 11.2 submissions

**Purpose:** User-submitted feedback and support requests with threaded conversation. The thread field is JSONB — an intentional exception to principle #6 for append-only conversation data (A25).
**Audit refs:** ADM-01

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping |
| submitter_id | uuid | NULL | auth.users FK. Who submitted it. |
| app | text | NOT NULL, DEFAULT 'gthy' | Which app (future-proofs for multi-app) |
| type | text | NOT NULL | 'feedback' or 'support' |
| category | text | NULL | roadblock, bug, ux, feature, calc, idea, question |
| area | text | NULL | App area/domain the submission relates to |
| screen | text | NULL | Which screen the user was on (auto-captured context) |
| priority | text | NOT NULL, DEFAULT 'normal' | normal, high, critical (support only) |
| status | text | NOT NULL, DEFAULT 'open' | open, resolved, closed |
| note | text | NULL | User's initial description |
| version | text | NULL | App version at time of submission |
| thread | jsonb | DEFAULT '[]' | Append-only conversation: [{role, text, ts, author}]. JSONB exception (A25). |
| dev_response | text | NULL | Developer's response text |
| dev_response_ts | timestamptz | NULL | When dev responded |
| first_response_at | timestamptz | NULL | SLA tracking — when first response was given |
| resolved_in_version | text | NULL | Which version resolved the issue |
| resolution_note | text | NULL | How it was resolved |
| oi_number | text | NULL | Links to OPEN_ITEMS tracking number |
| linked_to | uuid | NULL | FK to another submission (regression/duplicate linking) |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Thread as JSONB (A25).** The thread is an append-only conversation log: never queried independently, never filtered across submissions, only read with its parent. Normalizing into a `submission_messages` table adds a join for zero query benefit. Matches principle #6 exception for "truly unstructured data (conversation threads)."
- **tester field dropped.** V1 had a `tester` field from early beta. V2 uses `submitter_id` (auth.users FK) instead.

```sql
CREATE TABLE submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id          uuid NOT NULL REFERENCES operations(id),
  submitter_id          uuid,
  app                   text NOT NULL DEFAULT 'gthy',
  type                  text NOT NULL,
  category              text,
  area                  text,
  screen                text,
  priority              text NOT NULL DEFAULT 'normal',
  status                text NOT NULL DEFAULT 'open',
  note                  text,
  version               text,
  thread                jsonb DEFAULT '[]',
  dev_response          text,
  dev_response_ts       timestamptz,
  first_response_at     timestamptz,
  resolved_in_version   text,
  resolution_note       text,
  oi_number             text,
  linked_to             uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

#### 11.2a Shared feedback host normalization — OI-0195 (design only)

New normalized feedback items use the **existing `submissions` entity/table**, not a second inbox. Normalize additively; keep existing IDs, labels and host history. The legacy column table and DDL above are not an implementation of this extension. `type` remains feedback/support purpose; shared bug/request classification is a distinct concept. Support `priority` is urgency, never severity. The existing thread JSONB exception does not authorize a new catch-all JSONB column for this design.

| Shared module | GTHO release pin | Annotated tag peels to | Package version |
|---|---|---|---|
| `Homelab/feedback-module` | `v0.1.3` | `f70d0d7d83a0b56ffdcd2a28375b6f746863fecb` | `0.1.3` |
| `Homelab/conversation-runtime` | `v0.1.1` | `aea11f3cdb137a83f0aecaf38e2e60c9d1ba809a` | `0.1.1` |

These are the independently verified release targets for GTHO adoption; nothing auto-spreads. Older tags are unchanged and are **not** adoption pins: feedback-module `v0.1.2` → `f22b58af728594ee5c59edeb362b17467fe6e549`, `v0.1.1` → `eb7fc8010bf5173549db14382411c6386a7e09f2`, `v0.1.0` → `16a68aa94626eaa9f7f4b49754a6616cd0555af9`; conversation-runtime `v0.1.0` → `1a1d1e7b29680d724755f82384b475f1e4b6601f`.

**Faithful historical-field mapping (SQL / JS → contract or host context):**

| Existing field | Logical destination | Preservation / constraint |
|---|---|---|
| `id` | `itemId` | Keep exactly. |
| `operation_id` / `operationId` | scope | Preserve operation scope. |
| `submitter_id` / `submitterId` | `reporterId` | When present; do not invent identity. |
| `app` | `appId` | Keep `gthy`. |
| `type` (`feedback` / `support`) | `sourcePurpose` | Not shared bug/request type; do not overwrite legacy `type`. |
| `category`, `area` | optional category / area | Preserve original labels. |
| `screen` | original screen context | Existing values are hash-to-screen mapped, not reconstructed raw routes. |
| `version` | `buildStamp` | Current Feedback captures the build stamp at save; never copy to `contractVersion`. For new capture, retain first-capture build context. |
| `note` | candidate `firstNote` | Edited notes and `[Regression]` prefixes are not automatically the untouched original. Preserve the source; do not assert original-note provenance without evidence. |
| `priority` | host-only support urgency | Not shared severity. |
| `status`, `thread`, `dev_response`, `dev_response_ts`, `first_response_at`, `resolved_in_version`, `resolution_note`, `oi_number`, `linked_to` | host-only history | Keep. |
| `created_at` | host history | Not automatically capture time or filing time. |
| `updated_at` | host-only history | Keep; never replace first capture with latest edit. |

**Historical-state policy (Tim, 2026-11-08).** Add the new fields now with explicit unknowns; ask for missing fields only if someone reopens the item. Old rows retain their IDs and history and are not newly confirmed filings. Historical columns do not supply `contractVersion`, title, shared bug/request type, expected, actual, `reproSteps`, severity, impact, or `reviewConfirmation`. Do not infer classification from purpose/category, invent filing consent, or leave old items permanently in a legacy-only shape. The additive columns and explicit child-table fact states below specify that representation; these are design DDL sketches, not applied migration SQL. `contractVersion` records the pinned shared interview-contract release actually used for filing or adaptation, not an app build or a claim that the original capture used the new contract. Unknown capture and filing times stay unknown.

**Physical extension locked 2026-11-08 — nullable, additive, same inbox:**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| feedback_kind | text | NULL, CHECK bug/request | Shared kind, not legacy type |
| contract_version | text | NULL | Interview contract used, not build stamp |
| title | text | NULL | Shared title |
| first_note | text | NULL | Original note with provenance, not reconstructed legacy note |
| expected | text | NULL | Expected result |
| actual | text | NULL | Actual result |
| severity | text | NULL, CHECK critical/high/normal/low | Not support priority |
| impact | text | NULL | Shared impact |
| captured_at | timestamptz | NULL | First capture, not created_at inferred |
| filed_at | timestamptz | NULL | Actual filing time |
| conversation_id | uuid | NULL, scoped FK → assistant_conversations | Origin conversation |
| review_confirmation_id | uuid | NULL, scoped FK → assistant_review_confirmations | Exact filing confirmation |

**Design decisions.** Do not impose blanket NOT NULL on new columns or manufacture historical facts. The adapter checks new-filing completeness against the pinned feedback-module contract. New facts on historical rows remain NULL with a `submission_field_states` row of `unknown` for each new contract fact, including reproSteps and confirmation; old rows are not newly confirmed filings. Reopening is the only trigger to ask for missing facts. The existing `thread` JSONB exception remains only a thread, never an artifact envelope. No catch-all JSONB is added.

```sql
-- Design sketch only; add after the referenced artifact tables exist.
ALTER TABLE submissions
  ADD CONSTRAINT submissions_operation_identity UNIQUE (operation_id, id),
  ADD COLUMN feedback_kind text CHECK (feedback_kind IN ('bug','request')),
  ADD COLUMN contract_version text,
  ADD COLUMN title text,
  ADD COLUMN first_note text,
  ADD COLUMN expected text,
  ADD COLUMN actual text,
  ADD COLUMN severity text CHECK (severity IN ('critical','high','normal','low')),
  ADD COLUMN impact text,
  ADD COLUMN captured_at timestamptz,
  ADD COLUMN filed_at timestamptz,
  ADD COLUMN conversation_id uuid,
  ADD COLUMN review_confirmation_id uuid,
  ADD FOREIGN KEY (operation_id, conversation_id)
    REFERENCES assistant_conversations(operation_id, id),
  ADD FOREIGN KEY (operation_id, review_confirmation_id)
    REFERENCES assistant_review_confirmations(operation_id, id);
```

**Common physical conventions (design only).** Each new table has the following columns, included explicitly in every CREATE TABLE sketch below. JS uses camelCase; SQL uses snake_case. All artifacts are operation-scoped UUID records. All internal artifact FKs use `(operation_id, referenced_id)` against a unique `(operation_id, id)` key, rejecting cross-operation references; existing domain record references must likewise be checked against the current authorized operation, not trusted from model output. The existing Domain 11 operation-membership RLS pattern applies to every new table (enable RLS and scope reads/writes to authorized operation members). These sketches specify design, not executable migration order or applied SQL. Forward references are resolved when assembling a later migration. Index referencing operation/FK columns for scoped access; no new storage engine is chosen.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | Stable identity |
| operation_id | uuid | NOT NULL, FK → operations | RLS and cross-operation integrity |
| created_at | timestamptz | NOT NULL, default now() | Host creation time |
| updated_at | timestamptz | NOT NULL, default now() | Host update time; immutable revision content is not edited |

##### `submission_field_states`

**Purpose:** Explicit contract-fact states, not 30 companion columns.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| submission_id | uuid | NOT NULL | Parent submission |
| field_name | text | NOT NULL | Dedicated contract fact identity, including reproSteps |
| state | text | NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable')) | Explicit fact state |
| reason | text | NULL | Optional reason |
| source | text | NULL | Optional provenance |

**Design decisions:** One state row per submission/contract fact. Known values live in the dedicated column or ordered step rows. Unknown, unavailable and not_applicable do not invent values. Historical new facts start unknown.

```sql
CREATE TABLE submission_field_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  submission_id uuid NOT NULL,
  field_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable')),
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, submission_id) REFERENCES submissions(operation_id, id),
  UNIQUE (operation_id, submission_id, field_name)
);
```

##### `submission_repro_steps`

**Purpose:** Ordered reproduction steps, not a JSONB payload.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| submission_id | uuid | NOT NULL | Parent submission |
| position | integer | NOT NULL CHECK (position >= 0) | Stable ordering |
| step_text | text | NULL | Known step text; NULL for an explicit non-known step |
| state | text | NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable')) | Step fact state |
| reason | text | NULL | Optional reason |
| source | text | NULL | Optional provenance |

**Design decisions:** Whole-list unknown/not_applicable is represented in submission_field_states for reproSteps; do not fabricate placeholder step rows. Per-step states are available for partially known lists.

```sql
CREATE TABLE submission_repro_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  submission_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  step_text text,
  state text NOT NULL CHECK (state IN ('known','unknown','unavailable','not_applicable')),
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, submission_id) REFERENCES submissions(operation_id, id),
  UNIQUE (operation_id, submission_id, position),
  CHECK ((state = 'known' AND step_text IS NOT NULL) OR (state <> 'known' AND step_text IS NULL))
);
```

#### 11.2b Physical host artifacts — OI-0195 (locked 2026-11-08; design DDL)

> **Historical checkpoint, 2026-11-09 (not current deployment status; see `PROJECT_STATUS.md`):** These tables are implemented in `supabase/migrations/040_assistant_host_artifacts.sql`, merged on Forgejo main as PR #38 (`eb04c197`) and **not applied**. The schema stamp stays 39 until Tim approves the apply. Server-authoritative tables added by 040, the backup exception and the restore fence are in §11.2c.

Capture original input/context/build stamp before AI interpretation. Artifact presence follows purpose, not every artifact on every conversation. The common UUID, operation, timestamp and RLS conventions above apply. The typed mappings are the draft; there are no shadow draft copies of farm domain tables.

**Review is the populated normal UI.** Feedback/Get Help uses its normal sheet; a farm write uses the matching sheet or wizard. A review card is stored evidence only: exact revision, which normal UI was populated and what was shown. Confirmation binds that card and revision to the authenticated actor and transcript evidence. A correction updates those same UI fields, creates a new immutable proposal revision, supersedes the old revision, invalidates its confirmation for execution, and requires a new confirmation. Intent switches and cancellation never authorize an abandoned proposal.

##### `assistant_conversations`

**Purpose:** Original capture and conversation identity.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| original_input | text | NULL | Original text when available, not AI rewrite; original offline audio remains referenced by offline_voice_notes |
| original_context | text | NULL | Original screen/context as captured |
| build_stamp | text | NULL | First-capture app build |
| captured_at | timestamptz | NOT NULL | First capture |
| current_intent | text | NULL | Current interpreted intent |
| feedback_module_pin | text | NOT NULL | Pinned release identity |
| conversation_runtime_pin | text | NOT NULL | Pinned release identity |

**Design decisions:** Keep module pins separate from app build and submission contract_version. Original capture is preserved when intent changes. Offline capture preserves the original audio through offline_voice_notes without fabricating a transcript before online processing; original_input may be NULL until original text is available.

```sql
CREATE TABLE assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  original_input text,
  original_context text,
  build_stamp text,
  captured_at timestamptz NOT NULL,
  current_intent text,
  feedback_module_pin text NOT NULL,
  conversation_runtime_pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id)
);
```

##### `assistant_transcript_turns`

**Purpose:** Ordered user/assistant text and corrections.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Conversation |
| turn_index | integer | NOT NULL CHECK (turn_index >= 0) | Order within conversation |
| speaker | text | NOT NULL | Who spoke |
| text | text | NOT NULL | Transcript text |
| input_mode | text | NOT NULL | Voice or text provenance |
| corrects_turn_id | uuid | NULL | Prior turn corrected |

**Design decisions:** Correction references must be within the same conversation. Retained transcripts do not cascade away with finished attempts.

```sql
CREATE TABLE assistant_transcript_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  turn_index integer NOT NULL CHECK (turn_index >= 0),
  speaker text NOT NULL,
  text text NOT NULL,
  input_mode text NOT NULL,
  corrects_turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, corrects_turn_id) REFERENCES assistant_transcript_turns(operation_id, id),
  UNIQUE (operation_id, conversation_id, turn_index)
);
```

##### `assistant_proposals`

**Purpose:** Stable proposal identity; revisions hold changes.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Origin conversation |
| attempt_id | uuid | NULL | Origin voice-entry attempt; detachable at expiry |
| destination_entity | text | NOT NULL | Existing entity kind |
| destination_ui | text | NOT NULL | Matching sheet/wizard kind |
| existing_record_id | uuid | NULL | Optional existing record, including submission |

**Design decisions:** Existing-record references are resolved by destination_entity and checked against current authorized operation data; never an arbitrary SQL target. New proposals need no existing record.

```sql
CREATE TABLE assistant_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  destination_entity text NOT NULL,
  destination_ui text NOT NULL,
  existing_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id)
);
```

##### `assistant_proposal_revisions`

**Purpose:** Immutable content identity for each proposal version.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| proposal_id | uuid | NOT NULL | Stable proposal |
| revision_number | integer | NOT NULL CHECK (revision_number > 0) | Monotonic proposal revision |
| destination_field_names | text[] | NOT NULL | Exact destination field identities |
| superseded_by_id | uuid | NULL | Newer revision of this same proposal |

**Design decisions:** Field values are typed mappings below. Revision content is immutable; only supersession linkage is updated. Corrections cannot reuse an earlier confirmation.

```sql
CREATE TABLE assistant_proposal_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  proposal_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  destination_field_names text[] NOT NULL,
  superseded_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, proposal_id) REFERENCES assistant_proposals(operation_id, id),
  FOREIGN KEY (operation_id, superseded_by_id) REFERENCES assistant_proposal_revisions(operation_id, id),
  UNIQUE (operation_id, proposal_id, revision_number)
);
```

##### `assistant_field_mappings`

**Purpose:** Typed draft values and correction lineage, not a JSONB bag.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| attempt_id | uuid | NOT NULL | Retention owner |
| revision_id | uuid | NOT NULL | Exact immutable revision |
| source_turn_id | uuid | NULL | Source transcript turn |
| destination_field_name | text | NOT NULL | Existing UI/entity field identity |
| value_type | text | NOT NULL CHECK (value_type IN ('text','number','boolean','date','timestamp','uuid','null')) | Typed scalar discriminator |
| value_text | text | NULL | Text scalar |
| value_number | numeric | NULL | Numeric scalar |
| value_boolean | boolean | NULL | Boolean scalar |
| value_date | date | NULL | Calendar date scalar |
| value_timestamp | timestamptz | NULL | Timestamp scalar |
| value_uuid | uuid | NULL | Reference scalar, authorized by target field |
| uncertainty | text | NULL | Unresolved interpretation, not a safety gate |
| correction_predecessor_id | uuid | NULL | Prior mapping corrected |

**Design decisions:** Exactly the typed value slot selected by value_type is populated (none for null); adapter validation must reject mismatches and unknown destination fields. Multi-row/indexed UI fields keep their field identity rather than an opaque envelope. Same-conversation source/revision, same-proposal correction lineage and target-field reference scope are checked. Mappings/corrections expire with their finished attempt, not the retained review evidence.

```sql
CREATE TABLE assistant_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  attempt_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  source_turn_id uuid,
  destination_field_name text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('text','number','boolean','date','timestamp','uuid','null')),
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_timestamp timestamptz,
  value_uuid uuid,
  uncertainty text,
  correction_predecessor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id),
  FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id),
  FOREIGN KEY (operation_id, source_turn_id) REFERENCES assistant_transcript_turns(operation_id, id),
  FOREIGN KEY (operation_id, correction_predecessor_id) REFERENCES assistant_field_mappings(operation_id, id),
  UNIQUE (operation_id, revision_id, destination_field_name),
  CHECK (num_nonnulls(value_text, value_number, value_boolean, value_date, value_timestamp, value_uuid) = CASE WHEN value_type = 'null' THEN 0 ELSE 1 END),
  CHECK (value_type = 'null' OR CASE value_type WHEN 'text' THEN value_text IS NOT NULL WHEN 'number' THEN value_number IS NOT NULL WHEN 'boolean' THEN value_boolean IS NOT NULL WHEN 'date' THEN value_date IS NOT NULL WHEN 'timestamp' THEN value_timestamp IS NOT NULL WHEN 'uuid' THEN value_uuid IS NOT NULL ELSE false END)
);
```

##### `assistant_review_cards`

**Purpose:** Retained evidence of the normal UI shown, not a separate voice form.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| revision_id | uuid | NOT NULL | Exact revision shown |
| presented_at | timestamptz | NOT NULL | Presentation time |
| populated_ui | text | NOT NULL | Normal UI identity |
| presented_evidence | text | NOT NULL | Faithful record of shown field identities and values |

**Design decisions:** Evidence must preserve what the user actually saw independently of expiring draft mappings. It is presentation evidence, not executable draft storage or a JSONB artifact envelope.

```sql
CREATE TABLE assistant_review_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  revision_id uuid NOT NULL,
  presented_at timestamptz NOT NULL,
  populated_ui text NOT NULL,
  presented_evidence text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id),
  UNIQUE (operation_id, id, revision_id)
);
```

##### `assistant_review_confirmations`

**Purpose:** Authenticated confirmation of the exact presented revision.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| card_id | uuid | NOT NULL | Exact card |
| revision_id | uuid | NOT NULL | Exact revision |
| actor_id | uuid | NOT NULL REFERENCES auth.users(id) | Authenticated actor; operation membership still required |
| confirmed_at | timestamptz | NOT NULL | Confirmation time |
| channel | text | NOT NULL | Voice/text confirmation channel |
| evidence_turn_id | uuid | NULL | Relevant transcript evidence |

**Design decisions:** Card/revision must match, evidence must belong to the proposal conversation, and executor must reject superseded revision confirmations. An immutable historical confirmation is not current authorization.

```sql
CREATE TABLE assistant_review_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  card_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  confirmed_at timestamptz NOT NULL,
  channel text NOT NULL,
  evidence_turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id),
  FOREIGN KEY (operation_id, evidence_turn_id) REFERENCES assistant_transcript_turns(operation_id, id),
  FOREIGN KEY (operation_id, card_id, revision_id) REFERENCES assistant_review_cards(operation_id, id, revision_id)
);
```

##### `assistant_session_checkpoints`

**Purpose:** Durable recoverable progress, not a parallel farm-record store.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Conversation |
| transcript_position | integer | NOT NULL CHECK (transcript_position >= 0) | Resume position |
| pending_revision_id | uuid | NULL | Pending review revision |
| lifecycle_phase | text | NOT NULL | Current durable phase |

**Design decisions:** Resume from transcript and typed proposal; recheck current authorized data and windows before commit. Checkpoint cadence is not specified.

**Trusted snapshot — `pendingClarification` (PR #48, `b6689b23`; 2026-11-10).** This server-owned key lives inside the trusted runtime snapshot in `assistant_session_checkpoints`, not a new browser-owned column or farm entity. The strict validator is **`src/entities/assistant-pending-clarification.js`** (not under `src/features/assistant/entities/`). Its accepted shape is a plain object with no top-level keys other than `field`, `ui`, `names`, `fields` and `fill`:

- `field` is required and is one of `paddock`, `quantityBasis`, `lineAllocations`, `carryoverTiming`, `carryoverTime`, `carryoverSplit`.
- `ui`, if present, is a nonempty string of at most 64 characters; the validator does not define a UI enum here.
- `names`, `fields` and `fill`, if present, are plain objects containing JSON-compatible values: null, strings, booleans, finite numbers, arrays and plain objects. Recursive values beyond depth 8 are rejected; this does not impose per-field nested enums not present in the code.
- The entire serialized object is capped at **16 KB (16 × 1024 UTF-8 bytes)**, measured with `TextEncoder` after `JSON.stringify`, not JavaScript string length. Invalid or oversized values are rejected. `restoreTrustedSnapshot` clones the snapshot and strips a malformed pending key before it is trusted again; server compose and backend bindings use that restore sanitization.

Current clearing is on resolve, cancel and runtime intent change. Clearing when the entry kind changes within data-entry is **pending implementation/scoping**, not a shipped guarantee; OI-0210 is being scoped by Design with Tim for schema-driven entry across the whole app, not ready for Build. This note does not authorize its implementation. Like the other server-authoritative assistant state, `pendingClarification` is excluded from browser **CP-55/CP-56** with its checkpoint table (§11.2c); no new browser backup field or backup migration is introduced.


```sql
CREATE TABLE assistant_session_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  transcript_position integer NOT NULL CHECK (transcript_position >= 0),
  pending_revision_id uuid,
  lifecycle_phase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, pending_revision_id) REFERENCES assistant_proposal_revisions(operation_id, id)
);
```

##### `voice_entry_attempts`

**Purpose:** Running voice-to-entry log and retention owner.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Conversation |
| previous_attempt_id | uuid | NULL | Prior attempt in a retry chain, if any |
| captured_at | timestamptz | NOT NULL | Today filter uses this |
| status | text | NOT NULL CHECK (status IN ('unfinished','finished','discarded')) | Lifecycle |
| finished_at | timestamptz | NULL | Required only when finished |
| purpose | text | NOT NULL CHECK (purpose IN ('write','question','feedback','how-to')) | Separate how-to filter |

**Design decisions:** Unfinished items remain until finished or discarded; discarded attempts remain until user deletion, not a 90-day countdown. Finished attempts and their mappings/corrections expire 90 days from finished_at.

**Lifecycle (Design ruling, 2026-11-09).**
- A row is created when an utterance starts an entry. `captured_at` is the capture or recording time (for an offline note, when it was recorded).
- A reroute updates `purpose` on the same row; the reroute replay is marked with a host event, not a new attempt.
- The row becomes `finished` (with `finished_at`) when a write or feedback item saves locally, or when a question or how-to is answered. The 90-day expiry runs from `finished_at`.
- A user discard sets `discarded`, with no expiry.
- Log filters: Today (operation timezone), Write, Question, Feedback, How-to, Unfinished, All, plus the unfinished badge on the push-to-talk control.
- **Retry chains, ruling (a).** `previous_attempt_id` links a retry to the attempt it retries. The badge and the Unfinished filter count only the newest non-discarded attempt in a chain. Finishing a retry finishes its unfinished predecessors with the same `finished_at`. Discarding the retry makes its predecessor count again.
- **FK cross-check (2026-11-10, `b6689b23`):** migration 040 declares `conversation_id uuid NOT NULL` at :320 and adds its composite conversation FK at :512; the retry predecessor composite FK is at :514. These match the DDL below. Neither FK specifies an ON DELETE cascade; do not infer one from the empty-start cleanup RPC in migration 041.
- The fallback question is a host event stored device-local and kept out of the model transcript; it needs no 040 amendment.

```sql
CREATE TABLE voice_entry_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  previous_attempt_id uuid,
  captured_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('unfinished','finished','discarded')),
  finished_at timestamptz,
  purpose text NOT NULL CHECK (purpose IN ('write','question','feedback','how-to')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, previous_attempt_id) REFERENCES voice_entry_attempts(operation_id, id),
  CHECK ((status = 'finished' AND finished_at IS NOT NULL) OR (status <> 'finished' AND finished_at IS NULL))
);
```

##### `assistant_execution_results`

**Purpose:** Separate durable local, sync, server and feedback-handoff outcomes.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Origin conversation |
| attempt_id | uuid | NULL | Attempt; detachable at expiry |
| revision_id | uuid | NOT NULL | Executed revision |
| confirmation_id | uuid | NOT NULL | Exact authorization |
| destination_entity | text | NOT NULL | Existing target entity |
| saved_record_id | uuid | NULL | Actual existing-domain record or submission |
| local_saved_at | timestamptz | NULL | Actual durable local save only |
| sync_queued_at | timestamptz | NULL | Actual queued sync only |
| server_acknowledged_at | timestamptz | NULL | Actual server acknowledgement only |
| feedback_handoff_acknowledged_at | timestamptz | NULL | Separate feedback handoff acknowledgement |
| failure_stage | text | NULL | Stage that failed |
| failure_detail | text | NULL | Failure evidence |

**Design decisions:** These are independent outcomes, not one success boolean. Confirmation and revision must match. Retry/recovery must not assert a local save from a queued or server state. Saved references are checked against destination entity and operation.

```sql
CREATE TABLE assistant_execution_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  revision_id uuid NOT NULL,
  confirmation_id uuid NOT NULL,
  destination_entity text NOT NULL,
  saved_record_id uuid,
  local_saved_at timestamptz,
  sync_queued_at timestamptz,
  server_acknowledged_at timestamptz,
  feedback_handoff_acknowledged_at timestamptz,
  failure_stage text,
  failure_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id),
  FOREIGN KEY (operation_id, revision_id) REFERENCES assistant_proposal_revisions(operation_id, id),
  FOREIGN KEY (operation_id, confirmation_id) REFERENCES assistant_review_confirmations(operation_id, id)
);
```

##### `assistant_testing_consents`

**Purpose:** Actual testing-audio popup decision, asked once per tester per operation.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Context in which popup was decided |
| actor_id | uuid | NOT NULL REFERENCES auth.users(id) | Authenticated deciding user |
| decision | text | NOT NULL CHECK (decision IN ('accepted','declined')) | Actual decision, never inferred |
| decided_at | timestamptz | NOT NULL | Popup decision time |

**Design decisions:** Testing-audio consent is separate from offline local recording and from confirmation of a farm write. No later-rollout consent is invented. The client shows the popup and writes this row; the backend only reads the stored decision. `earlyTesting` comes from the secret `GTHO_ASSISTANT_EARLY_TESTING` (T12). Declining still allows voice, and no audio is kept for that tester (P7). Popup copy (exact): “During early testing, GTHO can keep recordings of what you say to the assistant so we can improve it. Keep my recordings? You can still use voice if you say no.” Buttons: “Keep recordings” / “Don't keep”.

```sql
CREATE TABLE assistant_testing_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('accepted','declined')),
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id)
);
```

##### `assistant_testing_audio`

**Purpose:** Consented early-testing audio metadata only.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Conversation |
| attempt_id | uuid | NULL | Attempt; detachable at expiry |
| consent_id | uuid | NOT NULL | Actual accepted testing decision |
| audio_reference | text | NOT NULL | Opaque audio reference |
| captured_at | timestamptz | NOT NULL | Capture metadata |
| duration_ms | numeric | CHECK (duration_ms >= 0) | Capture duration if known |

**Design decisions:** Verify accepted consent for the actor/operation before retention. Bytes go to the private Supabase Storage bucket `assistant-testing-audio` via a server-minted signed upload (P8, 2026-11-09); `audio_reference` points there. Only the user’s mic is kept, never assistant output. Stop keeping new testing audio at testing end; disposal of already-collected audio is deferred.

```sql
CREATE TABLE assistant_testing_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  consent_id uuid NOT NULL,
  audio_reference text NOT NULL,
  captured_at timestamptz NOT NULL,
  duration_ms numeric CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id),
  FOREIGN KEY (operation_id, consent_id) REFERENCES assistant_testing_consents(operation_id, id)
);
```

##### `offline_voice_notes`

**Purpose:** Device-local opaque recording reference and processing/deletion evidence.

Common columns above also apply.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| conversation_id | uuid | NOT NULL | Original conversation |
| attempt_id | uuid | NULL | Attempt; detachable without deleting recording |
| device_local_reference | text | NOT NULL | Opaque on-device reference, not cloud audio |
| original_context | text | NULL | Capture context |
| captured_at | timestamptz | NOT NULL | Capture time |
| confirmed_execution_result_id | uuid | NULL | Confirmed write/filing and actual local save evidence |
| deleted_at | timestamptz | NULL | Actual deletion time only |

**Design decisions:** Playback and user deletion remain available before processing; no extra on-device storage permission prompt. Processing/deletion eligibility requires confirmation AND successful durable local save from this note. Confirmation alone, discard, queued sync or server/handoff acknowledgement alone do not authorize processing deletion. Discard without filing keeps audio unless the user deletes it. Recordings are stored on the device in IndexedDB, capped at 3 minutes per note, transcribed once online and reviewed before saving (P9, 2026-11-09). This table is scoped metadata, not an audio upload promise.

```sql
CREATE TABLE offline_voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES operations(id),
  conversation_id uuid NOT NULL,
  attempt_id uuid,
  device_local_reference text NOT NULL,
  original_context text,
  captured_at timestamptz NOT NULL,
  confirmed_execution_result_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, id),
  FOREIGN KEY (operation_id, conversation_id) REFERENCES assistant_conversations(operation_id, id),
  FOREIGN KEY (operation_id, attempt_id) REFERENCES voice_entry_attempts(operation_id, id),
  FOREIGN KEY (operation_id, confirmed_execution_result_id) REFERENCES assistant_execution_results(operation_id, id)
);
```

**Relationships, validation and retention.** A conversation has ordered turns and may have multiple proposals and attempts. A proposal has immutable ordered revisions, each with typed mappings and zero or more presentations; a presentation can have confirmation evidence. The executor checks same-conversation/same-proposal relationships beyond operation FKs and executes only the currently confirmed revision through existing entity `validate()` and write paths. New-filing completeness is contract validation, not fabricated historical NOT NULL values.

No deletion cascade is specified from attempts or mappings to ordinary farm records, retained revisions/review-card evidence/confirmations or transcripts, testing consent/audio, execution evidence, checkpoints, or offline recordings. At 90 days from finished_at, explicitly delete the finished attempt and its mapping/correction rows; detach nullable attempt links on retained artifacts (including related-attempt links) and remove mapping predecessor dependencies within the cleanup set. Do not let an FK block cleanup indefinitely or cascade away retained evidence. Discarded attempts/recordings are not in that cleanup set. Transcripts and review evidence remain after testing; no extra retention duration is invented for them here. Today filtering uses capture time, not finish time.

The host 90-day finished mapping-record lock **differs from the shared conversation-runtime CONTRACT’s permanent mapping-record language**. Neither shared CONTRACT is changed; no reconciliation is claimed. How-to-only Get help stays in the same assistant with a matching doc link and no product filing. The new tables in this section and the additive submissions columns join the existing CP-55/CP-56 serialization/backup set in the same operation-scoped way as submissions, except `assistant_session_checkpoints` and `assistant_execution_results`, which are server-authoritative and excluded (§11.2c). Opaque metadata is not proof that audio bytes are backed up. See `V2_MIGRATION_PLAN.md` §5.3. Historical 2026-11-09 application checkpoint: migration 040 was on Forgejo main and not applied, with schema_version 39. This is not the current deployment claim; PR #48 is live as recorded in `PROJECT_STATUS.md`. Live migration-history verification is not contained in this docs-only review.

#### 11.2c Server-authoritative assistant tables, backup exception and restore fence — OI-0195 (locked 2026-11-09)

Migration 040 also adds server-side coordination and billing state. Physical DDL is in `supabase/migrations/040_assistant_host_artifacts.sql`; this section records the locks, not a second copy of the DDL.

**Server-authoritative tables.** Seven tables are written only by the backend (`service_role`); the browser has no table privileges on them:

| Table | Role |
|---|---|
| `assistant_session_checkpoints` | Trusted runtime snapshot (§11.2b) |
| `assistant_execution_results` | Execution claim and outcome (§11.2b) |
| `assistant_session_locks` | Durable exclusive operation/conversation lock; no expiry or takeover |
| `assistant_billing_policies` | Per-operation caps and billing timezone |
| `assistant_billing_reservations` | One reservation per request or settlement |
| `assistant_billing_usage` | Measured or unknown usage per reservation |
| `assistant_billing_settlements` | Voice settlement identities |

**Backup exception (Tim, testing scope).** Browser CP-55/CP-56 backup and restore exclude these seven tables plus `assistant_restore_fences`. CP-55/CP-56 is therefore not complete assistant recovery. The backend-authorized backup/recovery path is deferred.

**Restore fence (Tim).** A membership-checked SECURITY DEFINER probe and fence: `assistant_restore_prepare`, `assistant_restore_finish` and `assistant_restore_abort`. It reveals only whether the operation has rows in the protected tables, and it holds a durable fence (`assistant_restore_fences`) so new protected rows cannot appear during a restore. No GRANT loosening, no `service_role` in the PWA, no row contents, no expiry or takeover. A restore that would conflict with retained server authority is refused before anything destructive happens.

**Billing (Tim).** No blanket billing-policy seed: the policy row is created on the first reserve. Caps are 30 requests per 10 minutes, 2000 requests per month and 600 audio minutes per month, stored as policy parameters. The billing calendar uses the operation timezone; reserve fails with `billing-calendar-timezone-required` if it is not set. Unknown usage after a provider timeout or failure does not block reserve, still counts once against request caps, is never recorded as zero (counters stay NULL), and is listed in the `service_role`-only `assistant_billing_unreconciled_usage` view for later server-side reconciliation (deferred). A failure before any provider fetch is a measured zero (Design). Voice settles the worst case (the 10-minute session cap) at token issue; later client usage reports are refused. The central usage view is for Tim only (`GTHO_BILLING_CONTROL_USERS`); billing UI and operation-owned billing are deferred.

### 11.3 todos

**Purpose:** Farm task management. Tasks can be linked to a location, an animal, or both. Multi-user assignment via junction table (A26) replaces v1's JSONB `assignedTo[]` array.
**Audit refs:** ADM-02

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping |
| title | text | NOT NULL | Task title |
| description | text | NULL | Detailed description. V1: embedded in note field. |
| status | text | NOT NULL, DEFAULT 'open' | open, in_progress, closed. V1 used 'inprogress' (no underscore). |
| note | text | NULL | Free-form notes |
| location_id | uuid | NULL, FK → locations | V1: paddock (text name). V2: proper FK. |
| animal_id | uuid | NULL, FK → animals | Link to specific animal (treatment reminders, weaning tasks) |
| due_date | date | NULL | V1 had this in JS but not in Supabase schema. Now a proper column. |
| point_lat | numeric | NULL | Optional map pin. Migration 034. A to-do is a location or a point. |
| point_lng | numeric | NULL | Optional map pin. Migration 034. |
| created_by | uuid | NULL, FK → operation_members | Who created the task |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **assignedTo normalized (A26).** V1's JSONB array replaced by `todo_assignments` junction table. Enables "show me all tasks assigned to me" as a simple query without array scanning.
- **location_id replaces paddock text.** V1 stored the paddock name as a string — breaks if the paddock is renamed. V2 uses a proper FK.
- **animal_id kept.** Tasks linked to animals are a core workflow — "give cow #42 her booster shot" shows up in both the todo list and the animal's task tab.
- **due_date promoted to Supabase column.** V1 had this in JS state but excluded it from the Supabase schema (see v1 shape function comment). V2 includes it for query-based reminders.

```sql
CREATE TABLE todos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id),
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'open',
  note            text,
  location_id     uuid REFERENCES locations(id),
  animal_id       uuid REFERENCES animals(id),
  due_date        date,
  point_lat       numeric,
  point_lng       numeric,
  created_by      uuid REFERENCES operation_members(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 11.4 todo_assignments

**Purpose:** Junction table for multi-user task assignment. Replaces v1's `assignedTo[]` JSONB array (A26).
**Audit refs:** ADM-02

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scoping (Design Principle #8) |
| todo_id | uuid | NOT NULL, FK → todos ON DELETE CASCADE | |
| user_id | uuid | NOT NULL, FK → operation_members | Assigned team member |
| assigned_at | timestamptz | NOT NULL, DEFAULT now() | When the assignment was made |

**Design decisions:**
- **Composite unique on (todo_id, user_id).** Prevents duplicate assignments.
- **operation_id** carried directly for RLS and operation-scoped queries. Matches parent todo's operation_id — set by app code at insert time. Added in migration 019 (OI-0055).

```sql
CREATE TABLE todo_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id),
  todo_id         uuid NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES operation_members(id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (todo_id, user_id)
);
```

### 11.5 release_notes

**Purpose:** Global published release-note content, not per-operation. The current client pulls these rows but has no release-note UI consumer; 044 does not add a modal or renderer.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| version | text | NOT NULL | Build stamp or semantic version |
| title | text | NOT NULL | Release title |
| body | text | NOT NULL | Markdown release notes content |
| published_at | timestamptz | NOT NULL, DEFAULT now() | When the release was published |

**Design decisions:**
- **No operation_id.** Release notes are global — all users see the same notes.
- **No updated_at.** Release notes are write-once from the developer. If corrections are needed, publish a new entry.
- **Markdown body.** Stored as text; no UI consumer is implemented by 044.
- **044 grant posture:** RLS enabled; authenticated SELECT policy `USING (true)` and SELECT grant. Anon is fully denied; INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER are revoked from both browser roles. Writes are privileged migration/service operations only, not browser writes. Before 044, RLS was enabled with zero policies, so API reads returned empty. Successful pulls can now hydrate rows; this does not change the PWA update mechanism or add a release-note UI. `release_notes` remains excluded from CP-55/CP-56.

```sql
CREATE TABLE release_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now()
);
```

---

## Appendix A: Tables Eliminated in v2

| v1 Table | Why Eliminated | Replaced By |
|----------|----------------|-------------|
| event_sub_moves | Duplicated paddock window functionality | event_paddock_windows |
| event_npk_deposits | Stored computed values | Compute-on-read from windows + group data |
| event_group_memberships (v1 shape) | Snapshot-only, no window model | event_group_windows |
| operation_settings | JSONB blob | Typed columns on farm_settings (per-farm, A18) and operations |
| animal_health_events (mega-table) | 5 record types crammed into 24 columns | Split into animal_bcs_scores, animal_treatments, animal_breeding_records, animal_calving_records |

## Appendix B: Design Session Log

| Date | Tables Designed | Key Decisions |
|------|-----------------|---------------|
| 2026-04-11 | locations, events, event_paddock_windows, event_group_windows, event_feed_entries, event_feed_checks, event_feed_check_items, paddock_observations, surveys, survey_draft_entries, harvest_events, harvest_event_fields | Window model replaces anchor paddock; sub-moves eliminated; feed always delivered to paddock; feed checks normalized from JSONB; absolute remaining not percentage; transfer via source_event_id not negative qty; location taxonomy (confinement/land); bale ring residue count added to observations |
| 2026-04-11 | operations, farms, farm_settings, operation_members, user_preferences | Settings per-farm not per-operation (A18); no herd_type on operations (A19); currency operation-wide, NPK prices per-farm (A20); user preferences separate table (A21); spreaders as reference table in D8 (A22) |
| 2026-04-11 | forage_types, feed_types, batches, batch_adjustments, app_logs, submissions, todos, todo_assignments, release_notes | Per-forage-type utilization (A15); batch adjustments normalized from JSONB (A23); app logs direct-write (A24); submission thread JSONB exception (A25); todo assignments normalized (A26); batch_number for organic traceability; haylage/balage categories added |
| 2026-04-12 | app_logs (amended) | Added operation_id (nullable, no FK, best-effort context) and context jsonb (structured metadata for dead letters and error context). Infrastructure review harmonization — aligns schema with V2_INFRASTRUCTURE.md §3. Added future schema note for AI/voice tables in D11. |
| 2026-04-12 | animal_classes, animal_calving_records, farm_settings, npk_price_history (amended/new) | Calculation spec review: excretion columns renamed _pct → _rate (NRCS standard unit). Species split 'cattle' → 'beef_cattle'/'dairy_cattle' for distinct lactation logic and DMI rates. Added dmi_pct_lactating on animal_classes. Added dried_off_date on animal_calving_records for dairy dry-off tracking. Removed default_dm_per_aud_kg from farm_settings (DMI lives on class, seeded at onboarding). Excretion rates and DMI are 2-tier: class → NRCS code constant. New table npk_price_history (D8.10) resolves A16 — per-farm price tracking over time. |
| 2026-04-12 | farm_settings (amended) | UX flows review: Added forage_quality_scale_min/max (A41) for farm-configurable forage quality assessment range (default 1–100, expandable for RFQ or other scales). |
| 2026-04-13 | operations (amended) | Added unit_system column (text NOT NULL DEFAULT 'imperial', CHECK IN ('metric','imperial')). Resolves OI-0002. Decision A44: unit system is operation-wide, same rationale as currency. Storage remains metric per V2_INFRASTRUCTURE.md §1.1; column controls display layer only. |
| 2026-04-18 | animals (amended) | Added `confirmed_bred boolean NOT NULL DEFAULT false` (migration 026). Reverses A29's original "confirmed bred derived from breeding records" design — direct stored boolean written by the Edit Animal checkbox (OI-0099 Class B B4). A richer breeding-status model (palpation dates, methods, repro history) deferred to a future OI. Also clarifies A28 sire linkage: Edit Animal's sire picker writes `sire_animal_id` / `sire_ai_bull_id` with mutual exclusivity and offers an inline "Add AI bull" action; `ai_bulls` table retains its v1-era name but will hold historical / external / non-AI bulls in practice. |

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-11-10 | GTHO Design — docs only | Document server-owned pendingClarification shape, UTF-8 byte cap, restore sanitization, clearing and CP-55/CP-56 exclusion; distinguish pending entry-kind clearing from shipped behavior; verify migration 040 voice_entry_attempts FKs against the existing DDL. |
| 2026-11-09 | OI-0195 — ready-for-build gate locks | §11.2b notes migration 040 (on Forgejo main via PR #38, not applied). `voice_entry_attempts` lifecycle and retry-chain ruling (a); consent asked once per tester per operation with exact copy and decline behavior; testing audio in the private `assistant-testing-audio` bucket; offline notes in IndexedDB with a 3-minute cap. New §11.2c: seven server-authoritative tables, testing-scope CP-55/CP-56 exception, restore fence and billing locks. Calving dam clear marked implemented. |
| 2026-11-08 | OI-0195 host physical design specified | Additive submissions columns/fact states/repro steps and operation-scoped artifact table sketches; populated-UI review; typed drafts and safe 90-day cleanup. Open set excludes calves; every recorded birth clears dam confirmed_bred. Design only, adapter unimplemented, not handed to Build; shared CONTRACTs unchanged. |
| 2026-11-08 | OI-0195 — host adoption design | Added release pins, additive submissions mapping and explicit historical unknowns; logical host artifact inventory, review/capture obligations, how-to routing, offline deletion and consent, 90-day log/mapping retention. Physical layout and tool contracts remain open; not ready for Build. No SQL/schema applied. |
| 2026-11-08 | OI-0195 — voice/AI schema note | Updated the Domain 11 future-schema note: April transcript/training/script/confidence list is no longer treated as the planned table set. Tables remain undesigned. Pointer to rewritten `V2_INFRASTRUCTURE.md` §8. No schema change. |
| 2026-04-12 | Session 6 — Infrastructure review | D11.1 app_logs: Added operation_id (nullable, no FK, best-effort) and context (jsonb, dead letter + error metadata). D11 header: Added future schema note for AI/voice tables. Appendix B: Added 2026-04-12 session log entry. |
| 2026-04-12 | Session 7 — Calculation spec review | D3 animal_classes: excretion_n/p/k_pct → excretion_n/p/k_rate (NRCS unit alignment). Species CHECK updated: 'cattle' → 'beef_cattle' + 'dairy_cattle'. Added dmi_pct_lactating. D9 animal_calving_records: Added dried_off_date for dairy dry-off tracking. |
| 2026-04-12 | Session 8 — UX flows review | D1 farm_settings: Added forage_quality_scale_min (default 1), forage_quality_scale_max (default 100) for configurable survey assessment range (A41). |
| 2026-04-14 | Tier 3 migration testing — OI-0055 | Root-cause fix: added `operation_id uuid NOT NULL FK → operations` to four tables that were missing it: §5.6 event_feed_check_items, §6.2 survey_draft_entries, §7.2 harvest_event_fields, §11.4 todo_assignments. Updated column specs, design decision notes, and CREATE TABLE SQL for all four. Design Principle #8 simplified — no longer has exceptions. Migration 019 adds the column + backfill. |
| 2026-04-17 | Local-only fields audit — OI-0089 | Retroactive documentation of two tables that existed in live Supabase, entity code, and §5.3a but were missing from this design doc. Added §5.8 `event_observations` (migration 021 + `bale_ring_residue_count` from migration 022, SP-2 event-time pasture observations) and §9.11 `animal_notes` (migration 012 "Domain 9 amendment", OI-0003). Both sections match existing style (column table, design decisions, CREATE TABLE). No schema change — doc catch-up only. Live ground truth: `SCHEMA_DUMP_2026-04-17.md`. |
| 2026-04-18 | OI-0111 Settings UI unit conversion — farm_settings bale-ring column renamed | Migration 027 renames `farm_settings.bale_ring_residue_diameter_ft` → `bale_ring_residue_diameter_cm`, converts stored values (× 30.48), sets default 365.76, drops the old column. Bumps `schema_version` 26 → 27. The BRC-1 calc in `src/calcs/survey-bale-ring.js` stays imperial-native; callers (paddock-card, surveys) convert cm → ft inline before invoking. This closes the last farm-settings column that stored imperial natively — the whole table now follows the metric-internal / display-converted rule. §1.3 column table + CREATE TABLE SQL updated. |
| 2026-05-03 | Reconciliation Session A — schema doc catch-up (RECONCILIATION_PLAN_2026-05-03 SCH-1, SCH-2, SCH-3) | **§3.3 groups (SCH-1):** column table + CREATE TABLE updated to show `archived_at timestamptz` (replaces earlier `archived boolean` per migration 024 / SP-11 Part 3 / OI-0090). Added design-decision paragraph on the soft-delete-via-timestamp pattern. Updated index comment to reflect that migration 032's `farm_id` drop auto-dropped the `idx_groups_active` partial index without a replacement. **§5.1 events (SCH-2):** removed `date_in` and `time_in` from column table and CREATE TABLE (dropped in migration 028 / OI-0117). Added design-decision paragraph documenting the derive-on-read pattern via `getEventStart()` / `setEventStart()`, the OI-0115 drift class it closed, and the general rule "if derivable from child rows, derive on read." **§5.4 event_feed_entries (SCH-3):** added `entry_type`, `destination_type`, `destination_event_id` columns and four check constraints (chk_entry_type_enum, chk_destination_type_enum, chk_removal_has_destination, chk_dest_event_consistency) per migration 023 / SP-10 §8a Move Feed Out. Rewrote the design-decision section to cover the new direction-via-entry_type model (no negative quantities), the batch-vs-event destination model, and why pre-SP-10 `source_event_id` is retained for compatibility. Flagged CP-55/CP-56 export-spec impact for the three new columns. **SCH-4 (farm_settings) confirmed already reconciled** — `bale_ring_residue_diameter_cm` was documented in the 2026-04-18 entry above; no edit needed in this session. No code changed in this session — documentation catch-up only. Owner: Cowork. |

---

*End of document. Domains marked DESIGN PENDING will be completed in subsequent interactive design sessions.*
