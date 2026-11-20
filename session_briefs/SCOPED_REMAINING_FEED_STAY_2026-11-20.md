# OI-0240 — Scoped-remaining hide Feed Transfer; feed stays with remaining groups

**Status:** SPEC LOCKED (Tim, 2026-11-20 ~3:50 PM ET, via Orchestrator, card t694s2862)  
**Owner:** GTHO Design → GTHO Build after docs land  
**Schema / migration:** none  
**CP-55 / CP-56:** none

## Tim lock (exact card)

> Lock A: on scoped-remaining partial moves, hide Feed Transfer and show that feed stays with remaining groups

Tim did **not** choose C (move some by quantity) for now.

## Why

Tim needed to move sheep and goats out of an open E-pasture event while the cows stay and the event stays open. The move correctly forced a feed check, but the only choices were **Move** or **Leave as residual**. He wants the feed to stay with the remaining groups (the cows).

`V2_UX_FLOWS` §1.5 already says the Feed Transfer card is skipped entirely in `scoped-remaining` (OI-0066 — feed stays with groups still on the source). `src/features/events/move-wizard.js` still **renders** Move / Leave as residual whenever feed entries exist, regardless of mode.

- Default **Move** (`choice: 'move'`) runs `transferWizardPools` (or the non-pool destination `event_feed_entry` write) and **steals hay from the groups that remain**.
- **Leave as residual** on `scoped-remaining` is a no-op on the close-reading path (`executeMoveWizard` already skips the close-reading when `isScoped`), which is safe for continuity, but the caption (`event.feedTransferResidualCaption`: "Records to fertility ledger") is misleading — that caption is an OI-0092 close concern, not a mid-event leave-for-the-remaining-groups action.

## Locked scope (option A)

1. When Step 3 `mode === 'scoped-remaining'`, **do not render** the Feed Transfer card — no Move / Leave as residual radios, no residual quantity inputs, and do not substitute the "No feed to transfer" / all-zero transfer hints for the stay message.
2. Show clear copy that **feed stays with the groups remaining on this event**. A new i18n string is OK. Suggested English (Build may tighten wording; same intent): “Feed stays with groups remaining on this event.”
3. Save path already skips the close-reading when `isScoped`. **Defense in depth:** do **not** call `transferWizardPools` (or the non-pool Move write) when mode is `scoped-remaining`, or when no transfer UI was shown. Do **not** key this off bare `isScoped` alone — that flag is also true for `scoped-last`, which must keep transfer.
4. **`full-event` and `scoped-last`** keep the existing Move / Leave as residual UI and save behaviour (fertility residual on close; OI-0092 still owns the ledger write).
5. **No migration.** No schema. No CP-55/56.

## Out of scope

- Option C (move some feed by quantity) — not locked.
- Goats double-window data question (held separately).
- OI-0092 fertility ledger.
- Changing close-reading skip semantics beyond preventing a `scoped-remaining` transfer.
- Migrations, RLS, data repair.

## Files (Build — product behaviour, not invention)

| Area | Likely touch (Build owns code) |
|---|---|
| Move wizard Step 3 | `src/features/events/move-wizard.js` — when `mode === 'scoped-remaining'`, do not render the Feed Transfer card; show stay-copy instead |
| Save / Step 8 | `executeMoveWizard` — do not call `transferWizardPools` (or the non-pool Move loop) on `scoped-remaining` / when no transfer UI was shown |
| i18n | `src/i18n/locales/en.json` — new stay-copy string (e.g. `event.feedStaysWithRemainingGroups`) |
| Tests | `tests/unit/move-wizard-step3-gating.test.js` and/or `tests/unit/move-wizard-feed-transfer.test.js` (e2e only if needed): `scoped-remaining` with remaining feed → no radios, stay-copy visible, no destination feed rows; `full-event` / `scoped-last` unchanged |

## Acceptance

- [ ] `scoped-remaining` Step 3: Feed Transfer card (Move / Leave as residual) is **not** rendered, even when the source event has remaining feed.
- [ ] Stay-copy is visible: feed stays with groups remaining on this event.
- [ ] Saving a `scoped-remaining` move does **not** create destination transfer entries and does **not** call `transferWizardPools`; source feed entries remain on the open event and continue to count toward remaining demand / days-remaining for groups that stayed.
- [ ] `full-event` and `scoped-last` still show Move / Leave as residual and still transfer or residual-close as today.
- [ ] No migration; no schema; CP-55/56 untouched.

## Related

OI-0066 (scoped move; feed stays on source), OI-0104 / OI-0135 / OI-0136 (Move / Residual radios), OI-0161 (Step 3 mode gating), UX §1.5–§1.6, UX §6. Motivating case: partial group move off an open multi-group E-pasture event (cows remain).

## Origin

Tim, 2026-11-20 ~3:42 PM ET (question from iPhone); lock A at ~3:50 PM ET via Orchestrator card t694s2862.
