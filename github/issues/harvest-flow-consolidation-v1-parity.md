# Harvest Flow Consolidation — V1 Parity

**Labels:** ui-parity, harvest, locations, field-mode
**Priority:** High
**Refs:** V2_UX_FLOWS.md §10, GTHO_V1_FEATURE_AUDIT.md FED-10

---

## Problem

V2 currently has **two separate, incompatible harvest implementations:**

1. **Main harvest screen** (`src/features/harvest/index.js`) — row-based form (location + feed type + qty per row). Complete save flow but doesn't match v1 UI.
2. **Locations screen harvest sheet** (`src/features/locations/index.js:814-947`) — v1-style tile picker but **save is broken** (line 936 TODO: only creates `harvest_event`, never creates `harvest_event_fields` or batches).

Additionally, the **field mode** harvest tile just navigates to `#/harvest` with no field-mode-specific behavior (no field picker step, no full-screen sheet).

**V1 has one unified harvest flow** used from all entry points: Locations screen button, field mode menu, and pastures screen. It uses a tile-based UI with a field picker step in field mode.

---

## Solution

Consolidate to a **single v1-style tile-based harvest flow** used from all three entry points. Delete the row-based `#/harvest` screen form. The tile flow lives in `src/features/harvest/index.js` as an exported `openHarvestSheet(operationId, options)` function that all entry points call.

---

## Spec

### Entry Points

| Entry point | Behavior |
|---|---|
| **Locations screen** "🌾 Harvest" button (line 125) | Opens harvest sheet. No field picker step — goes straight to tile grid. All non-archived `type='land'` locations available in field dropdowns. |
| **Field mode** harvest tile (line 37 of field-mode/index.js) | Opens harvest sheet **with field picker step first** — user selects a crop/mixed-use location, then proceeds to tile grid with that location pre-filled in the first field row of each selected tile. |
| **#/harvest route** | Renders harvest event list + "Record Harvest" button. Button opens harvest sheet (no field picker). Same as locations screen entry. |

### openHarvestSheet(operationId, options)

**options:**
- `fieldMode: boolean` — if true, show field picker step first (Step 1), then tile grid (Step 2). If false, skip to tile grid.
- `preSelectedLocationId: string|null` — if set, pre-fill the first field row with this location (used when locations screen eventually adds per-card harvest buttons).

### Step 1: Field Picker (field mode only)

Matches v1 `_renderHarvestFieldPicker()`. Only shown when `fieldMode: true`.

**V1 reference HTML/CSS to match:**

```html
<!-- Title -->
<div style="font-size:17px;font-weight:600;margin-bottom:4px;">Pick a field</div>
<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Select the field this harvest came from</div>

<!-- Farm filter pills (only if >1 farm) -->
<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
  <button style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;
    border:1.5px solid var(--teal);background:var(--teal);color:white;">All farms</button>
  <!-- inactive: border:1.5px solid var(--border2);background:transparent;color:var(--text2) -->
</div>

<!-- Type filter pills -->
<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
  <button style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;
    border:1.5px solid var(--green);background:var(--green);color:white;">All crop & mixed-use</button>
  <!-- Crop, Mixed-Use pills — same pattern, inactive variant -->
</div>

<!-- Search -->
<input type="text" placeholder="Search fields..."
  style="width:100%;padding:10px 12px;border:1px solid var(--border2);border-radius:var(--radius);
  font-size:14px;margin-bottom:10px;background:var(--bg2);color:var(--text);"/>

<!-- Field cards -->
<div onclick="pickField(id)" style="padding:12px;background:var(--bg2);border:0.5px solid var(--border);
  border-radius:var(--radius);cursor:pointer;margin-bottom:6px;">
  <div style="display:flex;align-items:center;gap:8px;">
    <div style="font-size:20px;">🚜</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;">East Meadow · 42 ac</div>
      <div style="font-size:11px;color:var(--text2);">crop · Smith Farm · E3</div>
    </div>
  </div>
</div>

<!-- Empty state (no crop/mixed-use fields) -->
<div style="padding:16px;text-align:center;background:var(--bg2);border-radius:var(--radius);">
  <div style="font-size:13px;color:var(--text2);">No crop or mixed-use fields set up.
    Edit a pasture and set its land use to Crop or Mixed-Use to use it for harvest.</div>
</div>
```

**Filtering logic:**
- Show non-archived locations where `type === 'land'` AND (`landUse === 'crop'` OR `landUse === 'mixed-use'`)
- Farm filter pills: teal active color. Only shown if >1 farm.
- Type filter pills: green active color. Three options: "All crop & mixed-use", "Crop", "Mixed-Use".
- Search: filters by name and fieldCode (case-insensitive).
- Area display: convert `areaHa` to user's unit system (ac/ha).

**On field selection:** Store the selected location ID → proceed to Step 2 with this ID as `preSelectedLocationId`.

### Step 2: Tile Grid

Matches v1 `_renderHarvestTileGrid()`. This is the main harvest data entry screen.

**Header fields (above tile grid):**

```html
<!-- Already in sheet from openHarvestSheet -->
<div class="two">
  <div class="field"><label>Harvest date *</label>
    <input type="date" value="2026-04-17"/></div>
  <div class="field"><label>Event notes (optional)</label>
    <input type="text" placeholder="e.g. Good yield"/></div>
</div>
```

**Tile grid — v1 reference HTML/CSS:**

```html
<!-- Section label -->
<div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;
  letter-spacing:0.05em;margin-bottom:8px;">Select harvest type</div>

<!-- Tile grid -->
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px;">
  <!-- Active (selected) tile -->
  <button style="padding:10px 8px;border-radius:var(--radius);
    border:2px solid var(--green);background:var(--green);color:white;
    cursor:pointer;text-align:left;line-height:1.3;">
    <div style="font-size:13px;font-weight:600;">Grass Hay</div>
    <div style="font-size:11px;opacity:0.8;margin-top:2px;">C1 · bale</div>
  </button>
  <!-- Inactive tile -->
  <button style="padding:10px 8px;border-radius:var(--radius);
    border:2px solid var(--border2);background:var(--bg2);color:var(--text);
    cursor:pointer;text-align:left;line-height:1.3;">
    <div style="font-size:13px;font-weight:600;">Silage</div>
    <div style="font-size:11px;opacity:0.8;margin-top:2px;">tonne</div>
  </button>
</div>

<!-- No harvest types active — empty state -->
<div style="padding:16px;text-align:center;background:var(--bg2);border-radius:var(--radius);margin-bottom:12px;">
  <div style="font-size:22px;margin-bottom:6px;">🌾</div>
  <div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:4px;">No harvest types active</div>
  <div style="font-size:12px;color:var(--text3);">Go to Settings → Feed Types and enable<br>
    🌾 Harvest active on the types you're cutting.</div>
</div>
```

**Tile data:** Show all feed types where `harvestActive === true` and `!archived`. Each tile shows `ft.name` and (if `cuttingNum != null`) `C{cuttingNum} · {unit}`, else just `{unit}`.

**Tile toggle behavior:**
- Click selected tile → deselect (remove from `_harvestTiles`).
- Click unselected tile → select (add to `_harvestTiles` with one auto-added empty field row).

### Expanded Field Rows (per selected tile)

When a tile is selected, it expands to show a bordered section with per-field detail rows.

**V1 reference HTML/CSS:**

```html
<!-- Tile expansion container -->
<div style="border:1.5px solid var(--green);border-radius:var(--radius);
  padding:12px;margin-bottom:12px;background:var(--bg);">
  <div style="font-size:12px;font-weight:700;color:var(--green);text-transform:uppercase;
    letter-spacing:0.04em;margin-bottom:10px;">▼ Grass Hay — C1</div>

  <!-- Field row card -->
  <div style="background:var(--bg2);border-radius:var(--radius);padding:10px;margin-bottom:8px;position:relative;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:600;color:var(--text2);">Field 1</div>
      <button style="border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:18px;padding:0;">×</button>
    </div>

    <!-- Weight per bale — prominent input -->
    <div class="field" style="margin-bottom:8px;">
      <label style="font-size:12px;font-weight:600;">Weight / bale (lbs)</label>
      <input type="number" min="0" step="1" placeholder="850"
        style="font-size:18px;font-weight:600;height:44px;"/>
    </div>

    <!-- Field + bale count side by side -->
    <div class="two">
      <div class="field"><label>Field</label>
        <select>
          <option value="">— pick field —</option>
          <option value="id1">East Meadow [E3]</option>
        </select>
      </div>
      <div class="field"><label>Bale count</label>
        <input type="number" min="0" step="1" placeholder="0"/>
      </div>
    </div>

    <!-- Batch ID -->
    <div class="field">
      <label>Batch ID <span style="font-weight:400;font-size:10px;color:var(--text3);">(auto-generated · editable)</span></label>
      <input type="text" value="SMI-E3-1-20260417" placeholder="Set field + date first"/>
    </div>

    <!-- Notes -->
    <div class="field"><label>Notes (optional)</label>
      <input type="text" placeholder=""/>
    </div>
  </div>

  <!-- Add field button -->
  <button class="btn btn-outline btn-sm" style="width:100%;margin-top:2px;">+ Add field</button>
</div>
```

**Per-field-row data model:**

```js
{
  landId: null,          // UUID — location FK
  landName: null,        // denormalized for display
  fieldCode: null,       // denormalized for batch ID generation
  farmName: null,        // denormalized for batch ID generation
  quantity: null,        // bale count (integer)
  weightPerUnitKg: null, // weight per bale (display in user's unit system, store metric)
  batchId: null,         // auto-generated, editable — human-readable traceability string
  batchIdDirty: false,   // true if user manually edited batch ID
  notes: null,
}
```

**Weight display:** The weight input label says "Weight / bale (lbs)" in imperial, "Weight / bale (kg)" in metric. The placeholder comes from `ft.defaultWeightKg` converted to display units. User input is converted back to kg for storage.

**Field dropdown:** Shows all non-archived locations (not just crop/mixed-use — a harvest can come from any field). Each option: `{name} [{fieldCode}]` or just `{name}` if no fieldCode.

**Batch ID auto-generation:** Format `FARM-FIELD-CUTTING-DATE`. Same logic as v1:

```js
function generateBatchId(locationId, feedTypeId, date) {
  const loc = getById('locations', locationId);
  const ft = getById('feedTypes', feedTypeId);
  const farm = loc?.farmId ? getById('farms', loc.farmId) : null;
  const farmPart = farm
    ? farm.name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase()
    : 'UNK';
  const fieldPart = loc?.fieldCode
    ? loc.fieldCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : (loc ? loc.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() : 'FLD');
  const cutPart = ft?.cuttingNumber != null ? String(ft.cuttingNumber) : '?';
  const datePart = date ? date.replace(/-/g, '') : '';
  return [farmPart, fieldPart, cutPart, datePart].join('-');
}
```

**Batch ID behavior:**
- Auto-generates when field or date changes (unless user manually edited — `batchIdDirty` flag).
- Shown as placeholder until field is selected.
- User can edit freely; once edited, stops auto-updating.

**Pre-fill from field picker:** When `preSelectedLocationId` is set, the first field row in each newly-selected tile gets that location pre-filled (and batch ID auto-generated). The `preSelectedLocationId` is consumed after the first tile selection — subsequent tiles still get it.

### Save Logic

Matches v1 `saveHarvestEvent()` and v2's existing `src/features/harvest/index.js:227-292`.

**Validation:**
1. Date required
2. At least one tile selected
3. Each tile must have ≥1 field row
4. Each field row must have: field selected + bale count > 0

**Creates (in order):**
1. `harvest_event` — `{ operationId, date, notes }`
2. For each field row in each tile:
   a. `batch` — `{ operationId, feedTypeId, name: "{feedTypeName} {date}", source: 'harvest', quantity: baleCount, remaining: baleCount, unit: ft.unit, weightPerUnitKg, dmPct: null, purchaseDate: date }`
   b. `harvest_event_field` — `{ operationId, harvestEventId, locationId: row.landId, feedTypeId: tile.feedTypeId, quantity: row.quantity, weightPerUnitKg: row.weightPerUnitKg, dmPct: null, cuttingNumber: ft.cuttingNumber, batchId: batch.id, notes: row.notes }`

**Note:** The `batchId` on `harvest_event_field` is the UUID FK to the batch record. The human-readable batch ID string (FARM-FIELD-CUTTING-DATE) is **not currently stored** in the v2 schema. This matches v2's existing save logic. The human-readable string is a display-only traceability label — storing it as a batch field is deferred (see Open Question below).

**After save:**
- Close sheet
- Toast: "Harvest saved — {N} batches created" (if toast system exists, else no toast needed)

### Field Mode Sheet Behavior

When opened from field mode (`fieldMode: true`):
- Sheet handle hidden
- Backdrop click disabled (no accidental dismiss)
- Close button text: "⌂ Done" (returns to field mode home)
- Cancel button text: "⌂ Done"
- On close → navigate to field mode home

### Harvest Event List (#/harvest screen)

Keep the existing `renderHarvestList()` logic from `src/features/harvest/index.js:46-82`. It correctly shows events sorted newest-first with field summaries.

### Feed Types Link

The tile grid should include a small link to open the Feed Types sheet (matching v1):

```html
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
  <div style="font-size:12px;color:var(--text2);">Each field record creates a feed batch automatically.</div>
  <button class="btn btn-outline btn-xs" style="flex-shrink:0;white-space:nowrap;">⚙️ Feed types</button>
</div>
```

This button calls the existing `openFeedTypesSheet()` from the locations feature. It needs to be importable or the harvest module needs its own feed types sheet access.

---

## Open Question — Human-Readable Batch ID Storage

V1 stores the human-readable batch ID string (e.g., "SMI-E3-1-20260417") on both `harvest_event_fields.batchId` and `batches.batchId`. V2's batch entity does not currently have a `batchId` text field — it only has the UUID `id`.

**Options:**
1. Add a `batchId` text field to the `batch` entity and a `batch_id_label` column to the `batches` table (new migration). This enables searching/filtering batches by human-readable label.
2. Defer — the auto-generated string is display-only and can be re-computed from batch metadata at render time.

**Recommend option 2 for now** — the batch ID can be recomputed from `batch → harvest_event_field → location + feedType + date`. Add as a future enhancement if farmers request searchable batch labels.

---

## Files to Change

| File | Change |
|---|---|
| `src/features/harvest/index.js` | **Rewrite.** Replace row-based form with tile-based flow. Export `openHarvestSheet(operationId, options)`. Keep `renderHarvestScreen()` (list + button). Add `generateBatchId()` utility. |
| `src/features/locations/index.js` | **Delete lines 804-947** (the broken `openHarvestSheet` and `ensureHarvestSheetDOM`). Import and call `openHarvestSheet` from harvest feature instead. Update line 125 button handler. |
| `src/features/field-mode/index.js` | Change harvest tile onClick from `navigate('#/harvest')` to import and call `openHarvestSheet(operationId, { fieldMode: true })`. Need to get operationId from store. |
| `src/i18n/locales/en.json` | Add: `harvest.pickField`, `harvest.pickFieldHint`, `harvest.selectType`, `harvest.noTypesActive`, `harvest.noTypesHint`, `harvest.weightPerBale`, `harvest.baleCount`, `harvest.batchId`, `harvest.batchIdHint`, `harvest.addFieldRow`, `harvest.feedTypesLink`, `harvest.batchesCreated`, `harvest.fieldN`. Keep existing keys. |

---

## Acceptance Criteria

- [ ] Locations screen "🌾 Harvest" button opens tile-based harvest sheet (no field picker step)
- [ ] Field mode harvest tile opens tile-based harvest sheet WITH field picker step first
- [ ] #/harvest screen "Record Harvest" button opens tile-based harvest sheet (no field picker step)
- [ ] Field picker shows crop + mixed-use locations with farm filter + type filter + search
- [ ] Selecting a field in picker pre-fills first field row in each tile
- [ ] Tile grid shows all `harvestActive` feed types with name, cutting number, unit
- [ ] Selecting a tile adds it with one auto-added field row
- [ ] Field rows have: weight/bale (prominent), field dropdown, bale count, batch ID (auto-generated), notes
- [ ] Batch ID auto-generates as FARM-FIELD-CUTTING-DATE, stops auto-updating when manually edited
- [ ] Weight input label and placeholder respect user's unit system (lbs/kg)
- [ ] Save creates: harvest_event + harvest_event_fields + batches (one batch per field row)
- [ ] Save validates: date required, ≥1 tile, ≥1 row per tile, field + bale count per row
- [ ] Field mode close → returns to field mode home
- [ ] Old row-based harvest form code removed
- [ ] Old broken locations harvest sheet code removed
- [ ] Tile styling matches v1 reference (green border/bg when selected, grid layout)
- [ ] Field row styling matches v1 reference (bg2 cards, prominent weight input, two-column layout)

---

## CP-55/CP-56 Spec Impact

No new tables or columns. This spec changes UI/flow only — the same entities (`harvest_events`, `harvest_event_fields`, `batches`) are written. No backup/restore impact.

If the human-readable batch ID field is added later (Open Question option 1), that will require a migration + CP-55/CP-56 update at that time.
