# OI-0241 — Destination pre-graze copy + Event Detail pasture edit save

**Status:** PROPOSED (pending Tim lock via Orchestrator) — opened 2026-11-20 ~7:42–7:45 PM ET  
**Owner:** GTHO Design → GTHO Build after Tim locks  
**Schema / migration:** none  
**CP-55 / CP-56:** none

## Origin

Tim (iPhone PWA, ~7:36–7:42 PM ET Nov 20, via Orchestrator), right after OI-0240 went live:

1. Moved Sheep out of E event `ff115ee9` into a **new** event on F-1…F-5 (`8ef44a4a`, created ~7:36 PM ET).
2. Thought the move-wizard **pasture starting / Pre-Graze** fields were for the event they were **leaving**, so he entered wrong values on the **destination**.
3. Editing those readings on the new event **does not save** (server `updated_at` never moves past create).
4. Event card **lists pastures twice** — list with Edit, then inline editable fields below. He wants the list only: *"I think the list is enough and cleaner."*

Prod (SELECT-only, parent): five open `paddock_observations` on F (`type=open`, `source=event`, `source_id` = each EPW) all identical at create: `forage_height_cm≈5.08` (~2″), cover 100, quality 50, condition fair. `created_at = updated_at = observed_at` at event create — **no successful edit push**.

## Diagnosis (Design read-only on `origin/main` @ `7edb76a`)

### 1. CRITICAL — Edit sheet main Save does not write pre-graze (high confidence)

`src/features/events/edit-paddock-window.js`:

- **Green Save + blur** call `saveChanges()` (~L225–301). That function updates only `event_paddock_windows` (dates / area% / strip). It **never** calls `preGrazeCard.getValues()` and **never** `update`/`add` on `paddockObservations`. It then **`editPwSheet.close()`**.
- Blur listeners on date opened / date closed / area% (~L303–306) also call `saveChanges()` → **close the sheet** while the farmer may still be editing forage.
- Pre-graze `update('paddockObservations', …)` runs **only** from the separate small outline **Save** on the pre-graze card (~L118–142). Same split for post-graze (~L181–205).

Same split pattern on Event Detail inline §5 (`detail.js` ~L653–685): per-card Save writes observations; there is no “event Save” that covers those fields; closing the detail sheet with dirty inputs has **no dirty warning**.

**This explains Tim’s “edit pasture → Save → doesn’t stick”** if he used paddock **Edit** (or looked at inline fields) and hit **main/window Save** or closed without the forage-card Save. Prod F open obs never got `updated_at` — consistent. Not RLS (rows visible); not missing windows; not confinement wrap (F is land).

Secondary: local Save + OI-0230 sync failure / pull restore is still possible after a real card Save; recommend toast on throw and do not treat local-only “Saved” as sync ack.

### 2. Copy confusion — destination pre-graze misread as leaving (high confidence)

Move wizard Step 3 (`move-wizard.js` ~319–362): section `event.openDest` = **"Open New Event"** hosts `renderPreGrazeCard` titled only **"Pre-Graze Observations"**. On **`scoped-remaining`**, post-graze on close is **not** shown (paddocks stay open), so the **only** pasture card is **destination** pre-graze — easy to read as leaving-event info. Values are copied onto every new window (`wizard-shared.js` ~389–393) — matches five identical F rows.

### 3. Duplicate UI on Event Detail (Tim add-on; likely linked)

| Surface | Code | Persist |
|---|---|---|
| Paddock **list** + Edit | `detail.js` paddocks § | Edit opens sheet; see §1 trap |
| Inline **Pre-Graze** cards | `detail.js` §5 `renderPreGraze` | Per-card Save only; easy to miss |

Tim prefers list only. Removing the inline duplicate forces the Edit path — which **must** be fixed (§1) or the trap gets worse.

## Proposals for Tim’s lock card (NOT locked)

Orchestrator will put these on Tim’s card. Until he answers, status stays **PROPOSED**.

1. **Drop Event Detail inline Pre-Graze section**; keep paddock list + Edit (Tim asked). Mirror for Post-Graze if it duplicates closed-window edit.
2. **Fix Edit sheet trap (preferred):** main / green Save (and any blur-save that closes) must also persist pre-graze (and post-graze when shown) via `getValues()` + `update`/`add`. **Or** forage must not look covered by main Save (sticky card Save / dirty block close / explicit “observations not saved” warning). Preferred = main Save persists forage.
3. **Move-wizard destination copy:** under Open New Event, subtitle or renamed card so starting pasture is clearly for the **NEW** event / destination paddocks, not the event being left. Suggested English (Build may tighten): “Starting pasture for the **new** event (not the event you’re leaving).”

Also (Build with 1–2): try/catch + toast if observation write throws; recommend surfacing sync failure rather than a local-only Saved flash.

**No migration.** No schema. No CP-55/56. Prod value correction is ops (Orchestrator + Tim yes + backup), not this PR.

## Acceptance (after Tim locks)

- [ ] Editing pre-graze via **Edit paddock + main Save** persists after reopen + sync (server `updated_at` moves).
- [ ] Event Detail shows pastures **once** (list + Edit; no duplicate inline Pre-Graze) if proposal 1 locked.
- [ ] Blur on date/area cannot silently discard unsaved observation edits.
- [ ] `scoped-remaining` move shows destination-only pasture card with unambiguous **destination / new event** wording.
- [ ] Failed update/sync surfaces an error, not a silent no-op.
- [ ] Confinement still hides pre-graze; `full-event` / `scoped-last` post-graze + dest pre-graze still correct.
- [ ] No migration.

## Files (Build after lock — product behaviour, not invention)

| Area | Likely touch |
|---|---|
| Edit paddock window | `src/features/events/edit-paddock-window.js` — main Save persists obs; blur must not drop forage |
| Event Detail | `src/features/events/detail.js` — remove/hide §5 inline Pre-Graze (and duplicate Post-Graze if locked) |
| Move wizard + i18n | `src/features/events/move-wizard.js`, `src/i18n/locales/en.json` — destination copy |
| Observation card | `src/features/observations/pre-graze-card.js` — title/subtitle hooks if needed |
| Tests | Edit sheet main Save updates `paddock_observations`; Event Detail single list; move-wizard destination string |

## Tonight workaround (ops — already with Orchestrator)

Open new sheep event → paddock **Edit** → change Pre-Graze → tap the **outline Save on the Pre-Graze card** (not only green bottom Save) → or use inline §5 per-card Save if still present → Settings → Resync. If stuck: scoped update of the five F open observation rows once Tim states correct height/cover/quality/condition (backup + yes).

## Related

OI-0112, OI-0118, OI-0230, OI-0239, OI-0240, UX §1.5–§1.6, Event Detail paddocks / observations.
