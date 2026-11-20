# OI-0239 — iPhone Sheet scroll lock + Edit Animal Cull for composites (C1)

**Status:** SPEC LOCKED (Tim, 2026-11-20 ~6:38 AM ET, via Orchestrator)  
**Owner:** GTHO Design → GTHO Build (hotfix **ahead of** OI-0238 code)  
**Schema / migration:** none  
**CP-55 / CP-56:** none

## Tim lock (exact card)

Card: "Fix the iPhone dialog scroll and the missing Edit Animal Cull button now? Yes, fix it next."

Tim's answer (~6:38 AM ET): **"You can proceed on all items."**

## Why

Tim (2026-11-20 ~6:18 AM ET, via Orchestrator): on iPhone, dialogs like Edit Animal do not scroll while the form behind them does — pervasive across Edit Animal, event edits, feed entries. He tried to cull the ram lamb group and could not scroll; also did not see the Cull button on that dialog.

Design read-only probe on live main (`6c17815` / stamp `b2026-11-20.1112-6c17815`):

1. **Shared Sheet** (`src/ui/sheet.js` + `.sheet-wrap` / `.sheet-panel` in `src/styles/main.css`) has **no body/html scroll-lock** on open, uses bare **`max-height: 90vh`**, and has **no** `-webkit-overflow-scrolling: touch` / `overscroll-behavior: contain` on the panel. On iOS Safari/PWA the page underneath keeps receiving touch scroll while the panel often fails to scroll. This dates to the **Apr 2026 sheet scaffold**, **not** a regression from OI-0236 or OI-0237 Part A.
2. **Edit Animal Cull** for composites is still gated by `if (isEdit && !existingAnimal.isBulk)` in `src/features/animals/index.js` (~2009–2146). The Cull control sits inside that block, so composites never render Cull on Edit Animal. Group-card Cull already shipped in OI-0237 Part A (`openCullFromGroupCard` / living composites). `openCullSheet` already handles composites (heads input); only the Edit Animal entry control is missing → **OI-0237 C1 Edit Animal path incomplete**.

Ram Lambs / Ram Lambs-Sale (living composite, e.g. 16 head, `isBulk`) qualifies for group-card Cull under the C1 gate; Cull on Edit Animal for that animal is missing because of the `!isBulk` gate (and may also be below the fold when scroll is broken).

## Locked scope

### 1. Shared Sheet (all dialogs)

In `src/ui/sheet.js` and `.sheet-wrap` / `.sheet-panel` (and related flex scrollport) in `src/styles/main.css`:

- **Body/html scroll-lock** while any sheet is open; **restore** on close (including nested/stacked open/close if present — last close restores).
- Panel: **`-webkit-overflow-scrolling: touch`**
- Panel: **`overscroll-behavior: contain`**
- **`min-height: 0`** where a flex child must become the scrollport
- Prefer **`min(90dvh, 90vh)`** (or equivalent) instead of bare `90vh` for max-height
- Optional: prevent backdrop `touchmove` when the gesture is not scrolling the panel

Shared fix — every Sheet consumer (Edit Animal, event edit, feed entry, cull sheet, etc.) inherits it. No per-dialog forks unless a specific sheet already overrides height and needs the same rules applied there.

### 2. Edit Animal Cull outside `!isBulk` (complete C1)

- Move the **Cull** control (and culled banner when inactive) **outside** `if (isEdit && !existingAnimal.isBulk)` so **composites** render Cull on Edit Animal.
- Leave weaned / calving / individual-only sections inside the `!isBulk` gate.
- Do **not** reintroduce a no-op `isBulk` early-return in `openCullSheet` — Part A already supports composite heads.
- Group-card Cull unchanged (already Part A).

### 3. Out of scope

- No migration; no schema; no CP-55/56.
- No OI-0238 product behaviour.
- No inventing new Cull business rules beyond exposing the existing composite Cull sheet from Edit Animal.

## Files (Build — product behaviour, not invention)

| Area | Likely touch |
|---|---|
| Sheet lifecycle | `src/ui/sheet.js` — lock/unlock body scroll on open/close |
| Sheet CSS | `src/styles/main.css` — `.sheet-panel` / `.sheet-wrap` (dvh, webkit overflow, overscroll, min-height: 0) |
| Edit Animal | `src/features/animals/index.js` — Cull (+ banner) outside `!isBulk` |
| Tests | Sheet open/close restores overflow; Edit Animal shows Cull for a composite fixture; openCullSheet still opens heads UI |

## Acceptance

- [ ] iPhone: open **Edit Animal** (individual + composite), **event edit**, **feed entry** — **panel scrolls**; **page underneath does not**.
- [ ] Cull visible on **composite Edit Animal** and on **Ram Lambs-Sale** (or any living-composite) filter/group card.
- [ ] Cull opens the heads sheet for a composite (e.g. 16-head Ram Lambs).
- [ ] Closing the sheet **restores** body scroll.
- [ ] No migration; no schema; CP-55/56 untouched.

## Related

OI-0237 C1 (both Edit Animal + group-card Cull — Edit Animal path completed here), OI-0086 cull sheet, ARCH §6.2 Sheet lifecycle. Sequence: **hotfix before OI-0238 code**.

## Origin

Tim bug report 2026-11-20 ~6:18 AM ET (via Orchestrator); Design investigation same morning; Tim cleared hotfix ~6:38 AM ET ("You can proceed on all items").
