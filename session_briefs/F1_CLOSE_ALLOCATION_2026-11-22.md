# F1 close-allocation / hay-fed pasture DMI (OI-0258)

**Status:** **PROPOSED** 2026-11-22 ~10:56 AM ET (GTHO Design). Tim **t1129u** (~10:50 AM ET) + opening-carryover **t1134u** (~10:51 AM ET), via Orchestrator; Build/Orchestrator real-data finding **t1136u** (D/E-5 “July hay” = Move-wizard carryover, not new summer hay). Awaiting Tim lock. Docs tip only — **do not land on main**. No SQL / no migration.  
**Owner:** GTHO Design (PROPOSED; GTHO Build does not start until LOCKED).  
**Parent:** Forgejo `origin/main` `da22c6d5978fa9864142d5bb99b7e5f3f817ae5a` (OI-0254 PR **#135** live; OI-0253 docs live; OI-0252 PR #131 live; RELEASED **48**).  
**Also related:** OI-0246 season formula **F1** (DMI subtracts measured hay eaten; unmeasured hay day = “—”); OI-0253 **C0** (keep F1 season-sticky on the column when in-window hay days lack DM — this OI does **not** reopen C0; it changes *when* a hay day is known); OI-0256 **Mx1** (mixed event / `no_pasture` windows — locked on the **separate** tip `docs/oi-0254-0257-feedback-batch` at `01de63b`, not on this tip); Build **t1123u** (F1 unknown unless the day sits between two feed-check readings — `feed-pools.js` `elapsedDayShares`); Tim **t1129u**, **t1134u**; Build/Orchestrator **t1136u**.  
**Schema / migration:** **D0 — none.** Calc-path only. No new column, no migration, no data write.

**Separate tip:** this branch is `docs/oi-0258-f1-close-alloc` off `origin/main` at `da22c6d`. It must **not** ride the OI-0254–0257 docs land.

## 1. Problem

Today, F1 treats a hay day as **known** only when the day sits **between two feed-check readings** (`elapsedDayShares` in `feed-pools.js`). Delivery plus a close check (even a forced close check) is **not** enough, so Locations D / E-5 / F-1/2/3 stay blank (events `72f78e31`, `449b0108`, `38cb666e`) even though the batches have DM 85% + weight and a close inventory exists (Build **t1123u**).

Tim (**t1129u**, ~10:50 AM ET, via Orchestrator), on that gap:

> At close with a feed checks implying pasture the hay that was fed would be allocated across the event, with the pasture DMI being the offense between estimated demand and actual hay fed

(Orchestrator gloss, used here: Tim meant **difference** between estimated demand and actual hay fed.)

Tim (**t1134u**, ~10:51 AM ET, via Orchestrator), on the opening anchor:

> At opening the only feed is what may have been moved from a prior event in which case we would capture that at open

### Real-data finding — D/E-5 “July hay” (Build / Orchestrator **t1136u**)

The hay that shows on D / E-5 as “July hay” is **not** new summer hay. It is **Move-wizard carryover** of May Corral Alfalfa Small Squares (**7** physical square bales). Synthetic deliveries are dated to the move/open with a `source_event_id` chain; batch `sum_delivery_qty` is inflated **7→21** (the same physical bales counted three times across the chain).

This is exactly Tim’s **t1134u** opening-carryover path: feed moved from a prior event, captured at open (zero if none). The spec must distinguish **carryover provenance**:

- Move-feed / `source_event_id` **synthetic** deliveries dated to move/open, versus
- **Physical new** deliveries on this event.

If the F1 hay pool naively sums delivery quantity across events that re-record the same carryover, the same 7 bales become 21. Tim’s lock must decide how the pool avoids that triple-count. Design does **not** invent his answer — see axis **Cv**.

### Core rule to lock (plain language)

At close, when feed checks imply pasture:

- **Opening anchor** = carried-over feed captured at event open (**zero if none**). That capture is the Move-wizard / prior-event path in **t1134u** / **t1136u**.
- **Hay pool for the event** = opening carryover + **net new** deliveries − close remaining, allocated across the whole event — subject to **Cv** (do not triple-count synthetic move-dated deliveries that duplicate the opening capture).
- **Pasture DMI** = estimated demand − hay actually fed (that pool).
- **No** opening mid-check / prior mid-check is required for those days to be **known** under F1.

OI-0246 **F1** (subtract hay eaten when measured; do not invent eaten; do not use raw deliveries as eaten) and OI-0253 **C0** (column still goes “—” when an in-window hay day is unknown) stay in force. This OI only amends **when** hay eaten is measured / the day is known. Locked **L1** (floor implied pasture DMI at 0 per event-day) still applies — do not invent a negative pasture DMI if hay fed exceeds demand.

### Out of this OI

- OI-0254–0257 docs land (separate tip; do not stack or merge here).
- OI-0253 **B1** paint / **C0** column sticky-on-unknown (kept).
- Still-open events with no close inventory — Tim’s rule is **at close**. Do not invent an open-event rule; leave those as today unless Tim amends.
- Measuring missing DM on batches (ops).
- Rewriting historical Move-wizard rows / fixing stored `sum_delivery_qty` (this OI is calc-path provenance for F1, not a data rewrite) unless Tim later asks.
- Any SQL / new column.

## 2. Lock axes (PROPOSED — Design lean marked)

### **Al** — Anchor / when hay days become known

| Token | Meaning |
|---|---|
| **Al1** (rec) | Opening carryover captured at open (**zero if none**) + net new deliveries + close (or close inventory) is enough. Hay fed is that pool, allocated across the event (how deliveries are counted is **Cv**). Days in that span are **known** for F1. No mid-check required. Fixes Tim’s blank columns. |
| **Al0** | Keep today’s dual feed-check anchor only (delivery + close alone stays unknown). Does **not** match Tim. |

**Al1** wording includes Tim **t1134u**: the opening anchor is carryover from a prior event captured at open, not a required mid-event feed check. If nothing was moved in, opening carryover is zero. That opening capture is the same Move-wizard path seen on D/E-5 (**t1136u**).

### **Pd** — Pasture DMI from that span

| Token | Meaning |
|---|---|
| **Pd1** (rec) | Pasture DMI = estimated demand − hay actually fed (Tim **t1129u**). Existing **L1** floor at 0 still applies. |
| **Pd0** | Leave pasture inference as today once hay is known. |

### **Mc** — Mid-checks when they exist

| Token | Meaning |
|---|---|
| **Mc1** (rec) | Where mid-event feed checks exist, they still carve day shares (current `elapsedDayShares`). Close-allocation fills gaps / spans that lack dual anchors. |
| **Mc0** | Close-span allocation always wins even when mid-checks exist. |

Do **not** invent a new mid-check formula. **Mc1** reuses today’s elapsed-time shares between existing checks; the new close-allocation uses the same elapsed-time share method, with opening carryover (zero if none) and close remaining as the anchors, when a span lacks two mid-check anchors.

### **Mx** — Mixed with OI-0256 Mx1 (`no_pasture` windows)

OI-0256 **Mx1** is locked on the **separate** 0254–0257 tip: omit a `no_pasture` window from pasture DMI/AUD inference (infer pasture from other open windows); that window still participates in NPK and is **Mt1** (known Pasture 0) on itself. This axis is how close-allocation should meet that rule.

| Token | Meaning |
|---|---|
| **Mx-a** (rec) | Allocate hay / infer pasture DMI only across **non-`no_pasture`** open windows. `no_pasture` windows stay **Mt1** (known Pasture 0) and still get NPK per Mx1. |
| **Mx-b** | Allocate across all windows first, then apply Mx1 zeroing on `no_pasture` (risk of double-counting — ask Tim). |

### **Cv** — Carryover provenance / triple-count (open Q)

Real data (**t1136u**): Move-wizard carryover writes synthetic deliveries dated to move/open with a `source_event_id` chain. Summing delivery qty across that chain inflated 7 physical bales to 21. Do **not** invent Tim’s answer — this axis is for him to lock.

| Token | Meaning |
|---|---|
| **Cv1** (rec) | F1 hay pool = opening carryover qty **once** + **net new physical deliveries only** − close remaining. Do **not** also sum synthetic Move-wizard / `source_event_id` deliveries that re-record the same opening capture. |
| **Cv2** | Some other rule that also does **not** triple-count (Tim to specify — Design will not invent one). |

Naive “sum all delivery rows on the event / batch, including synthetic move-dated copies” is **not** offered: it recreates the 7→21 inflation and does not match “capture carryover at open.”

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** (standing) | No SQL / no new column. Calc path only. |

## 3. Design lean

**PROPOSED lean: Al1+Pd1+Mc1+Mx-a+Cv1+D0**

- Matches Tim **t1129u** (allocate hay fed across the event at close; pasture DMI = demand − hay fed) and **t1134u** (opening feed is prior-event carryover captured at open, else zero).
- **Cv1** is the Design rec against the D/E-5 real data (count the 7 bales once as opening carryover; add only new physical deliveries; subtract close remaining). It is **not locked** until Tim picks.
- Does not reopen OI-0253 **C0** or OI-0246 **F1**’s “don’t invent eaten / don’t use raw deliveries as eaten.”
- **Mc**, **Mx**, and **Cv** are real open questions for Tim (see below). Lean is marked; do not treat them as locked until he picks.

### Open questions (do not invent)

1. **Mid-checks:** if mid-event feed checks exist, should they still carve day shares (**Mc1**, lean), or should the close-span allocation always win (**Mc0**)?
2. **Mixed / OI-0256 Mx1:** should hay allocation and pasture inference run only across non-`no_pasture` open windows (**Mx-a**, lean), or allocate across all windows first and then zero the `no_pasture` window (**Mx-b**, risk of double-counting)?
3. **Carryover / triple-count:** should the F1 pool use opening carryover once + net new physical deliveries only, excluding synthetic move-dated `source_event_id` deliveries that duplicate the opening capture (**Cv1**, lean), or some other rule that also does not triple-count (**Cv2**, Tim specifies)?

No other mid-check, sub-move, or delivery-sum formula is proposed here.

## 4. Acceptance (when locked and built)

1. A closed event with opening carryover (or zero), net new deliveries, and close remaining, and no mid-checks, has **known** hay days across the event (**Al1**) — Locations D / E-5 / F-1/2/3 no longer blank solely for lack of a prior mid-check.
2. Hay fed for that span follows the locked **Cv** pool (lean **Cv1**: opening carryover once + net new physical deliveries − close remaining); pasture DMI = estimated demand − that hay fed (**Pd1**), floored at 0 per locked **L1**.
3. If **Cv1** is locked: the D/E-5 May Corral Alfalfa Small Squares carryover counts as **7** bales on the receiving event, not **21**. Synthetic Move-wizard / `source_event_id` deliveries that duplicate the opening capture are not added again.
4. Mid-event feed checks, when present, still carve day shares if **Mc1** is locked; close-allocation fills only the unanchored gaps.
5. If **Mx-a** is locked: `no_pasture` windows are omitted from this hay/pasture allocation, stay known Pasture 0 (**Mt1**), and still participate in NPK (OI-0256 **Mx1**).
6. OI-0253 **C0** still nulls the season column when an **in-window** hay day remains unknown for another reason (e.g. missing DM on the batch).
7. No new migration / no new column (**D0**). If Build finds a real schema gap, stop and ask; do not invent a column.

## 5. Tip instruction

**PROPOSED** — Design lean **Al1+Pd1+Mc1+Mx-a+Cv1+D0**. Awaiting Tim lock. **Do not land on main.** **Do not open a PR.** Never force-push. This tip is **separate** from `docs/oi-0254-0257-feedback-batch`. Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Base is `origin/main` `da22c6d` (post-#135).
