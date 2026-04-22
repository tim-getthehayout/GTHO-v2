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
8. **RLS by operation_id** — Every user-data table has `operation_id uuid NOT NULL` for row-level security. No exceptions — child and junction tables carry their own `operation_id` even though it's derivable from a parent FK, because every operation-scoped query (RLS policies, backup delete, parity checks) must filter directly without joins. Universal reference tables (`dose_units`, `input_product_units`) and global tables (`release_notes`) have RLS disabled.
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
| confirmed_bred | boolean | NOT NULL, DEFAULT false | Pregnancy-check / palpation confirmed. Stored state per OI-0099 (reverses the original A29 "derived" design). Migration 026. |
| notes | text | | |
| active | boolean | DEFAULT true | false = culled |
| cull_date | date | | Flattened from v1 cullRecord object |
| cull_reason | text | | |
| cull_notes | text | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Derived fields (not stored — A2):**
- **Current weight:** Latest record from `animal_weight_records` (D9)
- **Wean target date:** `birth_date + animal_classes.weaning_age_days`
- **Current group:** Open membership from `animal_group_memberships` (date_left IS NULL)

**Design decisions:**
- **Sire linkage via FKs, not free text (A28):** V1's sireTag (free text) replaced by two FKs: `sire_animal_id` for herd bulls, `sire_ai_bull_id` for AI sires. At most one populated. Lineage on the animal record; breeding history details on `animal_breeding_records` (D9). Edit Animal's sire picker writes these two FKs directly with mutual exclusivity (OI-0099 Class B B1). Inline "Add AI bull" from the picker creates `ai_bulls` rows for historical / external / non-AI bulls that predate the app — the table name is a v1-era artifact retained for now; rename/split is a future OI.
- **Confirmed bred stored, not derived (A29 — reversed by OI-0099 on 2026-04-18):** V1 stored `confirmedBred` on the animal; v2 originally planned to derive from breeding records ("most recent confirmed breeding with no subsequent calving"). Deriving turned out to block the Edit Animal UI (farmer can confirm pregnancy months before any calving record exists) and required rules that were never implemented. Migration 026 adds `confirmed_bred boolean NOT NULL DEFAULT false`; the Edit Animal checkbox writes directly. If a richer breeding-status model is ever needed (palpation dates, methods, repro history) that's a new `animal_breeding_status` table (see OI-0099 "Option B6" — deferred).
- **Cull fields flattened:** V1's `cullRecord` JSONB object ({date, reason, notes}) promoted to three proper columns for queryability.
- **No healthEvents[], calvingRecords[], weightHistory[]:** All moved to their own tables in D9 and weight records table. No JSONB arrays on the animal record.

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
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
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
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Operation-scoped with derived current farm (OI-0133):** The group record itself has no `farm_id`. The group's current farm is derived at read time by taking the latest open `event_group_window` (one with `date_left IS NULL`, sorted by `date_joined DESC, time_joined DESC`) and reading that window's parent event's `farm_id`. A group with no open window has no current farm — it appears only in "All farms" view. This removes the drift class where a cross-farm move updated the destination event but left `groups.farm_id` pointing at the source farm. Helper: `getGroupCurrentFarm(groupId)` in `src/data/store.js`. Prior design stored `farm_id` on the group and required the move wizard to keep it in sync; migration 032 dropped the column. See CLAUDE.md §"Known Traps" for the grep contracts that prevent re-introduction.
- **No animalIds[] array:** V1 derived `group.animalIds` from the membership ledger at load time. V2 does the same — the group record never stores a list of animals.

```sql
CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  name          text NOT NULL,
  color         text,
  archived      boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
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
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Normalized from JSONB (A23).** V1 stored adjustments as an inline array on the batch. V2 normalizes for: user tracking (adjusted_by), cross-batch queries (monthly shrinkage), and consistency with principle #6.
- **delta stored despite being derived.** Exception to compute-on-read (A2) because it enables direct aggregation queries and serves as an integrity check alongside previous_qty and new_qty.
- **No updated_at.** Adjustments are write-once records. Once recorded, they're immutable history.

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
| date_in | date | NOT NULL | Event start date |
| time_in | text | NULL | Optional time of day (HH:MM) |
| date_out | date | NULL | NULL = event still open |
| time_out | text | NULL | |
| source_event_id | uuid | NULL, FK → events ON DELETE SET NULL | When this event was created by a cross-farm move, points back to the (now-closed) source event on the other farm. NULL for regular within-farm events. Enables event cards to render "← Moved from {farm}" / "→ Moved to {farm}" markers on each side of the move pair. |
| notes | text | NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
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
  date_in           date NOT NULL,
  time_in           text,
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
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **All paddock windows are equal** — no anchor concept. First opened is just first opened.
- **no_pasture override** — normally inherited from location type, but can be set per-window for mixed-use locations where you want to track as stored-feed-only for a particular visit.
- **Closing a window triggers a paddock observation** (recorded in paddock_observations with source='event').
- **Opening a window also triggers a paddock observation** (pre-graze reading).
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

Records every feed delivery or transfer on an event. Feed is always delivered to a specific paddock within the event (location_id is NOT NULL). Transfers between events are tracked via source_event_id.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| operation_id | uuid | NOT NULL, FK → operations | RLS scope |
| event_id | uuid | NOT NULL, FK → events ON DELETE CASCADE | Parent event |
| batch_id | uuid | NOT NULL, FK → batches | Which feed batch |
| location_id | uuid | NOT NULL, FK → locations | Which paddock received the feed |
| date | date | NOT NULL | Delivery date |
| time | text | NULL | |
| quantity | numeric | NOT NULL | Amount delivered (always positive) |
| source_event_id | uuid | NULL, FK → events | NULL = fresh delivery. Set = transferred from this event |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **Always positive quantity.** No negative transfer-out entries. A transfer creates one new entry on the destination event with source_event_id pointing to where it came from. The source event's remaining is computed by the calculation layer (total delivered minus total consumed minus total transferred out).
- **location_id NOT NULL.** Feed is always delivered to a specific paddock. For bale grazing, knowing which paddock got the bales is essential for nutrient and residue tracking.
- **source_event_id for transfers.** When closing an event, the move wizard asks "how much feed to move?" The answer becomes a new feed entry on the destination event with source_event_id = old event. The leftover on the source event is recorded as feed residual via a feed check (see 5.5).
- **No unit column.** Unit comes from the batch (batch.quantity_unit). All feed entries for a batch use the same unit.
- **No transfer_pair_id / negative qty pattern.** The v1 double-entry model (negative on source, positive on destination) was error-prone. v2 uses a simpler model: the destination entry points back to the source event. The calculation layer derives what left the source.

```sql
CREATE TABLE event_feed_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id      uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  batch_id          uuid NOT NULL REFERENCES batches(id),
  location_id       uuid NOT NULL REFERENCES locations(id),
  date              date NOT NULL,
  time              text,
  quantity          numeric NOT NULL CHECK (quantity > 0),
  source_event_id   uuid REFERENCES events(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
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

Three reference tables support the domain: `input_product_categories` (user-extensible product grouping), `input_product_units` (shared measurement units), and `input_products` (commercial amendment catalog with full nutrient composition). A `spreaders` table replaces v1's single global manure load size (A22).

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

**Purpose:** Shared reference table for input product purchase/application units. Universal — not scoped to any operation. Seeded with common units at app setup; users can add new ones without code changes.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| name | text | NOT NULL, UNIQUE | 'ton', 'bag', 'lb', 'kg', 'gallon' |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **No operation_id:** Same pattern as dose_units (A33). Purchase units are universal. Adding a new unit is a row insert, not a code deploy.

```sql
CREATE TABLE input_product_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  archived    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

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

Three reference tables support the record tables: `ai_bulls` (AI sire catalog), `treatment_categories` (user-extensible grouping), and `treatment_types` (specific treatments linked to categories). A shared `dose_units` table provides universal measurement units for treatment dosing.

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

**Purpose:** Shared reference table for treatment dosage units. Universal — not scoped to any operation. Seeded with common units at app setup; users can add new ones without code changes.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| name | text | NOT NULL, UNIQUE | 'ml', 'cc', 'mg', 'tablet', 'capsule', 'pump' |
| archived | boolean | DEFAULT false | Soft delete |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Design decisions:**
- **No operation_id (A33):** Dose units are universal — "ml" means the same thing everywhere. Shared across all operations. No RLS needed beyond authenticated access.
- **Reference table, not hardcoded list (A33):** Adding a new unit (e.g., 'bolus', 'implant') is a row insert, not a code deploy.

```sql
CREATE TABLE dose_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  archived    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

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
5. Calving resets "confirmed bred" status naturally (A29) — new calving record exists after the breeding record

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

> **Future schema note:** AI/voice integration tables (voice transcripts, training data, guided scripts, confidence scores) are planned but not part of the launch schema. They will be designed as a D11 schema update when AI Phase 1 implementation begins — see V2_INFRASTRUCTURE.md §8 for the design roadmap.

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

**Purpose:** In-app release notes pushed by the developer. Replaces v1's hardcoded "what's new" modal. Global table — not per-operation.

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
- **Markdown body.** Rendered in-app with a simple markdown renderer. Keeps the table lean — no JSONB for structured sections.

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
| 2026-04-12 | Session 6 — Infrastructure review | D11.1 app_logs: Added operation_id (nullable, no FK, best-effort) and context (jsonb, dead letter + error metadata). D11 header: Added future schema note for AI/voice tables. Appendix B: Added 2026-04-12 session log entry. |
| 2026-04-12 | Session 7 — Calculation spec review | D3 animal_classes: excretion_n/p/k_pct → excretion_n/p/k_rate (NRCS unit alignment). Species CHECK updated: 'cattle' → 'beef_cattle' + 'dairy_cattle'. Added dmi_pct_lactating. D9 animal_calving_records: Added dried_off_date for dairy dry-off tracking. |
| 2026-04-12 | Session 8 — UX flows review | D1 farm_settings: Added forage_quality_scale_min (default 1), forage_quality_scale_max (default 100) for configurable survey assessment range (A41). |
| 2026-04-14 | Tier 3 migration testing — OI-0055 | Root-cause fix: added `operation_id uuid NOT NULL FK → operations` to four tables that were missing it: §5.6 event_feed_check_items, §6.2 survey_draft_entries, §7.2 harvest_event_fields, §11.4 todo_assignments. Updated column specs, design decision notes, and CREATE TABLE SQL for all four. Design Principle #8 simplified — no longer has exceptions. Migration 019 adds the column + backfill. |
| 2026-04-17 | Local-only fields audit — OI-0089 | Retroactive documentation of two tables that existed in live Supabase, entity code, and §5.3a but were missing from this design doc. Added §5.8 `event_observations` (migration 021 + `bale_ring_residue_count` from migration 022, SP-2 event-time pasture observations) and §9.11 `animal_notes` (migration 012 "Domain 9 amendment", OI-0003). Both sections match existing style (column table, design decisions, CREATE TABLE). No schema change — doc catch-up only. Live ground truth: `SCHEMA_DUMP_2026-04-17.md`. |
| 2026-04-18 | OI-0111 Settings UI unit conversion — farm_settings bale-ring column renamed | Migration 027 renames `farm_settings.bale_ring_residue_diameter_ft` → `bale_ring_residue_diameter_cm`, converts stored values (× 30.48), sets default 365.76, drops the old column. Bumps `schema_version` 26 → 27. The BRC-1 calc in `src/calcs/survey-bale-ring.js` stays imperial-native; callers (paddock-card, surveys) convert cm → ft inline before invoking. This closes the last farm-settings column that stored imperial natively — the whole table now follows the metric-internal / display-converted rule. §1.3 column table + CREATE TABLE SQL updated. |

---

*End of document. Domains marked DESIGN PENDING will be completed in subsequent interactive design sessions.*
