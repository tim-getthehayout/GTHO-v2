# Cull Animal Sheet — V1 Parity + Fix Broken Stub

## Summary

Replace the broken `window.prompt()`-based cull stub in the animal edit dialog with a proper Cull Sheet (date, reason, notes) matching v1's UI and persisting all three fields to Supabase. Also replace the placeholder culled banner with the v1 version that renders date + reason + notes.

**Related OI:** OI-0086.

## Why this matters

**Current state is silently broken:**
- `src/features/animals/index.js` line 1256–1257 uses `window.prompt()` for a cull reason only — no date picker, no notes field, no confirmation.
- The update call sends `{ culled: true, cullReason: reason }`. The animal entity has no `culled` field — the real field is `active` (boolean). So `culled: true` never reaches Supabase via `toSupabaseShape()`. The reason string **does not survive a sync round-trip** because the "am I culled" flag is wrong.
- The reactivate button reads `existingAnimal.culled`, which is always undefined — meaning the UI cannot display the culled state correctly.
- No date is captured at all. No notes field exists.

**This violates the "no local-only fields" rule.** Every UI-captured cull field must persist to Supabase.

**Good news:** the schema, migration, and entity are already correct (`cull_date`, `cull_reason`, `cull_notes` columns exist; entity has `cullDate`, `cullReason`, `cullNotes` with `sbColumn` mappings and full round-trip in `toSupabaseShape` / `fromSupabaseShape`). The fix is UI-only.

## What Claude Code builds

### 1. Cull Sheet (new)

A proper sheet opened from the "Cull animal…" button in the animal edit dialog. Three fields, all persisting to Supabase.

**V1 HTML reference** (index.html line 22160 in the `get-the-hay-out` repo — use as the parity target, translated into the v2 DOM builder pattern):

```html
<div class="sheet-wrap" id="cull-sheet-wrap">
  <div class="sheet-backdrop"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Cull animal</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;" id="cull-animal-label">
      <!-- e.g. "A-0042 · Tag 203 · 1,120 lbs" -->
    </div>
    <div class="two">
      <div class="field"><label>Date</label>
        <input type="date" id="cull-date"/>
      </div>
      <div class="field"><label>Reason</label>
        <select id="cull-reason">
          <option value="Sold">Sold</option>
          <option value="Died (natural)">Died (natural)</option>
          <option value="Died (injury)">Died (injury/accident)</option>
          <option value="Euthanized">Euthanized</option>
          <option value="Culled (production)">Culled — poor production</option>
          <option value="Culled (health)">Culled — health / chronic</option>
          <option value="Culled (age)">Culled — age</option>
          <option value="Culled (temperament)">Culled — temperament</option>
          <option value="Other">Other</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Notes <span style="font-size:10px;color:var(--text2);">optional</span></label>
      <input type="text" id="cull-notes" placeholder="Buyer name, cause of death, price received…"/>
    </div>
    <div class="banner ban-amber" style="margin-bottom:12px;font-size:12px;color:var(--amber-d);">
      Animal will be removed from its group and marked inactive.
      All history (weight, calving, lineage) is preserved.
      You can reactivate from the animal record if needed.
    </div>
    <div class="btn-row">
      <button class="btn btn-amber">Confirm cull</button>
      <button class="btn btn-outline">Cancel</button>
    </div>
  </div>
</div>
```

**Defaults:**
- Date defaults to today (editable, can be backdated)
- Reason defaults to "Sold"
- Notes blank

**Save behavior (`saveCull` equivalent):**
1. `update('animals', animalId, { active: false, cullDate: date, cullReason: reason, cullNotes: notes }, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals')`
2. For every open `animal_group_memberships` row for this animal (where `dateLeft === null`):
   `update('animalGroupMemberships', m.id, { dateLeft: date, reason: 'cull' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships')`
3. Close the cull sheet, close the animal edit sheet, re-render the Animals screen and dashboard.
4. Toast/alert: `"{systemId} ({tagNum}) marked as culled ({reason}). Removed from group — DMI targets updated."`

**Store call param-count check:** verify both update calls have all 6 params (entityType, id, changes, validateFn, toSupabaseFn, table) — this is a known v2 trap (see CLAUDE.md Rule 7, OI-0050).

### 2. Culled-state banner (replaces placeholder)

When viewing a culled animal (`active === false`), replace the current broken banner with:

```html
<div class="banner ban-red" style="margin-bottom:0;">
  <div style="font-size:13px;font-weight:600;color:var(--red-d);">Culled — {cullReason}</div>
  <div style="font-size:12px;color:var(--red-d);">{cullDate}{cullNotes ? ' · ' + cullNotes : ''}</div>
  <button class="btn btn-outline btn-xs" style="margin-top:6px;">Reactivate</button>
</div>
```

**Reactivate behavior:**
- Confirm dialog: `"Reactivate {systemId} ({tagNum})? You can reassign them to a group after reactivation."`
- `update('animals', animalId, { active: true, cullDate: null, cullReason: null, cullNotes: null }, …)`
- Close animal edit. User must reassign to a group manually (same as v1).

### 3. Remove the broken stub

Delete lines 1241–1261 of `src/features/animals/index.js` (the `window.prompt` cull and the reactivate-via-`existingAnimal.culled` branch). Replace with the sheet + banner pattern above.

## Acceptance Criteria

- [ ] Tapping "Cull animal…" in the animal edit dialog opens the Cull Sheet (not a `window.prompt`).
- [ ] Cull Sheet renders Date (default today) + Reason (dropdown with all 9 v1 options) + Notes (optional text input).
- [ ] Animal label in the header shows `systemId · tagNum · weightLbs` when available.
- [ ] Amber info banner is shown above the buttons.
- [ ] "Confirm cull" saves `active=false`, `cullDate`, `cullReason`, `cullNotes` to Supabase (verify via direct query, not just localStorage).
- [ ] "Confirm cull" closes all open group memberships on the cull date with `reason: 'cull'`.
- [ ] After cull, animal is hidden from the Animals list unless "Show culled" is checked; dashboard "Culled this season" count increments.
- [ ] Viewing a culled animal shows the red banner with reason, date, and notes (if any) + Reactivate button.
- [ ] Reactivate clears all four cull fields (`active`, `cullDate`, `cullReason`, `cullNotes`) and syncs to Supabase.
- [ ] No `window.prompt()` anywhere in the cull flow.
- [ ] All four fields round-trip correctly: cull an animal, query Supabase directly, confirm all three cull columns populated; reload app from Supabase, confirm banner displays the same values.
- [ ] No `innerHTML` with dynamic content (use DOM builder per v2 rules).
- [ ] No hardcoded English strings — use `t()`.
- [ ] `logger.info('cull', '…')` on confirm and reactivate (not `console.log`).
- [ ] PROJECT_CHANGELOG.md updated.

## Test Plan

### Unit tests (Vitest)
- [ ] `cull-sheet.test.js`: saving a cull produces the correct `update` call with all 6 params and the correct payload (`active: false`, `cullDate`, `cullReason`, `cullNotes`).
- [ ] Group membership close: given an animal in 2 open memberships, saving a cull closes both with `dateLeft = cullDate`.
- [ ] Reactivate clears all four fields.

### E2E (Playwright — sync verification pattern per CLAUDE.md)
- [ ] Cull an animal via the sheet. Query Supabase directly: `animals` row has `active=false`, `cull_date`, `cull_reason`, `cull_notes` populated. `animal_group_memberships` open row has `date_left = cull_date`.
- [ ] Reload the app (fresh session, pulls from Supabase). Animal renders as culled with banner showing reason + date + notes.
- [ ] Reactivate. Query Supabase: all four cull fields back to null/true.

### Manual
- [ ] Cull an animal with notes="Buyer: Johnson Ranch, $1,200". Verify the banner shows "Culled — Sold" on line 1 and "2026-04-17 · Buyer: Johnson Ranch, $1,200" on line 2.
- [ ] Backdate a cull (pick a date 2 weeks ago). Confirm the group membership close uses that date, not today.

## Related OIs

- OI-0086 — this issue
- OI-0050 — sync param-count trap (guard against regression)
- OI-0053 — migration execution rule (no schema changes needed here, but CP-55/CP-56 specs already cover these columns)

## Notes

**CP-55 / CP-56 impact:** none. The three cull columns were already built into the v2 schema from day one, so the export/import specs already cover them. This is purely UI reconciliation.

**Files:**
- Modified: `src/features/animals/index.js` (remove stub, open new sheet, render new banner)
- New: `src/features/animals/cull-sheet.js` (the Cull Sheet construction + save handler)
- New: `tests/unit/features/animals/cull-sheet.test.js`
- Modified: `tests/e2e/animals.spec.js` (or equivalent — add cull + reactivate sync verification)
- Modified: `src/i18n/locales/en.json` (new strings)
- Modified: `PROJECT_CHANGELOG.md` (one row)

**Why this is a standalone spec (not folded into animals-screen-ui-v1-parity):** The animals-screen spec treats the Cull section as a single button placeholder. The actual dialog + save flow + group membership closing + reactivate flow are enough behavior to warrant their own spec and test coverage.
