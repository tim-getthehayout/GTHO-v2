# Animals Screen — V1 Parity UI Rebuild

**Priority:** P1
**Area:** v2-build / UI sprint
**Files:** `src/features/animals/index.js`, `src/styles/main.css`
**Labels:** `ui`, `v1-parity`, `sprint`
**Schema impact:** None — visual/interaction only
**CP-55/CP-56 impact:** None

---

## Overview

The v2 Animals screen was built from prose specs and has very little visual resemblance to v1. This spec provides the exact v1 HTML patterns and CSS for each component. The v2 implementation should match v1's layout, spacing, and interaction patterns while using v2's DOM builder (`el()`, `text()`, `clear()`).

**Consolidation note:** v1 shares containers where it makes sense — Add/Edit animal use the same sheet, and Note/Treatment/Breeding/BCS use one unified event sheet. Preserve this pattern in v2.

**Rule:** Do NOT use innerHTML. Translate all HTML patterns below into `el()` / `text()` DOM builder calls. The HTML is provided as a visual spec, not as code to paste.

---

## Part 1: Shared CSS — Design Tokens and Base Classes

These CSS values from v1 must be present in v2's `main.css`. Check each one and add/fix as needed.

### 1A: CSS Custom Properties

```css
:root {
  --green: #639922; --green-d: #3B6D11; --green-l: #EAF3DE; --green-l2: #97C459;
  --amber: #BA7517; --amber-d: #854F0B; --amber-l: #FAEEDA;
  --teal: #1D9E75; --teal-d: #0F6E56; --teal-l: #E1F5EE;
  --purple: #534AB7; --purple-l: #EEEDFE; --purple-d: #3C3489;
  --red: #E24B4A; --red-l: #FCEBEB; --red-d: #A32D2D;
  --blue: #185FA5; --blue-l: #E6F1FB; --blue-d: #0C447C;
  --bg: #ffffff; --bg2: #f5f5f3; --bg3: #eeede9;
  --text: #1a1a18; --text2: #6b6b67; --text3: #9c9a94;
  --border: rgba(0,0,0,0.12); --border2: rgba(0,0,0,0.2);
  --radius: 8px; --radius-l: 12px; --radius-xl: 16px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a18; --bg2: #242420; --bg3: #2c2c28;
    --text: #e8e6de; --text2: #9c9a92; --text3: #6b6b67;
    --border: rgba(255,255,255,0.1); --border2: rgba(255,255,255,0.18);
    --green-l: #1a2e0a; --amber-l: #2e1e00; --teal-l: #002e20;
    --purple-l: #1a1840; --red-l: #2e0a0a; --blue-l: #001830;
  }
}
```

### 1B: Button Classes

```css
.btn { display: block; width: 100%; padding: 12px; border: none; border-radius: var(--radius);
       font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; text-align: center; }
.btn:active { opacity: 0.82; }
.btn-green { background: var(--green); color: white; }
.btn-amber { background: var(--amber); color: white; }
.btn-teal { background: var(--teal); color: white; }
.btn-blue { background: var(--blue); color: white; }
.btn-red { background: var(--red); color: white; }
.btn-outline { background: transparent; color: var(--text); border: 0.5px solid var(--border2); }
.btn-sm { display: inline-block; width: auto; padding: 7px 16px; font-size: 13px; }
.btn-xs { display: inline-block; width: auto; padding: 4px 10px; font-size: 12px; }
```

### 1C: Badge Classes

```css
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.bg { background: var(--green-l); color: var(--green-d); }
.ba { background: var(--amber-l); color: var(--amber-d); }
.bt { background: var(--teal-l); color: var(--teal-d); }
.bp { background: var(--purple-l); color: var(--purple-d); }
.br { background: var(--red-l); color: var(--red-d); }
.bb { background: var(--bg2); color: var(--text2); border: 0.5px solid var(--border); }
```

### 1D: Card, Section, Empty, Progress

```css
.card { background: var(--bg); border: 0.5px solid var(--border); border-radius: var(--radius-l);
        padding: 14px 16px; margin-bottom: 10px; }
.card-inset { background: var(--bg2); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 10px; }
.sec { font-size: 11px; font-weight: 600; color: var(--text2); text-transform: uppercase;
       letter-spacing: 0.06em; margin-bottom: 10px; }
.empty { text-align: center; padding: 20px 16px; color: var(--text2); font-size: 13px; line-height: 1.6; }
.prog { height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; margin-top: 4px; }
.prog-fill { height: 100%; border-radius: 3px; }
```

### 1E: Sheet Overlay (already fixed in feed-check spec — verify it matches)

```css
.sheet-wrap { display: none; position: fixed; inset: 0; z-index: 200; }
.sheet-wrap.open { display: flex; align-items: center; justify-content: center; }
.sheet-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.4); }
.sheet-panel { /* or .sheet in v1 */
  position: relative; z-index: 1; background: var(--bg);
  border-radius: var(--radius-xl); padding: 16px 16px 24px;
  width: min(92vw, 680px); max-height: 90vh; overflow-y: auto;
}
.sheet-handle { width: 36px; height: 4px; background: var(--border2);
                border-radius: 2px; margin: 0 auto 16px; }
```

---

## Part 2: Animals Screen — Main Layout

The Animals screen has a sticky filter header, config buttons, a groups card, and the animal list.

### 2A: Sticky Filter Header (`.agc-wrap`)

**CSS — add to `main.css`:**
```css
.agc-wrap { position: sticky; top: 0; z-index: 20; background: var(--bg);
            padding-bottom: 8px; margin-bottom: 4px; }
.agc-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
.agc-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
            border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer;
            border: 1px solid var(--border2); background: var(--bg2); color: var(--text2);
            white-space: nowrap; transition: background 0.15s; }
.agc-chip.active { background: var(--green); border-color: var(--green); color: white; }
.agc-chip .agc-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
```

**V1 HTML structure:**
```html
<div class="agc-wrap">
  <!-- Group filter chips -->
  <div class="agc-chips">
    <!-- "All" chip — active when no filter -->
    <span class="agc-chip active">All</span>
    <!-- One chip per group — colored dot + name -->
    <span class="agc-chip">
      <span class="agc-dot" style="background:#639922"></span>Cow-Calf Herd
    </span>
    <!-- ... more group chips ... -->
  </div>

  <!-- Search bar -->
  <div style="position:relative;">
    <input type="search" placeholder="Search by tag, EID, class…"
      style="width:100%; padding:9px 32px 9px 12px; border:0.5px solid var(--border2);
             border-radius:var(--radius); font-size:14px; background:var(--bg);
             color:var(--text); font-family:inherit; box-sizing:border-box;" />
    <span id="animals-search-clear"
      style="display:none; position:absolute; right:10px; top:50%;
             transform:translateY(-50%); cursor:pointer; font-size:16px;
             color:var(--text2); line-height:1;">×</span>
  </div>

  <!-- Secondary controls row -->
  <div style="display:flex; gap:8px; align-items:center; margin-top:7px;">
    <label style="display:flex; align-items:center; gap:6px; font-size:12px;
                  color:var(--text2); cursor:pointer; white-space:nowrap;">
      <input type="checkbox" style="accent-color:var(--amber);"> Show culled
    </label>
    <button class="btn btn-green btn-xs" style="white-space:nowrap; margin-left:auto;">
      + Add animal
    </button>
  </div>
</div>
```

### 2B: Config Buttons Row

```html
<div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px;">
  <button class="btn btn-outline btn-xs">🐄 Classes</button>
  <button class="btn btn-outline btn-xs">💉 Treatments</button>
  <button class="btn btn-outline btn-xs">🐂 AI Sires</button>
</div>
```

### 2C: Groups Summary Card

The groups list sits inside a `.card` with a "GROUPS" header and "+ Add group" button.

```html
<div class="card" style="margin-bottom:8px;">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
    <div class="sec" style="margin:0;">Groups</div>
    <button class="btn btn-green btn-xs">+ Add group</button>
  </div>
  <div id="groups-list">
    <!-- renderGroupsList() output goes here — see Part 3 -->
  </div>
</div>
```

### 2D: Selection Action Bar (hidden until checkboxes ticked)

```html
<div id="animals-action-bar"
  style="display:none; position:sticky; top:0; z-index:30; background:var(--green);
         color:white; padding:10px 14px; border-radius:var(--radius); margin-bottom:10px;">
  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
    <div style="font-size:13px; font-weight:600;">0 selected</div>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      <button class="btn btn-sm"
        style="background:white; color:var(--green-d); padding:6px 12px;">Move to group</button>
      <button class="btn btn-sm"
        style="background:white; color:var(--green-d); padding:6px 12px;">New group</button>
      <button class="btn btn-sm"
        style="background:transparent; border:1px solid rgba(255,255,255,0.5);
               color:white; padding:6px 12px;">Cancel</button>
    </div>
  </div>
</div>
```

---

## Part 3: Groups List (inside card)

**⚠️ V2 GROUP ROWS ARE INCOMPLETE.** The v2 group card only has Edit and Delete buttons. V1 has Edit, Split, Weights, and × (archive/delete). The Split button is conditionally shown (only when the group has an active event). The Weights button opens a group weigh sheet. Both are **missing entirely** from v2.

Each group row is a `.chip`-style div with a 3px left color bar. Clicking the row filters the animal list by that group.

**V1 HTML per group row:**
```html
<div style="border-left:3px solid #639922; margin-bottom:6px; cursor:pointer;
            padding:10px 12px; /* inherited from .chip */">
  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
    <div>
      <!-- Group name + status badge -->
      <div style="font-size:14px; font-weight:600;">
        Cow-Calf Herd
        <span class="badge bt">active · J2</span>
        <!-- OR if unplaced: <span class="badge bb">unplaced</span> -->
      </div>
      <!-- Sex breakdown -->
      <div style="font-size:12px; color:var(--text2); margin-top:2px;">29 female, 2 male</div>
      <!-- Stats line -->
      <div style="font-size:12px; color:var(--text2);">
        31 head · avg 1137 lbs · DMI target 882 lbs/day
      </div>
    </div>
    <!-- Action buttons -->
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="btn btn-outline btn-xs">Edit</button>
      <button class="btn btn-outline btn-xs">Split</button>  <!-- only if group has active event -->
      <button class="btn btn-outline btn-xs">Weights</button>
      <button style="border:none; background:transparent; color:var(--text2);
                     cursor:pointer; font-size:18px; padding:2px 4px;">×</button>
    </div>
  </div>
</div>
```

**Key behaviors:**
- Clicking the group row toggles the animal list filter to show only that group's animals
- When a group filter is active, that row gets `background:var(--green-l)` and shows a `✕ clear filter` badge
- Split button only appears when the group has an active event
- × button calls the archive/delete logic
- All action buttons use `event.stopPropagation()` to prevent triggering the filter

---

## Part 4: Animal List

### 4A: Sort Header Row

```html
<div style="display:flex; gap:10px; padding:4px 0 6px;
            border-bottom:0.5px solid var(--border); font-size:11px;">
  <div style="width:22px; flex-shrink:0;"></div>  <!-- checkbox column spacer -->
  <div style="flex:1;">
    <span style="cursor:pointer; color:var(--green); font-weight:600;">Tag / ID ↑</span>
    ·
    <span style="cursor:pointer; color:var(--text2); font-weight:400;">Class</span>
    ·
    <span style="cursor:pointer; color:var(--text2); font-weight:400;">Group</span>
  </div>
  <div style="display:flex; align-items:center; gap:6px;">
    <span style="cursor:pointer; color:var(--text2); font-weight:400;">Weight</span>
    <div style="width:24px;"></div>  <!-- spacer -->
  </div>
</div>
```

**Sort behavior:**
- Active sort column gets `color:var(--green); font-weight:600`
- Inactive columns get `color:var(--text2); font-weight:400`
- Clicking a column toggles ascending ↑ / descending ↓
- Default sort: Tag ascending

### 4B: Individual Animal Row

```html
<div style="padding:8px 0; border-bottom:0.5px solid var(--border); opacity:1;">
  <!-- opacity:0.5 if culled -->
  <div style="display:flex; align-items:center; gap:10px;">

    <!-- Checkbox for multi-select -->
    <div style="width:22px; height:22px; border-radius:6px;
                border:1.5px solid var(--border2); background:transparent;
                display:flex; align-items:center; justify-content:center;
                flex-shrink:0; cursor:pointer;">
      <!-- When selected: border-color:var(--green); background:var(--green);
           plus white check SVG inside -->
    </div>

    <!-- Main info — taps to open edit -->
    <div style="flex:1; min-width:0; cursor:pointer;">
      <div style="font-size:13px; font-weight:600;">
        1                                                 <!-- tag number -->
        <span style="font-size:11px; color:var(--text2); font-weight:400;">♀</span>
        <!-- Optional badges inline: -->
        <span class="badge bt" style="font-size:10px;">J2</span>           <!-- location -->
        <span class="badge" style="font-size:10px; background:var(--teal-l);
              color:var(--teal); border-radius:4px; padding:1px 5px;">✓ bred</span>
        <!-- Todo badge if any open todos: -->
        <span class="badge" style="font-size:10px; background:var(--amber-l);
              color:var(--amber-d); border-radius:4px; padding:1px 5px;">📋 2</span>
      </div>
      <div style="font-size:11px; color:var(--text2);">No class · Cow-Calf Herd</div>
    </div>

    <!-- Weight -->
    <div style="text-align:right; flex-shrink:0; display:flex; align-items:center; gap:6px;">
      <div style="cursor:pointer;">
        <div style="font-size:13px; font-weight:600;">1250 lbs</div>
      </div>
    </div>
  </div>

  <!-- Quick-action buttons -->
  <div style="display:flex; gap:5px; margin-top:5px; margin-left:30px; flex-wrap:wrap;">
    <button class="btn btn-outline btn-xs">Edit</button>
    <button class="btn btn-outline btn-xs">⚖ Weight</button>
    <button class="btn btn-outline btn-xs">📝 Note</button>
    <button class="btn btn-outline btn-xs">💉 Treatment</button>
    <!-- Female only: -->
    <button class="btn btn-outline btn-xs">♀ Breeding</button>
    <button class="btn btn-outline btn-xs">📊 BCS</button>
    <button class="btn btn-outline btn-xs"
      style="border-color:var(--amber); color:var(--amber-d);">📋 Todo</button>
  </div>
</div>
```

**Key behaviors:**
- Checkbox toggles multi-select (green fill + white check SVG when selected)
- Preserve scroll position when toggling selection (save scrollTop before re-render, restore after)
- Culled animals: `opacity:0.5`, hidden unless "Show culled" is checked
- Empty state: `<div class="empty">No animals match this filter</div>`
- Breeding button only shown for females
- Todo button styled with amber border to stand out

---

## Part 5: Config Sheets

### 5A: Classes Manager Sheet

Opens from the 🐄 Classes config button. Lists all classes with inline edit/delete, plus an add form at the bottom.

```html
<div class="sheet-wrap" id="manage-classes-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>

    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div style="font-size:16px; font-weight:600;">Animal classes</div>
      <div style="font-size:12px; color:var(--text2);">Weight and DMI defaults per class</div>
    </div>

    <!-- Classes list — dynamically populated -->
    <div id="mc-classes-list" style="margin-bottom:12px;">
      <!-- Each class row: -->
      <div style="display:flex; justify-content:space-between; align-items:center;
                  padding:7px 0; border-bottom:0.5px solid var(--border); font-size:13px;">
        <span>
          <strong>Cow</strong>
          <span class="badge bb">Beef cattle</span>
          <span class="badge bt">1200 lbs</span>
          <span class="badge bg">2.5% DMI</span>
        </span>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-outline btn-xs">Edit</button>
          <button style="border:none; background:transparent; color:var(--text2);
                         cursor:pointer; font-size:16px;">×</button>
        </div>
      </div>
      <!-- Archived class row has opacity:0.45, "archived" badge, "Unarchive" button -->
      <!-- Editing class row gets background:var(--green-l); margin:0 -4px; padding:7px 4px; border-radius:4px; -->
    </div>

    <div class="div"></div>

    <!-- Add/Edit form -->
    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Add class</div>
    <div class="two">
      <div class="field">
        <label>Class name *</label>
        <input type="text" placeholder="Cow, Heifer, Steer…" />
      </div>
      <div class="field">
        <label>Species</label>
        <select>
          <option>Beef cattle</option><option>Dairy cattle</option>
          <option>Sheep</option><option>Goats</option><option>Other</option>
        </select>
      </div>
    </div>
    <div class="two">
      <div class="field">
        <label>Default weight (lbs)</label>
        <input type="number" placeholder="1200" step="1" />
      </div>
      <div class="field">
        <label>DMI % of body weight</label>
        <input type="number" placeholder="2.5" step="0.1" min="0.5" max="6" />
      </div>
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button class="btn btn-green">Add class</button>
      <!-- When editing: button text changes to "Save changes", Cancel button appears -->
      <button class="btn btn-outline" style="display:none;">Cancel</button>
      <button class="btn btn-outline">Done</button>
    </div>
  </div>
</div>
```

### 5B: Treatments Manager Sheet

```html
<div class="sheet-wrap" id="manage-treatments-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div style="font-size:16px; font-weight:600;">Treatment types</div>
      <button class="btn btn-outline btn-xs">Done</button>
    </div>
    <div style="font-size:13px; color:var(--text2); margin-bottom:12px;">
      Define treatment types used when logging health events. Add a category to group related treatments.
    </div>

    <!-- Types list -->
    <div id="mt-types-list" style="margin-bottom:12px;">
      <!-- Each row: -->
      <div style="display:flex; justify-content:space-between; align-items:center;
                  padding:7px 0; border-bottom:0.5px solid var(--border);">
        <div>
          <span style="font-size:13px; font-weight:500;">💉 Vaccinate — BVD</span>
          <span class="badge bb" style="font-size:10px;">Vaccine</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-outline btn-xs">Edit</button>
          <button style="border:none; background:transparent; color:var(--text2);
                         cursor:pointer; font-size:16px; padding:0 2px;">×</button>
        </div>
      </div>
    </div>

    <div class="div"></div>

    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Add treatment type</div>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <div class="field" style="flex:2; margin:0;">
        <input type="text" placeholder="e.g. Vaccinate — BVD" />
      </div>
      <div class="field" style="flex:1; margin:0;">
        <select style="height:100%; padding:9px 8px; border:0.5px solid var(--border2);
                       border-radius:var(--radius); font-size:13px; background:var(--bg);
                       color:var(--text); font-family:inherit; width:100%;">
          <option value="">No category</option>
          <option>Vaccine</option><option>Parasite Control</option>
          <option>Antibiotic</option><option>Wound/Surgery</option>
          <option>Nutritional</option><option>Other</option>
        </select>
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-green btn-sm" style="padding:10px 16px;">Add</button>
      <button class="btn btn-outline btn-sm" style="padding:10px 16px; display:none;">Cancel</button>
    </div>
  </div>
</div>
```

### 5C: AI Sires Manager Sheet

```html
<div class="sheet-wrap" id="manage-ai-bulls-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div style="font-size:16px; font-weight:600;">AI sires</div>
      <button class="btn btn-outline btn-xs">Done</button>
    </div>
    <div style="font-size:13px; color:var(--text2); margin-bottom:12px;">
      Name and registration number are snapshotted on each breeding record so edits don't affect history.
    </div>

    <!-- Sires list -->
    <div id="mab-bulls-list" style="margin-bottom:12px;">
      <!-- Each row: -->
      <div style="display:flex; justify-content:space-between; align-items:center;
                  padding:7px 0; border-bottom:0.5px solid var(--border);">
        <div>
          <div style="font-size:13px; font-weight:600;">
            Connealy Confidence
            <span style="font-size:11px; color:var(--text2);">17760326</span>
          </div>
          <div style="font-size:11px; color:var(--text2);">Angus · CE+8 BW-1.2 WW+68</div>
        </div>
        <button style="border:none; background:transparent; color:var(--text2);
                       cursor:pointer; font-size:16px;">×</button>
      </div>
    </div>

    <div class="div"></div>

    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Add sire</div>
    <div class="two">
      <div class="field"><label>Sire name *</label>
        <input type="text" placeholder="e.g. Connealy Confidence" /></div>
      <div class="field"><label>Reg #</label>
        <input type="text" placeholder="e.g. 17760326" /></div>
    </div>
    <div class="two">
      <div class="field"><label>Breed</label>
        <input type="text" placeholder="e.g. Angus" /></div>
      <div class="field"><label>EPDs</label>
        <input type="text" placeholder="e.g. CE+8 BW-1.2 WW+68" /></div>
    </div>
    <div class="field"><label>Notes</label>
      <input type="text" placeholder="Tank location, straw count, etc." /></div>
    <button class="btn btn-green btn-sm" style="width:auto; padding:10px 20px;">Add sire</button>
  </div>
</div>
```

---

## Part 6: Group Sheets

### 6A: Add / Edit Group Sheet (shared container)

**⚠️ V2 IS INCOMPLETE.** Compare v1 vs v2:

| Section | V1 | V2 (current) |
|---|---|---|
| Layout | ✅ Two-column: name field + color swatches side by side (`.two`) | ❌ Single-column: name full-width, color below |
| Color picker | ✅ Inline with name field in same row | ❌ Below name in separate row |
| Animals in group section | ✅ "Animals in group" header + helper text + scrollable picker with toggle rows | ❌ **Missing entirely** |
| Animal picker rows | ✅ Green highlight + check circle when selected, dimmed (opacity:0.45) for animals in other groups, shows tag/sex/class/weight/group | ❌ **Missing entirely** |
| Delete button | ✅ Red "Delete group" button, visible only when editing | ✅ Present |

**The animal picker is critical** — without it, users can't assign animals to groups from the group sheet. The v1 picker shows all active animals, highlights selected ones in green, and dims animals already assigned to other groups.

```html
<div class="sheet-wrap" id="add-group-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel" style="max-height:90vh; overflow-y:auto;">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:12px;">Add group</div>
    <!-- Title changes to "Edit group" when editing -->

    <div class="two">
      <div class="field">
        <label>Group name</label>
        <input type="text" placeholder="Cow herd, Yearlings…" />
      </div>
      <div class="field">
        <label>Color</label>
        <div style="display:flex; gap:8px; margin-top:4px;">
          <!-- 6 color swatches: 28px circles, selected one gets border:2px solid var(--text) -->
          <div style="width:28px; height:28px; border-radius:50%; background:#639922;
                      cursor:pointer; border:2px solid var(--text);"></div>
          <div style="width:28px; height:28px; border-radius:50%; background:#1D9E75;
                      cursor:pointer; border:2px solid transparent;"></div>
          <div style="width:28px; height:28px; border-radius:50%; background:#185FA5;
                      cursor:pointer; border:2px solid transparent;"></div>
          <div style="width:28px; height:28px; border-radius:50%; background:#BA7517;
                      cursor:pointer; border:2px solid transparent;"></div>
          <div style="width:28px; height:28px; border-radius:50%; background:#E24B4A;
                      cursor:pointer; border:2px solid transparent;"></div>
          <div style="width:28px; height:28px; border-radius:50%; background:#534AB7;
                      cursor:pointer; border:2px solid transparent;"></div>
        </div>
      </div>
    </div>

    <div class="div"></div>

    <div style="font-size:13px; font-weight:600; margin-bottom:6px;">Animals in group</div>
    <div style="font-size:12px; color:var(--text2); margin-bottom:8px;">
      Tap to add/remove animals. Unassigned animals shown.
    </div>

    <!-- Animal picker — scrollable list of toggle rows -->
    <div style="max-height:220px; overflow-y:auto; margin-bottom:10px;">
      <!-- Each animal pick row: -->
      <div style="display:flex; align-items:center; gap:8px; padding:6px 8px;
                  background:var(--bg2); border-radius:var(--radius); margin-bottom:4px;
                  cursor:pointer; border:0.5px solid var(--border);">
        <!-- When selected: background:var(--green-l); border-color:var(--green-l2) -->
        <div style="width:16px; height:16px; border-radius:50%;
                    border:1.5px solid var(--border2); background:transparent;
                    display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <!-- When selected: border-color:var(--green); background:var(--green); + white check SVG -->
        </div>
        <div style="flex:1; font-size:13px;">
          <strong>T-001</strong>
          <span style="color:var(--text2); font-size:11px;">female · Cow · 1200 lbs</span>
        </div>
      </div>
      <!-- Animals in OTHER groups get opacity:0.45 -->
    </div>

    <div class="btn-row" style="margin-top:12px;">
      <button class="btn btn-green">Save group</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
    <!-- Delete button — only visible when editing -->
    <div style="display:none; margin-top:8px;">
      <button class="btn btn-red btn-sm" style="width:auto;">Delete group</button>
    </div>
  </div>
</div>
```

### 6B: Split Group Sheet

**⚠️ ENTIRELY MISSING FROM V2.** There is no split functionality anywhere in `src/features/animals/`. The entire sheet — animal picker, destination choice (new group vs existing), color picker, placement option, preview card — must be built from scratch. This is a new sheet, not a restyle.

```html
<div class="sheet-wrap" id="split-sheet-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel" style="max-height:92vh; overflow-y:auto;">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:2px;">Split group</div>
    <div style="font-size:12px; color:var(--text2); margin-bottom:14px;">
      Cow-Calf Herd · 31 head · at J2
    </div>

    <!-- Date / time -->
    <div class="two" style="margin-bottom:12px;">
      <div class="field"><label>Split date</label><input type="date" /></div>
      <div class="field">
        <label>Time <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="time" />
      </div>
    </div>

    <!-- Animal picker (same pattern as group sheet) -->
    <div style="font-size:13px; font-weight:600; margin-bottom:6px;">Animals to split off</div>
    <div style="font-size:11px; color:var(--text2); margin-bottom:8px;">Tap to select individual animals.</div>
    <div style="max-height:200px; overflow-y:auto; margin-bottom:12px;">
      <!-- Same toggle-row pattern as Part 6A animal picker -->
    </div>

    <!-- Destination radio choice -->
    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Where are these animals going?</div>
    <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
      <label style="display:flex; align-items:center; gap:8px; padding:10px 12px;
                    border:0.5px solid var(--border); border-radius:var(--radius); cursor:pointer;">
        <input type="radio" name="split-dest" value="new" checked
               style="accent-color:var(--green);" />
        <span style="font-size:13px;">New group</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px; padding:10px 12px;
                    border:0.5px solid var(--border); border-radius:var(--radius); cursor:pointer;">
        <input type="radio" name="split-dest" value="existing"
               style="accent-color:var(--green);" />
        <span style="font-size:13px;">Existing group</span>
      </label>
    </div>

    <!-- New group fields (shown when "New group" selected) -->
    <div id="split-new-fields">
      <div class="two">
        <div class="field"><label>New group name</label>
          <input type="text" placeholder="e.g. Dry cows, Yearlings…" /></div>
        <div class="field"><label>Color</label>
          <!-- Same 6-color swatch picker as Part 6A --></div>
      </div>
      <div class="field">
        <label>Placement after split</label>
        <select>
          <option value="same">Same location as source group</option>
          <option value="unplaced">Unplaced — place later via Move</option>
        </select>
      </div>
    </div>

    <!-- Existing group fields (shown when "Existing group" selected) -->
    <div id="split-existing-fields" style="display:none;">
      <div class="field"><label>Move into group</label>
        <select><option value="">— select group —</option></select>
      </div>
      <div style="display:none; font-size:12px; padding:8px 10px; background:var(--teal-l);
                  border-radius:var(--radius); color:var(--teal-d); margin-top:4px;">
        <!-- Info about destination group's active event -->
      </div>
    </div>

    <!-- Preview card (appears when animals are selected) -->
    <div style="display:none; margin-top:12px;" class="card-inset">
      <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:var(--text2);">After split</div>
      <!-- Two summary blocks with 3px left color bar showing remaining vs split groups -->
      <div style="padding:8px 10px; background:var(--bg2); border-radius:var(--radius);
                  border-left:3px solid #639922;">
        <div style="font-size:12px; font-weight:600;">Cow-Calf Herd (remaining)</div>
        <div style="font-size:11px; color:var(--text2);">28 head · avg 1150 lbs · 820 lbs DMI/day</div>
      </div>
      <div style="text-align:center; font-size:18px; padding:4px 0; color:var(--text2);">↓</div>
      <div style="padding:8px 10px; background:var(--bg2); border-radius:var(--radius);
                  border-left:3px solid #1D9E75;">
        <div style="font-size:12px; font-weight:600;">New group</div>
        <div style="font-size:11px; color:var(--text2);">3 head · avg 980 lbs · 73 lbs DMI/day</div>
      </div>
    </div>

    <div class="btn-row" style="margin-top:16px;">
      <button class="btn btn-green">Confirm split</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
  </div>
</div>
```

### 6C: Group Weights Sheet

```html
<div class="sheet-wrap" id="wt-sheet-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <div style="font-size:16px; font-weight:600;">Update group weights</div>
      <button class="btn btn-green btn-sm">Commit all</button>
    </div>
    <div style="font-size:13px; color:var(--text2); margin-bottom:4px;">
      Cow-Calf Herd · 31 animals
    </div>
    <div class="field"><label>Weigh date</label><input type="date" /></div>
    <div style="font-size:12px; color:var(--text2); margin-bottom:10px;">
      Enter new weights below. Leave blank to keep current weight unchanged.
    </div>

    <!-- Animal weight rows -->
    <div>
      <div style="display:flex; align-items:center; gap:10px; padding:8px 0;
                  border-bottom:0.5px solid var(--border);">
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:600;">T-001</div>
          <div style="font-size:11px; color:var(--text2);">female · Cow</div>
        </div>
        <div style="text-align:right; font-size:12px; color:var(--text2); margin-right:4px;">
          Current:<br><strong>1250 lbs</strong>
        </div>
        <input type="number" placeholder="New wt" step="1"
          style="width:90px; padding:7px 8px; border:0.5px solid var(--border2);
                 border-radius:var(--radius); font-size:14px; background:var(--bg);
                 color:var(--text); font-family:inherit; text-align:right;" />
      </div>
    </div>

    <div class="btn-row" style="margin-top:8px;">
      <button class="btn btn-green">Commit all changes</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
  </div>
</div>
```

---

## Part 7: Animal Edit Sheet (Add + Edit share one container)

**⚠️ V2 IS SEVERELY INCOMPLETE — this is the biggest gap.** Compare v1 vs v2:

| Section | V1 | V2 (current) |
|---|---|---|
| Ear tag + EID | ✅ Two-column, full-width bordered inputs | ✅ Present but styling differs |
| Sex + Class | ✅ Two-column, full-width styled selects | ❌ Raw unstyled browser selects, not full-width |
| Current weight + Group | ✅ Two-column | ❌ Group is there, weight is there, but layout is wrong |
| Dam + Sire | ✅ Two-column (dam select + sire text input) | ❌ **Missing entirely** |
| Notes | ✅ Full-width text input | ✅ Present |
| Birth date | ✅ Full-width date input | ✅ Present but in wrong position (before notes in v2, after notes in v1) |
| Weaning toggle | ✅ Checkbox with description + conditional wean date | ❌ **Missing entirely** |
| Calving history | ✅ Section header + record list + "Record calving" button | ❌ **Missing entirely** |
| Confirmed bred toggle | ✅ Checkbox with description + conditional date | ❌ **Missing entirely** |
| Heat history | ✅ Section header + record list + "Record heat" button | ❌ **Missing entirely** |
| Weight history | ✅ Scrollable history list | ❌ **Missing entirely** |
| Treatment history | ✅ Event list with icons + Edit buttons | ❌ **Missing entirely** |
| Cull section | ✅ "Cull animal…" button or red culled banner with reactivate | ❌ **Missing entirely** |
| Button row | ✅ Save (green) + Delete (red) + Cancel (outline) | ✅ Present |

**Field order must match v1:** Ear tag/EID → Sex/Class → Weight/Group → Dam/Sire → Notes → Birth date → Weaning → Calving history → Confirmed bred → Heat history → Weight history → Treatment history → Cull → Buttons.

**All selects must be full-width styled** — not raw browser `<select>` elements. Use the same `.field > select` styling as other sheets.

```html
<div class="sheet-wrap" id="ae-sheet-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>

    <!-- Header with title + system ID display -->
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
      <div style="font-size:16px; font-weight:600;">Edit animal</div>
      <div style="font-family:Menlo,monospace; font-size:11px; color:var(--text2);
                  background:var(--bg2); padding:3px 8px; border-radius:var(--radius);">A-00042</div>
    </div>

    <!-- Ear tag + EID -->
    <div class="two">
      <div class="field"><label>Ear tag # <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="text" placeholder="T-001" /></div>
      <div class="field"><label>EID # <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="text" placeholder="840-…" /></div>
    </div>

    <!-- Sex + Class -->
    <div class="two">
      <div class="field"><label>Sex</label>
        <select><option value="female">Female</option><option value="male">Male</option></select>
      </div>
      <div class="field"><label>Class</label><select><!-- dynamic --></select></div>
    </div>

    <!-- Weight + Group -->
    <div class="two">
      <div class="field"><label>Current weight (lbs)</label><input type="number" step="1" /></div>
      <div class="field"><label>Group</label><select><!-- dynamic --></select></div>
    </div>

    <!-- Lineage -->
    <div class="two">
      <div class="field"><label>Dam <span style="font-size:10px; color:var(--text2);">mother</span></label>
        <select><option value="">— unknown —</option></select>
      </div>
      <div class="field"><label>Sire tag/name <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="text" placeholder="Bull tag or name" /></div>
    </div>

    <div class="field"><label>Notes</label><input type="text" /></div>
    <div class="field"><label>Birth date <span style="font-size:10px; color:var(--text2);">optional</span></label>
      <input type="date" /></div>

    <!-- Weaning toggle -->
    <div class="div"></div>
    <label style="display:flex; align-items:center; gap:10px; padding:8px 0; cursor:pointer;">
      <input type="checkbox" style="width:18px; height:18px; accent-color:var(--teal); flex-shrink:0;">
      <div>
        <div style="font-size:14px; font-weight:500;">Weaned</div>
        <div style="font-size:11px; color:var(--text2);">Uncheck to mark as unweaned and track in the Weaning report</div>
      </div>
    </label>
    <!-- Wean date field — shown when checked -->

    <!-- Calving history (females only) -->
    <div class="div"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div class="sec" style="margin:0;">Calving history</div>
      <button class="btn btn-teal btn-xs">+ Record calving</button>
    </div>
    <!-- Calving records list -->

    <!-- Confirmed bred toggle (females only) -->
    <div class="div"></div>
    <label style="display:flex; align-items:center; gap:10px; padding:8px 0; cursor:pointer;">
      <input type="checkbox" style="width:18px; height:18px; accent-color:var(--teal); flex-shrink:0;">
      <div>
        <div style="font-size:14px; font-weight:500;">Confirmed bred</div>
        <div style="font-size:11px; color:var(--text2);">Pregnancy check / palpation confirmed</div>
      </div>
    </label>

    <!-- Heat history (females only) -->
    <div class="div"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div class="sec" style="margin:0;">Heat history</div>
      <button class="btn btn-teal btn-xs">+ Record heat</button>
    </div>

    <!-- Weight history -->
    <div class="div"></div>
    <div class="sec" style="margin-bottom:6px;">Weight history</div>
    <div style="font-size:12px; color:var(--text2); max-height:120px; overflow-y:auto;">
      <!-- Each weight row: date left, weight+note right, border-bottom -->
    </div>

    <!-- Treatment history -->
    <div class="div"></div>
    <div class="sec" style="margin-bottom:6px;">Treatment history</div>
    <div style="font-size:13px; color:var(--text2); margin-bottom:4px;">
      <!-- Each event row: icon + title + detail + Edit button -->
      <div style="display:flex; align-items:flex-start; gap:10px; padding:8px 0;
                  border-bottom:0.5px solid var(--border);">
        <span style="font-size:16px; flex-shrink:0;">💉</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600;">Vaccinate — BVD</div>
          <div style="font-size:11px; color:var(--text2);">Apr 10, 2026 · Draxxin @ 3ml</div>
        </div>
        <button class="btn btn-outline btn-xs">Edit</button>
      </div>
    </div>

    <!-- Cull section -->
    <div style="margin-top:10px;">
      <button class="btn btn-amber btn-sm" style="width:auto;">Cull animal…</button>
      <!-- OR if already culled: red banner with reason + "Reactivate" button -->
    </div>

    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-green">Save</button>
      <button class="btn btn-red" style="width:auto; padding:12px 16px;">Delete</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
  </div>
</div>
```

---

## Part 8: Quick Weight Sheet

```html
<div class="sheet-wrap" id="animal-weight-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:4px;">Update weight</div>
    <div style="font-size:13px; color:var(--text2); margin-bottom:14px;">
      T-001 · current: 1250 lbs
    </div>

    <div class="two">
      <div class="field"><label>New weight (lbs)</label>
        <input type="number" placeholder="0" step="1" /></div>
      <div class="field"><label>Date</label><input type="date" /></div>
    </div>
    <div class="field">
      <label>Note <span style="font-size:10px; color:var(--text2);">optional</span></label>
      <input type="text" placeholder="e.g. Pre-shipping weight" />
    </div>
    <div class="btn-row" style="margin-top:12px;">
      <button class="btn btn-green">Save weight</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
  </div>
</div>
```

---

## Part 9: Unified Animal Event Sheet (Note / Treatment / Breeding / BCS)

One sheet container handles all four event types. Show/hide sections based on the event type.

```html
<div class="sheet-wrap" id="animal-event-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel" style="max-height:92vh; overflow-y:auto;">
    <div class="sheet-handle"></div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div style="font-size:16px; font-weight:600;">Add note</div>
      <!-- Title changes: "Log treatment", "Log breeding event", "Body condition score", "Edit event" -->
      <div style="font-size:12px; color:var(--text2);">T-001</div>
    </div>

    <!-- Common: date + time -->
    <div class="two" style="margin-bottom:10px;">
      <div class="field"><label>Date</label><input type="date" /></div>
      <div class="field">
        <label>Time <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="time" /></div>
    </div>

    <!-- ═══ NOTE section ═══ -->
    <div id="ae-evt-note-section">
      <div class="field"><label>Note</label>
        <textarea rows="3"
          style="width:100%; padding:8px; border:0.5px solid var(--border2);
                 border-radius:var(--radius); font-size:14px; background:var(--bg);
                 color:var(--text); font-family:inherit; resize:vertical;"
          placeholder="Enter note…"></textarea>
      </div>
    </div>

    <!-- ═══ TREATMENT section ═══ -->
    <div id="ae-evt-treatment-section" style="display:none;">
      <div class="field"><label>Treatment type</label>
        <select><option value="">— select —</option><!-- dynamic + __custom__ option --></select>
      </div>
      <div class="field" style="display:none;"><label>Custom treatment name</label>
        <input type="text" placeholder="e.g. Pinkeye treatment" /></div>
      <div class="two">
        <div class="field"><label>Product / drug <span style="font-size:10px; color:var(--text2);">optional</span></label>
          <input type="text" placeholder="e.g. Draxxin" /></div>
        <div class="field"><label>Dose <span style="font-size:10px; color:var(--text2);">optional</span></label>
          <input type="text" placeholder="e.g. 3ml" /></div>
      </div>
      <div class="field"><label>Withdrawal date <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="date" /></div>
      <div class="field"><label>Notes <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <textarea rows="2"
          style="width:100%; padding:8px; border:0.5px solid var(--border2);
                 border-radius:var(--radius); font-size:14px; background:var(--bg);
                 color:var(--text); font-family:inherit; resize:vertical;"
          placeholder="Additional notes…"></textarea>
      </div>
    </div>

    <!-- ═══ BREEDING section ═══ -->
    <div id="ae-evt-breeding-section" style="display:none;">
      <div class="field"><label>Event subtype</label>
        <select>
          <option value="heat">Observed heat</option>
          <option value="ai">Bred — AI</option>
          <option value="bull">Bred — Bull</option>
        </select>
      </div>

      <!-- AI fields (shown when subtype = ai) -->
      <div id="ae-evt-ai-fields">
        <div class="field"><label>AI sire</label>
          <select><option value="">— select or type below —</option></select></div>
        <div style="padding:8px 10px; background:var(--bg2); border-radius:var(--radius);
                    margin-bottom:10px; display:none;">
          <!-- Sire details: name, reg, breed, EPDs, notes -->
        </div>
        <div class="field"><label>Free-form sire name <span style="font-size:10px; color:var(--text2);">if not in list</span></label>
          <input type="text" placeholder="Sire name or registration" /></div>
        <div class="field"><label>Semen straw / tank ID <span style="font-size:10px; color:var(--text2);">optional</span></label>
          <input type="text" placeholder="Tank location or straw ID" /></div>
        <div class="field"><label>Technician <span style="font-size:10px; color:var(--text2);">optional</span></label>
          <input type="text" placeholder="Name" /></div>
      </div>

      <!-- Natural bull fields (shown when subtype = bull) -->
      <div id="ae-evt-bull-fields" style="display:none;">
        <div class="field"><label>Bull (from animal list)</label>
          <select><option value="">— select from herd —</option></select></div>
        <div class="field"><label>Free-form bull name <span style="font-size:10px; color:var(--text2);">if not in list</span></label>
          <input type="text" placeholder="Bull name or tag" /></div>
      </div>

      <!-- Heat fields (shown when subtype = heat) -->
      <div id="ae-evt-heat-fields">
        <div class="field"><label>Notes <span style="font-size:10px; color:var(--text2);">optional</span></label>
          <textarea rows="2"
            style="width:100%; padding:8px; border:0.5px solid var(--border2);
                   border-radius:var(--radius); font-size:14px; background:var(--bg);
                   color:var(--text); font-family:inherit; resize:vertical;"
            placeholder="e.g. Standing heat, mucus noted"></textarea>
        </div>
      </div>

      <div class="field">
        <label>Expected calving date <span style="font-size:10px; color:var(--text2);">optional — auto-calc +283d</span></label>
        <input type="date" />
        <div style="font-size:11px; color:var(--text2); margin-top:3px;"><!-- hint text --></div>
      </div>
    </div>

    <!-- ═══ BCS section ═══ -->
    <div id="ae-evt-bcs-section" style="display:none;">
      <div style="font-size:13px; font-weight:500; margin-bottom:6px;">
        Body condition score
        <span style="font-size:11px; color:var(--text2);">1 = emaciated · 5 = ideal · 10 = obese</span>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        <!-- 10 score chip buttons, 1-10 -->
        <!-- Active chip gets .on class — needs CSS for selected state -->
        <button class="btn bcs-chip" type="button">1</button>
        <button class="btn bcs-chip" type="button">2</button>
        <!-- ... through 10 ... -->
      </div>
      <div class="field"><label>Notes <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <textarea rows="2"
          style="width:100%; padding:8px; border:0.5px solid var(--border2);
                 border-radius:var(--radius); font-size:14px; background:var(--bg);
                 color:var(--text); font-family:inherit; resize:vertical;"
          placeholder="e.g. Thin over ribs, gaining condition"></textarea>
      </div>
      <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
        <input type="checkbox" style="width:18px; height:18px; accent-color:var(--red);" />
        <label style="font-size:13px; font-weight:500; color:var(--red);">Likely cull</label>
        <span style="font-size:11px; color:var(--text2);">Flag for culling review</span>
      </div>
    </div>

    <div class="btn-row" style="margin-top:16px;">
      <button class="btn btn-green">Save</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
    <!-- Delete button — only visible when editing existing event -->
    <div style="display:none; margin-top:8px;">
      <button class="btn btn-red btn-sm" style="width:auto;">Delete event</button>
    </div>
  </div>
</div>
```

**BCS chip CSS needed:**
```css
.bcs-chip {
  display: inline-block; width: auto; padding: 8px 14px; font-size: 14px;
  border: 0.5px solid var(--border2); background: var(--bg2); color: var(--text);
  border-radius: var(--radius); cursor: pointer;
}
.bcs-chip.on {
  background: var(--green); border-color: var(--green); color: white;
}
```

---

## Part 10: Animal Todo Sheet

```html
<div class="sheet-wrap" id="todo-sheet-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:14px;">New task</div>
    <!-- Title changes to "Edit task" when editing -->

    <div class="field"><label>Task name</label>
      <input type="text" placeholder="e.g. Check water trough in North paddock" /></div>

    <div class="field"><label>Assign to</label>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
        <!-- User assignment chips — dynamic -->
      </div>
    </div>

    <div class="two">
      <div class="field"><label>Status</label>
        <select>
          <option value="open">Open</option>
          <option value="inprogress">In progress</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div class="field"><label>Paddock (optional)</label>
        <select><option value="">— none —</option></select>
      </div>
    </div>

    <div class="field"><label>Animal (optional)</label>
      <select style="width:100%;"><option value="">— none —</option></select>
    </div>

    <div class="field"><label>Note</label>
      <textarea placeholder="Additional details..." style="min-height:60px;"></textarea>
    </div>

    <div class="btn-row">
      <button class="btn btn-green">Save task</button>
      <button class="btn btn-outline">Cancel</button>
    </div>

    <!-- Delete button — only visible when editing -->
    <div style="display:none; margin-top:12px; padding-top:12px;
                border-top:0.5px solid var(--border);">
      <button class="btn btn-red btn-sm" style="width:auto;">Delete task</button>
    </div>
  </div>
</div>
```

---

## Part 11: Animal Move Sheet (Multi-select action)

Opened from the green selection action bar when checkboxes are ticked. Two modes: move to existing group, or create new group.

```html
<div class="sheet-wrap" id="animal-move-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet-panel">
    <div class="sheet-handle"></div>
    <div style="font-size:16px; font-weight:600; margin-bottom:4px;">Move animals</div>
    <div style="font-size:13px; font-weight:600; margin-bottom:2px;">3 animals selected</div>
    <div style="font-size:12px; color:var(--text2); margin-bottom:14px;">T-001, T-002, T-003</div>

    <!-- Date + time -->
    <div class="two" style="margin-bottom:12px;">
      <div class="field"><label>Date</label><input type="date" /></div>
      <div class="field">
        <label>Time <span style="font-size:10px; color:var(--text2);">optional</span></label>
        <input type="time" /></div>
    </div>
    <div style="font-size:11px; color:var(--text2); margin-bottom:12px;">
      Defaults to now — adjust if recording a past move.
    </div>

    <!-- Move to existing group section -->
    <div id="am-existing-section">
      <div class="field"><label>Move to group</label>
        <select><option value="">— select group —</option></select>
      </div>
    </div>

    <!-- Create new group section -->
    <div id="am-new-section" style="display:none;">
      <div class="field"><label>New group name</label>
        <input type="text" placeholder="e.g. Yearlings, Dry cows…" /></div>
      <div class="field"><label>Color</label>
        <!-- Same 6-color swatch picker --></div>
      <div style="font-size:12px; color:var(--text2); margin-bottom:10px;">
        Selected animals will be removed from their current groups. Use Move Herd on the Home screen to place the new group.
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-green">Confirm</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
  </div>
</div>
```

---

## Acceptance Criteria

1. **All 11 parts** above are implemented with v1-matching layout and spacing
2. All CSS classes from Part 1 are present in `main.css` (verify, don't duplicate)
3. No innerHTML — all patterns translated to `el()` / `text()` / `clear()` DOM builder calls
4. All sheets use the shared `.sheet-wrap` / `.sheet-panel` / `.sheet-handle` / `.sheet-backdrop` pattern
5. Filter chips, search bar, and config buttons work identically to current v2 behavior
6. Group rows filter the animal list on click (toggle behavior)
7. Multi-select action bar appears/disappears based on checkbox state
8. Quick-action buttons on animal rows open the correct sheet type
9. Consolidated containers: Add/Edit animal = one sheet, Note/Treatment/Breeding/BCS = one sheet
10. Scroll position preserved when toggling animal selection checkboxes
