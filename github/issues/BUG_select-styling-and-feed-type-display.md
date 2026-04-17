# BUG: Select Element Styling + Feed Type Display Fixes

**Priority:** P2
**Area:** v2-build / UI
**Files:** `src/styles/main.css`, `src/features/feed/index.js`
**Labels:** `bug`, `ui`, `v1-parity`
**Schema impact:** None
**CP-55/CP-56 impact:** None

---

## Bug 1: Unstyled Select Elements (Global — 56 instances across 19 files)

### Problem

`main.css` has a `.field input` rule that styles all text inputs inside `.field` containers (padding, border, border-radius, font-size, background). But there is **no `.field select` rule**. This means every `<select>` rendered inside a `.field` div gets raw browser-default styling — different padding, no border-radius, wrong font-size, mismatched background. They look visually out of place next to properly styled text inputs.

This affects **56 select elements across 19 files:**

| File | Count |
|------|-------|
| locations/index.js | 12 |
| animals/index.js | 9 |
| feed/index.js | 6 |
| amendments/entry.js | 4 |
| todos/todo-sheet.js | 3 |
| health/breeding.js | 3 |
| surveys/index.js | 2 |
| health/calving.js | 2 |
| harvest/index.js | 2 |
| feed/quality.js | 2 |
| amendments/reference-tables.js | 2 |
| amendments/manure.js | 2 |
| settings/member-management.js | 1 |
| health/treatment.js | 1 |
| health/reference-tables.js | 1 |
| events/rotation-calendar/toolbar.js | 1 |
| events/move-wizard.js | 1 |
| events/list-view/events-log.js | 1 |
| amendments/soil-tests.js | 1 |

### Fix

Add a single CSS rule to `main.css` that styles selects the same as inputs when inside `.field` containers. This fixes all 56 instances at once with no JS changes.

Add this rule immediately after the existing `.field input` rule:

```css
.field select {
  width: 100%;
  padding: 9px 10px;
  border: 0.5px solid var(--border2);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg);
  box-sizing: border-box;
  font-family: inherit;
  color: var(--text);
}
.field select:focus {
  outline: none;
  border-color: var(--color-green-base);
}
```

**Do NOT use `appearance: none`** — this is a mobile PWA. Native select appearance (`appearance: auto`, the default) gives users the platform picker on iOS/Android which is a better mobile UX than a custom dropdown. We just want the surrounding chrome (padding, border, radius, font) to match text inputs.

### Also fix: standalone selects outside `.field`

Some selects are rendered outside `.field` wrappers (e.g., filter selects in event log). These should use a shared utility class. Check if `.auth-select` already covers the right styles — if so, apply it where standalone selects appear. If not, add a `.styled-select` class with the same properties as `.field select` and apply it to any select created outside a `.field` wrapper.

### Verification

After the CSS change, visually inspect every screen that has a select:
- Locations screen (Add/Edit sheet, survey, harvest, soil test, apply input)
- Animals screen (Add/Edit, health sheets)
- Feed screens (feed types, feed quality)
- Events screen (log filters, rotation calendar toolbar, move wizard)
- Amendments (entry, reference tables, manure)
- Settings (member management)
- Todos

Each select should now have the same padding, border, border-radius, and font as text inputs on the same form.

---

## Bug 2: Feed Type List — "undefined% DM" Display

### Problem

The existing feed types list renders DM% as a badge, but for feed types without a DM value (common for v1 migrated data), it shows `"undefined% DM"` instead of hiding the badge. The DM value is either not being read from the entity correctly (property name mismatch between store data and render code), or the null/undefined guard is insufficient.

### Fix

In `src/features/feed/index.js`, in the `renderFeedTypeList()` function (around line 210-225):

1. **Guard the DM% display** — only show the DM badge when the value is a valid number:
   ```
   if (ft.dmPct != null && !isNaN(ft.dmPct))  →  show badge
   otherwise  →  omit badge entirely
   ```

2. **Check the property name** — verify that the entity's `fromSupabaseShape()` maps `dm_pct` → `dmPct` correctly. If the data coming from localStorage or Supabase uses `dm_pct` and the render code reads `dmPct`, that's the root cause.

3. **Apply the same guard to all optional badges** in the feed type list row (weight, cutting number, etc.) — any badge that could be null/undefined should be guarded.

### Also check: NPK display in existing types list

The v1 feed type list shows only `unit · DM% · category` in the subtitle. The v2 list shows badges for more fields (unit, DM%, weight, cutting). Both are fine, but verify that when a feed type has NPK hay analysis values (nPct, pPct, kPct), they display correctly when editing that feed type — the form should pre-populate the N%, P%, K% fields.

---

## Acceptance Criteria

1. [ ] `.field select` CSS rule added to `main.css`, matching `.field input` styling
2. [ ] All 56 selects across 19 files render with consistent padding, border, radius, font
3. [ ] No `appearance: none` on selects (preserve native mobile picker)
4. [ ] Feed type list hides DM% badge when value is null/undefined/NaN
5. [ ] Feed type list hides weight badge when value is null/undefined
6. [ ] Feed type list hides cutting badge when value is null/undefined
7. [ ] Editing a feed type with NPK values pre-populates the N%, P%, K% fields correctly
8. [ ] Visual verification across all screens with selects
