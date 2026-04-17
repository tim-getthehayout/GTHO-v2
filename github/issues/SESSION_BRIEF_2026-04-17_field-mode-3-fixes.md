# SESSION BRIEF — Field Mode: 3 Fixes

**Date:** 2026-04-17
**Context:** SP-8 field mode v1 parity — three fixes after initial implementation
**Read first:** `UI_SPRINT_SPEC.md` § SP-8, `github/issues/field-mode-v1-parity.md`

---

## Fix 1: Feed Check — Event Picker + Return to Field Home

### Problem

The feed check handler (`handleFeedCheck`, line 156) already shows an event picker when multiple events have feed. But after completing the feed check, the feed check sheet doesn't return to field mode home — it just closes normally. The user should land back on `#/field` after saving.

### Fix

In `src/features/feed/check.js`, find the save handler. After a successful save, check if field mode is active and navigate accordingly:

```javascript
import { getFieldMode } from '../../utils/preferences.js';
import { navigate } from '../../ui/router.js';

// After successful save in the feed check sheet:
if (getFieldMode()) {
  navigate('#/field');
} else {
  // existing close behavior
}
```

Also: when the event picker closes without selection ("⌂ Done"), it already navigates to `#/field` (line 240). That part works.

### Acceptance Criteria

- [ ] Feed check tile → event picker (if multiple events with feed) → feed check sheet → save → returns to `#/field`
- [ ] Feed check tile → feed check sheet (if single event) → save → returns to `#/field`
- [ ] "⌂ Done" on event picker returns to `#/field` (already works)

---

## Fix 2: Record Heat — Animal Picker (V1 Parity)

### Problem

The heat handler (`handleHeat`, line 194) currently auto-selects the first female animal and opens the heat sheet directly. V1 has a dedicated 2-step heat picker: Step 1 is an animal picker with event/group filter pills and search, Step 2 is the recording form. The picker stays open after saving so the user can record heat for multiple animals in one session.

### Fix

Replace the current `handleHeat()` with a proper heat picker sheet. Build it using the `ensurePickerSheetDOM()` pattern (or a dedicated sheet). The picker has two steps:

**Step 1 — Animal Selection:**

| Element | Description |
|---------|-------------|
| Title | "Select Animal" with "⌂ Done" button |
| Event pills | Filter bar: "All events" + one pill per open event (green active state) |
| Group pills | Filter bar: "All groups" + one pill per group (teal active state). Resets to "All" when event filter changes |
| Search | Text input: "Search by tag, name, or ID" |
| Animal list | Scrollable list of matching female animals. Each row: tag number (bold), name · group name, "Last: {date}" on right |

**Step 2 — Heat Recording:**

| Element | Description |
|---------|-------------|
| "← Back" button | Returns to Step 1 |
| Title | "Record Heat" |
| Animal label | Tag + name display |
| Date | Date input, defaults to today |
| Time | Time input, defaults to now (optional) |
| Notes | Textarea (optional), placeholder: "Behavior observed, standing heat, etc." |
| Buttons | Cancel (→ Step 1) · Save (green) |

**After save:** Stay on Step 1 (refresh the list to show updated "Last:" date). Toast: "Heat recorded — {tag}". Do NOT close the sheet — the user may want to record heat for another animal.

**"⌂ Done" on Step 1:** Close sheet → navigate to `#/field`.

### Animal Filtering Logic

```javascript
// Base pool: female, not culled, active
let pool = getAll('animals').filter(a => a.sex === 'female' && !a.culled);

// Event filter: if not 'all', limit to animals in groups on that event
if (eventFilter !== 'all') {
  const evGws = getAll('eventGroupWindows').filter(gw => gw.eventId === eventFilter && !gw.dateLeft);
  const evGroupIds = new Set(evGws.map(gw => gw.groupId));
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft && evGroupIds.has(m.groupId));
  const animalIds = new Set(memberships.map(m => m.animalId));
  pool = pool.filter(a => animalIds.has(a.id));
}

// Group filter: further limit to specific group
if (groupFilter !== 'all') {
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft && m.groupId === groupFilter);
  const animalIds = new Set(memberships.map(m => m.animalId));
  pool = pool.filter(a => animalIds.has(a.id));
}

// Search: tag, name, or systemId
if (query) {
  const q = query.toLowerCase();
  pool = pool.filter(a =>
    (a.tagNumber || '').toLowerCase().includes(q) ||
    (a.name || '').toLowerCase().includes(q) ||
    (a.id || '').toLowerCase().includes(q)
  );
}

// Sort by tag number
pool.sort((a, b) => (a.tagNumber || a.id || '').localeCompare(b.tagNumber || b.id || '', undefined, { numeric: true }));
```

### "Last heat" Date

Look up the most recent heat record for each animal:

```javascript
function getLastHeatDate(animal) {
  const records = getAll('animalHeatRecords').filter(r => r.animalId === animal.id);
  if (!records.length) return null;
  records.sort((a, b) => (b.observedAt || b.date || '').localeCompare(a.observedAt || a.date || ''));
  return records[0].observedAt || records[0].date;
}
```

### Filter Pill Styling (v1 reference)

```css
/* Event pills — green */
padding: 4px 12px;
border-radius: 20px;
font-size: 11px;
font-weight: 600;
/* Active: */  border: 1.5px solid var(--green); background: var(--green); color: white;
/* Inactive: */ border: 1.5px solid var(--border2); background: transparent; color: var(--text2);

/* Group pills — teal */
/* Active: */  border: 1.5px solid var(--teal); background: var(--teal); color: white;
/* Inactive: */ same as event inactive
```

### v1 HTML Template (reference — use v2 DOM builder)

```html
<!-- Step 1 -->
<div id="hp-step1">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <h3 style="margin:0;">Select Animal</h3>
    <button class="sheet-close btn btn-outline btn-xs" onclick="closeHeatPickerSheet()">Done</button>
  </div>
  <div id="hp-event-pills" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>
  <div id="hp-group-pills" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"></div>
  <input type="text" id="hp-search" placeholder="Search by tag, name, or ID"
    style="width:100%;padding:10px 12px;font-size:15px;border:1.5px solid var(--border2);border-radius:8px;margin-bottom:8px;"
    oninput="_hpFilterAnimals()"/>
  <div id="hp-animal-list" style="max-height:55vh;overflow-y:auto;"></div>
</div>

<!-- Step 2 -->
<div id="hp-step2" style="display:none;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
    <button class="btn btn-outline btn-xs" onclick="_hpBackToStep1()">← Back</button>
    <h3 style="margin:0;">Record Heat</h3>
  </div>
  <div id="hp-animal-label" style="font-size:15px;font-weight:600;margin-bottom:12px;"></div>
  <div class="field"><label>Date</label><input type="date" id="hp-date"/></div>
  <div class="field"><label>Time</label><input type="time" id="hp-time"/></div>
  <div class="field"><label>Notes (optional)</label>
    <textarea id="hp-notes" rows="2" placeholder="Behavior observed, standing heat, etc."></textarea></div>
  <div class="btn-row" style="margin-top:12px;">
    <button class="btn btn-outline" onclick="_hpBackToStep1()">Cancel</button>
    <button class="btn btn-green" onclick="_hpSaveHeat()">Save</button>
  </div>
</div>
```

### Animal Row (v1 reference)

```html
<div style="padding:12px 8px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;min-height:44px;">
  <div>
    <div style="font-size:15px;font-weight:600;">{tag}</div>
    <div style="font-size:12px;color:var(--text2);">{name} · {groupName}</div>
  </div>
  <div style="font-size:11px;color:var(--text3);">Last: {date}</div>
</div>
```

### Acceptance Criteria

- [ ] Heat tile opens a 2-step picker sheet (not auto-select first female)
- [ ] Step 1: event filter pills (green active state), group filter pills (teal active state)
- [ ] Step 1: search by tag, name, or ID
- [ ] Step 1: animal list shows tag (bold), name · group, and "Last: {date}" for each female
- [ ] Step 1: tapping an animal opens Step 2 with that animal pre-filled
- [ ] Step 2: date defaults to today, time defaults to now
- [ ] Step 2: Save records heat and returns to Step 1 (stays open for multi-record)
- [ ] Step 2: Cancel returns to Step 1
- [ ] Step 1: "⌂ Done" closes sheet → navigate to `#/field`
- [ ] Group filter resets to "All" when event filter changes
- [ ] Empty state: "No matching animals" when filters/search yield no results
- [ ] Toast shown on save: "Heat recorded — {tag}"

---

## Fix 3: Event Cards — Expand Not Working + Move Button Layout

### Problem A: Expand not working

The expand/collapse state (`expandedEventId`, line 23 of `index.js`) toggles on click, but the render only shows the collapsed row — there's no expanded view. When `isExpanded` is true, the row just gets a teal border (line 277) but the content is identical. V1 shows an expanded card with the full location card content.

### Fix A

When `isExpanded === true`, render the full location card below the collapsed row. Options:

1. **Inline expansion** (simpler): Below the collapsed row, render a detail section with event info (groups with head counts, day count, date in, feed status per group, cost). This doesn't need the full dashboard card — just more detail than the collapsed row.

2. **V1 approach**: Render the full `renderLocationCard()` wrapped in a teal border. This is heavier and may cause circular imports.

**Recommended:** Option 1 — inline expansion. Show these additional lines when expanded:

```
┌─ teal border ──────────────────────────────────────────┐
│  🌿 North Pasture  12.5 ac                             │
│  Cow-Calf Herd · Culls · Day 14 · 3 sub-moves         │  ← collapsed row
│                                                         │
│  In: Apr 3, 2026 · Est. cost: $234                     │  ← expanded detail
│  ────────────────────────────────────────               │
│  Cow-Calf Herd: 45 hd · 1,125 lbs avg                 │  ← per-group lines
│  Culls: 12 hd · 1,340 lbs avg                          │
│  ────────────────────────────────────────               │
│  Fed today ✓  ·  3 feed entries  ·  1 feed check       │  ← feed status
└─────────────────────────────────────────────────────────┘
```

Add this as a child `div` that renders only when `isExpanded`:

```javascript
if (isExpanded) {
  // Insert expanded detail after the collapsed row content
  const detail = el('div', { style: { padding: '8px 12px 4px', borderTop: '0.5px solid var(--border)' } }, [
    // Date in + cost
    el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' } }, [
      `In: ${formatDate(evt.dateIn)} · Est. cost: $${totalCost.toFixed(0)}`
    ]),
    // Per-group details
    ...gws.map(gw => {
      const g = getById('groups', gw.groupId);
      return el('div', { style: { fontSize: '12px', marginBottom: '2px' } }, [
        `${g?.name || '?'}: ${gw.headCount} hd · ${avgWeight} lbs avg`
      ]);
    }),
    // Feed status
    el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '4px' } }, [
      feedStatusLine
    ]),
  ]);
  row.appendChild(detail);
}
```

### Problem B: Move button too close to expand target

The "Move all" button sits right next to the expand chevron. On mobile, tapping to expand often accidentally hits "Move all" instead. The button needs more separation from the expand tap target.

### Fix B

Move the "Move all" button **inside the expanded section** instead of on the collapsed row. The collapsed row becomes a pure expand/collapse tap target with no competing buttons.

**New collapsed row layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ ▌ 🌿 North Pasture  12.5 ac                              ›  │
│ ▌ Cow-Calf Herd · Culls · Day 14 · 3 sub-moves              │
└──────────────────────────────────────────────────────────────┘
```

- Green left bar
- Content area (flex: 1)
- Chevron `›` / `▾`
- **No "Move all" button on collapsed row**

**Expanded section includes "Move all" at the bottom:**

```
│  ────────────────────────────────────────               │
│                                    [Move all]           │  ← button in expanded view
└─────────────────────────────────────────────────────────┘
```

This completely eliminates accidental Move taps when trying to expand.

### Acceptance Criteria

- [ ] Tapping a collapsed event row expands it (teal border, additional detail)
- [ ] Tapping an expanded event row collapses it
- [ ] Only one event expanded at a time
- [ ] Expanded view shows: date in, cost, per-group head/weight, feed status
- [ ] "Move all" button is inside the expanded section, NOT on the collapsed row
- [ ] Collapsed row is a clean tap target with no competing buttons
- [ ] Collapse chevron (⌃ / ›) updates to reflect state

---

## Files Changed

| File | Changes |
|------|---------|
| `src/features/field-mode/index.js` | Fix 2: replace `handleHeat()` with proper picker. Fix 3: event card expand + move button relocation |
| `src/features/feed/check.js` | Fix 1: add field mode return after save |

## Implementation Order

1. **Fix 1** (smallest) — feed check return navigation
2. **Fix 3** (medium) — event card expand/collapse + move button relocation
3. **Fix 2** (largest) — heat animal picker sheet

## No Schema Impact

All three fixes are UI/interaction only. No CP-55/CP-56 impact.
