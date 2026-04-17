# Session Brief: OI-0085 — §8 Feed Entries Display Bugs + V1-Parity Inline Add/Edit (2026-04-17)

**Context:** Post-SP-10 field testing surfaced three bugs in the §8 Feed Entries card inside the Edit Event dialog. Two are field-name typos; the third is that the per-row Edit button was never wired to a real edit UI. Fix scope expanded to full v1 parity: rebuild §8 using v1's **inline** add/edit pattern (form embeds inside the event edit dialog — not a separate sheet).

**Priority:** P0 — blocks field testing.

**Spec reference:** `UI_SPRINT_SPEC.md` § SP-10 § §8 Feed Entries (validation guards, save semantics — ratified 2026-04-17). This brief adds the v1 HTML/CSS/JS references so Claude Code builds to v1 exactly.

**OI reference:** OI-0085.

**Related OI (stays open):** OI-0072 covers the *standalone* Deliver Feed sheet used from dashboard-level CTAs. This brief doesn't touch that — only the inline §8 pattern inside the event edit dialog. If `delivery.js` is still imported somewhere outside §8, leave it alone.

---

## Part 1 — Fix display bugs in `renderFeedEntries`

File: `src/features/events/detail.js`

**Bug 1 — feed name shows `?`**
Line ~887: `const feedName = batch?.feedName || '?';`
→ change to: `const feedName = batch?.name || '?';`
The batch entity's label field is `name` (see `src/entities/batch.js` — `FIELDS.name`). There is no `feedName` field.

**Bug 2 — delivery date is blank**
Line ~894: `` `${feedName} \u00B7 ${fe.quantity ?? 0} \u00B7 ${fe.deliveryDate || ''} \u00B7 $${cost.toFixed(2)}` ``
→ change `fe.deliveryDate` to `fe.date`.
The entity's field is `date` (see `src/entities/event-feed-entry.js` — `FIELDS.date`). There is no `deliveryDate` field.

Both are one-character/one-word fixes. After the fixes, a v2 row will render like v1: `Oak Field Barn · 1 · 2026-04-17 · $45.00`.

(The display format beyond the bug fixes is addressed in Part 2 — you'll rewrite the row markup anyway to match v1's layout.)

---

## Part 2 — Rebuild §8 to V1 Inline Pattern

### 2.1 V1 HTML structure (reference)

From v1 (`get-the-hay-out/index.html:22367–22382`) — what the §8 section looks like inside the event edit dialog:

```html
<!-- ── FEED ENTRIES ──────────────────────────────────────────────── -->
<div class="div"></div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
  <div class="sec" style="margin:0;">Feed entries</div>
  <button class="btn btn-green btn-xs" onclick="openEeFeedEntry()">+ Add feed</button>
</div>
<div id="ee-feed-list" style="margin-bottom:10px;"></div>
<div id="ee-feed-form" style="display:none;" class="card-inset">
  <div class="field"><label>Date</label><input type="date" id="ee-feed-date"/></div>
  <div id="ee-feed-batch-sel" style="margin-bottom:8px;"></div>
  <div id="ee-feed-qty-lines"></div>
  <div class="btn-row">
    <button class="btn btn-green btn-xs" onclick="saveEeFeedEntry()">Add to event</button>
    <button class="btn btn-outline btn-xs" onclick="closeEeFeedEntry()">Cancel</button>
  </div>
</div>
```

Key pattern elements:
- Section header uses a single `<div>` with flex space-between — title on left, `+ Add feed` button on right.
- List (`#ee-feed-list`) above, inline form (`#ee-feed-form`) below, both in the same card.
- Form is hidden by default (`display:none`) and expands in place — no sheet, no modal.
- `card-inset` class gives it a subtle inset visual to distinguish it from the outer card.

In v2, adapt these to the DOM builder (`el()`) — no `innerHTML`. Match the visual hierarchy and spacing exactly.

### 2.2 V1 list row rendering (reference)

From v1 (`index.html:17574–17627`) — how each entry row renders:

```js
// Per entry: date on top, description below, DMI + cost right-aligned, Edit + × buttons
// Visual layout:
// [  Apr 17, 26        ]  [ 100 lbs DMI ] [Edit] [×]
// [  1 bale Oak Field  ]  [ $45.00      ]

return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:0.5px solid var(--border);">
  <div>
    <div style="font-size:13px;font-weight:500;">${dLabel(entry.date)}</div>
    <div style="font-size:11px;color:var(--text2);">${desc||'—'}</div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
    <div style="text-align:right;font-size:12px;color:var(--text2);">${Math.round(dmi)} lbs DMI<br>$${cost.toFixed(2)}</div>
    <button class="btn btn-outline btn-xs" onclick="editEeFeedEntry('${entry.id}')">Edit</button>
    <button class="btn btn-outline btn-xs" style="color:var(--red-d);border-color:var(--red-d);"
      onclick="deleteEeFeedEntry('${entry.id}')">×</button>
  </div>
</div>`;
```

Description format: `"1 bale Oak Field Barn"` → in v2, `${quantity} ${batch.unit} ${batch.name}`. If a v2 "entry" corresponds to one `event_feed_entries` row, that's one line in the description. If multiple rows share the same date (and were added together in a multi-batch save), the row can still display per-row — don't try to regroup by date. (v1 grouped by entry; v2's data model is flatter — one row per batch — so each `event_feed_entries` row is its own list item. This is fine and does not break v1 parity visually — the information shown is equivalent.)

DMI computation: use the existing DMI calc from the calc registry; don't reinvent here.

### 2.3 V1 add/edit form logic (reference)

From v1 (`index.html:18043–18238`) — the critical flow:

**`openEeFeedEntry()`** — opens the form in ADD mode:
- Clear `eeFeedLines = []` (the in-memory selected-batches list).
- Default date = today, clamped into event window.
- Render batch selector (`renderEeFeedBatches()`).
- Show the form (`.style.display='block'`).

**`editEeFeedEntry(entryId)`** — opens the form in EDIT mode:
- Set `eeEditingEntryId = String(entryId)`.
- **Restore inventory** for this entry's batch (`batch.remaining += entry.qty`) — it will be re-decremented on save. This lets the user raise the qty without hitting the inventory guard.
- Backup the entry (`_eeEditingEntryBackup = JSON.parse(JSON.stringify(entry))`).
- **Remove the entry from state temporarily** (splice it out of `feedEntries`) so it doesn't appear as a duplicate while the form is open.
- Pre-populate date and `eeFeedLines` from the entry.
- Render batch selector + show form.

**`closeEeFeedEntry()`** — cancel:
- If in edit mode: restore the backed-up entry + re-decrement inventory + re-render the list.
- Clear edit state.
- Hide the form.

**`saveEeFeedEntry()`** — commit add or edit:
- Validate: at least one batch has qty > 0.
- Validate: date within event window (`date >= ev.dateIn`, `date <= ev.dateOut` if closed).
- Build entry: `{id: editing ? editingId : newId(), date, lines: [...selectedWithQty]}`.
- Push to `feedEntries`, decrement inventory.
- Save + queue sync + re-render list + close form.

**Key implementation detail for v2:**

V2's data model is flatter than v1 — each `event_feed_entries` row is `{event_id, batch_id, location_id, date, quantity, ...}`, one per batch. So:

- **Add mode, single batch:** create 1 `event_feed_entries` row.
- **Add mode, multi-batch:** create N rows with same date (one per selected batch with qty > 0).
- **Edit mode:** always single-row — the pencil edits one specific `event_feed_entries` row. Lock the batch selector to that row's batch (can't add more, can't remove it). User can change date and qty. Save = `update('eventFeedEntries', id, changes, ...)`.

**Why batch is locked in edit mode:** changing batch means delete + re-add (different inventory impacts, different FK targets). Don't try to support batch-change-on-edit — that's a scope trap.

### 2.4 V1 batch selector card (reference)

From v1 (`index.html:18077–18090`) — tap-to-toggle batch selection:

```js
el.innerHTML = S.batches.filter(b=>!b.archived).map(b=>{
  const on = eeFeedLines.find(l=>l.batchId===b.id);
  return `<div class="batch-sel${on?' on':''}" onclick="toggleEeFeedBatch(${b.id})">
    <div>
      <div style="font-size:13px;font-weight:600;">${b.label}</div>
      <div style="font-size:11px;color:var(--text2);">${b.remaining.toFixed(1)} ${b.unit}s remaining</div>
    </div>
    <div class="chk">${on ? '<svg ... checkmark ...>' : ''}</div>
  </div>`;
}).join('');
```

Visual: each batch renders as a card with name + remaining on the left, a checkbox on the right. Selected state = green background + white checkmark. Use v2's existing `batch-sel` / `batch-sel.on` / `.chk` CSS classes if they already exist (see `delivery.js` — OI-0072 spec already defines these patterns). If not, reuse from v1.

### 2.5 V1 qty stepper (reference)

From v1 (`index.html:18097–18112`) — per-selected-batch qty row:

```js
`<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
  <div style="flex:1;font-size:14px;font-weight:500;">${b.label}
    <span style="font-size:11px;color:var(--text2);">${b.unit}s</span>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <button class="qty-btn" onclick="adjEeFeed(${i},-0.5)">−</button>
    <span class="qty-val">${l.qty}</span>
    <button class="qty-btn" onclick="adjEeFeed(${i},0.5)">+</button>
  </div>
</div>`
```

Step size: 0.5. Min: 0. Uses `qty-btn` / `qty-val` CSS classes.

### 2.6 Remove the Deliver feed big button from §8

The current `renderFeedEntries` puts a big `Deliver feed` button in the card footer. Delete it — its job is now done by the inline `+ Add feed` button in the section header. Keep `Move feed out` in the footer (it's a separate flow per §8a).

---

## Part 3 — Validation guards (reject-on-save)

Copy exactly from SP-10 § §8 Feed Entries:

| Condition | Error copy |
|---|---|
| `entry.date < event.date_in` | "Feed entry date must be on or after the event start date." |
| `entry.date > event.date_out` on closed events | "Feed entry date must be on or before the event end date." |
| `entry.date` > today | "Feed entry date can't be in the future." |
| `quantity <= 0` | "Quantity must be greater than zero. To remove feed from this event, use the Move feed out action." |
| In edit mode: `new_qty > batch.remaining + old_qty` | "Not enough inventory. Batch has {X} {unit} available." |

Inline error under the form; do not close the form on error.

---

## Part 4 — Save behavior

### Add mode (one or more batches with qty > 0):

For each `line` where `line.qty > 0`:
1. Create `event_feed_entries` row via `FeedEntryEntity.create({...})`.
2. Call `add('eventFeedEntries', entry, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries')`.
3. Decrement `batches.remaining` by `line.qty`:
   `update('batches', batch.id, { remaining: Math.max(0, batch.remaining - line.qty) }, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches')`.

All rows share the same `date`.

### Edit mode (exactly one row being edited):

1. Compute delta: `delta = old_qty - new_qty`.
2. `update('eventFeedEntries', entry.id, { date, quantity: new_qty }, ...)`.
3. `update('batches', batch.id, { remaining: Math.max(0, batch.remaining + delta) }, ...)`.

(Note: Part 2.3 described v1's "restore inventory on editOpen, re-decrement on save" trick. In v2 you can skip that — just compute the delta on save. Simpler. The inventory-guard validation uses `batch.remaining + old_qty` as the ceiling, which is equivalent.)

### Post-save:

- Hide the inline form.
- Clear edit state.
- Re-render `renderFeedEntries` — DMI / cost / NPK cascade automatically via compute-on-read.

---

## Part 5 — Acceptance Criteria

- [ ] Bug 1: `batch?.feedName` → `batch?.name`. §8 rows show real batch names.
- [ ] Bug 2: `fe.deliveryDate` → `fe.date`. §8 rows show the delivery date.
- [ ] `+ Add feed` button appears in the §8 section header (top-right, `btn btn-green btn-xs`).
- [ ] Clicking `+ Add feed` expands the inline form below the list. Date defaults to today clamped to event window. Batch selector shows all non-archived batches.
- [ ] Multi-batch add works: select two batches, set qty on each, save → two `event_feed_entries` rows created with matching date.
- [ ] Per-row Edit (pencil) button opens the inline form pre-populated with date + qty; batch is displayed but locked (not toggleable).
- [ ] Edit save updates the `event_feed_entries` row and adjusts `batches.remaining` by the delta.
- [ ] All 5 validation guards reject inline with the correct copy.
- [ ] `Deliver feed` big button removed from §8 card footer. `Move feed out` button remains.
- [ ] Delete (×) button unchanged; inventory restored on delete.
- [ ] Dashboard and event card DMI / NPK / cost update after any add/edit (compute-on-read).
- [ ] Cancel from edit mode: no state changes.
- [ ] Visual layout matches v1 — verify against `/sessions/affectionate-upbeat-sagan/mnt/get-the-hay-out/index.html` line 22367 onward.
- [ ] Unit tests: display rendering with real batch resolves name correctly; validation guards; inventory delta on edit; multi-batch add creates N rows; edit pre-population; edit locks batch.
- [ ] PROJECT_CHANGELOG.md updated (one row).
- [ ] OI-0085 closed on completion.

---

## Part 6 — Files to touch

**Modified:**
- `src/features/events/detail.js` — fix the 2 display bugs; rewrite `renderFeedEntries` to v1 inline pattern including the inline add/edit form logic.
- `src/styles/main.css` — verify `.batch-sel`, `.batch-sel.on`, `.chk`, `.qty-btn`, `.qty-val`, `.card-inset` classes exist (they likely do from delivery.js / OI-0072 work); if missing, port from v1.

**May be extracted (builder's choice if detail.js gets too big):**
- `src/features/events/feed-entry-inline-form.js` — the inline form render + state + save logic. Only extract if it materially improves readability; otherwise inline is fine.

**New:**
- `tests/unit/feed-entry-inline-form.test.js` (or expand `tests/unit/feed-entry-entity.test.js` if it covers the save flow) — unit tests per acceptance criteria.

---

## Part 7 — Design Principles to Watch

- **Scoped changes only.** Do not touch `delivery.js` or the standalone Deliver Feed sheet — that's OI-0072's territory and is used from dashboard-level CTAs.
- **No innerHTML** — all DOM via builder (`el()`, `text()`, `clear()`).
- **Store param-count check** (CLAUDE.md #7) — every `add()` call has 5 params, `update()` has 6, `remove()` has 3.
- **No invariant check required** for feed entries. They're point-in-time, not windows. DMI/NPK/cost cascade on read automatically. (The invariant check lives in §9 Feed Checks — don't bleed it into §8.)
- **Match v1 exactly.** Use the extracted HTML and class names in Part 2 as the ground truth. Don't reinvent styling.
- **Invention stop rule.** If anything not covered here comes up, flag in OPEN_ITEMS.md with status "open — DESIGN REQUIRED."
