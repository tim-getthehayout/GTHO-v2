# Session Brief: SP-10 Event Data Edit Consistency Suite (2026-04-17)

**Context:** Field testing is blocked until every data field inside the Edit Event dialog has predictable edit behavior. Tim walked through all 13 sections of the event detail sheet (from GH-10) and ratified edit-behavior specs for each one. This brief is the handoff.

**Authoritative spec:** `UI_SPRINT_SPEC.md` § SP-10 (ratified 2026-04-17). This brief summarizes and points at that section — do not duplicate; read SP-10 directly for the full walk-throughs.

**Priority:** P0 — blocks field testing.

**Scope:**
- Seven sections of the Edit Event dialog get explicit edit-behavior specs (§7 Groups, §12 Sub-moves, event-level dates, §8 Feed Entries, §9 Feed Checks, §3 Pre-graze, §6 Post-graze).
- One new capability: **§8a Move Feed Out** (farmer pulls feed back out of an active event to batch inventory or another open event).
- One new user action: **Event Reopen** (replaces direct `date_out` editing — routes `date_out` changes through a controlled re-open + re-close flow).
- One new shared UI pattern: **Gap / Overlap Resolution Routine** (three options each, used for structural edits in §7 and event-level dates).

**Dependencies on existing code:**
- `src/features/events/move-wizard.js` — reuse `executeMoveWizard` as the close step for the retro-place flow (§7 gap option 3). The only behavioral change needed is the line filter (`activeEvents`) — see SP-10 Retro-Place Flow.
- `src/features/events/close.js` — Event Reopen action lives near the close sheet and mirrors it in reverse.
- CP-29 feed transfer logic in `move-wizard.js:358+` — reuse for §8a destination=event flow. Same shape (source_event_id link, inbound row on destination).
- Compute-on-read calc layer — cascades automatically for benign edits. DMI / NPK / cost calcs need a one-line update to treat `entry_type='removal'` as negative (see §8a).

---

## OPEN_ITEMS changes

Apply these to `OPEN_ITEMS.md` before starting implementation (already added by Cowork in the same session; verify presence):

- **OI-0081 — SP-10: Event Data Edit Consistency Suite** (P0, open, DESIGN COMPLETE, ready for Claude Code). Covers §7, §12, event-level dates, §8, §9, §3, §6.
- **OI-0082 — SP-10 §8a: Move Feed Out (new capability)** (P1, open, DESIGN COMPLETE, ready for Claude Code). Schema impact: 3 new columns on `event_feed_entries`.

Close on completion:
- **OI-0064** (Manage button dropped from sub-move history; reopen folds into Edit dialog) — folded into SP-10 §12.

---

## Order of implementation (suggested)

Work these in order — later sections assume earlier ones are in place.

### Phase 1: Shared infrastructure

1. **Snapshot + rollback helper** in `src/data/store.js` — a function that captures a typed subset of the store state (e.g., one event + its windows + its feed entries + its checks + its observations) and can restore it atomically. Used by the retro-place flow and any future cancel-with-rollback work. Add a `rollback_in_progress` flag in `localStorage` to make offline rollback safe.
2. **Gap / Overlap resolution routine as a reusable dialog** — `src/features/events/resolve-window-change.js`. Takes a proposed change to a date-bounded record (group window or event-level date) and surfaces the three-option picker when gap or overlap is detected. See SP-10 "Shared Routine: Gap / Overlap Resolution" for spec.

### Phase 2: §8a Move Feed Out (schema change, do early)

3. **Migration** `supabase/migrations/NNN_feed_removal_columns.sql` — adds `entry_type`, `destination_type`, `destination_event_id` + check constraints to `event_feed_entries`. Execute against Supabase. Verify columns land. Also update `src/data/backup-migrations.js` with a no-op entry at the new schema version. See CLAUDE.md "Migration Execution Rule — Write + Run + Verify" and "Code Quality Checks" #6.
4. **Entity update** `src/entities/event-feed-entry.js` — add fields, update `FIELDS`, `toSupabaseShape`, `fromSupabaseShape`.
5. **Calc registry update** — for DMI-1, DMI-5, NPK-1, NPK-2, cost-per-day, change the deliveries sum to (deliveries − removals). One-line per calc. Unit tests: add a case with a removal row, verify the expected net.
6. **CP-55 export** — serialize the three new columns.
7. **CP-56 import** — default old-backup values (delivery / NULL / NULL). Migration in the `BACKUP_MIGRATIONS` chain handles old backups.
8. **Move Feed Out sheet** `src/features/events/move-feed-out.js` — new file. Four-step single-sheet flow per SP-10 §8a. Entry points: card-footer button in §8, per-row inline `Move out` action. Both accept optional `{ preselectBatchId, preselectLocationId }`.

### Phase 3: §7 Groups + shared retro-place

9. **Group window edit dialog** `src/features/events/edit-group-window.js` — new file. Opens from the Edit button on each group row in §7. Fields per SP-10 §7. Auto-save on blur. Delete-window action with guards.
10. **Retro-place flow** `src/features/events/retro-place.js` — new file. Reopens the destination event, runs the move wizard's close step (which writes the group window into the destination and closes it again), handles Cancel via snapshot rollback. See SP-10 "Retro-Place Flow" for the exact sequence. Changes to `move-wizard.js`: update the active-events filter on line 254 to accept a "point-in-time" parameter for the retro-place caller.

### Phase 4: §12 Sub-move History

11. **Paddock window edit dialog** `src/features/events/edit-paddock-window.js` — new file. Two entry points: from §4 Paddocks cards (add Edit button) and from §12 Sub-move History rows (Edit button already exists per GH-10). Same dialog. Fields per SP-10 §12. No gap detection (gaps are legal — animals were on another paddock). Range guards + same-paddock overlap reject. Delete window + guards. Includes the reopen action for closed windows (clears `date_left`/`time_left`) — this folds in OI-0064.

### Phase 5: Event-level dates + Event Reopen

12. **`date_in` direct edit** — inline on the Edit Event dialog header. Reject-on-narrow (blocks edit if any child record would fall outside). Confirm-on-widen (proceed but warn — new gap at the front of the event is acceptable, farmer should check §4 Paddocks and §7 Groups after). See SP-10 Event-level Dates.
13. **Event Reopen action** `src/features/events/reopen-event.js` — new file. Visible on the Edit Event dialog footer for closed events only. Clears `date_out`, re-opens matching child windows (paddock windows that closed with the event, group windows that closed with the event). Runs the invariant check for group conflicts with subsequent events — surfaces the three-option picker (leave on subsequent / pull back / cancel). On re-close (after farmer re-commits the now-open event), runs overlap check against subsequent events — warning only, no block. See SP-10 Event-level Dates.

### Phase 6: §9 Feed Checks

14. **Feed check edit invariant** — on save, run the `consumed(Ti → Ti+1) ≥ 0` check across all adjacent intervals on the feed line (batch × location). Four cases per SP-10 §9: (A) benign → silent cascade, (B) later-interval break → **Re-snap dialog** offering to delete later invalid checks + save, (C) earlier-interval break → conflict surface with Cancel only, (D) back-fill past-dated check → same check against both neighbors.
15. **Re-snap dialog** — reusable dialog for Case B. Lists the specific impossible check(s), offers [Cancel edit] or [Delete later checks and save]. After save, non-modal toast + shortcut button to open a new check dialog pre-filled for that feed line.

### Phase 7: §3 + §6 Observations

16. **Inline auto-save on blur** for all pre-graze and post-graze observation fields per SP-10 §3 and §6. Field-level validation only (non-negative, % ≤ 100, recovery 0-365). No warnings on DMI shifts — silent cascade by design.
17. **Recovery window edit** — live date preview shows `{event.date_out + recovery_window_days}` as farmer types. Planning conflict (recovery window overlaps a planned future event) surfaces at the future event's planning step, not on the §6 edit.

---

## Acceptance Criteria

Per-section ACs are in SP-10. Top-level ACs for the brief:

- [ ] All seven sections (§3, §6, §7, §8, §9, §12, event-level dates) have working inline edit behavior per SP-10.
- [ ] §8a Move Feed Out capability works end-to-end: both entry points, all four steps, both destinations (batch and event).
- [ ] Retro-Place flow (§7 gap option 3) successfully reopens a closed destination event, places the group, re-closes, and handles Cancel with full snapshot rollback.
- [ ] Event Reopen action clears `date_out`, re-opens matching child windows, and catches subsequent-event group conflicts with the three-option resolver.
- [ ] Gap / Overlap Resolution dialog appears whenever a structural edit would create gap or overlap; three options for each.
- [ ] Re-snap dialog appears on Feed Check edits that break a later interval.
- [ ] All DMI / NPK / cost calcs correctly treat `entry_type='removal'` as negative.
- [ ] Migration executed + verified per CLAUDE.md "Migration Execution Rule."
- [ ] CP-55 / CP-56 updated for the three new columns.
- [ ] Unit tests: new snapshot/rollback helper, new re-snap dialog logic, new calc registry behavior with removals, Event Reopen invariant check.
- [ ] E2E test: create event → deliver feed → move feed out to another event → verify source + destination Supabase rows have correct `entry_type`, `destination_type`, `destination_event_id`, `source_event_id`.
- [ ] PROJECT_CHANGELOG.md updated with one row per commit.
- [ ] OI-0064, OI-0081, OI-0082 closed on completion.

---

## Files likely to touch

**New files:**
- `src/features/events/move-feed-out.js`
- `src/features/events/edit-group-window.js`
- `src/features/events/edit-paddock-window.js`
- `src/features/events/reopen-event.js`
- `src/features/events/retro-place.js`
- `src/features/events/resolve-window-change.js`
- `supabase/migrations/NNN_feed_removal_columns.sql`

**Modified files:**
- `src/entities/event-feed-entry.js`
- `src/features/events/event-detail.js` (all section cards — add per-row `Move out`, Edit buttons on group rows, etc.)
- `src/features/events/move-wizard.js` (line 254 — accept point-in-time param for retro-place)
- `src/data/store.js` (snapshot/rollback helpers)
- `src/data/backup-export.js`, `src/data/backup-import.js`, `src/data/backup-migrations.js`
- Calc registry file(s) for DMI-1, DMI-5, NPK-1, NPK-2, cost-per-day
- `tests/unit/` — new tests for calc behavior, entity round-trip, snapshot/rollback
- `tests/e2e/` — new test for Move Feed Out Supabase verification

---

## Design principles to watch

- **Scoped changes only.** Don't refactor surrounding code.
- **Root cause fix.** If you hit a bug that needs a structural change not spec'd here, stop and flag it in OPEN_ITEMS.md with status "open — DESIGN REQUIRED."
- **Invention-required stop rule.** If a flow or field is not in SP-10 or GH-10, add an OPEN_ITEMS entry and continue with other work.
- **Compute-on-read.** No derived values get stored. All DMI / NPK / cost flows through the calc registry.
- **Mutation pattern.** Every store action: validate → mutate → persist → queue sync → notify.
- **Store param-count check** (CLAUDE.md #7) before committing.

---

## References

- Full spec: `UI_SPRINT_SPEC.md` § SP-10 (all seven sections ratified 2026-04-17)
- GH-10 spec file: `github/issues/GH-10_event-detail-view.md` (the 13-section event detail sheet)
- Schema: `V2_SCHEMA_DESIGN.md` — `events`, `event_group_windows`, `event_paddock_windows`, `event_feed_entries`, `event_feed_checks`, `event_observations`
- FK ordering rules: `V2_MIGRATION_PLAN.md` §5.3a (relevant for rollback ordering — children before parents on delete, parents before children on insert)
- Related OI (closed): OI-0064 (sub-move reopen folds into Edit) — implementation should close this.
