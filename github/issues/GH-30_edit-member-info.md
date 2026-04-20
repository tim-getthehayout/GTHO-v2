# Edit Member Info — Display Name, Email, Role (Pending Invites + Accepted Members)

## Summary

CP-66 (closed 2026-04-20) shipped invite creation, role change for accepted members, member removal, link copy/regenerate, and invite cancel — but did NOT include any edit path for the captured `display_name` / `email` fields after the invite row is created. This spec adds:

1. **Pending invite in-place edit** — owner/admin can edit `display_name`, `email`, and `role` on a pending invite row without cancelling and re-issuing.
2. **Accepted member edit** — owner/admin can edit `display_name` and `email` on accepted non-owner non-self rows. Role edit already works via the existing `renderRoleSelect` and stays in place.

**Why this matters:** Without this, an admin who typos an email when creating an invite must Cancel → start over (which generates a new token and invalidates any link they may have already copied to a draft message). And once a member accepts, neither the admin nor the member has any UI to update display name or email — drift accumulates and the email-based fallback claim path silently breaks if a primary email changes.

**Origin:** OI-0120 (2026-04-20). Surfaced during CP-66 close-out audit.

## Schema Impact

**NONE.** Both `display_name` and `email` columns already exist on `operation_members` (added in CP-66 migration). No new columns, no migration.

**Verify before write (Claude Code task):** Check whether `operation_members` has a `(operation_id, email)` UNIQUE constraint. If not, the spec defaults to a client-side collision check before write (see Edge Cases below). If it does, surface the unique-constraint error inline.

```sql
-- Verification query
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'operation_members'
  AND con.contype = 'u';
```

## CP-55/CP-56 Spec Impact

**NONE.** No schema change → no export/import shape change. The existing CP-55 export already includes `display_name` and `email`; CP-56 import already round-trips them. This spec only exposes editing; the underlying data flow is unchanged.

## UX Flow

### Entry Points (unchanged)

Settings → Section 2 (Operation) → "Members" row → tap opens Member Management sheet (CP-66's `openMemberManagementSheet`).

### Pending Invite Row — Add Edit Button

**Current state** (`src/features/settings/member-management.js:100-115`): pending row actions are Copy / Regenerate / Cancel.

**New state:** insert "Edit" button as the first action, before Copy. Order: **Edit | Copy | Regenerate | Cancel**.

```js
// In renderMemberList, inside the `if (isPending)` branch, prepend:
actions.push(el('button', {
  className: 'btn btn-outline btn-xs',
  'data-testid': `member-edit-${member.id}`,
  onClick: () => showEditForm(member, operationId, panel, { isPending: true }),
}, [t('members.edit')]));
```

**Tap behavior:** reveals an inline expand-in-place form **below the row** (matches CP-66's invite creation pattern of expanding inline rather than opening a separate sheet — phone-friendly).

### Accepted Member Row — Add Edit Button

**Current state** (`src/features/settings/member-management.js:117-124`): accepted non-owner non-self row actions are Role Select + Remove.

**New state:** insert "Edit" button between Role Select and Remove. Order: **Role Select | Edit | Remove**.

```js
// In renderMemberList, inside the `else { if (!isSelf) { ... } }` branch, after renderRoleSelect:
actions.push(el('button', {
  className: 'btn btn-outline btn-xs',
  'data-testid': `member-edit-${member.id}`,
  onClick: () => showEditForm(member, operationId, panel, { isPending: false }),
}, [t('members.edit')]));
```

**Tap behavior:** reveals an inline expand-in-place form below the row.

### Edit Form — Inline Expand-in-Place

**Single function `showEditForm(member, operationId, panel, opts)`** handles both pending and accepted cases. Differs only by which fields render and the role control inclusion.

**Form fields:**

| Field | Pending invite | Accepted member |
|-------|----------------|-----------------|
| Display name | text input, pre-populated with `member.display_name`, required | text input, pre-populated, required |
| Email | email input, pre-populated with `member.email`, required + `@` check | email input, pre-populated, required + `@` check |
| Role | segment control (admin / team_member), pre-selected from `member.role` | NOT shown — role select stays on the row |

**Buttons:** Save (green primary) | Cancel (outline secondary). Cancel discards changes and collapses the form. Save validates → writes to Supabase → toasts → re-renders the member list (which collapses the form via re-render).

**Inline error area:** below the form, above the buttons. Used for validation failures and Supabase error messages (e.g. email collision).

**Form placement:** insert immediately after the row's `member-row` element. Use `[data-testid="member-edit-form-{id}"]` for stable test selectors.

**Form removal on re-render:** since `renderMemberList` calls `clear(panel)` and rebuilds, the form is naturally removed when the list re-renders. No special teardown needed.

**Idempotent open:** if the form is already open for a given member when Edit is tapped again, do nothing (or close it). Recommended: close it (toggle behavior). Implementation: query `panel.querySelector('[data-testid="member-edit-form-{id}"]')` before showing; if exists, remove and return.

### Save Flow

1. Validate inputs:
   - `name = inputs.name.value.trim()` — must be non-empty. Error: `t('members.nameRequired')`.
   - `email = inputs.email.value.trim()` — must be non-empty AND contain `@`. Error: `t('members.emailInvalid')`.
2. Build update payload:
   ```js
   const updates = {
     display_name: name,
     email,
     updated_at: new Date().toISOString(),
   };
   if (opts.isPending) {
     updates.role = inputs._role; // segment control state
   }
   ```
3. Email collision check (client-side, **only if no DB unique constraint exists** — verify per Schema Impact above):
   ```js
   const { data: existing } = await supabase
     .from('operation_members')
     .select('id')
     .eq('operation_id', operationId)
     .eq('email', email)
     .neq('id', member.id);
   if (existing && existing.length > 0) {
     showInlineError(t('members.emailInUse'));
     return;
   }
   ```
   If a DB unique constraint exists, skip this check and rely on the constraint error from the update call.
4. Write to Supabase:
   ```js
   const { error } = await supabase
     .from('operation_members')
     .update(updates)
     .eq('id', member.id);
   ```
5. Handle error:
   - If error matches unique-constraint violation pattern, surface as `t('members.emailInUse')`.
   - Otherwise log via `logger.error('members', 'Failed to edit member', { error: error.message })` and surface error message inline.
6. Success: `showToast(t('members.changesSaved'))`, `logger.info('members', 'member edited', { operationId, memberId: member.id })`, then `await renderMemberList(panel, operationId)`.

### Permissions (matches CP-66 model)

| Viewer role | Pending invite Edit visible? | Accepted member Edit visible? |
|-------------|------------------------------|-------------------------------|
| owner | yes (all rows) | yes (all non-owner non-self rows) |
| admin | yes (all rows) | yes (all non-owner non-self rows) |
| team_member | no (no member management UI at all) | no |

Owner row: never has an Edit button (matches CP-66's owner-protection rule). To change the owner's display_name / email, the owner must use the self-profile path — currently absent from the app, captured as a known gap in OI-0120 Notes, out of scope for this spec.

Self row: never has an Edit button (self-edit out of scope; same rationale).

## i18n Strings (new)

Add to `src/i18n/i18n.js` (or wherever the locale dictionary lives):

```
members.edit              → "Edit"
members.editTitle         → "Edit member"
members.editPending       → "Edit invite"
members.saveChanges       → "Save changes"
members.changesSaved      → "Changes saved"
members.emailInUse        → "This email is already used by another member"
```

If the project uses placeholder interpolation, no params needed for any of these.

## Files to Modify

1. **`src/features/settings/member-management.js`** — primary surface
   - Add `showEditForm(member, operationId, panel, opts)` function (modeled on `showInviteForm`)
   - Add `editMember(member, operationId, panel, inputs, statusEl, opts)` async save function (modeled on `createInvite`)
   - Modify `renderMemberList` action arrays to include the Edit button per the rules above
2. **`src/i18n/i18n.js`** (or per-locale files) — add the six new strings above
3. **`tests/unit/member-management-edit.test.js`** — new test file, six cases (see Test Plan)
4. **`tests/e2e/member-edit.spec.js`** — new e2e file, full edit + Supabase round-trip

## Acceptance Criteria

- [ ] Edit button renders on pending invite rows for owner/admin (`data-testid="member-edit-{id}"`)
- [ ] Edit button renders on accepted non-owner non-self rows for owner/admin
- [ ] Owner row has no edit button (CP-66 owner-row protection)
- [ ] Self row has no edit button (self-edit out of scope)
- [ ] Team members see no edit buttons (no member management UI for them at all)
- [ ] Tapping Edit on a pending row reveals inline form with display_name input, email input, role segment control, Save + Cancel
- [ ] Tapping Edit on an accepted row reveals inline form with display_name input, email input, Save + Cancel (no role segment)
- [ ] Tapping Edit again on a member with an open form closes it (toggle behavior)
- [ ] Save validates display_name (trimmed non-empty) and email (trimmed non-empty + contains `@`); validation failures surface inline above the buttons
- [ ] Save persists to Supabase via `update` on `operation_members.id`; success toast `t('members.changesSaved')` shows; member list re-renders with new values
- [ ] Email collision (another row in same operation has same email) shows inline error `t('members.emailInUse')`. Implementation matches DB constraint state (see Schema Impact verification step)
- [ ] Cancel button collapses the form without writing
- [ ] All user-facing strings use `t()` — no hardcoded English
- [ ] No `innerHTML` — DOM builder (`el()`, `text()`, `clear()`) only
- [ ] All `logger.*` calls use the structured `(category, message, context)` signature
- [ ] Unit tests cover all six cases (see Test Plan)
- [ ] E2E test verifies Supabase row reflects the edit (per CLAUDE.md §E2E rule)

## Test Plan

**Unit (`tests/unit/member-management-edit.test.js`):**

- [ ] Pending invite happy path: open form, change all three fields, Save → Supabase update called with `display_name`, `email`, `role`, `updated_at`; list re-renders; toast shown
- [ ] Accepted member happy path: open form, change display_name + email, Save → Supabase update called with both fields + `updated_at` (no `role`); list re-renders
- [ ] Validation failures: empty display_name shows `t('members.nameRequired')`, no Supabase call. Bad email (no `@`) shows `t('members.emailInvalid')`, no Supabase call
- [ ] Owner row: assert no edit button rendered (`querySelector('[data-testid="member-edit-{ownerId}"]')` returns null)
- [ ] Self row: assert no edit button rendered for the current user's row
- [ ] Email collision (mock Supabase to return existing row): inline error `t('members.emailInUse')`, no update call

**E2E (`tests/e2e/member-edit.spec.js`)** — per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI":

- [ ] Admin opens member management sheet, edits a pending invite's email (e.g. `typo@example.com` → `correct@example.com`), Saves
- [ ] Verify success toast appears in UI
- [ ] Query Supabase: `SELECT email FROM operation_members WHERE id = ?` returns `correct@example.com`
- [ ] Verify the member list re-renders with the new email visible

## Notes

**Why a single `showEditForm` for both pending and accepted (instead of two separate functions):** the form structure is 90% identical — same display_name input, same email input, same Save/Cancel pattern. The only difference is whether the role segment control renders. Branching on `opts.isPending` inside one function keeps the spec smaller and the code more grep-able. If the surfaces diverge later, splitting is cheap.

**Why role stays on the accepted row (not folded into the edit form):** the existing `renderRoleSelect` is single-tap inline change with immediate Supabase write — no edit-mode, no Save button. Tim has used this pattern in production; folding role into a multi-field edit form would slow down the most common admin task (promote a team member to admin). Keep them separate.

**Why role IS in the pending edit form:** pending rows have no role select today (only Copy/Regenerate/Cancel). Adding a separate inline role select for pending rows would clutter the action row. The edit form is the most natural place to expose role for pending invites — admins need it less often there (role is usually set correctly at creation), so the extra tap to open the form is acceptable.

**Why no audit log:** out of scope for this spec. Could be added later via `app_logs` insertion in `editMember`. Captured as a future enhancement, not a blocker.

**Self-profile editing:** known gap left by CP-66 and not closed by this OI. A member who needs to change their own display_name today must ask an admin to do it for them. If/when this becomes painful, open a separate OI for a self-profile editing UI in user account settings.

**Build phase:** Phase 3.5 polish. Ships standalone — no dependency on OI-0119 (DMI-8 cascade) or other UI sprint items. Can be implemented in any order relative to the rest of the sprint.
