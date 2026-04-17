# BUG: Event Detail Sheet Bottom Buttons Don't Match V1 Layout

**Priority:** P2
**Area:** v2-build / UI sprint
**Labels:** bug, ui, v1-parity

---

## Problem

The v2 event detail sheet (`src/features/events/detail.js`, `renderActions()`) renders bottom action buttons as a flat flex row of Move All / Close and Move / Delete / Cancel. This doesn't match the v1 edit event sheet layout, which has a deliberate visual hierarchy:

1. **Primary row:** Save & recalculate (green, flex:2) + Cancel (outline, flex:1)
2. **Warning action:** Close this event & move groups (amber, full-width, conditional on event being open)
3. **Destructive action:** Delete event (red, small, left-aligned)

The v2 version also uses CSS classes (`btn-olive`, `btn-danger`, `btn-ghost`) that don't have definitions in the stylesheet, so buttons render with no background color.

---

## V1 HTML (extracted from index.html lines 22295-22309)

```html
<!-- Primary action row -->
<div class="btn-row" style="flex-wrap:wrap;gap:8px;">
  <button class="btn btn-green" onclick="saveEventEdit()"
    style="flex:2;min-width:160px;">Save &amp; recalculate</button>
  <button class="btn btn-outline" onclick="closeEventEdit()"
    style="flex:1;min-width:80px;">Cancel</button>
</div>

<!-- Close event (conditional — only for open events) -->
<div id="ee-close-event-btn-wrap" style="display:none;margin-top:10px;">
  <button class="btn" onclick="openEeAnchorClose()"
    style="width:100%;background:var(--amber);color:#fff;border:none;
           font-size:14px;font-weight:600;padding:13px;border-radius:var(--radius);
           cursor:pointer;">
    ⬇ Close this event &amp; move groups
  </button>
</div>

<!-- Delete event -->
<div style="margin-top:8px;">
  <button class="btn btn-red btn-sm" onclick="deleteEvent()"
    style="width:auto;padding:10px 16px;font-size:12px;">Delete event</button>
</div>
```

### V1 CSS classes used

```css
.btn-row { display: flex; gap: 8px; }
.btn-row .btn { flex: 1; }
.btn { display: block; width: 100%; padding: 12px; border: none; border-radius: var(--radius);
       font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; text-align: center; }
.btn-green { background: var(--green); color: white; }       /* --green: #639922 */
.btn-outline { background: transparent; color: var(--text); border: 0.5px solid var(--border2); }
.btn-red { background: var(--red); color: white; }           /* --red: #E24B4A */
.btn-sm { display: inline-block; width: auto; padding: 7px 16px; font-size: 13px; }
```

---

## Fix

**File:** `src/features/events/detail.js`, `renderActions()` function (lines 1115-1152)

### V2 button mapping (v1 → v2 equivalents)

| V1 button | V2 equivalent | Handler |
|---|---|---|
| Save & recalculate | **Save & recalculate** — persists any pending inline edits and recalculates derived values | Same concept as v1 |
| Cancel | **Cancel** — close sheet without saving pending changes | `closeEventDetailSheet()` |
| Close this event & move groups | **Close this event & move groups** | `openCloseEventSheet(event, operationId)` |
| Delete event | **Delete event** | `openDeleteConfirm(ctx)` |

**Key fix:** The current v2 "Move all" button is redundant with "Close & move" (both ultimately move groups). Replace "Move all" with **"Save & recalculate"** — the v1 primary action. Even though v2 uses inline auto-save, an explicit save button gives users confidence their changes are persisted and triggers a recalc of derived values (DMI, NPK, capacity estimates).

### Revised button layout

The hierarchy is already correct (green primary + cancel row, amber close, red delete). The fix is button labels and handlers:

**For active events:**
```
[Save & recalculate (green, flex:2)]  [Cancel (outline, flex:1)]      ← btn-row
[↓ Close this event & move groups (amber, full-width)]                ← separate div, margin-top:10px
[Delete event (red, small, left-aligned)]                             ← separate div, margin-top:8px
```

**For closed events:**
```
[Cancel (outline, full-width)]                               ← single button
[Delete event (red, small, left-aligned)]                    ← separate div, margin-top:8px
```

### Implementation

```js
function renderActions(ctx) {
  const el2 = ctx.sections.actions;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const isActive = !event.dateOut;

  // Row 1: Primary action + Cancel
  const primaryRow = el('div', {
    className: 'btn-row',
    style: { flexWrap: 'wrap', gap: '8px' },
  }, isActive ? [
    el('button', {
      className: 'btn btn-green',
      style: { flex: '2', minWidth: '160px' },
      'data-testid': 'detail-save-recalc',
      onClick: () => saveAndRecalculate(ctx),
    }, ['Save & recalculate']),
    el('button', {
      className: 'btn btn-outline',
      style: { flex: '1', minWidth: '80px' },
      onClick: () => closeEventDetailSheet(),
    }, [t('action.cancel')]),
  ] : [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => closeEventDetailSheet(),
    }, [t('action.cancel')]),
  ]);

  el2.appendChild(primaryRow);

  // Row 2: Close event (active events only)
  if (isActive) {
    const closeWrap = el('div', { style: { marginTop: '10px' } }, [
      el('button', {
        className: 'btn',
        style: {
          width: '100%', background: 'var(--color-amber-base, var(--amber, #BA7517))',
          color: '#fff', border: 'none',
          fontSize: '14px', fontWeight: '600', padding: '13px',
          borderRadius: 'var(--radius-m, var(--radius, 8px))', cursor: 'pointer',
        },
        'data-testid': 'detail-close-move',
        onClick: () => openCloseEventSheet(event, ctx.operationId),
      }, ['\u2B07 Close this event & move groups']),
    ]);
    el2.appendChild(closeWrap);
  }

  // Row 3: Delete (always, small, left-aligned)
  const deleteWrap = el('div', { style: { marginTop: '8px' } }, [
    el('button', {
      className: 'btn btn-red btn-sm',
      style: { width: 'auto', padding: '10px 16px', fontSize: '12px' },
      'data-testid': 'detail-delete',
      onClick: () => openDeleteConfirm(ctx),
    }, [t('action.delete') + ' event']),
  ]);
  el2.appendChild(deleteWrap);
}
```

### CSS additions needed

Verify these classes exist in `src/ui/main.css`. If missing, add them:

```css
.btn-row { display: flex; gap: 8px; }
.btn-row .btn { flex: 1; }
.btn-green { background: var(--color-green-base); color: white; }
.btn-red { background: var(--color-red-base); color: white; }
.btn-outline { background: transparent; color: var(--text-primary); border: 1px solid var(--border-default); }
.btn-sm { display: inline-block; width: auto; padding: 7px 16px; font-size: 13px; }
```

Remove any references to undefined classes: `btn-olive`, `btn-danger`, `btn-ghost`.

---

## Acceptance Criteria

- [ ] Active event: Save & recalculate (green) + Cancel in a row, Close this event & move groups (amber, full-width) below, Delete event (red, small) at bottom
- [ ] Closed event: Cancel (full-width) + Delete event (red, small) at bottom
- [ ] All buttons have visible, correct background colors (no unstyled/undefined CSS classes)
- [ ] Save & recalculate persists pending inline edits and recalculates derived values
- [ ] Close this event & move groups opens close event sheet
- [ ] Delete opens confirmation dialog
- [ ] Cancel closes the detail sheet
- [ ] Button hierarchy matches v1 screenshot (primary action large, destructive action small and separated)

---

## No Schema Impact

Visual/rendering only. No CP-55/CP-56 impact.
