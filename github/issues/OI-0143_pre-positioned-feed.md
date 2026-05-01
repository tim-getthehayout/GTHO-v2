# OI-0143 — Pre-positioned feed at paddocks with no active event (Option 2 framework: new `staged_feed_entries` entity + hand-off rule)

**Priority:** P2 (real-world farmer workflow that the current event-centric model can't represent — Tim has bumped up against this himself)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0143.
**Labels:** `feature`, `feed`, `schema`, `v2-build`
**Status:** **DESIGN LOCKED on framework** (Option 2 — new `staged_feed_entries` entity); **DESIGN REQUIRED on workflow details.** Six sub-questions (SQ1–SQ6) need Tim's answers before this spec is converted into a full implementation spec for Claude Code. **Do not start implementation work on this OI until Tim resolves SQ1–SQ6 and the spec is finalized.**

## Summary

The current data model is strictly event-centric for feed: `event_feed_entries.event_id` is `NOT NULL` and the delivery sheet is reachable only from event detail. Farmers cannot represent feed staged at a paddock before the cattle arrive there (winter pre-positioning, dropping bales along a future rotation, staging at remote paddocks during a single transport trip, etc.). Tim's call: build a parallel `staged_feed_entries` table that holds pre-positioned feed without an event link; when an event opens at the destination location, a hand-off rule converts qualifying staged rows into `event_feed_entries` rows attached to that event.

## Why Option 2 was chosen

Three options were considered (full discussion in OPEN_ITEMS.md → OI-0143):

1. Allow `event_feed_entries.event_id` to be nullable + add backfill on event open
2. **New entity `staged_feed_entries` + explicit hand-off** (chosen)
3. "Phantom" location-only event holding pre-positioned hay until a real event arrives

Option 2 wins because the hand-off becomes an explicit, atomic, auditable transition rather than an implicit nullable-field interpretation. DMI calcs and `getLiveRemainingForMove` don't grow `event_id IS NULL` branches. Same drift-class avoidance as OI-0117 / OI-0133 (separating "staged at a place" from "delivered to an event" cleanly into two tables, rather than overloading one table's nullable column).

## Framework — Option 2 mechanic (DESIGN LOCKED)

New entity `staged_feed_entries` parallel to `event_feed_entries` but with no `event_id`:

```
staged_feed_entries
  id              uuid (pk)
  operation_id    uuid (fk → operations)
  batch_id        uuid (fk → batches)
  location_id     uuid (fk → locations)
  date            date
  time            text (HH:MM, optional)
  quantity        numeric
  notes           text (optional)
  created_at      timestamptz
  updated_at      timestamptz
```

When an event opens (or is already open) at the destination location, a hand-off step converts qualifying staged rows into `event_feed_entries` rows attached to that event.

## Sub-questions for Tim — DESIGN REQUIRED before this spec is finalized

### SQ1 — Entry point for staging

Where in the UI does a farmer stage feed?

- **(a) Location detail page → new "Stage feed" action.** Matches the spatial mental model ("I want to drop hay at this paddock"). *(Cowork's lean — primary)*
- **(b) Batches/inventory screen → "Drop at location" action picking a destination.** Matches the inventory-out mental model ("I'm planning a feed-out trip from these bales").
- **(c) A new "Inventory" tab/route.** Heavier UI footprint, more discoverable.

Both (a) and (b) could ship; pick at least one for v1. **Tim's call.**

### SQ2 — Hand-off trigger

When does a staged row convert to an event-linked row?

- **(i) Automatic on event open** at the same location — every staged row at that location flips immediately when an `event_paddock_window` opens, with a per-event audit trail showing which entries came in via hand-off. *(Cowork's lean)*
- **(ii) Manual via prompt** — when an event opens, app shows "Stage X bales of {batch} at this paddock — attach to this event?" confirmation.
- **(iii) On first feed check** — staged rows attach when the farmer takes the first feed check on the new event.

Cowork's lean: **(i) automatic with audit trail.** Manual prompts add friction; first-check trigger lags reality. **Tim's call.**

### SQ3 — Partial consumption between staging and event open

A bale staged at G-1 might lose to weather, vermin, or trespass cattle before the planned event opens. Staged row says "1.0 bale on date X"; reality on event-open day is "0.6 bale." How does hand-off handle this?

- **(α) Hand-off uses staged quantity as-is** (`quantity = 1.0`); farmer takes a feed check at event open to record actual remaining. *(Cowork's lean — lowest friction, faithful to physical record)*
- **(β) Hand-off prompts for current quantity** at hand-off time and uses that.
- **(γ) Hand-off creates both** the entry (1.0) AND a forced first feed check (0.6) so the math reflects reality immediately.

Cowork's lean: **(α).** Keeps the staged delivery as a faithful record of what was placed; the next feed check (which OI-0119 already forces on sub-move close, and OI-0139 prefill consolidates on) captures actual remaining. **Tim's call.**

### SQ4 — Multi-event matching rule

Two open events both have open paddock windows at the same location L (strip grazing across multiple groups, or sequential events sharing a sub-paddock briefly). When a staged row at L hands off, which event does it attach to?

- **The most-recently-opened `event_paddock_window` at that location.** *(Cowork's lean — same recency rule as OI-0140's picker default; rare in practice but rule must be deterministic)*
- All open events get a copy of the row (split quantity proportionally? duplicate?).
- Prompt the farmer at hand-off.

Cowork's lean: **most-recently-opened window wins, single attachment.** **Tim's call.**

### SQ5 — Staging visibility on location detail

A paddock with staged feed but no active event — should the location card render a "X bales staged" chip / row?

- **Yes — show "X bales staged" chip on location card.** *(Cowork's lean — out-of-sight-out-of-mind risk otherwise)*
- No — staged inventory only visible from the inventory screen / dedicated surface.

Cowork's lean: **yes.** **Tim's call.**

### SQ6 — Edit / delete staged rows before hand-off

Can a farmer correct a staged row (change quantity, change location, delete entirely) before any event handles it?

- **Yes — full CRUD on staged rows pre-hand-off.** Once handed off, the row is an `event_feed_entries` row and follows that table's edit/delete rules. *(Cowork's lean)*
- No — staged rows are immutable once written; corrections require delete + re-create.

Cowork's lean: **full CRUD pre-hand-off.** **Tim's call.**

## Files (anticipated; will be locked when SQ1–SQ6 resolve)

- `supabase/migrations/NNN_staged_feed_entries.sql` — new table + RLS + indexes; schema_version bump
- `src/entities/staged-feed-entry.js` — new entity file (FIELDS, create, validate, toSupabaseShape, fromSupabaseShape with numeric coercion on quantity per CLAUDE.md §"Known Traps")
- `src/data/store.js` — entityType + collection accessor; consume in any `getVisibleX` patterns where appropriate
- `src/data/sync-registry.js` + `src/data/push-all.js` — register new entity
- `src/data/backup-export.js` `BACKUP_TABLES` — add table
- `src/data/backup-import.js` `FK_ORDER` — add position; bump `CURRENT_SCHEMA_VERSION`
- `src/data/backup-migrations.js` — `BACKUP_MIGRATIONS[N-1]` no-op rule for old backups
- Staging entry-point UI per SQ1 — file path TBD
- `src/features/feed/staging-handoff.js` — new helper for the hand-off rule per SQ2
- Hooks into wherever paddock windows open (e.g., `src/features/events/event-start.js`, `src/features/events/move-wizard.js`, sub-move open) — trigger hand-off per SQ2
- `src/i18n/locales/en.json` — staging-related keys
- New unit tests (entity round-trip, hand-off rule, edge cases) + e2e (Supabase round-trip per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI")

## Acceptance criteria (high-level — locked in detail when SQ1–SQ6 resolve)

- [ ] Migration NNN written, applied, and verified against Supabase per CLAUDE.md §"Migration Execution Rule — Write + Run + Verify"; commit message includes the verify query result
- [ ] `staged_feed_entries` entity round-trips (toSupabaseShape ↔ fromSupabaseShape) with full FIELDS coverage; numeric coercion on `quantity` per CLAUDE.md §"Known Traps"
- [ ] CRUD on staged rows works per SQ6 lock
- [ ] Hand-off rule fires per SQ2 lock; staged rows transition cleanly to `event_feed_entries`; original staged row is deleted (or marked handed-off — sub-decision when SQ2 resolves)
- [ ] Multi-event matching deterministic per SQ4 lock
- [ ] Location card shows staged inventory per SQ5 lock
- [ ] CP-55/CP-56 round-trip clean — existing pre-migration backups restore without error and re-export with no drift; new backups including staged rows round-trip cleanly
- [ ] End-to-end Tim's pre-positioning workflow: stage hay at G-1 with no active event; later open an event at G-1; staged row converts to event-linked row with date preserved; first feed check at event open captures actual remaining; e2e test asserts the Supabase row shape at every step
- [ ] OPEN_ITEMS.md OI-0143 flipped to closed in the same commit (orphan-flip rule per CLAUDE.md §"OPEN_ITEMS.md Closure Discipline")
- [ ] Piggyback sweep: grep OPEN_ITEMS.md for `staged`, `pre-position`, `event_id IS NULL`, `staging` — flip any now-moot entries
- [ ] PROJECT_CHANGELOG.md row added
- [ ] GitHub issue closed with commit hash

## Schema change

**YES** — new `staged_feed_entries` table, migration NNN, schema_version bump.

## CP-55/CP-56 impact

**YES** — new `BACKUP_TABLES` entry, new position in `FK_ORDER` (after `batches` and `locations`, before `events`/`event_feed_entries` since the hand-off creates rows in those tables), new `BACKUP_MIGRATIONS[N-1]` no-op rule for old backups (staged_feed_entries simply doesn't exist in pre-migration backups; restore should default to empty array, not error). V2_MIGRATION_PLAN.md §5.3 + §5.3a updated.

## Architectural notes

- **Drift-class avoidance:** by separating "staged" from "event-linked" into distinct tables rather than overloading `event_feed_entries.event_id` with nullable semantics, we avoid creating a stored-vs-derived ambiguity. The hand-off is an explicit, atomic, auditable transition. Same architectural principle as OI-0117 (drop `events.date_in` rather than store-and-derive) and OI-0133 (drop `groups.farm_id` rather than store-and-sync).
- **Temporal-ordering parity with OI-0139:** when a staged row dated 2026-04-15 hands off to an event opened 2026-05-01, the resulting `event_feed_entries` row keeps `date = 2026-04-15` (faithful to physical reality). The first feed check on the new event correctly treats this as a pre-check delivery; the OI-0139 strict-`>` rule applies cleanly.
- **PLUGIN IMPROVEMENT candidate:** event-centric data models often need a "no-event-yet" staging surface. A pattern of "staged_X paired with event_X tables, with explicit hand-off helpers" might generalize to other domains (staged observations, staged amendments). Worth flagging once OI-0143 ships.

## Not in scope

- Staging at multiple locations at once (each staged row is one batch + one location; if a farmer is dropping at multiple paddocks in one trip, they create multiple staged rows — same pattern as OI-0140's "save twice for split deliveries").
- Cross-batch staging (a staged row is one batch; if you're staging from multiple sources, multiple rows).
- Migration of historical pre-app pre-positioning data — out of scope.
- Field-mode staging surface (Phase 1 desktop + mobile event detail; Field Mode parity is a follow-on if needed).

## Checklist for Claude Code

**DO NOT START until Tim has resolved SQ1–SQ6 and this spec is updated with the locked answers.**

When the spec is finalized:

- [ ] Phase 1 implemented per locked SQ1–SQ6
- [ ] All acceptance criteria above
- [ ] Full test suite passes (`npx vitest run`)
- [ ] CLAUDE.md §"Architecture Audit" §6 extended with grep contracts for the staging hand-off invariants
- [ ] OI-0143 flipped to closed in the same commit
- [ ] PROJECT_CHANGELOG.md row added
- [ ] GitHub issue closed
