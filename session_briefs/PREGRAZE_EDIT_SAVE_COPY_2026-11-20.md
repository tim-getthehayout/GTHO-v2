# OI-0241 — Destination pre-graze copy + Event Detail pasture edit save

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-20 ~7:49 PM ET, via Orchestrator, card t710s2923) — opened ~7:42 PM ET; revised ~7:47–7:50 PM ET (persistence bug); **A+B+C locked ~7:49 PM ET**  
**Owner:** GTHO Design → GTHO Build  
**Schema / migration:** none  
**CP-55 / CP-56:** none

## Origin

Tim (iPhone PWA, ~7:36–7:45 PM ET Nov 20, via Orchestrator), right after OI-0240 went live:

1. Moved Sheep out of E event `ff115ee9` into a **new** event on F-1…F-5 (`8ef44a4a`, created ~7:36 PM ET).
2. Thought the move-wizard **pasture starting / Pre-Graze** fields were for the event they were **leaving**, so he entered wrong values on the **destination**.
3. Editing those readings on the new event **does not save** (server `updated_at` never moves past create).
4. Event card **lists pastures twice** — list with Edit, then inline editable fields below. He wants the list only: *"I think the list is enough and cleaner."*
5. **Workaround failed (~7:45 PM ET):** Tim used the **small Pre-Graze card Save**, then Resync. Values still don’t stick. Resync shows ~**“0 new items”** (0 to send). Server F open obs still have create-time stamps. So **B is a real persistence bug**, not only the green-Save UX trap.

## Prod snapshot (SELECT-only; Design does not write prod)

Event `8ef44a4a` — five open `paddock_observations` on F (`type=open`, `source=event`):

| Paddock | Observation id |
|---|---|
| F-1 | `2e0ebbed-8f42-4fb6-9d91-4d8ab1e6ba7e` |
| F-2 | `91ef9900-c730-4b2d-8422-2f708c2db2f7` |
| F-3 | `3ef198d9-553b-437a-9626-81461c6dc021` |
| F-4 | `eae54bdf-b286-4a8c-8594-7b572eb6ff0b` |
| F-5 | `b9a1ed99-6706-4c58-aa11-ce4c5d5bd8bd` |

**At create (before ops fix):** all five identical — `forage_height_cm≈5.08` (~2″), cover 100, quality 50, condition fair. `created_at = updated_at = observed_at` at event create — UI edit push never landed (card Save + Resync failed).

**F open-obs data fix — ALREADY APPLIED (do not re-run):** Orchestrator, 2026-11-20 ~7:48 PM ET, card t715s2944 (Tim yes). Heights cm: F-1 `22.86`, F-2 `15.24`, F-3 `15.24`, F-4 `20.32`, F-5 `20.32` (9/6/6/8/8 in); cover **100**, quality **70**, condition **good** on all five. Design did not write prod.

## Diagnosis (Design read-only on `origin/main` @ `7edb76a` + Tim evidence)

### A. CRITICAL — Edit sheet main Save does not write pre-graze (high confidence; still true)

`src/features/events/edit-paddock-window.js`:

- **Green Save + blur** call `saveChanges()` (~L225–301). That function updates only `event_paddock_windows` (dates / area% / strip). It **never** calls `preGrazeCard.getValues()` and **never** `update`/`add` on `paddockObservations`. It then **`editPwSheet.close()`**.
- Blur listeners on date opened / date closed / area% (~L303–306) also call `saveChanges()` → **close the sheet** while the farmer may still be editing forage.
- Pre-graze `update('paddockObservations', …)` is wired from the separate small outline **Save** on the pre-graze card (~L118–142). Same split for post-graze (~L181–205).

Same split pattern on Event Detail inline §5 (`detail.js` ~L653–685): per-card Save writes observations; there is no “event Save” that covers those fields; closing the detail sheet with dirty inputs has **no dirty warning**.

**This explains “edit pasture → green Save → doesn’t stick.”** Not RLS for visibility (rows visible); not missing windows; not confinement wrap (F is land).

### B. CRITICAL — Small-card Pre-Graze Save also fails to persist / enqueue (high/medium; new from Tim ~7:45 PM)

Tim used the small Pre-Graze card Save, then Resync → **“0 new items”**; server stamps unchanged. So the path that *should* call:

`update('paddockObservations', obs.id, values, validate, toSupabaseShape, 'paddock_observations')`

(`edit-paddock-window.js` ~L123 and `detail.js` ~L658) is **not** resulting in a server-newer row or a Resync-sendable unconfirmed write.

**B is a real persistence bug**, not only a UX trap. Build must prove/fix the root cause among (non-exclusive):

1. **Local update throws / never runs.** “Saved” flash today is after `update` with no try/catch, so a throw *should* block the flash — still surface errors; verify flash isn’t shown without a real write.
2. **`persistMutation` / `enqueueWrite` not enqueueing** for this table/op (or wrong store key / shape so the queue is skipped).
3. **Flush drops as superseded** (`_supersededReason` older) while still reporting success to the UI.
4. **Flush `update` returns 0 rows** → dead-letter `zero_rows` (OI-0230) then Resync skips/gone oddly; check RLS **UPDATE USING / WITH CHECK** on `paddock_observations`.
5. **Pull `mergeRemote` with `remoteTime >= localTime` clobber** if the local stamp never advanced after the edit.

**Acceptance for B:** after Edit → change pre-graze → (fixed) Save, server `updated_at` advances and Resync would have had something to send before ack; Event Detail shows values after reopen + pull.

### C. Copy confusion — destination pre-graze misread as leaving (high confidence)

Move wizard Step 3 (`move-wizard.js` ~319–362): section `event.openDest` = **"Open New Event"** hosts `renderPreGrazeCard` titled only **"Pre-Graze Observations"**. On **`scoped-remaining`**, post-graze on close is **not** shown (paddocks stay open), so the **only** pasture card is **destination** pre-graze — easy to read as leaving-event info. Values are copied onto every new window (`wizard-shared.js` ~389–393) — matches five identical F rows.

### D. Duplicate UI on Event Detail (Tim add-on)

| Surface | Code | Persist |
|---|---|---|
| Paddock **list** + Edit | `detail.js` paddocks § | Edit opens sheet; see A + B |
| Inline **Pre-Graze** cards | `detail.js` §5 `renderPreGraze` | Per-card Save only; same B risk |

Tim prefers list only. Removing the inline duplicate forces the Edit path — which **must** get A + B fixed or the trap gets worse.

## Locked (Tim, 2026-11-20 ~7:49 PM ET, card t710s2923)

**Tim lock (exact words):** "Lock OI-0241 A+B+C: drop inline Pre-Graze (keep list+Edit), fix Edit Save so forage isn't silently dropped, clearer destination pasture copy"

- **A LOCKED:** Drop Event Detail inline Pre-Graze section; keep paddock list + Edit. Mirror for Post-Graze if it duplicates closed-window edit.
- **B LOCKED:** Fix Edit Save so forage isn't silently dropped — includes **BOTH** (1) green/main Save must persist pre-graze (and post-graze when shown) via `getValues()` + `update`/`add` (not only windows) **AND** (2) the **real persistence bug**: small-card Save must reliably enqueue+push (queue / unacked / flush `ok` | `zero_rows` | `superseded`); toast on failure; **no silent “Saved”**. Per Design diagnosis after Tim Save+Resync “0 new items” with server still create-time.
- **C LOCKED:** Clearer destination pasture / pre-graze copy in move wizard — under Open New Event, subtitle or renamed card so starting pasture is clearly for the **NEW** event / destination paddocks, not the event being left. Suggested English (Build may tighten): “Starting pasture for the **new** event (not the event you’re leaving).”

**No migration.** No schema. No CP-55/56. F open-obs data fix already applied by Orchestrator (~7:48 PM ET, card t715s2944) — **do not re-run**.

## Acceptance

- [ ] Editing pre-graze via **Edit paddock + main Save** persists after reopen + sync (server `updated_at` moves).
- [ ] **Small-card Save** also persists (enqueue → push → server newer); Resync would show work to send before ack; failure toasts, never silent Saved.
- [ ] Event Detail shows pastures **once** (list + Edit; no duplicate inline Pre-Graze).
- [ ] Blur on date/area cannot silently discard unsaved observation edits.
- [ ] `scoped-remaining` move shows destination-only pasture card with unambiguous **destination / new event** wording.
- [ ] Confinement still hides pre-graze; `full-event` / `scoped-last` post-graze + dest pre-graze still correct.
- [ ] No migration.

## Files (Build — product behaviour, not invention)

| Area | Likely touch |
|---|---|
| Edit paddock window | `src/features/events/edit-paddock-window.js` — main Save persists obs; blur must not drop forage; card Save durable + errors surfaced |
| Event Detail | `src/features/events/detail.js` — remove/hide §5 inline Pre-Graze (and duplicate Post-Graze if locked); same persist rules |
| Sync / store | `persistMutation` / `enqueueWrite` / flush / mergeRemote paths for `paddock_observations` updates (Diagnosis B) |
| Move wizard + i18n | `src/features/events/move-wizard.js`, `src/i18n/locales/en.json` — destination copy |
| Observation card | `src/features/observations/pre-graze-card.js` — title/subtitle hooks if needed |
| RLS / server | Confirm `paddock_observations` UPDATE USING/WITH CHECK if zero_rows suspected |
| Tests | Edit sheet main Save updates `paddock_observations`; card Save enqueues sendable write; Event Detail single list; move-wizard destination string; failed update toasts |

## Tonight ops (not this PR)

1. **Failed UI workaround:** Pre-Graze card Save + Resync did **not** stick (~7:45 PM ET). Do not tell Tim that path works until B is fixed in code.
2. **F open-obs data fix — DONE:** Orchestrator applied scoped UPDATE ~7:48 PM ET (card t715s2944) after Tim numbers + backup + yes. Heights 22.86/15.24/15.24/20.32/20.32 cm; cover 100; quality 70; condition good. **Do not re-run.**

## Related

OI-0112, OI-0118, OI-0230, OI-0239, OI-0240, UX §1.5–§1.6, Event Detail paddocks / observations.
