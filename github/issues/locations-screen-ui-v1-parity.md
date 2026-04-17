# Locations Screen — V1 Parity UI Build

**Priority:** P1
**Area:** v2-build / UI
**Files:** New `src/features/locations/index.js`, `src/styles/main.css`, plus new sheet files per dialog
**Labels:** `ui`, `v1-parity`
**Schema impact:** None — visual/interaction only (schema already built)
**CP-55/CP-56 impact:** None

---

## Overview

Build the dedicated Locations screen as a standalone route (`/locations`), separate from the dashboard. V1 calls this "Fields" — v2 uses "Locations" to encompass all location types including confinement.

This spec covers the Locations list screen plus all 6 connected dialogs:
1. Location cards in list view
2. Add/Edit Location sheet
3. Survey sheet (bulk & single)
4. Harvest sheet
5. Feed Types sheet
6. Apply Input/Amendment sheet
7. Soil Test sheet

**Naming change:** V1 uses "Fields" and "Pastures" interchangeably. V2 uses "Locations" throughout. Where v1 says "field" or "pasture," v2 says "location." The type taxonomy (Pasture, Mixed-Use, Crop, Confinement) stays the same.

**Rule:** Do NOT use innerHTML. Translate all HTML patterns below into `el()` / `text()` DOM builder calls. The HTML is provided as a visual spec, not as code to paste.

**CSS reference:** The shared CSS tokens and base classes (custom properties, `.btn`, `.badge`, `.card`, `.sec`, `.sheet-wrap`, `.sheet-panel`, `.sheet-handle`, `.field`, `.two`, `.three`) are defined in the animals-screen-ui-v1-parity.md spec Part 1. Do not duplicate them — just verify they exist in `main.css`.

---

## Part 1: Locations Screen — Main Layout

The Locations screen is a full-page route with a two-tab header, an amendments summary, and the location list.

### 1A: Screen-Level Tabs

Two pill buttons at the top toggle between the Locations list and a Surveys list view.

```html
<div style="display:flex; gap:8px; margin-bottom:14px;">
  <button class="btn btn-green btn-sm" style="font-weight:600;">Locations</button>
  <button class="btn btn-outline btn-sm" onclick="navigateToSurveys()">Surveys</button>
</div>
```

**Behavior:** "Locations" is active (green fill) by default. "Surveys" switches to a survey history list view (separate render, out of scope for this spec — use a placeholder that renders the text "Surveys list — coming soon").

### 1B: Inputs & Amendments Summary

Below the tabs, a collapsed summary of recent input applications with an action button.

```html
<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
  <div style="font-size:15px; font-weight:600;">Inputs & amendments</div>
  <button class="btn btn-green btn-sm" onclick="openApplyInputSheet()">Apply input</button>
</div>
<div id="input-applications-list" style="margin-bottom:12px;"></div>
```

**Content of `#input-applications-list`:**
- If no applications: show `<div style="font-size:13px; color:var(--text2);">No inputs applied yet</div>`
- If applications exist: show the 8 most recent, each as a row:

```html
<div style="display:flex; justify-content:space-between; align-items:center;
            padding:6px 0; border-bottom:0.5px solid var(--border); font-size:13px;">
  <div>
    <span style="font-weight:500;">{productName}</span>
    <span style="color:var(--text2);"> · {date} · {locationNames}</span>
  </div>
  <div style="font-size:12px; color:var(--text2);">
    {npkSummary} · ${cost}
  </div>
</div>
```

If more than 8 exist, append: `<div style="font-size:11px; color:var(--text3); margin-top:4px;">{N} earlier applications not shown</div>`

### 1C: Locations Header with Action Buttons

```html
<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
  <div style="font-size:17px; font-weight:600;">Locations</div>
  <button class="btn btn-green btn-sm" onclick="openAddLocation()">+ Add</button>
  <button class="btn btn-outline btn-sm" onclick="openBulkSurveySheet()">📋 Survey</button>
  <button class="btn btn-outline btn-sm" onclick="openHarvestSheet()">🌾 Harvest</button>
  <button class="btn btn-outline btn-sm" onclick="openFeedTypesSheet()">⚙ Feed types</button>
  <!-- Search input -->
  <input type="search" id="location-search" placeholder="Filter locations…"
    style="flex:1; min-width:140px; padding:7px 12px; border:0.5px solid var(--border2);
           border-radius:var(--radius); font-size:13px; background:var(--bg);
           color:var(--text); font-family:inherit;" />
</div>
```

### 1D: Filter Pills (Land Use + Farm)

Land use filter pills — "All" is active by default. Active pill uses green fill.

```html
<div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
  <!-- Land use filters -->
  <button onclick="setLocationFilter('all')"
    style="padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600;
           cursor:pointer; border:1.5px solid var(--green); background:var(--green);
           color:white;">All</button>
  <button onclick="setLocationFilter('pasture')"
    style="padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600;
           cursor:pointer; border:1.5px solid var(--border2); background:transparent;
           color:var(--text2);">Pasture</button>
  <button onclick="setLocationFilter('mixed-use')" ...>Mixed-Use</button>
  <button onclick="setLocationFilter('crop')" ...>Crop</button>
  <button onclick="setLocationFilter('confinement')" ...>Confinement</button>
</div>
```

**Active pill styling:**
```css
/* active */   border-color: var(--green); background: var(--green); color: white;
/* inactive */ border-color: var(--border2); background: transparent; color: var(--text2);
```

**Farm filter pills** — only shown if user has >1 farm. Uses amber color for active state:
```html
<!-- Only when multiple farms exist -->
<div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
  <button onclick="setLocationFarmFilter('all')"
    style="padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600;
           cursor:pointer; border:1.5px solid var(--amber-d); background:var(--amber-d);
           color:white;">All farms</button>
  <button onclick="setLocationFarmFilter('{farmId}')" ...>{Farm Name}</button>
</div>
```

### 1E: Sort Header

Clickable column names that toggle sort direction. Active column shows ↑ or ↓ arrow.

```html
<div style="display:flex; justify-content:space-between; align-items:center;
            padding:4px 0 6px; border-bottom:0.5px solid var(--border);
            font-size:11px; margin-bottom:6px;">
  <div style="color:var(--text2);">
    <span onclick="sortLocations('name')" style="cursor:pointer;">
      Name {arrow if active}</span>
    <span style="color:var(--text3);"> · </span>
    <span onclick="sortLocations('acres')" style="cursor:pointer;">Acres</span>
  </div>
  <div style="color:var(--text2);">
    <span onclick="sortLocations('graze')" style="cursor:pointer;">Exp. Graze</span>
    <span style="color:var(--text3);"> · </span>
    <span onclick="sortLocations('survey')" style="cursor:pointer;">Survey</span>
    <span style="color:var(--text3);"> · </span>
    <span onclick="sortLocations('avg')" style="cursor:pointer;">Avg %</span>
  </div>
</div>
```

**Sort columns:**
- `name` — alphabetical by location name
- `acres` — by area
- `graze` — by expected graze window date (earliest first)
- `survey` — by latest survey rating (highest first)
- `avg` — by average forage quality % (highest first)

Default: `name` ascending.

### 1F: Farm Grouping

When multiple farms exist, locations are grouped by farm with a header:

```html
<div style="font-size:12px; font-weight:600; font-style:italic; color:var(--text2);
            text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 6px;">
  {Farm Name}
</div>
```

---

## Part 2: Location Card (List View)

Each location in the list renders as a card. This is different from the dashboard's active-event card — the list card shows the **location itself** (whether or not it has an active event).

### 2A: Card Container

```html
<div class="card" id="loc-list-{locationId}">
  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
    <!-- Left side: info -->
    <div style="flex:1; min-width:0;">
      {card content — see 2B-2F}
    </div>
    <!-- Right side: badges + buttons -->
    <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
      {right side — see 2G}
    </div>
  </div>
</div>
```

### 2B: Title Row

```html
<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
  <!-- Location name -->
  <span style="font-size:14px; font-weight:600;">{name}</span>
  <!-- Land use badge -->
  <span class="badge bg" style="font-size:10px;">{land_use}</span>
  <!-- Field code (or "no code") -->
  <span style="font-size:11px; color:var(--text3);">{field_code || 'no code'}</span>
  <!-- Confinement sub-type (if confinement) -->
  <span style="font-size:11px; color:var(--text2);">{confinement_subtype}</span>
</div>
```

**Badge colors by land_use:**
- `Pasture` → `.bg` (green)
- `Mixed-Use` → `.bg` (green)
- `Crop` → `.ba` (amber)
- `Confinement` → `.bb` (gray)

### 2C: Detail Line

```html
<div style="font-size:12px; color:var(--text2); margin-top:2px;">
  {acres} ac · {soil_type || ''} {forage_species || ''}
</div>
```

For confinement locations:
```html
<div style="font-size:12px; color:var(--text2); margin-top:2px;">
  Confinement · {description || ''}
</div>
```

### 2D: Soil Test Line

```html
<!-- If soil test exists -->
<div style="font-size:11px; color:var(--text2); margin-top:3px;">
  <span style="color:var(--green);">✓</span> Soil tested {date}
  · N:{n} P:{p} K:{k} {unit}
</div>

<!-- If no soil test -->
<div style="font-size:11px; color:var(--text2); margin-top:3px;">
  <span style="color:var(--green);">✓</span> No soil test yet
</div>
```

### 2E: Estimated Available DM (pasture/mixed-use only)

Shows the estimated forage currently available, calculated from the latest survey or observation.

```html
<div style="font-size:12px; color:var(--teal); margin-top:3px; font-weight:500;">
  🌿 Est. available: {lbs_dm} lbs DM · ~{auds} AUDs
</div>
<div style="font-size:10px; color:var(--text3); margin-top:1px;">
  at {utilization}% util · Survey {rating} · {height}" · Residual: {residual}"
</div>
```

If no survey data exists, omit this section entirely.

### 2F: Recovery / Rotation Line

Shows the expected graze window based on recovery calculations.

```html
<!-- When recovery data exists -->
<div style="font-size:11px; color:var(--text2); margin-top:3px;">
  ↻ {days_since}d → {recovery_date_range}
  <!-- Status indicator -->
  <span style="color:var(--amber); font-weight:500;">⚠ window closing</span>
  <!-- or -->
  <span style="color:var(--green); font-weight:500;">✓ ready to graze</span>
  <!-- or -->
  <span style="color:var(--text3);">{N}d until ready</span>
</div>
```

### 2G: Right Side — Score Badge + Action Buttons

```html
<div style="display:flex; gap:6px; align-items:center;">
  <!-- Survey score badge (if survey exists) -->
  <span style="font-size:11px; font-weight:700; padding:2px 7px; border-radius:10px;
               color:{ratingColor}; background:{ratingBg};"
        title="Survey {date}">{rating}</span>

  <!-- Action buttons -->
  <button class="btn btn-outline btn-xs" onclick="openLocEdit({locationId})">Edit</button>
  <button class="btn btn-outline btn-xs" onclick="openSurveySheet('{locationId}')">
    📋 Survey</button>
  <button class="btn btn-outline btn-xs" onclick="openSoilTestSheet('{locationId}')">
    ✏ Soil</button>
</div>
```

**Survey rating color function:**
- 0–30: red tones (`var(--red)` text, `var(--red-l)` bg)
- 31–60: amber tones (`var(--amber-d)` text, `var(--amber-l)` bg)
- 61–100: green tones (`var(--green-d)` text, `var(--green-l)` bg)

**Confinement cards:** Do NOT show Survey or Soil buttons. Show only Edit. Replace score badge with `no cap` text if no capacity concept applies:
```html
<span style="font-size:11px; color:var(--text3);">no cap</span>
```

### 2H: Active Event Indicator

If this location has an active grazing event, show a small badge on the title row:

```html
<span class="badge ba" style="font-size:10px;">active</span>
```

---

## Part 3: Add/Edit Location Sheet

A single sheet handles both Add and Edit modes. Edit mode pre-populates all fields and shows additional sections (survey history, delete button).

### 3A: Sheet Container

```html
<div class="sheet-wrap" id="loc-edit-wrap">
  <div class="sheet-backdrop" onclick="closeLocEdit()"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:14px;" id="loc-edit-title">
      Add location  <!-- or "Edit location" in edit mode -->
    </div>
    {form content — see 3B–3G}
  </div>
</div>
```

### 3B: Basic Fields

```html
<div class="two">
  <div class="field">
    <label>Name</label>
    <input type="text" id="le-name" placeholder="North paddock" />
  </div>
  <div class="field">
    <label>Acres</label>
    <input type="number" id="le-acres" step="0.5" placeholder="20" />
  </div>
</div>

<div class="two">
  <div class="field">
    <label>Field code <span style="font-weight:400; color:var(--text2); font-size:11px;">
      (optional)</span></label>
    <input type="text" id="le-field-code" placeholder="e.g. 07, B2, HKX" maxlength="8" />
  </div>
  <div></div>
</div>

<div class="two">
  <div class="field">
    <label>Farm</label>
    <select id="loc-farm-id">
      <option value="">— none —</option>
      <!-- Populated from store.getState().farms -->
    </select>
  </div>
  <div class="field">
    <label>Land use</label>
    <select id="loc-land-use" onchange="onLocLandUseChange()">
      <option value="pasture">Pasture</option>
      <option value="mixed-use">Mixed-use</option>
      <option value="crop">Crop</option>
      <option value="confinement">Confinement</option>
    </select>
  </div>
</div>
```

### 3C: Pasture-Specific Fields

Shown when land_use is pasture, mixed-use, or crop. Hidden for confinement.

```html
<div id="le-pasture-fields">
  <div class="two">
    <div class="field">
      <label>Soil type</label>
      <select id="le-soil">
        <option value="">— select —</option>
        <option>Loam</option>
        <option>Sandy loam</option>
        <option>Clay loam</option>
        <option>Clay</option>
        <option>Sand</option>
        <option>Silt</option>
        <option>Peat</option>
      </select>
    </div>
    <div class="field">
      <label>Forage type</label>
      <select id="le-forage-type" onchange="onLeForageTypeChanged()">
        <option value="">— none —</option>
        <!-- Populated from store.getState().forageTypes -->
      </select>
    </div>
  </div>

  <div class="two">
    <div class="field">
      <label>Forage species (notes)</label>
      <input type="text" id="le-species" placeholder="Mixed grass/clover" />
    </div>
    <div class="field">
      <label>Residual grazing height (in)</label>
      <input type="number" id="le-residual-height" step="0.5" min="0" />
      <div style="font-size:10px; color:var(--text3); margin-top:2px;" id="le-residual-hint">
        Leave blank for default</div>
    </div>
  </div>
</div>
```

**Forage type change behavior:** When a forage type is selected, update the residual height hint to show the forage type's default: `"Default for {forageTypeName}: {height} in"`

### 3D: Confinement-Specific Fields

Shown when land_use is confinement. Hidden otherwise.

```html
<div id="le-confinement-fields" style="display:none;">
  <div class="field">
    <label>Description</label>
    <input type="text" id="le-desc" placeholder="e.g. Winter barn, Drylot A" />
  </div>

  <div class="field">
    <label>Capture manure?</label>
    <select id="le-capture" onchange="onLeCaptureChange()">
      <option value="yes">Yes — captured for storage</option>
      <option value="no">No — not captured</option>
    </select>
  </div>

  <div id="le-capture-fields">
    <div class="two">
      <div class="field">
        <label>Capture %</label>
        <input type="number" id="le-cap-pct" min="0" max="100" step="5" placeholder="80" />
      </div>
      <div class="field">
        <label>Batch mode</label>
        <select id="le-batch-mode">
          <option value="accumulate">Accumulate into one running batch</option>
          <option value="new">New batch each event close</option>
        </select>
      </div>
    </div>
  </div>
</div>
```

**Toggle logic:**
- When `le-capture` = "no" → hide `#le-capture-fields`
- When `le-capture` = "yes" → show `#le-capture-fields`

### 3E: Survey History (Edit Mode, Pasture Only)

In edit mode for land locations, show a collapsible survey history section.

```html
<div id="le-survey-history-wrap" style="margin-top:16px;">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
    <div style="font-size:13px; font-weight:600;">Survey history</div>
    <button class="btn btn-outline btn-xs" onclick="openSurveySheet('{locationId}')">
      + Add reading</button>
  </div>
  <div id="le-survey-history">
    <!-- List of past survey readings -->
    <div style="font-size:12px; color:var(--text2); padding:4px 0;
                border-bottom:0.5px solid var(--border);">
      {date} — Rating: {rating}, Height: {height}in, Cover: {cover}%,
      Condition: {condition}
    </div>
    <!-- ... more readings ... -->
    <!-- If none: -->
    <div style="font-size:12px; color:var(--text3);">No survey readings yet</div>
  </div>
</div>
```

### 3F: Action Buttons

```html
<div class="btn-row" style="margin-top:14px;">
  <button class="btn btn-green" id="le-save-btn" onclick="saveLocEdit()">
    Save changes  <!-- "Add location" in add mode -->
  </button>
  <button class="btn btn-outline" onclick="closeLocEdit()">Cancel</button>
</div>
```

### 3G: Delete Button (Edit Mode Only)

```html
<div id="le-delete-wrap" style="margin-top:8px;">
  <button class="btn btn-red btn-sm" style="width:auto;" onclick="tryDeleteLocation()">
    Delete location</button>
</div>
```

**Delete guard:** If the location has active events, show a warning instead of deleting: "This location has {N} active event(s). Close them before deleting."

---

## Part 4: Survey Sheet (Bulk & Single)

The survey sheet handles both bulk (all paddocks) and single-location surveys. The sheet structure is the same — single mode just filters to one paddock.

### 4A: Sheet Container

```html
<div class="sheet-wrap" id="survey-sheet-wrap">
  <div class="sheet-backdrop" onclick="closeSurveySheet()"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow:hidden;
                                   display:flex; flex-direction:column;">
    <div class="sheet-handle"></div>

    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div style="font-size:16px; font-weight:600;" id="survey-sheet-title">
        Pasture survey</div>
      <span id="survey-draft-tag" style="display:none; font-size:10px; font-weight:600;
            color:var(--amber-d); background:var(--amber-l); padding:2px 8px;
            border-radius:4px;">DRAFT</span>
    </div>
    <div style="font-size:13px; color:var(--text2); margin-top:4px; margin-bottom:10px;">
      Rate each paddock 0–100 for forage availability.
    </div>

    <!-- Date -->
    <div class="field" style="margin-bottom:14px;">
      <label>Survey date</label>
      <input type="date" id="survey-date" style="max-width:180px;" />
    </div>

    <!-- Scrollable body -->
    <div id="survey-scroll-body" style="flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;">
      <div id="survey-paddock-list"></div>

      <div class="div"></div>

      <!-- Recovery section header -->
      <div style="font-size:13px; font-weight:600; margin:12px 0 8px;">
        Recovery window edits
        <span style="font-weight:400; color:var(--text3); font-size:11px;">
          (optional — override defaults)</span>
      </div>
      <div id="survey-recovery-list"></div>

      <!-- Buttons -->
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-green" id="survey-save-btn" onclick="saveSurvey()">
          Save survey</button>
        <button class="btn btn-outline" onclick="closeSurveySheet()">Close</button>
      </div>

      <div style="margin-top:10px; text-align:center;">
        <button id="survey-discard-btn" style="display:none; font-size:12px;
                color:var(--red); background:none; border:none; cursor:pointer;
                text-decoration:underline;" onclick="discardSurveyDraft()">
          Discard survey</button>
      </div>
    </div>
  </div>
</div>
```

### 4B: Bulk Mode — Filter Pills

In bulk mode, show farm and type filter pills above the paddock list.

```html
<!-- Farm filter (if >1 farm) -->
<div style="display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
  <button style="padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600;
                 cursor:pointer; border:1.5px solid var(--amber-d);
                 background:var(--amber-d); color:white;">All farms</button>
  <button style="...inactive...">{Farm Name}</button>
</div>

<!-- Type filter -->
<div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
  <button style="...active...">All</button>
  <button style="...inactive...">Pasture</button>
  <button style="...inactive...">Mixed-Use</button>
</div>
```

### 4C: Paddock Card — Single Mode (Expanded)

When surveying a single paddock, all fields are visible inline without expand/collapse.

**Forage Rating:**
```html
<div style="font-size:13px; font-weight:600; margin-bottom:8px;">Forage rating</div>
<div style="display:flex; gap:8px; align-items:center;">
  <input type="range" min="0" max="100" step="1" value="{current}"
    style="flex:1; accent-color:{ratingColor};" />
  <input type="number" min="0" max="100" step="1" value="{current}" placeholder="0–100"
    style="width:68px; padding:6px; border:0.5px solid var(--border2);
           border-radius:var(--radius); font-size:14px; text-align:center;" />
</div>
<!-- Progress bar visualization -->
<div style="height:8px; border-radius:4px; background:var(--bg2); margin-top:6px;
            overflow:hidden;">
  <div style="height:100%; width:{rating}%; background:{ratingColor};
              border-radius:4px; transition:width 0.15s;"></div>
</div>
```

**Veg Height & Forage Cover:**
```html
<div style="display:flex; gap:12px; margin-top:14px; flex-wrap:wrap;">
  <div style="flex:1; min-width:120px;">
    <div style="font-size:11px; font-weight:600; color:var(--text2);
                margin-bottom:5px;">AVG VEG HEIGHT (in)</div>
    <input type="number" min="0" max="72" step="0.5" placeholder="inches"
      style="width:100%; padding:8px; border:0.5px solid var(--border2);
             border-radius:var(--radius); font-size:14px;" />
  </div>
  <div style="flex:1; min-width:120px;">
    <div style="font-size:11px; font-weight:600; color:var(--text2);
                margin-bottom:5px;">AVG FORAGE COVER (%)</div>
    <input type="number" min="0" max="100" step="1" placeholder="%"
      style="width:100%; padding:8px; border:0.5px solid var(--border2);
             border-radius:var(--radius); font-size:14px;" />
  </div>
</div>
```

**Forage Condition (4-button toggle):**
```html
<div style="margin-top:12px;">
  <div style="font-size:11px; font-weight:600; color:var(--text2);
              margin-bottom:5px;">FORAGE CONDITION</div>
  <div style="display:flex; gap:4px;">
    <!-- One button per condition. Active = green fill. -->
    <button style="flex:1; padding:6px 0; font-size:12px; border-radius:6px;
                   cursor:pointer; border:0.5px solid var(--green);
                   background:var(--green-l); color:var(--green-d);
                   font-weight:500;">Poor</button>
    <button style="flex:1; padding:6px 0; font-size:12px; border-radius:6px;
                   cursor:pointer; border:0.5px solid var(--border2);
                   background:transparent; color:var(--text2);
                   font-weight:400;">Fair</button>
    <button ...>Good</button>
    <button ...>Exc.</button>
  </div>
</div>
```

**Recovery Window:**
```html
<div style="margin-top:14px;">
  <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Recovery window</div>
  <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
    <div>
      <div style="font-size:10px; color:var(--text2); margin-bottom:3px;">MIN days</div>
      <input type="number" placeholder="{default}" min="1" max="365"
        style="width:72px; padding:6px; border:0.5px solid var(--border2);
               border-radius:var(--radius); font-size:14px;" />
    </div>
    <span style="font-size:16px; color:var(--text2); padding-bottom:6px;">–</span>
    <div>
      <div style="font-size:10px; color:var(--text2); margin-bottom:3px;">MAX days</div>
      <input type="number" placeholder="{default}" min="1" max="365"
        style="width:72px; padding:6px; border:0.5px solid var(--border2);
               border-radius:var(--radius); font-size:14px;" />
    </div>
    <div style="font-size:12px; color:var(--text2); padding-bottom:6px;">
      days from {surveyDate}</div>
  </div>
  <!-- Recovery preview -->
  <div style="font-size:12px; margin-top:6px;">
    <!-- Shows calculated next graze window -->
    <span style="color:var(--green);">✓ Ready to graze</span>
    <!-- or -->
    <span style="color:var(--amber);">⚠ Apr 11 – 5d → Apr 14 window closing</span>
    <!-- or -->
    <span style="color:var(--text3);">{N}d until ready ({date range})</span>
  </div>
</div>
```

### 4D: Bulk Mode — Paddock Card (Collapsible)

In bulk mode, each paddock renders as a collapsible card. The header is always visible; details expand on tap.

**Collapsed header:**
```html
<div style="display:flex; align-items:center; gap:8px; padding:10px 0;
            border-bottom:0.5px solid var(--border); cursor:pointer;">
  <div style="flex:1; min-width:0;">
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="font-size:13px; font-weight:600;">{locationName}</span>
      <span style="font-size:11px; color:var(--text2);">{acres} ac</span>
      <!-- If has active event -->
      <span class="badge ba" style="font-size:9px;">active</span>
    </div>
  </div>
  <!-- Completion indicator -->
  <div style="font-size:11px; color:{rated ? 'var(--green)' : 'var(--text3)'};">
    {rated ? '✓' : '○'}</div>
  <!-- Expand arrow -->
  <div style="font-size:14px; color:var(--text3);">{expanded ? '▾' : '›'}</div>
</div>
```

**Expanded section:** Same fields as 4C (forage rating, height, cover, condition) but without the recovery window — recovery edits appear in the separate "Recovery window edits" section below all paddock cards.

### 4E: Draft Behavior

- **Auto-save:** Every field change saves draft state to localStorage
- **Resume:** Opening bulk survey checks for existing draft and resumes it
- **Discard:** "Discard survey" button clears draft and closes sheet
- **Commit:** "Save survey" commits all readings to `paddock_observations` table

### 4F: Data Commit

On save, each paddock's readings become a `paddock_observation` record:
- `source: 'survey'`
- `observed_at: {surveyDate}`
- `location_id: {locationId}`
- `forage_quality: {0-100 rating}`
- `forage_height_cm: {height converted to metric}`
- `forage_cover_pct: {cover %}`
- `forage_condition: {Poor|Fair|Good|Excellent}`
- `recovery_min_days: {min days}`
- `recovery_max_days: {max days}`

---

## Part 5: Harvest Sheet

A two-step flow: select which field was harvested, then record harvest details per feed type.

### 5A: Sheet Container

```html
<div class="sheet-wrap" id="harvest-sheet-wrap">
  <div class="sheet-backdrop" onclick="closeHarvestSheet()"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:4px;">Record harvest</div>

    <!-- Date -->
    <div class="field" style="margin-bottom:12px;">
      <label>Harvest date</label>
      <input type="date" id="harvest-sheet-date" />
    </div>

    <div id="harvest-content">
      <!-- Step 1: Field picker OR Step 2: Tile grid -->
    </div>
  </div>
</div>
```

### 5B: Step 1 — Field Picker

Select which field was harvested. Shows only Crop and Mixed-Use locations.

```html
<!-- Search -->
<input type="search" id="harvest-field-search" placeholder="Search fields…"
  style="width:100%; padding:8px 12px; border:0.5px solid var(--border2);
         border-radius:var(--radius); font-size:13px; margin-bottom:8px;" />

<!-- Farm pills (if >1 farm) -->
<div style="display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
  <button style="padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600;
                 cursor:pointer; border:1.5px solid var(--teal); background:var(--teal);
                 color:white;">All</button>
  <button style="...inactive...">{Farm Name}</button>
</div>

<!-- Type filter -->
<div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
  <button style="...active...">All crop & mixed-use</button>
  <button style="...inactive...">Crop</button>
  <button style="...inactive...">Mixed-Use</button>
</div>

<!-- Field list -->
<div>
  <div style="display:flex; align-items:center; gap:8px; padding:10px 0;
              border-bottom:0.5px solid var(--border); cursor:pointer;"
       onclick="selectHarvestField('{locationId}')">
    <div style="flex:1;">
      <div style="font-size:13px; font-weight:500;">{name}</div>
      <div style="font-size:11px; color:var(--text2);">{acres} ac {fieldCode}</div>
    </div>
    <div style="font-size:14px; color:var(--text3);">›</div>
  </div>
</div>
```

### 5C: Step 2 — Feed Type Tile Grid

After selecting a field, show feed type tiles to toggle and record per-type harvest details.

```html
<!-- Feed type tiles (toggle buttons) -->
<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
  <button style="padding:10px 14px; border-radius:var(--radius); font-size:13px;
                 font-weight:500; cursor:pointer; border:1.5px solid var(--green);
                 background:var(--green-l); color:var(--green-d);">
    🌾 {feedTypeName}</button>
  <button style="...inactive tile...">{feedTypeName}</button>
</div>

<!-- Expanded section per selected feed type -->
<div style="margin-bottom:14px; padding:12px; background:var(--bg2);
            border-radius:var(--radius);">
  <div style="font-size:13px; font-weight:600; margin-bottom:8px;">{feedTypeName}</div>

  <!-- Field row -->
  <div style="display:flex; gap:8px; align-items:flex-end; margin-bottom:8px;">
    <div class="field" style="flex:1;">
      <label>Bale count</label>
      <input type="number" min="0" step="1" placeholder="0" />
    </div>
    <div class="field" style="flex:1;">
      <label>Weight per bale (lbs)</label>
      <input type="number" min="0" step="1" placeholder="{defaultWeight}" />
    </div>
  </div>

  <div class="two">
    <div class="field">
      <label>Batch ID</label>
      <input type="text" value="{autoGenerated}" />
    </div>
    <div class="field">
      <label>Notes</label>
      <input type="text" placeholder="Optional" />
    </div>
  </div>

  <button class="btn btn-outline btn-xs" style="margin-top:6px;">
    + Add another field</button>
</div>

<!-- Save -->
<div class="btn-row" style="margin-top:14px;">
  <button class="btn btn-green" onclick="saveHarvest()">Save harvest</button>
  <button class="btn btn-outline" onclick="closeHarvestSheet()">Cancel</button>
</div>
```

---

## Part 6: Feed Types Sheet

Manage stored feed type definitions: create, edit, delete.

### 6A: Sheet Container

```html
<div class="sheet-wrap" id="feed-types-wrap">
  <div class="sheet-backdrop" onclick="closeFeedTypesSheet()"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:4px;">Feed types</div>

    <!-- Existing types list -->
    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Existing types</div>
    <div id="ft-list">
      <!-- Rendered per type — see 6B -->
    </div>

    <!-- Create/Edit form — see 6C -->
    <div id="ft-form">...</div>
  </div>
</div>
```

### 6B: Existing Feed Type Row

```html
<div style="display:flex; align-items:center; gap:8px; padding:8px 0;
            border-bottom:0.5px solid var(--border);">
  <div style="flex:1;">
    <div style="font-size:13px; font-weight:500;">{name}</div>
    <div style="font-size:11px; color:var(--text2);">
      {unit} · {dmPct}% DM · {category}
      {cuttingNum ? ' · ' + cuttingNum + ' cut' : ''}
      {defaultWeight ? ' · ' + defaultWeight + ' lbs/unit' : ''}
    </div>
  </div>
  <button class="btn btn-outline btn-xs" onclick="editFeedType({index})">Edit</button>
</div>
```

### 6C: Create/Edit Form

```html
<div id="ft-form-title" style="font-size:13px; font-weight:600; margin:14px 0 8px;">
  Add feed type</div>

<div class="two">
  <div class="field">
    <label>Name</label>
    <input type="text" id="ft-name" placeholder="Round bale" />
  </div>
  <div class="field">
    <label>Unit</label>
    <select id="ft-unit">
      <option value="bale">bale</option>
      <option value="sq bale">sq bale</option>
      <option value="round-bale">round-bale</option>
      <option value="ton">ton</option>
      <option value="lb">lb</option>
      <option value="bag">bag</option>
    </select>
  </div>
</div>

<div class="field">
  <label>Forage type
    <span style="font-weight:400; color:var(--text2); font-size:11px;">
      (auto-fills DM% and NPK)</span></label>
  <select id="ft-forage-type">
    <option value="">— Custom / none —</option>
    <!-- Populated from store.getState().forageTypes -->
  </select>
</div>

<div class="two">
  <div class="field">
    <label>DM %</label>
    <input type="number" id="ft-dm" placeholder="85" />
  </div>
  <div class="field">
    <label>Category</label>
    <select id="ft-cat">
      <option value="hay">Hay/forage</option>
      <option value="silage">Silage</option>
      <option value="grain">Grain/supp</option>
    </select>
  </div>
</div>

<div class="two">
  <div class="field">
    <label>Cutting #</label>
    <select id="ft-cutting-num">
      <option value="">None</option>
      <option value="1">1st cut</option>
      <option value="2">2nd cut</option>
      <option value="3">3rd cut</option>
      <option value="4">4th cut</option>
    </select>
  </div>
  <div class="field">
    <label>Default weight (lbs)
      <span style="font-weight:400; color:var(--text2); font-size:11px;">
        per bale/unit</span></label>
    <input type="number" id="ft-default-weight" placeholder="850" min="0" step="1" />
  </div>
</div>

<!-- Harvest active toggle -->
<div class="field" style="padding-bottom:6px;">
  <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
    <input type="checkbox" id="ft-harvest-active"
      style="width:16px; height:16px; cursor:pointer; accent-color:var(--green);" />
    Harvest active — show as tile on harvest sheet
  </label>
</div>

<!-- Hay analysis section -->
<div style="font-size:12px; font-weight:600; color:var(--text2); margin:10px 0 4px;">
  Hay analysis — optional</div>
<div style="font-size:11px; color:var(--text3); margin-bottom:8px;">
  From a lab feed test. Used to credit uneaten bale OM as a fertility input.</div>
<div class="three">
  <div class="field">
    <label>N %</label>
    <input type="number" id="ft-npct" placeholder="1.5" step="0.01" min="0" max="10" />
  </div>
  <div class="field">
    <label>P %</label>
    <input type="number" id="ft-ppct" placeholder="0.2" step="0.01" min="0" max="10" />
  </div>
  <div class="field">
    <label>K %</label>
    <input type="number" id="ft-kpct" placeholder="2.0" step="0.01" min="0" max="10" />
  </div>
</div>

<!-- Action buttons -->
<div id="ft-create-btns" class="btn-row" style="margin-top:8px;">
  <button class="btn btn-green" onclick="addFeedType()">Add type</button>
  <button class="btn btn-outline" onclick="clearFeedTypeForm()">Cancel</button>
</div>
<div id="ft-edit-btns" class="btn-row" style="margin-top:8px; display:none;">
  <button class="btn btn-green" onclick="saveEditFeedType()">Save changes</button>
  <button class="btn btn-outline" onclick="cancelFeedTypeEdit()">Cancel</button>
  <button class="btn btn-outline" style="color:var(--red); border-color:var(--red);
                                          margin-left:auto;"
    onclick="deleteFeedType()">Delete</button>
</div>
```

**Forage type auto-fill:** When a forage type is selected, auto-populate DM%, N%, P%, K% from the forage type's stored values.

---

## Part 7: Apply Input / Amendment Sheet

Record a fertilizer application or manure spread to one or more locations.

### 7A: Sheet Container

```html
<div class="sheet-wrap" id="apply-input-wrap">
  <div class="sheet-backdrop" onclick="closeApplyInputSheet()"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:14px;">
      Apply input / amendment</div>

    <div class="field">
      <label>Date applied</label>
      <input type="date" id="ai-date" />
    </div>

    <!-- Source toggle -->
    <div class="field">
      <label>Source</label>
      <select id="ai-source-type" onchange="onAiSourceChange()">
        <option value="product">Purchased product / input</option>
        <option value="manure">Stored manure from inventory</option>
      </select>
    </div>

    {source-specific fields — see 7B and 7C}
    {location multi-select — see 7D}
    {preview — see 7E}

    <div class="field">
      <label>Notes <span style="font-size:10px; color:var(--text2);">optional</span></label>
      <input type="text" id="ai-notes"
        placeholder="Application method, conditions, applicator…" />
    </div>

    <div class="btn-row">
      <button class="btn btn-green" onclick="saveApplyInput()">Record application</button>
      <button class="btn btn-outline" onclick="closeApplyInputSheet()">Cancel</button>
    </div>
  </div>
</div>
```

### 7B: Purchased Product Fields

Shown when source = "product".

```html
<div id="ai-product-fields">
  <div class="field">
    <label>Product</label>
    <select id="ai-product" onchange="onAiProductChange()">
      <option value="">— select product —</option>
      <!-- Populated from store input products -->
    </select>
  </div>

  <!-- Product info card (shown after selection) -->
  <div id="ai-product-info" style="display:none;" class="card-inset">
    <!-- Shows NPK analysis, application rate, unit -->
  </div>

  <div class="two">
    <div class="field">
      <label>Quantity</label>
      <input type="number" id="ai-qty" step="0.01" placeholder="0" />
    </div>
    <div class="field">
      <label>Unit</label>
      <div style="padding:9px 12px; background:var(--bg2); border-radius:var(--radius);
                  font-size:14px; color:var(--text2);">—</div>
    </div>
  </div>

  <div class="two">
    <div class="field">
      <label>Cost override ($)
        <span style="font-size:10px; color:var(--text2);">optional</span></label>
      <input type="number" id="ai-cost-override" step="0.01"
        placeholder="Leave blank to use product rate" />
    </div>
    <div class="field" style="display:flex; align-items:flex-end; padding-bottom:12px;">
      <div id="ai-cost-calc" style="font-size:13px; color:var(--amber-d);"></div>
    </div>
  </div>
</div>
```

### 7C: Manure Source Fields

Shown when source = "manure". Hidden otherwise.

```html
<div id="ai-manure-fields" style="display:none;">
  <div class="field">
    <label>Manure batch</label>
    <select id="ai-manure-batch" onchange="onAiManureBatchChange()">
      <option value="">— select batch —</option>
      <!-- Populated from store manure batches -->
    </select>
  </div>

  <!-- Batch info card -->
  <div id="ai-manure-info" style="display:none;" class="card-inset">
    <!-- Shows batch volume, NPK content, source location -->
  </div>

  <div class="field">
    <label>Amount to apply</label>
    <select id="ai-manure-amount-type" onchange="onAiManureAmtChange()">
      <option value="pct">Percentage of batch (%)</option>
      <option value="vol">Volume</option>
    </select>
  </div>

  <!-- Percentage slider -->
  <div id="ai-manure-pct-field">
    <div style="display:flex; align-items:center; gap:12px;">
      <input type="range" id="ai-manure-pct" min="1" max="100" step="1" value="25"
        style="flex:1; accent-color:var(--green);" />
      <span style="font-size:14px; font-weight:600; min-width:40px; text-align:right;">
        25%</span>
    </div>
  </div>

  <!-- Volume input (hidden by default) -->
  <div id="ai-manure-vol-field" style="display:none;">
    <div class="field">
      <label>Volume (loads)</label>
      <input type="number" id="ai-manure-vol" step="0.5" />
    </div>
  </div>
</div>
```

### 7D: Location Multi-Select

Checkbox list of all locations. Multiple can be selected.

```html
<div class="field">
  <label>Apply to locations
    <span style="font-size:10px; color:var(--text2);">select one or more</span></label>
  <div id="ai-location-list" style="max-height:200px; overflow-y:auto;
       border:0.5px solid var(--border2); border-radius:var(--radius);
       padding:4px 0; margin-top:4px;">
    <!-- Per-location row -->
    <div style="display:flex; align-items:center; gap:10px; padding:7px 10px;
                cursor:pointer; background:transparent;"
         onclick="toggleAiLocation('{locationId}')">
      <!-- Checkbox -->
      <div style="width:16px; height:16px; border-radius:4px;
                  border:1.5px solid var(--border2); background:transparent;
                  display:flex; align-items:center; justify-content:center;
                  flex-shrink:0;">
        <!-- When checked: border-color:var(--green); background:var(--green);
             + white checkmark SVG -->
      </div>
      <div style="flex:1; font-size:13px; font-weight:500;">{locationName}</div>
      <div style="font-size:11px; color:var(--text2);">{acres} ac</div>
    </div>
  </div>
</div>
```

**Selected state styling:**
```
background: var(--green-l);
checkbox border: var(--green);
checkbox background: var(--green);
+ white checkmark SVG inside
```

### 7E: Application Preview

Live-updating preview panel shown after product/batch and locations are selected.

```html
<div id="ai-preview" style="display:none;" class="card-inset">
  <div class="sec" style="margin-bottom:6px;">Application summary</div>
  <div style="font-size:12px; color:var(--text2); line-height:1.8;">
    {productName} × {quantity} {unit} → {locationCount} location(s)<br />
    N: {nLbs} lbs/ac · P: {pLbs} lbs/ac · K: {kLbs} lbs/ac<br />
    Est. cost: ${totalCost}
  </div>
</div>
```

---

## Part 8: Soil Test Sheet

Record a soil test result for a specific location.

### 8A: Sheet Container

```html
<div class="sheet-wrap" id="soil-sheet-wrap">
  <div class="sheet-backdrop" onclick="closeSoilTestSheet()"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:4px;">Soil test</div>
    <div style="font-size:13px; color:var(--text2); margin-bottom:14px;"
         id="soil-sheet-location-name">{Location Name}</div>

    <div class="two">
      <div class="field">
        <label>Test date *</label>
        <input type="date" id="soil-sheet-date" />
      </div>
      <div class="field">
        <label>Unit</label>
        <select id="soil-sheet-unit">
          <option value="lbs/acre">lbs/acre</option>
          <option value="kg/ha">kg/ha</option>
          <option value="ppm">ppm</option>
        </select>
      </div>
    </div>

    <div class="three">
      <div class="field">
        <label>N</label>
        <input type="number" id="soil-sheet-n" step="0.1" />
      </div>
      <div class="field">
        <label>P</label>
        <input type="number" id="soil-sheet-p" step="0.1" />
      </div>
      <div class="field">
        <label>K</label>
        <input type="number" id="soil-sheet-k" step="0.1" />
      </div>
    </div>

    <div class="two">
      <div class="field">
        <label>pH <span style="font-weight:400; color:var(--text2); font-size:11px;">
          (optional)</span></label>
        <input type="number" id="soil-sheet-ph" step="0.1" min="0" max="14" />
      </div>
      <div class="field">
        <label>Organic matter %
          <span style="font-weight:400; color:var(--text2); font-size:11px;">
            (optional)</span></label>
        <input type="number" id="soil-sheet-om" step="0.1" min="0" max="100" />
      </div>
    </div>

    <div class="field">
      <label>Lab <span style="font-weight:400; color:var(--text2); font-size:11px;">
        (optional)</span></label>
      <input type="text" id="soil-sheet-lab" placeholder="Lab name" />
    </div>

    <div class="field">
      <label>Notes <span style="font-weight:400; color:var(--text2); font-size:11px;">
        (optional)</span></label>
      <input type="text" id="soil-sheet-notes" placeholder="Sample depth, conditions…" />
    </div>

    <div class="btn-row" style="margin-top:14px;">
      <button class="btn btn-green" onclick="saveSoilTest()">Save test</button>
      <button class="btn btn-outline" onclick="closeSoilTestSheet()">Cancel</button>
    </div>
  </div>
</div>
```

**Data commit:** Creates a `soil_test` record with:
- `location_id`, `tested_at`, `unit`
- `n`, `p`, `k` (required)
- `ph`, `organic_matter_pct`, `lab`, `notes` (optional)

---

## Part 9: Implementation Notes

### 9A: File Organization

Create these new files:
- `src/features/locations/index.js` — Locations list screen, renderLocations(), filter/sort logic
- `src/features/locations/location-edit-sheet.js` — Add/Edit Location sheet
- `src/features/surveys/survey-sheet.js` — Survey sheet (bulk & single)
- `src/features/harvest/harvest-sheet.js` — Harvest sheet
- `src/features/feed-types/feed-types-sheet.js` — Feed Types sheet
- `src/features/amendments/apply-input-sheet.js` — Apply Input sheet
- `src/features/soil-tests/soil-test-sheet.js` — Soil Test sheet

### 9B: Router Integration

Register `/locations` as a route in `src/ui/router.js`. The Locations screen is a top-level nav destination alongside Dashboard, Events, Animals, and Reports.

### 9C: Data Sources

All data reads go through the store. Key entity types:
- `locations` — from `src/entities/locations.js`
- `paddock_observations` — for survey data
- `soil_tests` — from `src/entities/soil-tests.js`
- `input_applications` / `amendment_locations` — for amendments
- `feed_types` — from `src/entities/feed-types.js`
- `harvest_records` — from `src/entities/harvest-records.js`
- `forage_types` — reference data for forage species
- `events` — to check active event status per location

### 9D: Calculation Dependencies

- **Est. available DM:** Uses FOR-1 (forage available) from latest observation
- **AUD estimate:** Uses DMI-1 (per-head daily DMI) or farm-level dmPerAUD setting
- **Recovery window:** Uses REC-1 (recovery calc) from latest close observation
- **Survey rating color:** Simple threshold function (0-30 red, 31-60 amber, 61-100 green)

### 9E: Unit Display

All stored values are metric. Display conversions via `src/utils/units.js`:
- Area: hectares → acres (if user unit = imperial)
- Height: cm → inches
- Weight: kg → lbs
- DM: kg/ha → lbs/acre

### 9F: Known Dependencies on Other Specs

- **Dashboard location cards (SP-3):** The dashboard has its own active-event-focused cards. This Locations screen is complementary — it shows ALL locations regardless of event status.
- **OI-0075 (display bugs):** Those bugs are on the dashboard Locations tab, not this screen. But shared helper functions (DM estimate, rating color) should be consistent.
- **OI-0008 (recovery in location picker):** The recovery classification logic built for the location picker can be reused for the recovery line on location cards here.

---

## Acceptance Criteria

1. [ ] Dedicated `/locations` route renders the Locations list screen
2. [ ] Screen-level tabs (Locations / Surveys) — Surveys tab shows placeholder
3. [ ] Inputs & amendments summary section renders with "Apply input" button
4. [ ] Locations header with + Add, Survey, Harvest, Feed types buttons and search
5. [ ] Filter pills (All, Pasture, Mixed-Use, Crop, Confinement) filter the list
6. [ ] Farm filter pills appear when >1 farm exists
7. [ ] Sort header (Name, Acres, Exp. Graze, Survey, Avg %) toggles sort
8. [ ] Location cards show all v1 parity fields (title, badge, acres, soil, DM, recovery, buttons)
9. [ ] Confinement cards show appropriate subset (no Survey/Soil buttons, capture %)
10. [ ] Add Location sheet creates a new location via store
11. [ ] Edit Location sheet pre-populates and updates via store, shows survey history
12. [ ] Delete location with active-event guard
13. [ ] Bulk survey sheet: filter pills, collapsible paddock cards, draft auto-save, commit
14. [ ] Single survey sheet: all fields visible, recovery preview
15. [ ] Harvest sheet: two-step field picker → tile grid flow
16. [ ] Feed Types sheet: list existing, add/edit/delete with forage type auto-fill
17. [ ] Apply Input sheet: product/manure toggle, location multi-select, live preview
18. [ ] Soil Test sheet: date, unit, NPK, pH, OM, lab, notes
19. [ ] All sheets use v2 DOM builder (`el()`, `text()`, `clear()`) — no innerHTML
20. [ ] All user-facing strings use `t()` for i18n
21. [ ] All store mutations follow validate → mutate → persist → queue sync → notify
22. [ ] Unit conversions via `src/utils/units.js` for all displayed values
