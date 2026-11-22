# Move carryover guard — Move Step 3 is the close feed check (OI-0259)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 ~11:37 AM ET  
**Authority:** Tim card **t1210s4665** (~11:37 AM ET America/New_York, via Orchestrator), verbatim: “Confirm OI-0259 D: Move Step 3 = close check (enter remaining, no prefill)”. Prior lock card **t1192s4608** (~11:31 AM ET) picked **D**; Tim **t1197u** framed the Move itself as the feed check; Build YES/FIT on `origin/main` `06f20e3`.  
**Package:** **D+D0** (reshaped **D**; **D0** = no SQL / no migration).  
**Branch tip:** `docs/oi-0259-move-carryover-guard` (parent post–OI-0258 tip `9ec1212`; Tim land of 0258 may still be in flight — Bridge may restack after `origin/main` advances).  
**Related:** Alfalfa Corral→D→E-5 synthetic cleanup is **separate** (Build PRIMARY SQL under OI-0258 / t1171u track). OI-0258 **Cv1** is calc-only provenance for F1 — it does **not** stop recurrence. Sub-move already OI-0119.

---

## 1. Problem

Seven Corral alfalfa bales fed in May (Tim **t1173u**) stayed as remaining with **no mid-checks**. The classic Move wizard on Jul 19 and Aug 3 defaulted to **Move** and copied that leftover into dest as synthetic deliveries (`source_event_id`), carrying the same 7 bales forward (54d then 21d with zero mid-checks). Only this chain among current >14d zero-check synth carryovers.

**Root cause (Build as-built on `06f20e3`, folded into t1171u proposal):**

1. **(b)+(c)** — no mid-checks; `getLiveRemainingForMove` falls back to Σ deliveries = 7; Move defaults `choice:'move'` and copies into dest with `source_event_id`. Corral close remaining is **0** (Move stamp, `is_close_reading=true` same second as synth delivery) — not residual leftover.
2. **Path:** Corral `e76ae64b` → Jul 19 Move → D entry `27523892` + close `45621661` rem0; Aug 3 → E-5 entry `9976425c` + close `f269b6e6` rem0.
3. Classic Move: **no** confirm when qty>0; **no** age check. Plausibility warns Residual/pool checks only. Pool form has confirm — **not** this path.
4. Expected Move behavior + **product gap** (not a crash). Current main **still** carries the same way. Key history: CP-29 `15ac9f5`, OI-0104 `1a22923`, OI-0135/36 `4e6a4be` (mid-check inflation only), OI-0162 `c8da54e`, Nov residual/plaus `f158144`/`321fab2`, scoped `ff3571c`. OI-0135 did **not** fix this hole.

**Tim framing (t1197u):** “Isn’t the move itself a feedcheck? Saying how much is moved?” — Yes for the product intent. Today Move writes a close-reading check but **pre-fills leftover from live remaining** and defaults to Move, so he never enters a real count. Lock **D** makes Step 3 itself that check.

---

## 2. Lock — **D** reshaped (Move Step 3 = close feed check)

**No separate prior check screen.** Classic **Move wizard Step 3** itself is the close feed check.

For each leftover stored-feed line:

1. Tim **enters actual remaining** — **required**.
2. Blank / NaN / neg **blocks Save** (OI-0119 / OI-0136 style).
3. **No prefill** from live remaining / Σ deliveries (`getLiveRemainingForMove`). Live remaining may show as a **“Started:” hint only** (not in the input) — OI-0119 style.
4. Remaining field shown for **both Move and Residual** (today Residual-only; `residualInputWrap` hidden while default `choice:'move'`).
5. Then he picks **Move vs Residual** for that **entered** qty.
6. Save uses **entered** qty for the close-reading stamp and any dest `source_event_id` carry — **not** `toggle.total` / live / `group.total`.

### Scope edges (locked facts, not open Tim Qs)

| Case | Rule |
|---|---|
| **Pasture-only / leftover 0** | **D does not apply** (no leftover radios). |
| **Advance strip** | No synth feed path — **D need not cover** (Build fact). |
| **Sub-move** | Already OI-0119 — **unchanged**. |
| **Zero-live lines** | Still skipped (OI-0162) — Tim can’t correct a wrong live=0 on this screen (**caveat**, not a Tim open Q). |
| **Move Feed Out** | Already has confirm-remaining (prefilled) — optional no-prefill parity only; **not** the full-Move hole this OI closes. |
| **Schema** | **D0** — no SQL / no migration. |

### Wire notes for Build (YES/FIT on `06f20e3`)

- Classic Move wizard Step 3 already has per-leftover radios + a remaining input; today that input is **Residual-only**.
- Clear prefill (blank required); show remaining for **both** Move and Residual; extend the OI-0136 Residual-only gate (~663) to Move.
- `executeMoveWizard` / `transferWizardPools` / `writePoolTransfer` must use **entered** qty (today pool Move stamps live total; legacy Move stamps rem 0 + dest qty = `toggle.total`).
- Fine to keep live as “Started:” hint only — do **not** prefill.

---

## 3. Locked package

**D+D0**

- **D** — Move wizard Step 3 is the close feed check: enter actual remaining (required, no live prefill), then Move vs Residual; Save uses entered qty.
- **D0** — no SQL / no migration.

Data cleanup of the May→Jul→Aug alfalfa synthetics is **out of this OI** (pairs with Build cleanup under the t1171u / OI-0258 track). Implementing **D** alone stops recurrence; cleanup alone does not.

---

## 4. Acceptance (when built)

1. Full Move with leftover stored feed: Step 3 shows remaining input for **each** leftover line under **both** Move and Residual.
2. Input starts **blank** (no live / Σ prefill). Optional “Started: N” hint outside the field.
3. Save with blank / NaN / neg remaining is blocked.
4. Choosing Move stamps close-reading remaining = **entered** qty and dest carry qty = **entered** qty (with `source_event_id` as today).
5. Choosing Residual uses **entered** qty (existing Residual path, now with the field always visible).
6. Pasture-only / leftover-0 Moves behave as today (no new forced check).
7. Sub-move OI-0119 path unchanged.
8. Advance strip unchanged.
9. No new migration / column (**D0**). If Build finds a real schema gap, stop and ask.

---

## 5. Tip instruction

**LOCKED / READY FOR BUILD** — **D+D0** (Tim card **t1210s4665**; prior **t1192s4608** picked D; reshape confirmed after **t1197u** + Build YES/FIT). **Do not land on main.** **Do not open a PR.** Never force-push. Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Parent is OI-0258 Sp-f tip `9ec1212bad8eb0051814873760e1ef2b8ad03d78` (restacked onto `06f20e3`); if `origin/main` later includes that tip, Bridge may restack this tip FF onto that main before Tim land.

**Handoff:** Orchestrator → Build after Tim lands this docs tip (or after Bridge verify + Tim land card). Design does not invent further open Qs from the zero-live / Advance / pasture-only edges above — those are locked caveats.
