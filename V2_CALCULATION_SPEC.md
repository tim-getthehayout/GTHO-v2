# GTHO v2 — Calculation Specification

**Status:** APPROVED
**Source:** Prior CALCULATION_REGISTRY.md + interactive design sessions
**Purpose:** Catalog every formula in the app (37 formulas across 11 domains), document the registerCalc() pattern, specify the reference console, and flag v1 bugs to fix. Claude Code implements calculations from this spec.

---

## 1. The registerCalc() Pattern

Every formula in the app is registered via `registerCalc()` before use. This serves three purposes:

1. **Metadata for humans** — agronomists, nutritionists, and Tim can review formulas without reading JS
2. **Test generation** — example values in metadata become the first unit test
3. **Auditability** — every calculation is traceable, versionable, and citable

### 1.1 Registration Interface

```js
// src/utils/calc-registry.js
registerCalc({
  name: 'npkExcretion',
  category: 'npk',
  description: 'Total NPK deposited by animals on a pasture',
  formula: 'N = headCount × avgWeight/1000 × days × nExcRate',
  inputs: [
    { name: 'headCount', type: 'integer', unit: 'head' },
    { name: 'avgWeightKg', type: 'number', unit: 'kg' },
    { name: 'days', type: 'number', unit: 'days' },
    { name: 'excretionNRate', type: 'number', unit: 'kg/1000kg BW/day', configKey: 'npk.nExcRate' },
  ],
  output: { type: 'object', shape: '{ nKg, pKg, kKg }', unit: 'kg' },
  example: {
    inputs: { headCount: 30, avgWeightKg: 545, days: 14, excretionNRate: 0.145 },
    output: { nKg: 33.2, pKg: 9.4, kKg: 31.2 }
  },
  source: 'USDA NRCS Nutrient Management Standard',
  notes: 'v2: per-class rates from animal_classes table. v1 used global rates.'
});
```

### 1.2 Registry API

```js
getAllCalcs()                    // → Calc[] (all registered)
getCalcsByCategory(category)    // → Calc[] (filtered)
getCalcByName(name)             // → Calc | undefined
```

### 1.3 v2 Enhancements (over prior implementation)

- **Type safety:** Input/output type annotations (number, integer, object, date)
- **Unit metadata:** Track units on every input/output for the display conversion layer
- **Precision rules:** Specify rounding per output (e.g., `.toFixed(1)` for feed display)
- **Config keys:** Inputs that are configurable reference their config path for the 3-tier fallback
- **Change history:** Link formula versions to deploy stamps for audit trail

---

## 2. Reference Console (Admin)

A non-technical screen in Settings where all registered calculations are displayed. Purpose: allow Tim and advisors to audit formulas without reading code.

### 2.1 Features

- **Grouped by category** — NPK, DMI, Forage, Animal Metrics, Cost, Feed Residual, Time, Recovery, Survey, Unit Conversions
- **Each formula shows:** name, plain-English description, formula, example with inputs/outputs, source citation, notes
- **Searchable** — filter by name or keyword
- **Shareable** — URL links directly to a specific formula for advisor review
- **PDF export** — generate printable document of all formulas, one page per category

### 2.2 Expert Review Workflow

Agronomists and nutritionists can review all formulas by visiting the reference console. All sources are cited. They don't need to see JS — the metadata tells the full story. When a formula needs updating, the change goes through: update registerCalc() metadata → update implementation → update example → tests run automatically.

---

## 3. Configuration System — 3-Tier Fallback

Many formula inputs are configurable. The system uses a 3-tier fallback:

```
Field-level (most specific)  →  Type-level  →  Global (least specific)
```

**Example:** Residual graze height
1. If the location has a forage_type with `min_residual_height_cm` set → use it
2. Else if the operation has a `default_residual_height_cm` → use it
3. Else use the farm_settings global default (10 cm / ~4 in)

### 3.1 Configurable Parameters

| Parameter | Default (metric) | Config Path | Tier 1 (field) | Tier 2 (type) | Tier 3 (global) |
|-----------|-----------------|-------------|-----------------|----------------|------------------|
| N excretion rate | 0.145 kg/1000kg BW/day | npk.nExcRate | — | animal_classes.excretion_n_rate | NRCS code constant (seeded at onboarding, editable per class) |
| P excretion rate | 0.041 kg/1000kg BW/day | npk.pExcRate | — | animal_classes.excretion_p_rate | NRCS code constant (seeded at onboarding, editable per class) |
| K excretion rate | 0.136 kg/1000kg BW/day | npk.kExcRate | — | animal_classes.excretion_k_rate | NRCS code constant (seeded at onboarding, editable per class) |
| N price | $/kg (user-set) | npk.nPrice | — | — | farm_settings.n_price_per_kg |
| P price | $/kg (user-set) | npk.pPrice | — | — | farm_settings.p_price_per_kg |
| K price | $/kg (user-set) | npk.kPrice | — | — | farm_settings.k_price_per_kg |
| DM per AUD | derived | forage.dmPerAud | — | — | Derived: farm_settings.default_au_weight_kg × animal_classes.dmi_pct / 100 |
| AU reference weight | 454 kg | animal.auWeight | — | — | farm_settings.default_au_weight_kg |
| Residual graze height | 10 cm | forage.residualHeight | — | forage_types.min_residual_height_cm | farm_settings.default_residual_height_cm |
| Forage utilization % | 65% | forage.utilizationPct | — | forage_types.utilization_pct | farm_settings.default_utilization_pct |
| Recovery min days | 21 | recovery.minDays | paddock_observations.recovery_min_days | — | farm_settings.default_recovery_min_days |
| Recovery max days | 60 | recovery.maxDays | paddock_observations.recovery_max_days | — | farm_settings.default_recovery_max_days |
| DMI % of body weight | 2.5% | animal.dmiPct | — | animal_classes.dmi_pct | NRCS code constant (seeded at onboarding, editable per class) |
| DMI % lactating | 3.0% | animal.dmiPctLactating | — | animal_classes.dmi_pct_lactating | NRCS code constant (seeded at onboarding, editable per class) |
| Weaning age | 180 days | animal.weaningAge | — | animal_classes.weaning_age_days | — |

---

## 4. Formula Catalog

### 4.1 NPK Domain (4 formulas)

**NPK-1: Excretion**
- Computes: Total N, P, K deposited by animals on a location
- Inputs: head_count, avg_weight_kg, days, excretion rates (per-class)
- Output: { n_kg, p_kg, k_kg }
- v1 bug: Global rates only. **v2 fix:** Per-class rates from animal_classes table.
- Source: USDA NRCS Nutrient Management Standard

**NPK-2: Fertilizer Value**
- Computes: Dollar value of deposited NPK
- Inputs: NPK quantities (from NPK-1), prices per kg (from npk_price_history)
- Output: value in $
- v1 bug: Uses current prices for all events. **v2 fix:** Price history table per farm (A16 resolved). Query: latest `npk_price_history.effective_date ≤ event date` for the event's farm. Falls back to earliest available row if no history exists before event date.

**NPK-3: Paddock Attribution**
- Computes: Splits event NPK across paddocks proportional to time × effective area
- Inputs: event_paddock_windows (dates + location areas + area_pct), total NPK
- Output: { location_id, n_kg, p_kg, k_kg, duration_hours } per paddock window
- v1 bug: Equal split if acres unknown. **v2 fix:** area_hectares is on locations table; require it for land locations.
- **Strip grazing:** When `is_strip_graze = true`, effective area = `location.area_hectares × area_pct / 100`. Each strip window gets its own NPK attribution based on its duration and effective area. Multiple strip windows on the same location are treated as separate attribution targets.

**NPK-4: Amendment NPK**
- Computes: NPK from fertilizer or manure application
- Inputs: quantity, product NPK%, or manure volume & composition
- Output: { n_kg, p_kg, k_kg }
- v1 bugs: Bag weight hardcoded (make configurable per product); manure density hardcoded as water 8.34 lbs/gal (should be ~8.7 for slurry, make configurable).

### 4.2 DMI Domain (9 formulas)

**DMI-1: Consumed DM from Feed**
- Computes: Total DM consumed from stored feed, adjusted for residual
- Inputs: event_feed_entries (qty, batch DM%), event_feed_check_items (remaining)
- Output: total_dm_consumed_kg
- **CRITICAL v1 bug (fixed by v2 schema):** Residual was applied by array index, not by measurement date. v2 schema fix: event_feed_check_items with absolute remaining per batch per paddock, time-filtered.

**DMI-1a: startedUnits Display**
- Computes: "Started: X units" shown on feed check sheet
- Inputs: last check's remaining + new feed entries since check (time-filtered by check date)
- Output: started_units for display
- **CRITICAL v1 bug (fixed by v2 schema):** Was all-time cumulative. v2 fix: last_remaining + new_since_check. Both main sheet AND move wizard must implement. Display `.toFixed(1)`.

**DMI-2: Daily DMI Target**
- Computes: Total daily DM demand for a group, lactation-aware
- Inputs: head_count, avg_weight_kg, class dmi_pct, class dmi_pct_lactating, lactation status (derived)
- Output: group_dmi_kg_per_day
- v1 bug: No lactation adjustment. **v2 fix:** Per-class `dmi_pct_lactating` on animal_classes, applied when animal is determined to be lactating.
- **Lactation determination (compute on read, A2):**
  - Find animal's most recent `animal_calving_records` entry
  - **If beef_cattle species:** lactating = calf exists AND calf still in calf-role class (not yet weaned via class reassignment)
  - **If dairy_cattle species:** lactating = `dried_off_date` is NULL or hasn't passed yet
  - **If sheep/goat:** same logic as beef_cattle (lactation ends at lamb/kid weaning)
  - If lactating → use `dmi_pct_lactating`; else → use `dmi_pct`

**DMI-3: Event Daily DMI**
- Computes: Combined daily DMI for all active groups on an event
- Inputs: Sum of group daily DMI (from DMI-2) per active event_group_window
- Output: total_event_dmi_kg_per_day

**DMI-4: Pasture vs Stored Feed Split**
- Computes: How much DMI came from pasture vs stored feed
- Inputs: total DMI demand (DMI-3), stored feed consumed (DMI-1)
- Output: { pasture_dmi_kg, stored_dmi_kg, pasture_pct }
- Note: Mass balance approach — assumes full daily intake met. Reasonable approximation.

**DMI-5: Daily Stored DMI by Date**
- Computes: Stored feed consumption on a specific date using feed check interpolation
- Inputs: Bracketing feed checks with remaining quantities, total delivered DM
- Output: daily_stored_consumption_kg
- Note: Linear interpolation between checks. Acceptable for 1-3 day gaps.

**DMI-6: DMI Variance (Confinement)**
- Computes: Actual vs expected DMI for confinement events
- Inputs: head_count, avg_weight_kg, days, actual consumed (DMI-1)
- Output: { variance_kg, variance_pct }

**DMI-7: Grass DMI by Paddock**
- Computes: Per-paddock grass consumption using mass balance per paddock window
- Inputs: event_paddock_windows (dates + location), daily DMI (DMI-3), event_feed_entries + event_feed_check_items (stored feed delivered and consumed per paddock, time-filtered)
- Output: grass_dmi_kg per paddock (total DMI for window minus stored feed consumed in that window)

**DMI-8: Daily DMI Breakdown by Date (3-Day Chart)**
- Computes: For a given event and date, the daily DMI split between pasture and stored feed, or a state indicating the data isn't available yet. Powers the 3-day DMI chart on both the dashboard card (SP-3) and event detail sheet (SP-2).
- **Inputs:**
  - `event` — the target event
  - `date` — the date to compute for
  - `groupWindows[]` — active group windows on this event (from store)
  - `feedEntries[]` — event_feed_entries for this event
  - `feedChecks[]` — event_feed_checks + event_feed_check_items for this event
  - `paddockWindows[]` — event_paddock_windows (for area, forage type)
  - `observations[]` — event_observations with `observation_phase = 'pre_graze'` (for height, cover)
  - `forageTypes[]` — forage_types (for `dm_kg_per_cm_per_ha`, `utilization_pct`, `residual_height_cm`)
- **Output:** One of three states per date:
  - `{ status: 'actual', totalDmiKg, storedDmiKg, pastureDmiKg }` — feed check covers this date
  - `{ status: 'estimated', totalDmiKg, storedDmiKg, pastureDmiKg }` — no check, forecasted from declining pasture mass balance
  - `{ status: 'needs_check' }` — no check, no basis for estimate (grey bar)

- **State determination logic:**

  1. **Compute daily demand:** `totalDmiKg` = DMI-3(event, date) — sum of DMI-2 for each group window active on this date. If groups changed during the 3-day window, demand adjusts per-day.

  2. **Check for feed check data on this date:** If a feed check exists that brackets this date (check before + check after, or check on this date), use DMI-5 interpolation to get `storedDmiKg`. Then `pastureDmiKg = totalDmiKg - storedDmiKg`. Status = `actual`.

  3. **No feed check — try estimate:** If the event has at least one prior day with an actual split AND a pre-graze observation exists with forage height + cover, AND the paddock has a forage type set:
     - Compute initial pasture DM via FOR-1: `(height - residual) × dmPerUnit × area × (cover / 100) × (utilization / 100)`
     - Walk forward from event start, subtracting each day's pasture consumption (actual where known, estimated where not)
     - `remainingPastureDm` = initial - cumulative pasture consumed through yesterday
     - If `remainingPastureDm >= totalDmiKg` → `pastureDmiKg = totalDmiKg`, `storedDmiKg = 0`
     - If `0 < remainingPastureDm < totalDmiKg` → `pastureDmiKg = remainingPastureDm`, `storedDmiKg = totalDmiKg - remainingPastureDm`
     - If `remainingPastureDm <= 0` → `pastureDmiKg = 0`, `storedDmiKg = totalDmiKg`
     - Status = `estimated`

  4. **No feed check, can't estimate:** First day of event with no check and no prior actual → status = `needs_check`.

- **Source event bridge:** When the event has `source_event_id`, the chart's 3-day window can extend into the source event. For dates before the current event's `dateIn`, query the source event's feed check data and render those bars as `actual`. This gives continuity — the chart isn't empty on day 1 of a move.

- **Forage type missing guard:** If the paddock's location has no forage type set, the estimate path (step 3) cannot run — `dmPerUnit` is undefined. In this case, treat as `needs_check` and render an inline prompt: "Set forage type to enable pasture estimate" with a link to the location edit sheet. On save, the chart re-renders. Matches v1's pattern for the same situation.

- **Chart rendering spec (presentation layer, not calc):**
  - 3 bars: today, yesterday, day before (or today + 2 future days — depends on context)
  - `actual` → solid bar, two-color stack (green = pasture, amber = stored)
  - `estimated` → striped/hatched bar, same two-color stack, label = "(est.)"
  - `needs_check` → grey bar, label = "Feed check needed"
  - Right column: today's total DMI number (large) + "lbs DMI today"
  - Legend: ■ grazing (green) · ■ stored (amber)

- **Display precision:** All kg values display as whole numbers. When the chart tooltip or label shows estimated days (e.g., "~1.25 days pasture remaining"), use 2 decimal places per FOR-3 display rule.
- **Composites:** DMI-2 (per-group demand), DMI-3 (event demand), DMI-5 (stored feed interpolation), FOR-1 (standing forage DM)
- **v2-only:** No v1 equivalent. V1's chart was purely visual with no source split.

### 4.3 Forage Domain (6 formulas)

**FOR-1: Standing Forage DM**
- Computes: Harvestable dry matter available for grazing
- Inputs: forage_height_cm (from paddock_observations), residual_height_cm, area_hectares, forage_cover_pct, dm_kg_per_cm_per_ha (from forage_types)
- Output: available_dm_kg
- v1 bug: Utilization % was global. **v2 fix:** Per-forage-type utilization_pct.
- **Strip grazing:** When computing for a strip window (`is_strip_graze = true`), use effective area = `area_hectares × area_pct / 100`. Each strip's standing forage and estimated graze days are scoped to its portion of the paddock.

**FOR-2: Available AUDs**
- Computes: Animal unit days a location can support
- Inputs: available_dm_kg (FOR-1), dm_per_aud_kg
- Output: available_auds

**FOR-3: Estimated Graze Days**
- Computes: How many days a group can graze a location
- Inputs: available_dm_kg, group_dmi_kg_per_day (DMI-2)
- Output: days (number, 2 decimal places) = `Math.round((available_dm / group_dmi) * 100) / 100`
- **Display rule:** Always show 2 decimal places (e.g., `1.25`, `3.00`). Applies everywhere this value is rendered — dashboard card, event detail, move wizard capacity line.
- v1 bug: Used `Math.floor()` returning integers — lost precision on fractional days. **v2 fix:** 2 decimal places.

**FOR-4: Days Remaining (Active Event)**
- Computes: How many more days animals can stay on current location
- Inputs: Consumed to date, remaining stored DM, current forage estimate
- Output: days_remaining (number, 2 decimal places) — same precision rule as FOR-3

**FOR-5: Stocking Efficiency**
- Computes: Actual AUDs used vs estimated AUDs available
- Inputs: Actual (head × weight × days), estimated AUDs (FOR-2)
- Output: efficiency_pct

**FOR-6: Forecast Standing DM at Date**
- Computes: Projected standing dry matter for a paddock at a future date, used by the rotation calendar's future forecast blocks
- Inputs: most_recent_close_observation (observed_at, residual height, forecast growth model from forage_types), recovery_min_days, recovery_max_days (REC-1 inputs), target_date, area_hectares, forage_cover_pct
- Output: `{ forecast_dm_kg, confidence: 'min' | 'mid' | 'max' | 'past_max' }` — `confidence = 'min'` when `target_date ≤ earliest_return`, `'mid'` when between min and max recovery, `'max'` when at window_closes, `'past_max'` when beyond
- **Rule:** `target_date < observed_at` is invalid — this formula is forecast-only. For present DM use FOR-1.
- **Strip grazing:** Same rule as FOR-1 — each strip has its own close observation and its own forecast curve. The whole-paddock forecast = sum of strip forecasts at `target_date`.
- **Used by:** rotation calendar Estimated Status View (gradient rendering) and CAP-1 (demand-side coverage).

### 4.4 Animal Metrics Domain (3 formulas)

**ANI-1: Group Totals**
- Computes: Aggregated head count, total live weight, daily DMI target
- Inputs: Individual animals or class entries with weights, class dmi_pct
- Output: { total_head, total_weight_kg, total_dmi_kg_per_day, avg_weight_kg }

**ANI-2: Membership-Weighted Animal Days**
- Computes: Precise animal-days accounting for mid-event joins/leaves
- Inputs: event_group_windows (join/leave dates), event date range
- Output: animal_days per group window
- Note: Most accurate AUD basis — should be default in v2.

**ANI-3: Weaning Target Date**
- Computes: Expected weaning date for calf
- Inputs: birth_date, weaning_age_days (from animal_classes)
- Output: target_date
- v1 bug: Hardcoded by species. **v2 fix:** Configurable per class.

### 4.5 Cost Domain (3 formulas)

**CST-1: Feed Entry Cost**
- Computes: Cost of feed deliveries
- Inputs: event_feed_entries quantities, batch cost_per_unit
- Output: cost in $

**CST-2: Batch Unit Cost**
- Computes: Unit cost of a batch (bidirectional)
- Inputs: cost_total, quantity_original
- Output: cost_per_unit

**CST-3: NPK Value per Event**
- Computes: Dollar value of NPK deposited during an event
- Inputs: NPK quantities (NPK-1), prices (NPK-2)
- Output: value in $
- Same price history lookup as NPK-2.

### 4.6 Feed Residual Domain (5 formulas)

**FED-1: Effective Feed Residual**
- Computes: Current remaining feed from latest check
- Inputs: event_feed_check_items (remaining_quantity), total delivered
- Output: remaining_pct per batch per paddock

**FED-2: Feed DM Delivered to Date**
- Computes: Total DM delivered to a paddock by a cutoff date
- Inputs: event_feed_entries filtered by date ≤ cutoff, batch dm_pct, weight_per_unit_kg
- Output: total_dm_kg
- **Rule:** Time-filtering is critical. Do not count future deliveries when computing past checks.

**FED-3: Organic Matter Residual**
- Computes: OM remaining from feed
- Inputs: remaining DM, ash correction factor (OM ≈ DM × 0.93)
- Output: om_kg

**FED-4: Manure Batch Remaining**
- Computes: Volume of manure left to apply
- Inputs: Total volume, applied volumes from transactions
- Output: remaining_kg (min 0)

**FED-5: Manure Batch Remaining NPK**
- Computes: NPK composition of remaining manure
- Inputs: Total NPK, remaining volume ratio
- Output: { n_kg, p_kg, k_kg }

### 4.7 Time Domain (3 formulas)

**TIM-1: Days Between (Inclusive)**
- Computes: Days on pasture where same-day = 1 day
- Inputs: date_a, date_b
- Output: days (integer, +1 for inclusivity)

**TIM-2: Days Between (Exact)**
- Computes: Fractional days for pro-rata calculations
- Inputs: date_a, date_b
- Output: fractional_days (no +1)

**TIM-3: Paddock Window Duration**
- Computes: Time spent in a location
- Inputs: date_opened, time_opened, date_closed, time_closed
- Output: hours (0.25h precision, handles midnight crossing)

### 4.8 Recovery Domain (1 formula)

**REC-1: Recovery Window**
- Computes: When location is safe to re-graze
- Inputs: Most recent paddock_observations row where type='close' (observed_at), recovery_min_days, recovery_max_days (from same observation row)
- Output: { earliest_return, window_closes }
- **v2 enhancement:** Incorporate survey-observed regrowth to refine window dynamically.
- **Strip grazing:** Each strip has its own close observation with its own recovery estimates. The rotation calendar must show per-strip recovery states when a paddock has been strip-grazed (e.g., Strip 1 ready to re-graze while Strip 3 is still recovering). Whole-paddock readiness = all strips past their minimum recovery window. Query: all `paddock_observations` where `source_id` matches windows in the `strip_group_id`.

### 4.9 Survey/Forage Quality Domain (1 formula)

**SUR-1: Forage Quality Rating**
- Computes: Color/label classification for a quality score
- Inputs: forage_quality (1-100)
- Output: { label, color } — poor ≤30 red, fair 31-50 amber, good 51-70 green, excellent >70 teal
- **v2 enhancement (post-launch):** Make thresholds configurable per farm on farm_settings if farmers request customization. Hardcoded for initial release — breakpoints are standard in pasture assessment.

### 4.10 Unit Conversion Domain (2 formulas)

**UNT-1: Metric ↔ Imperial Display**
- Computes: Display conversion for all measurement types
- Conversions: weight (kg↔lbs ×2.20462), area (ha↔acres ×2.47105), height (cm↔inches ×0.393701), volume (L↔gal ×0.264172), temp (°C↔°F), yield (kg/ha↔lbs/acre ×0.892179)

**UNT-2: Manure Volume Display**
- Computes: Manure weight to display units
- Inputs: weight_kg, unit preference (tonnes/gallons/cubic yards/loads)
- v1 bug: Water density used instead of slurry density. **v2 fix:** Configurable density (default 8.7 lbs/gal for slurry).

### 4.11 Capacity Forecast Domain (1 formula)

**CAP-1: Period Capacity Coverage**
- Computes: Fraction of a selected period that a paddock can feed a set of groups, given forecast standing DM — the engine behind the rotation calendar's DM Forecast View (§4.3, §19 in V2_UX_FLOWS.md)
- Inputs:
  - `paddock` (area, forage_cover, forage_type linkage — feeds FOR-6)
  - `groups[]` — one or more animal groups (from ANI-1)
  - `period_days` — 1, 3, or custom number of days selected in the Dry Matter Forecaster
  - `start_date` — typically the paddock's `earliest_return` (from REC-1) when we first consider it available
- Output:
  - `{ dm_available_kg, dm_demand_kg, coverage_fraction, covers_hours, shortfall_lbs_hay, surplus_hours }`
  - `coverage_fraction = min(1, dm_available_kg / dm_demand_kg)` where `dm_available_kg = FOR-6(paddock, start_date + period_days).forecast_dm_kg` and `dm_demand_kg = Σ(group.total_dmi_kg_per_day from ANI-1) × period_days`
  - `covers_hours = coverage_fraction × period_days × 24`
  - `shortfall_lbs_hay = max(0, (dm_demand_kg − dm_available_kg)) × 2.20462` (rendered in tan segment label)
  - `surplus_hours = max(0, (dm_available_kg − dm_demand_kg) / (Σ(group.total_dmi_kg_per_day) / 24))` (rendered in `+ Xd Yh` surplus chip when coverage_fraction = 1)
- **Never-grazed paddock rule:** when no close observation exists, FOR-6 returns `forecast_dm_kg = 0` and `confidence = 'min'`; CAP-1 treats the paddock as 100% shortfall and the calendar labels it "Est. <lbs> hay needed — survey to confirm". A post-graze survey unblocks a real forecast.
- **Multi-group rule:** `dm_demand_kg` sums DMI across all selected groups. The calendar's mode indicator and past-event block labels collapse to "Multiple Groups (N)" (V2_UX_FLOWS.md §19.2) — no calc-side change, only presentation.
- **Strip grazing:** `dm_available_kg` sums across strips via the FOR-6 strip-grazing rule.
- **v2-only:** No v1 equivalent. New for CP-54.

### 4.12 Accuracy Domain (1 formula)

**EST-1: Event Pasture Accuracy**
- Computes: Estimated vs actual pasture performance for a closed event. Surfaces as a summary card at event close and as data points in an accuracy trend report. Orchestrates existing calcs — no new formulas, just comparison logic.
- **Requires:** Event must be closed (`dateOut` exists). Pre-graze AND post-graze observations must exist (forage height at minimum). Paddock must have a forage type set (for `dmPerUnit`, `residual`, `utilization`).
- **Inputs:**
  - `event` — closed event with `dateIn`, `dateOut`
  - `preGrazeObs` — event_observation with `observation_phase = 'pre_graze'` (forage_height_cm, forage_cover_pct)
  - `postGrazeObs` — event_observation with `observation_phase = 'post_graze'` (post_graze_height_cm)
  - `forageType` — from paddock location (dm_kg_per_cm_per_ha, utilization_pct, residual_height_cm)
  - `paddockArea` — hectares (from location)
  - `groupWindows[]` — for DMI-3 demand
  - `feedEntries[]` + `feedChecks[]` — for DMI-1 stored feed consumed
- **Output:**
  ```
  {
    // Estimated (from pre-graze observation + FOR calcs)
    estimatedStandingDmKg,        // FOR-1(pre-graze height, cover, area, forage type)
    estimatedUsableDmKg,          // standing × utilization%
    estimatedDaysGrazing,         // FOR-3(usable DM, daily demand)
    configuredUtilizationPct,     // from forage type

    // Actual (from event outcome + post-graze observation)
    actualDaysGrazed,             // dateOut - dateIn
    actualRemainingDmKg,          // FOR-1(post-graze height, cover, area, forage type)
    actualPastureDmConsumedKg,    // standing - remaining (forage measurement method)
    actualStoredFeedConsumedKg,   // DMI-1(entries, checks)
    actualTotalDmiKg,             // DMI-3 × actual days
    actualPastureDmiKg,           // total - stored (mass balance method)
    actualUtilizationPct,         // pasture consumed ÷ standing × 100

    // Variance
    daysVariance,                 // estimated - actual (positive = overestimated)
    daysVariancePct,              // variance ÷ estimated × 100
    utilizationVariance,          // actual - configured (positive = grazed harder than expected)

    // Sanity check: two methods of computing pasture consumed
    forageMeasurementDmKg,        // standing - remaining (from height observations)
    massBalanceDmKg,              // total DMI - stored feed (from demand - feed records)
    methodDivergenceKg,           // forageMeasurement - massBalance
    methodDivergencePct,          // divergence ÷ forageMeasurement × 100
  }
  ```
- **Interpretation guide (for UX):**
  - `daysVariance > 0` → overestimated ("thought it would last longer than it did"). Forage type params may need downward adjustment.
  - `daysVariance < 0` → underestimated ("pasture lasted longer than expected"). Params are conservative.
  - `daysVariance ≈ 0` → estimate was accurate.
  - `methodDivergencePct > 15%` → the two methods disagree significantly. Possible causes: forage observation inaccuracy, unrecorded feed, or forage type `dmPerUnit` calibration is off. Worth flagging to the user.
  - `utilizationVariance > 10%` → animals grazed harder (or lighter) than the configured utilization %. Over time, this variance tells the user whether to tune their forage type utilization setting.

- **Composites:** FOR-1 (×2: pre-graze + post-graze), FOR-3 (estimated days), DMI-1 (stored feed consumed), DMI-3 (daily demand)
- **v2-only:** No v1 equivalent. V1 had no estimated vs actual comparison.

- **Surface 1 — Event Close Summary Card:**
  - Appears on the event detail sheet after an event is closed and both pre-graze + post-graze observations exist.
  - Headline: `Estimated {N} days → Actual {M} days ({±X%})` — estimated days display with 2 decimal places (e.g., `1.25`); actual days are always integers.
  - Sub-metrics (2×2 grid):
    - Est. pasture DM: `{lbs}` | Actual consumed: `{lbs}`
    - Utilization: `{config}% → {actual}%` | Stored feed: `{lbs}`
  - If method divergence > 15%, show a muted hint: "Forage measurement and mass balance differ by {N}% — observations or feed records may need review."
  - If no post-graze observation, show: "Add post-graze observation to see accuracy comparison."
  - Card is read-only. No actions.

- **Surface 2 — Accuracy Trend Report:**
  - Lives in Reports as a tab or section (exact placement TBD when Reports are built).
  - Each closed event with EST-1 data is a row/point.
  - Columns: location, event dates, estimated days, actual days, days variance %, utilization est/actual, method divergence %.
  - Over time, the user can see if their estimates are consistently high or low, and which forage types or locations are most inaccurate.
  - Optional chart: scatter plot of estimated vs actual days (ideal = 45° line).

---

## 5. Critical v1 Bugs — Must Fix in v2

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| 1 | Residual check by array index, not date (DMI-1) | New feed after check inflates DMI | v2 schema: absolute remaining per batch per paddock, time-filtered |
| 2 | startedUnits all-time cumulative (DMI-1a) | Feed check shows wrong starting point | last_remaining + new_since_check. .toFixed(1). Both codepaths. |
| 3 | NPK prices not date-stamped (NPK-2) | Historical values wrong if prices changed | npk_price_history table per farm (A16 resolved) |
| 4 | Global excretion rates (NPK-1) | Beef/dairy/sheep rates differ significantly | Per-class rates on animal_classes |
| 5 | Bag weight hardcoded 50 lbs (NPK-4) | Wrong DM for different bag sizes | Configurable per product |
| 6 | Manure density = water (UNT-2) | Conversion off by ~5% | Configurable (default 8.7 for slurry) |
| 7 | Equal NPK split across locations (NPK-3) | Multi-paddock events allocate wrong | Split by area × time, not equal |
| 8 | Utilization % is global (FOR-1) | Legume 60%, grass 40% — can't differentiate | Per-forage-type on forage_types table |
| 9 | No event price snapshots (CST-3) | Reports use wrong prices | Same fix as #3 — npk_price_history lookup |
| 10 | Weaning age hardcoded by species (ANI-3) | Dairy 60 days, beef 180 — can't differentiate | Per-class on animal_classes. beef_cattle/dairy_cattle species split provides distinct defaults. |

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-16 | UI sprint — decimal precision | FOR-3 and FOR-4 output changed from integer (`Math.floor`) to 2 decimal places (`Math.round(x * 100) / 100`). Display rule: all estimated/forecasted day values render with 2 decimal places (e.g., `1.25`). Precision notes added to DMI-8 and EST-1 specs. |
| 2026-04-16 | UI sprint — EST-1 accuracy comparison | Added §4.12 Accuracy Domain with EST-1 (Event Pasture Accuracy). Compares estimated (pre-graze FOR-1 + FOR-3) vs actual (post-graze FOR-1 + mass balance) for closed events. Two surfaces: event close summary card (days accuracy headline) and accuracy trend report. Two-method sanity check (forage measurement vs mass balance). No new data stored — all compute-on-read from existing observations and feed records. Total formulas: 38 → 39. Domains: 11 → 12. |
| 2026-04-16 | UI sprint — DMI-8 daily breakdown | Added DMI-8 (Daily DMI Breakdown by Date) to the DMI domain. Three-state output (actual/estimated/needs_check) powers the 3-day chart on dashboard card and event detail sheet. Composes DMI-2/DMI-3 (demand), DMI-5 (stored feed interpolation), FOR-1 (standing DM). Declining pasture mass balance for estimates. Source event bridge for continuity across moves. Forage type required with inline prompt fallback. Total formulas: 37 → 38. |
| 2026-04-13 | Rotation calendar design (CP-54) | Added FOR-6 (Forecast Standing DM at Date) to the Forage domain and new §4.11 Capacity Forecast domain with CAP-1 (Period Capacity Coverage). Both formulas are required by CP-54 — FOR-6 drives the Estimated Status View DM gradient, and CAP-1 drives the DM Forecast View capacity split and surplus chip. Total formulas: 35 → 37. Domains: 10 → 11. |

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For UX flows see V2_UX_FLOWS.md.*
