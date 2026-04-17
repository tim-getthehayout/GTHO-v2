# SP-8: Field Mode — V1 Parity

**Sprint:** UI Sprint (2026-04-15)
**Status:** Spec complete · Ready for Claude Code
**Priority:** P1
**Labels:** ui-sprint, v1-parity, field-mode
**Schema:** Minor — `field_mode_quick_actions` column already exists on `user_preferences`. No new migration.
**CP-55/CP-56 impact:** None — `field_mode_quick_actions` is already in the schema. No new columns.

---

## Goal

Rebuild v2 field mode to match v1: 8 configurable modules, user-selectable tile grid, feed delivery loop, event picker sheets for Move/Feed Check/Heat/Single Survey, expandable event cards, interactive tasks, and module customization in Settings. Two structural changes from current v2:

1. **Remove the green field-mode header bar** — v2 currently renders a dedicated dark-green `field-mode-header` bar inside the field mode screen. V1 doesn't have this. Navigation in/out of field mode happens through the **header pill button** (already present in the app header), which changes text depending on context.
2. **Add module settings to the Settings screen** — v1 has a Settings section where users toggle which of the 8 modules appear on their field mode tile grid. V2 Settings has no field mode section.

---

## Part 1: Remove Field Mode Header Bar

### Problem

V2 renders `renderFieldModeHeader()` as a dark-green bar at the top of the field mode home screen (`.field-mode-header` with `background: var(--color-green-dark)`). This bar contains a "← Detail" button and a "Field Mode" title. V1 doesn't have this — the normal app header stays visible, and the **pill button** in the header right-cluster changes behavior:

| Context | Pill text | Action |
|---------|-----------|--------|
| Not in field mode (any screen) | `⊞ Field` | Enter field mode → navigate to `#/field` |
| Field mode, on home (`#/field`) | `← Detail` | Exit field mode → navigate to `#/` |
| Field mode, on sub-screen (e.g. `#/animals`) | `⌂ Home` | Return to field mode home → navigate to `#/field` |

### Fix

1. **Delete** the `renderFieldModeHeader()` function and its call in `renderFieldModeHome()` (line 23 of `src/features/field-mode/index.js`)
2. **Delete** the CSS classes `.field-mode-header`, `.field-mode-header-btn`, `.field-mode-header-title` from `src/styles/main.css` (lines 1444–1468)
3. **Update** the header pill button in `src/ui/header.js`:
   - Currently: always shows `t('fieldMode.enter')` with a fixed `onClick` that calls `setFieldMode(true); navigate('#/field')`
   - New behavior: check field mode state and current route to set text and handler dynamically
   - The pill must re-render when the route changes (subscribe to route changes or update on each `renderHeader()` call)

### Header Pill Spec

**Element:** `btn btn-green btn-xs` in the header right-cluster (already exists at `data-testid="header-field-mode-toggle"`)

**State logic:**

```javascript
const isFieldMode = getFieldMode(); // from preferences.js
const isFieldHome = window.location.hash === '#/field';

if (!isFieldMode) {
  // Normal mode — green border, enter field mode
  text = '⊞ Field';
  className = 'btn btn-outline btn-xs'; // subtle when not active
  onClick = () => { setFieldMode(true); navigate('#/field'); };
} else if (isFieldHome) {
  // Field mode, on home — exit
  text = '← Detail';
  className = 'btn btn-green btn-xs'; // green when active
  onClick = () => { setFieldMode(false); navigate('#/'); };
} else {
  // Field mode, sub-screen — return to field home
  text = '⌂ Home';
  className = 'btn btn-green btn-xs';
  onClick = () => { navigate('#/field'); };
}
```

**CSS (v1 reference):**

```css
/* When in field mode, pill has green border + green text */
body.field-mode [data-testid="header-field-mode-toggle"] {
  border-color: var(--color-green);
  color: var(--color-green-dark);
}
/* When not in field mode, pill has neutral border */
body:not(.field-mode) [data-testid="header-field-mode-toggle"] {
  border-color: var(--border);
  color: var(--text2);
}
```

**Important:** The pill must update its text/handler when the route changes. Options:
- Call `updateFieldModeToggle()` from the router after each navigation
- Or re-render the entire header on route change (existing pattern)

### Field Mode Body Class

V1 uses `body.field-mode` as a CSS gate. V2 should do the same:
- `setFieldMode(true)` → `document.body.classList.add('field-mode')`
- `setFieldMode(false)` → `document.body.classList.remove('field-mode')`
- On app init, check `getFieldMode()` and apply class if true

**What hides in field mode (v1 parity):**

```css
body.field-mode .desktop-sidebar { display: none !important; }
body.field-mode .bottom-nav { display: none !important; }
body.field-mode .header-sub-row { display: none !important; }  /* SP-6 feedback row */
body.field-mode .header-build-stamp { display: none !important; }
```

**Desktop grid collapse (when sidebar hidden):**

```css
body.field-mode .app-layout {
  grid-template-columns: 1fr;
}
```

---

## Part 2: Module Settings in Settings Screen

### Problem

V1 has a "Field Mode" section in Settings where users toggle which of the 8 modules appear on their field mode tile grid. V2 Settings has `defaultViewMode` (detail/field toggle) and `homeViewMode` (groups/locations) but no module selection.

### Fix

Add a new card to the Settings screen's preferences section: **Field Mode Modules**.

### Settings Card Spec

**Position:** After the existing "Home view" preference card, before any other cards.

**Card structure:**

```
┌──────────────────────────────────────────────┐
│  Field Mode Modules                          │
│                                              │
│  Choose which tiles appear on your field     │
│  mode home screen.                           │
│                                              │
│  🌾 Feed Animals        [✓ On]              │
│  ──────────────────────────────              │
│  🐄 Move Animals        [  Off]              │
│  ──────────────────────────────              │
│  🚜 Harvest             [✓ On]              │
│  ──────────────────────────────              │
│  📋 Feed Check          [  Off]              │
│  ──────────────────────────────              │
│  📋 Multi-Pasture Survey [✓ On]             │
│  ──────────────────────────────              │
│  📋 Pasture Survey      [  Off]              │
│  ──────────────────────────────              │
│  🐄 Animals             [✓ On]              │
│  ──────────────────────────────              │
│  🌡️ Record Heat         [  Off]              │
└──────────────────────────────────────────────┘
```

**Toggle button styling (v1 reference):**

```css
/* On state */
padding: 4px 14px;
border-radius: 20px;
font-size: 12px;
font-weight: 600;
border: 1.5px solid var(--color-green);
background: var(--color-green);
color: white;

/* Off state */
border: 1.5px solid var(--border);
background: transparent;
color: var(--text2);
```

**Data flow:**
1. Read: `getAll('userPreferences')` → find current user's prefs → `fieldModeQuickActions` (or null = defaults)
2. Toggle: `update('userPreferences', prefsId, { fieldModeQuickActions: newArray }, validateUserPref, prefToSb, 'user_preferences')`
3. Default set (when `fieldModeQuickActions` is null): `['feed', 'harvest', 'surveybulk', 'animals']`

**Module keys (must match between Settings, field mode home, and the FIELD_MODULES constant):**

| Key | Icon | Label |
|-----|------|-------|
| `feed` | 🌾 | Feed Animals |
| `move` | 🐄 | Move Animals |
| `harvest` | 🚜 | Harvest |
| `feedcheck` | 📋 | Feed Check |
| `surveybulk` | 📋 | Multi-Pasture Survey |
| `surveysingle` | 📋 | Pasture Survey |
| `animals` | 🐄 | Animals |
| `heat` | 🌡️ | Record Heat |

---

## Part 3: Full 8-Module Tile Grid

### Problem

V2 field mode home has 4 hardcoded tiles (Feed Animals, Harvest, Survey, Animals). V1 has 8 configurable modules.

### Fix

Replace the hardcoded 4-tile grid with a dynamic grid driven by the `FIELD_MODULES` constant, filtered by the user's `fieldModeQuickActions` preference.

### FIELD_MODULES Constant

Define in `src/features/field-mode/index.js`:

```javascript
export const FIELD_MODULES = [
  { key: 'feed',         icon: '🌾', label: 'fieldMode.feedAnimals',  handler: handleFeed },
  { key: 'move',         icon: '🐄', label: 'fieldMode.moveAnimals',  handler: handleMove },
  { key: 'harvest',      icon: '🚜', label: 'fieldMode.harvest',      handler: handleHarvest },
  { key: 'feedcheck',    icon: '📋', label: 'fieldMode.feedCheck',    handler: handleFeedCheck },
  { key: 'surveybulk',   icon: '📋', label: 'fieldMode.survey',       handler: handleSurveyBulk },
  { key: 'surveysingle', icon: '📋', label: 'fieldMode.surveySingle', handler: handleSurveySingle },
  { key: 'animals',      icon: '🐄', label: 'fieldMode.animals',      handler: handleAnimals },
  { key: 'heat',         icon: '🌡️', label: 'fieldMode.recordHeat',   handler: handleHeat },
];

export const FIELD_MODULES_DEFAULT = ['feed', 'harvest', 'surveybulk', 'animals'];
```

**Label values are i18n keys** — add these to `en.json`:

```json
"fieldMode": {
  "moveAnimals": "Move Animals",
  "feedCheck": "Feed Check",
  "surveySingle": "Pasture Survey",
  "recordHeat": "Record Heat",
  "noModules": "No modules active — go to Settings to add tiles.",
  "modulesTitle": "Field Mode Modules",
  "modulesHint": "Choose which tiles appear on your field mode home screen."
}
```

### Tile Grid Rendering

```javascript
function renderTileGrid(container) {
  const prefs = getAll('userPreferences').find(p => p.userId === getCurrentUserId());
  const activeKeys = prefs?.fieldModeQuickActions || FIELD_MODULES_DEFAULT;
  const activeTiles = FIELD_MODULES.filter(m => activeKeys.includes(m.key));

  if (!activeTiles.length) {
    // Show "no modules" message
    return el('div', { className: 'form-hint' }, [t('fieldMode.noModules')]);
  }

  return el('div', { className: 'field-mode-tiles' }, activeTiles.map(m =>
    el('button', {
      className: 'field-mode-tile',
      'data-testid': `field-mode-tile-${m.key}`,
      onClick: m.handler,
    }, [
      el('div', { className: 'field-mode-tile-icon' }, [m.icon]),
      t(m.label),
    ])
  ));
}
```

### Tile Touch Feedback (v1)

V1 uses `ontouchstart` / `ontouchend` to flash green on tap. V2 equivalent:

```css
.field-mode-tile:active {
  background: var(--color-green-light);
  border-color: var(--color-green);
}
```

(Already partially in main.css — verify `.field-mode-tile:active` rule exists.)

---

## Part 4: Module Handlers

Each tile needs a handler that either opens a sheet directly or shows an event picker when multiple events are open.

### 4.1 Feed Animals (`handleFeed`)

**V1 behavior:** Opens `openQuickFeedSheet()`. After each delivery, returns to the event picker (not field mode home). "Done" on the event picker returns to field mode home.

```javascript
function handleFeed() {
  // Import openQuickFeedSheet or navigate to feed with sheet auto-open
  openQuickFeedSheet();
  // Feed loop: after save, QuickFeedSheet returns to event picker (§4.2 loop)
  // "Done" on event picker → navigate('#/field')
}
```

**Feed loop spec (§16.5 / §4.2):** The Quick Feed sheet already has a loop behavior — after saving a delivery, it returns to the event picker step so the user can feed the next group. The "Done" button on the event picker must check `getFieldMode()` and if true, navigate to `#/field` instead of closing normally.

### 4.2 Move Animals (`handleMove`)

**V1 behavior:** If one open event → open Move Wizard directly. If multiple → show event picker sheet.

```javascript
function handleMove() {
  const openEvents = getAll('events').filter(e => !e.dateOut);
  if (!openEvents.length) { showToast(t('fieldMode.noOpenEvents')); return; }
  if (openEvents.length === 1) {
    openMoveWizard(openEvents[0], operationId, farmId);
    return;
  }
  openFieldModePickerSheet('move', openEvents, (event) => {
    openMoveWizard(event, operationId, farmId);
  });
}
```

### 4.3 Harvest (`handleHarvest`)

**V1 behavior:** Opens `openHarvestSheet()` directly.

```javascript
function handleHarvest() {
  const opId = getAll('operations')[0]?.id;
  openHarvestSheet(opId, { fieldMode: true });
}
```

(Already works in current v2.)

### 4.4 Feed Check (`handleFeedCheck`)

**V1 behavior:** Filters to events that have feed entries (stored feed). If one → open Feed Check sheet. If multiple → show event picker.

```javascript
function handleFeedCheck() {
  const eventsWithFeed = getAll('events').filter(e => {
    if (e.dateOut) return false;
    const entries = getAll('eventFeedEntries').filter(fe => fe.eventId === e.id);
    return entries.length > 0;
  });
  if (!eventsWithFeed.length) { showToast(t('fieldMode.noStoredFeed')); return; }
  if (eventsWithFeed.length === 1) {
    openFeedCheckSheet(eventsWithFeed[0].id);
    return;
  }
  openFieldModePickerSheet('feedcheck', eventsWithFeed, (event) => {
    openFeedCheckSheet(event.id);
  });
}
```

### 4.5 Multi-Pasture Survey (`handleSurveyBulk`)

**V1 behavior:** Opens `openBulkSurveySheet()` directly.

```javascript
function handleSurveyBulk() {
  openBulkSurveySheet();
}
```

### 4.6 Single Pasture Survey (`handleSurveySingle`)

**V1 behavior:** Opens a pasture picker sheet with farm/type filters.

```javascript
function handleSurveySingle() {
  openPastureSurveyPickerSheet();
  // Picker → select location → open single survey for that location
}
```

**Note:** If `openPastureSurveyPickerSheet` doesn't exist yet in v2, this handler should open the survey workflow with a location pre-picker. May need a new picker sheet or reuse the existing survey creation flow with a location selector. **If the function doesn't exist, flag as OPEN_ITEMS and wire the tile to `navigate('#/surveys')` as an interim.**

### 4.7 Animals (`handleAnimals`)

**V1 behavior:** Navigates to the animals screen.

```javascript
function handleAnimals() {
  navigate('#/animals');
}
```

(Already works in current v2.)

### 4.8 Record Heat (`handleHeat`)

**V1 behavior:** Opens a heat picker sheet — 2-step flow: animal picker (female-filtered, group-filtered to active events), then heat recording form.

```javascript
function handleHeat() {
  openHeatPickerSheet();
  // Step 1: pick animal (female only, filtered to groups on active events)
  // Step 2: heat recording form
  // After save → navigate('#/field')
}
```

**Note:** If `openHeatPickerSheet` doesn't exist in v2, this needs a new sheet. V1 has a dedicated heat picker with group/event filters and search. The sheet has two steps: animal selection and heat recording. **If the function doesn't exist, this is the largest new-build item in SP-8. Flag with implementation notes.**

---

## Part 5: Event Picker Sheet (Shared)

Several handlers (Move, Feed Check, Heat-fallback) need an event picker when multiple open events exist. V1 has separate picker sheets for each. V2 should use a **shared picker pattern**.

### Shared Picker Sheet

```javascript
function openFieldModePickerSheet(type, events, onSelect) {
  // Render a sheet with a list of events
  // Each row: location name, group names, tap to select
  // Field mode sheet treatment: no backdrop close, "⌂ Done" button, full-screen mobile
  // onSelect(event) → close sheet → call the handler
  // "Done" → close sheet → navigate('#/field')
}
```

**Row layout (v1 reference):**

```
┌────────────────────────────────────────────┐
│  📍 North Pasture                          │
│  Cow-Calf Herd · Culls                     │
└────────────────────────────────────────────┘
```

**Row HTML (v1):**
```html
<div style="padding:12px;background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--radius);cursor:pointer;margin-bottom:6px;">
  <div style="font-size:14px;font-weight:600;">{locationName}</div>
  <div style="font-size:12px;color:var(--text2);">{groupNames}</div>
</div>
```

---

## Part 6: Sheet Behavior in Field Mode

### Problem

V2 spec (§16.3) requires field mode sheets to: expand to full-screen on mobile, disable backdrop close, hide the sheet handle, show "⌂ Done" instead of ✕. Currently only partially wired.

### Fix

Add field-mode-aware logic to the sheet open pattern. When `getFieldMode()` is true:

1. **Full-screen on mobile** — already in CSS: `body.field-mode .sheet-panel { border-radius: 0; max-height: 100vh; }`
2. **Backdrop close disabled** — when opening any sheet, check field mode and skip backdrop click handler
3. **Sheet handle hidden** — CSS: `body.field-mode .sheet-handle { display: none; }`
4. **"Done" button** — sheets already have close buttons; in field mode, relabel to "⌂ Done"
5. **After save → field mode home** — sheet save handlers check `getFieldMode()` and navigate to `#/field` instead of normal close behavior

**CSS additions:**

```css
body.field-mode .sheet-handle {
  display: none;
}

body.field-mode .sheet-backdrop {
  pointer-events: none;  /* or remove onclick in JS */
}
```

**JS pattern for sheet openers:**

```javascript
// In each sheet open function:
const isFieldMode = getFieldMode();
if (isFieldMode) {
  // Disable backdrop close
  backdrop.onclick = null;
  // Update close button text
  closeBtn.textContent = '⌂ Done';
}
```

---

## Part 7: Active Events Section (Expandable Cards)

### Problem

V2 shows simple event cards with basic info. V1 has a collapsed/expandable pattern — collapsed shows a compact row, tapping expands to show the full location card with a teal border.

### Fix

Add expand/collapse behavior to the events section in `renderActiveEvents()`.

**Collapsed row (v1 reference):**

```html
<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border:0.5px solid var(--border);border-radius:10px;margin-bottom:6px;">
  <!-- Green/gray accent bar -->
  <div style="width:4px;border-radius:2px;flex-shrink:0;align-self:stretch;background:var(--green);height:36px;"></div>
  <!-- Content -->
  <div style="flex:1;">
    <div style="display:flex;gap:6px;">
      <span style="font-size:13px;font-weight:500;">🌿 {locationName}</span>
      <span style="font-size:10px;color:var(--text2);">{acres} ac</span>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:2px;">{groupNames} · Day {N}{submoveLine}</div>
  </div>
  <!-- Move button -->
  <button class="btn btn-teal btn-sm" style="padding:3px 8px;">Move all</button>
  <!-- Expand chevron -->
  <div style="font-size:14px;color:var(--text3);">›</div>
</div>
```

**Expanded state:** Full location card wrapped in teal border with a collapse `⌃` handle.

**State:** Track `expandedEventId` in module scope. Tapping a row toggles it. Only one expanded at a time.

---

## Part 8: Tasks Section (Interactive)

### Problem

V2 tasks section is a read-only list. V1 has interactive checkboxes, due date color coding (overdue = red, today = amber), and an "+ Add" button.

### Fix

Update `renderTasks()` to match v1:

**Task row (v1 reference):**

```html
<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg);border:0.5px solid var(--border);border-radius:10px;margin-bottom:6px;">
  <!-- Checkbox -->
  <div style="width:18px;height:18px;border-radius:4px;border:1.5px solid var(--border2);flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;"
    onclick="completeTodo(todoId)"></div>
  <!-- Content -->
  <div style="flex:1;cursor:pointer;" onclick="openTodoSheet(todoId)">
    <div style="font-size:13px;">{title}</div>
    <div style="font-size:11px;color:{dueColor};">{dueLabel}</div>
  </div>
</div>
```

**Due date logic:**
- Overdue: `color: var(--color-red)`, text: `Overdue · {date}`
- Due today: `color: var(--color-amber)`, text: `Due today`
- Future: `color: var(--text3)`, text: `Due {date}`
- No due date: no sub-line

**"+ Add" button:** Top-right of section header, opens todo sheet.

**Complete action:** Mark todo as closed (`status: 'closed'`, `closedAt: now()`), update via store, re-render.

**Limit:** Show up to 4 open todos (v1 pattern). If more exist, show a "View all" link to `#/todos`.

---

## Part 9: Field Mode Sub-heading on Home Screen

V1 shows a brief heading at the top of the field mode home:

```
Field mode
Tap to log. Use ← Detail in the header to return to the full app.
```

V2 should render the same. The heading text lives in i18n:

```json
"fieldMode": {
  "homeTitle": "Field mode",
  "homeHint": "Tap to log. Use ← Detail in the header to return to the full app."
}
```

---

## Acceptance Criteria

### Part 1: Header pill
- [ ] Green field-mode-header bar is removed from field mode home screen
- [ ] Header pill shows "⊞ Field" when not in field mode (outline style)
- [ ] Header pill shows "← Detail" when on `#/field` (green style, exits field mode)
- [ ] Header pill shows "⌂ Home" when in field mode on any other route (green style, returns to `#/field`)
- [ ] Pill text updates correctly on every route change
- [ ] `body.field-mode` class applied/removed when entering/exiting
- [ ] Desktop sidebar, bottom nav, feedback sub-row, build stamp hidden in field mode
- [ ] Desktop grid collapses to single column when sidebar hidden

### Part 2: Settings
- [ ] Settings screen shows "Field Mode Modules" card in the preferences section
- [ ] All 8 modules listed with icon, label, and toggle button
- [ ] Toggle On/Off states match v1 styling (green pill = on, gray outline = off)
- [ ] Toggling a module updates `fieldModeQuickActions` in `user_preferences` via the store
- [ ] Default set (`['feed', 'harvest', 'surveybulk', 'animals']`) used when `fieldModeQuickActions` is null
- [ ] Changes immediately reflected on field mode home screen

### Part 3: Tile grid
- [ ] Tile grid driven by `FIELD_MODULES` constant filtered by user preferences
- [ ] All 8 module tiles render correctly when enabled
- [ ] Touch feedback (green highlight on tap) works on mobile
- [ ] "No modules active" message shown when all are disabled
- [ ] Tiles use i18n keys (not hardcoded English)

### Part 4: Module handlers
- [ ] Feed tile opens Quick Feed sheet with feed loop (returns to event picker after each delivery)
- [ ] Move tile opens Move Wizard (single event) or event picker (multiple events)
- [ ] Harvest tile opens Harvest sheet
- [ ] Feed Check tile opens Feed Check sheet with event picker (filtered to events with feed entries)
- [ ] Multi-Pasture Survey opens Bulk Survey sheet
- [ ] Single Pasture Survey opens pasture picker (or interim fallback to `#/surveys`)
- [ ] Animals tile navigates to `#/animals`
- [ ] Record Heat opens heat picker sheet (or interim fallback if sheet doesn't exist)
- [ ] All handlers show toast when no applicable events exist

### Part 5: Event picker sheet
- [ ] Shared picker sheet renders event rows (location name, group names)
- [ ] Field mode sheet treatment applied (no backdrop close, "⌂ Done", full-screen mobile)
- [ ] Selection calls the appropriate handler and closes the sheet

### Part 6: Sheet behavior
- [ ] All sheets in field mode expand to full-screen on mobile
- [ ] Backdrop tap-to-close disabled in field mode
- [ ] Sheet handle hidden in field mode
- [ ] Close buttons show "⌂ Done" in field mode
- [ ] After save, sheets navigate to `#/field` (not the originating screen)

### Part 7: Events section
- [ ] Collapsed event rows show accent bar, location name, acreage, group names, day count, submove line
- [ ] Tapping a row expands it (full card with teal border)
- [ ] Only one event expanded at a time
- [ ] "Move all" button on collapsed rows opens Move Wizard
- [ ] Collapse handle (⌃) on expanded card

### Part 8: Tasks section
- [ ] Up to 4 open todos shown with interactive checkboxes
- [ ] Due date color coding: overdue = red, today = amber, future = neutral
- [ ] "+ Add" button opens todo sheet
- [ ] Checking a checkbox marks todo as closed
- [ ] "View all" link shown when more than 4 todos exist

### Part 9: Home sub-heading
- [ ] "Field mode" title and hint text rendered at top of home screen
- [ ] Text uses i18n keys

---

## v1 Code Reference

### FIELD_MODULES array (v1 lines 5163–5181)

```javascript
const FIELD_MODULES = [
  { key:'feed',      icon:'🌾', label:'Feed Animals',  handler:()=>{
    if(document.body.classList.contains('field-mode')){ openQuickFeedSheet(); }
    else { nav('feed',document.getElementById('bn-feed')); setTimeout(openQuickFeedSheet,120); }
  }},
  { key:'move',      icon:'🐄', label:'Move Animals',  handler:()=>{ _fieldModeMoveHandler(); } },
  { key:'harvest',   icon:'🚜', label:'Harvest',       handler:()=>{
    if(document.body.classList.contains('field-mode')){ openHarvestSheet(); }
    else { nav('pastures',document.getElementById('bn-pastures')); setTimeout(openHarvestSheet,120); }
  }},
  { key:'feedcheck', icon:'📋', label:'Feed Check',    handler:()=>{ _fieldModeFeedCheckHandler(); } },
  { key:'surveybulk',   icon:'📋', label:'Multi-Pasture Survey',        handler:()=>{
    if(document.body.classList.contains('field-mode')){ openBulkSurveySheet(); }
    else { nav('pastures',document.getElementById('bn-pastures')); setTimeout(openBulkSurveySheet,120); }
  }},
  { key:'surveysingle', icon:'📋', label:'Pasture Survey', handler:()=>{ _fieldModePastureSurveyHandler(); } },
  { key:'animals',   icon:'🐄', label:'Animals',       handler:()=>{ nav('animals',document.getElementById('bn-animals')); } },
  { key:'heat',      icon:'🌡', label:'Record Heat',   handler:()=>{ _fieldModeHeatHandler(); } },
];
const FIELD_MODULES_DEFAULT = ['feed','harvest','surveybulk','animals'];
```

### renderFieldHome() — Tile Grid (v1 lines 5418–5434)

```javascript
const activeKeys = _getUserFieldModules();
const tiles = FIELD_MODULES.filter(m => activeKeys.includes(m.key));
const tileHTML = tiles.length
  ? tiles.map(m=>`
      <button onclick="(${m.handler.toString()})()"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;
               gap:8px;min-height:88px;border-radius:12px;
               border:1.5px solid var(--border);background:var(--bg);
               cursor:pointer;font-family:inherit;padding:14px 8px;
               -webkit-tap-highlight-color:transparent;"
        ontouchstart="this.style.background='var(--green-l)';this.style.borderColor='var(--green)';"
        ontouchend="this.style.background='var(--bg)';this.style.borderColor='var(--border)';">
        <span style="font-size:32px;line-height:1;">${m.icon}</span>
        <span style="font-size:13px;font-weight:500;color:var(--text);">${m.label}</span>
      </button>`).join('')
  : `<div style="font-size:13px;color:var(--text2);padding:16px 0;">No modules active — go to Settings ⇒ Field mode to add tiles.</div>`;
```

### renderFieldModules() — Settings Panel (v1 lines 5393–5408)

```javascript
function renderFieldModules(){
  const el = document.getElementById('field-modules-list');
  if(!el) return;
  const active = _getUserFieldModules();
  el.innerHTML = FIELD_MODULES.map(m=>{
    const on = active.includes(m.key);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--border);">
      <span style="font-size:14px;">${m.icon} ${m.label}</span>
      <button onclick="toggleFieldModule('${m.key}')"
        style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
               border:1.5px solid ${on?'var(--green)':'var(--border2)'};
               background:${on?'var(--green)':'transparent'};
               color:${on?'white':'var(--text2)'};">${on?'✓ On':'Off'}</button>
    </div>`;
  }).join('');
}
```

### Module Persistence (v1 lines 5365–5385)

```javascript
function _getUserFieldModules(){
  const c = _sbLoadCachedIdentity();
  if(c && Array.isArray(c.fieldModules)){
    return c.fieldModules.map(k => k === 'survey' ? 'surveybulk' : k);
  }
  return FIELD_MODULES_DEFAULT;
}

function _setUserFieldModules(keys){
  const c = _sbLoadCachedIdentity();
  if(c === null) return;
  localStorage.setItem('gthy-identity', JSON.stringify({...c, fieldModules: keys}));
  if(_sbClient && _sbOperationId && _sbSession){
    _sbClient.from('operation_members')
      .update({field_modules: keys})
      .eq('operation_id', _sbOperationId)
      .eq('user_id', _sbSession.user.id)
      .then(({error}) => { if(error) logError('field-modules', error.message, ''); });
  }
}
```

### Move Handler (v1 lines 5185–5218)

```javascript
function _fieldModeMoveHandler(){
  const rows=[];
  S.events.filter(e=>e.status==='open').forEach(ev=>{
    const padName=evDisplayName(ev);
    const grpNames=evGroups(ev).filter(g=>!g.dateRemoved).map(g=>{
      const grp=getGroupById(g.groupId);return grp?grp.name:'';
    }).filter(Boolean).join(', ');
    rows.push({eventId:ev.id, paddockName:padName, groupNames:grpNames});
  });
  if(!rows.length){ alert('No open events to move from.'); return; }
  if(rows.length===1){ openMoveWizSheet(rows[0].eventId, null, true); return; }
  openMovePickerSheet(rows);
}
```

### Feed Check Handler (v1 lines 5221–5254)

```javascript
function _fieldModeFeedCheckHandler(){
  const rows=[];
  S.events.filter(e=>e.status==='open'&&allFeedEntries(e).length>0).forEach(ev=>{
    const padName=evDisplayName(ev);
    const grpNames=evGroups(ev).filter(g=>!g.dateRemoved).map(g=>{
      const grp=getGroupById(g.groupId);return grp?grp.name:'';
    }).filter(Boolean).join(', ');
    rows.push({eventId:ev.id, paddockName:padName, groupNames:grpNames});
  });
  if(!rows.length){ alert('No groups with stored feed to check.'); return; }
  if(rows.length===1){ openFeedCheckSheet(rows[0].eventId); return; }
  openFeedCheckPickerSheet(rows);
}
```

### Heat Handler (v1 lines 12945–12967)

```javascript
function _fieldModeHeatHandler(){ openHeatPickerSheet(); }

function openHeatPickerSheet(){
  _hpEventFilter='all';
  _hpGroupFilter='all';
  document.getElementById('hp-search').value='';
  _hpRenderFilters();
  _hpFilterAnimals();
  document.getElementById('hp-step1').style.display='block';
  document.getElementById('hp-step2').style.display='none';
  const isField=document.body.classList.contains('field-mode');
  const wrap=document.getElementById('heat-picker-wrap');
  const backdrop=wrap.querySelector('.sheet-backdrop');
  const handle=wrap.querySelector('.sheet-handle');
  const closeBtn=wrap.querySelector('.sheet-close');
  if(backdrop) backdrop.onclick=isField?null:closeHeatPickerSheet;
  if(handle) handle.style.display=isField?'none':'';
  if(closeBtn) closeBtn.textContent=isField?'\u2302 Done':'\u2715';
  wrap.classList.add('open');
}
```

### Field Mode Toggle & Activation (v1 lines 19737–19827)

```javascript
function setFieldModeUI(active){
  const btn = document.getElementById('field-mode-toggle');
  if(!btn) return;
  if(!active){
    btn.textContent = '⊞ Field';
    btn.title = 'Switch to field mode';
    btn.onclick = toggleFieldMode;
    return;
  }
  _updateFieldModeBtn();
}

function _updateFieldModeBtn(){
  const btn = document.getElementById('field-mode-toggle');
  if(!btn) return;
  if(!document.body.classList.contains('field-mode')) return;
  const onHome = (typeof curScreen !== 'undefined' && curScreen === 'home');
  if(onHome){
    btn.textContent = '← Detail';
    btn.title = 'Exit field mode';
    btn.onclick = toggleFieldMode;
  } else {
    btn.textContent = '⌂ Home';
    btn.title = 'Back to field home';
    btn.onclick = _fieldModeGoHome;
  }
}

function _fieldModeGoHome(){
  nav('home', document.getElementById('bn-home'));
}

function toggleFieldMode(){
  const isActive = document.body.classList.contains('field-mode');
  const willBeActive = !isActive;
  const user = getActiveUser ? getActiveUser() : null;
  if(user){
    user.fieldMode = willBeActive;
    save();
  }
  document.body.classList.toggle('field-mode', willBeActive);
  setFieldModeUI(willBeActive);
  if(willBeActive){
    nav('home', document.getElementById('bn-home'));
  } else {
    nav('home', document.getElementById('bn-home'));
  }
  renderCurrentScreen();
}
```

### Field Mode CSS (v1 lines 459–519)

```css
#field-mode-toggle{display:none;}

body.field-mode .dsk-sidebar{display:none !important;}
body.field-mode .bnav{display:none !important;}
body.field-mode #sync-indicator{display:none !important;}
body.field-mode #ver-tag{display:none !important;}
body.field-mode .hdr-sub{display:none !important;}
body.field-mode .fab{display:none !important;}
body.field-mode #field-mode-toggle{
  display:inline-flex !important;
  align-items:center;
  gap:4px;
  font-size:12px;
  font-weight:600;
  color:var(--green-d);
  text-decoration:none;
  background:transparent;
  border:1px solid var(--green);
  border-radius:var(--radius);
  padding:4px 9px;
  cursor:pointer;
  font-family:inherit;
  flex-shrink:0;
  white-space:nowrap;
}

body.field-mode.desktop .app{
  grid-template-columns:1fr;
  grid-template-areas:
    "header"
    "content";
}
body.field-mode.desktop .hdr{
  border-left:none;
}

body:not(.field-mode) #field-mode-toggle{
  display:inline-flex !important;
  align-items:center;
  gap:4px;
  font-size:12px;
  font-weight:600;
  color:var(--text2);
  text-decoration:none;
  background:transparent;
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:4px 9px;
  cursor:pointer;
  font-family:inherit;
  flex-shrink:0;
  white-space:nowrap;
}
```

---

## Implementation Order

1. **Header pill + body.field-mode class** (Part 1) — unblocks everything else
2. **FIELD_MODULES constant + dynamic tile grid** (Part 3) — core rendering
3. **Module handlers: Feed, Harvest, Animals, Bulk Survey** (Part 4) — already partially working, just re-wire
4. **Event picker sheet** (Part 5) — needed by Move, Feed Check, Heat
5. **Module handlers: Move, Feed Check** (Part 4.2, 4.4) — depend on picker sheet
6. **Settings card** (Part 2) — module customization
7. **Events section expandable cards** (Part 7)
8. **Tasks section interactive** (Part 8)
9. **Sheet behavior in field mode** (Part 6) — cross-cutting, touch all sheets
10. **Module handlers: Single Survey, Heat** (Part 4.6, 4.8) — may need new sheets
11. **Feed loop behavior** (Part 4.1) — requires changes in Quick Feed sheet's save handler

---

## Dependencies

- **Quick Feed sheet** (`openQuickFeedSheet`) — must exist and support feed loop return behavior
- **Move Wizard** (`openMoveWizard`) — must be callable from field mode
- **Feed Check sheet** (`openFeedCheckSheet`) — must exist
- **Bulk Survey sheet** (`openBulkSurveySheet`) — must exist
- **Harvest sheet** (`openHarvestSheet`) — already wired
- **Todo sheet** (`openTodoSheet`) — must exist for task tap and "+ Add"
- **Heat picker sheet** — may not exist in v2 yet (check before implementing)
- **Single Pasture Survey picker** — may not exist in v2 yet (check before implementing)

---

## Open Questions (flag if encountered during implementation)

1. Does `openHeatPickerSheet` exist in v2? If not, the Record Heat tile needs a new sheet built.
2. Does `openPastureSurveyPickerSheet` exist in v2? If not, the Single Survey tile needs a new picker.
3. Does the Quick Feed sheet's save handler support the feed loop (return to event picker)? If not, this needs wiring.
4. Does the todo sheet (`openTodoSheet`) exist for the "+ Add" flow? Check `src/features/todos/`.
