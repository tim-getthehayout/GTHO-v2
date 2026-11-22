# F1 close-allocation / hay-fed pasture DMI (OI-0258)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 ~11:25 AM ET (Tim card **t1168s4534**, via Orchestrator, locking **Sp-f(demand)**; **Sp-w superseded**). Lock **Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0**. Feed checks stay the hay span boundaries; inside each check-span, that span’s hay is prorated by **demand** across overlapping grazing paddock/group windows. Docs tip only — **do not land on main**. No SQL / no migration.
**Owner:** GTHO Design (LOCKED / READY FOR BUILD). Docs tip only until Tim lands docs.
**Parent:** Forgejo `origin/main` `744dc64ab96c0e8a394f54338306d9b60e0f13d9` (OI-0254–0257 docs live; OI-0254 PR **#135** live; OI-0253 docs live; OI-0252 PR #131 live; RELEASED **48**).
**Also related:** OI-0246 season formula **F1** (DMI subtracts measured hay eaten; unmeasured hay day = “—”); OI-0253 **C0** (keep F1 season-sticky on the column when in-window hay days lack DM — this OI does **not** reopen C0; it changes *when* a hay day is known); OI-0256 **Mx1** (mixed event / `no_pasture` windows — locked on main `744dc64`); Build **t1123u** (F1 unknown unless the day sits between two feed-check readings — `feed-pools.js` `elapsedDayShares`); Tim **t1129u**, **t1134u**, **t1153u**, **t1155u**, **t1164u**, **t1168**; Build/Orchestrator **t1136u**; Build code facts (as-built hay spans = feed-check anchors only) and OI-0119 forced-check facts (tip `744dc64`).
**Schema / migration:** **D0 — none.** Calc-path only. No new column, no migration, no data write.

**Separate tip:** this branch is `docs/oi-0258-f1-close-alloc` restacked onto `origin/main` `744dc64` (OI-0254–0257 docs now on main). **Do not land on main.**

## 1. Problem

Today, F1 treats a hay day as **known** only when the day sits **between two feed-check readings** (`elapsedDayShares` in `feed-pools.js`). Delivery plus a close check (even a forced close check) is **not** enough, so Locations D / E-5 / F-1/2/3 stay blank (events `72f78e31`, `449b0108`, `38cb666e`) even though the batches have DM 85% + weight and a close inventory exists (Build **t1123u**).

Tim (**t1129u**, ~10:50 AM ET, via Orchestrator), on that gap:

> At close with a feed checks implying pasture the hay that was fed would be allocated across the event, with the pasture DMI being the offense between estimated demand and actual hay fed

(Orchestrator gloss, used here: Tim meant **difference** between estimated demand and actual hay fed.)

Tim (**t1134u**, ~10:51 AM ET, via Orchestrator), on the opening anchor:

> At opening the only feed is what may have been moved from a prior event in which case we would capture that at open

Tim (**t1153u**, ~11:11 AM ET, via Orchestrator, answering card **t1149s4474**), on mid-checks and per-span pasture DMI:

> We don't actually store DMI per day after a mid check, but a mid check would technically allocate to the time period prior to the check, and then the final check would allocate to the period between the last check and the close. So pasture DMI may fall over the course of an event in one paddock, or in an event with one anchor for stored feed (bale grazing a paddock) and multiple open an closes of sub moves for grazing, the DMI from pasture would go up and down across those moves

(Orchestrator’s accepted read, written into this lock: each check allocates to the span since the prior anchor; close covers the last span. Pasture DMI is per span, so it can vary across the event, including multiple grazing sub-move windows sharing one stored-feed anchor.)

Tim (**t1155u**, ~11:15 AM ET, via Orchestrator, answering card **t1154s4493**), on how a hay-check span splits across grazing windows:

> It's should be allocated across the grazing paddocks open during that event window within the event. As we open and close (or add or remove animals) on an event we are opening and closing event windows to 'snap a line' and properly allocate the new numbers within the event. Does that line up with reality of how it's working?

(Written at the time as **Sp-w**: each paddock open/close or animal add/remove snaps a hay-allocation segment line. **Sp-w is superseded** by **Sp-f** below. Build code facts: placement and demand already snap; hay / feed-pool spans do not — they split only on feed-check anchors.)

Tim (**t1164u**, ~11:22 AM ET, via Orchestrator), refining the split after those as-built facts:

> Ok that makes sense the way we are doing it. So what's best approach that can show the variation across windows? Use the feed checks as the 'line' and then allocate them prorated across the prior event windows? When we close a sub-move if the feed check is also forced then (I think it is) then we already have a clean way to apply to the prior window.

Tim (**t1168**, card **t1168s4534**, ~11:25 AM ET, via Orchestrator), locking that approach:

> Lock OI-0258 Sp-f (demand): Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0

### Real-data finding — D/E-5 “July hay” (Build / Orchestrator **t1136u**)

The hay that shows on D / E-5 as “July hay” is **not** new summer hay. It is **Move-wizard carryover** of May Corral Alfalfa Small Squares (**7** physical square bales). Synthetic deliveries are dated to the move/open with a `source_event_id` chain; batch `sum_delivery_qty` is inflated **7→21** (the same physical bales counted three times across the chain).

This is exactly Tim’s **t1134u** opening-carryover path: feed moved from a prior event, captured at open (zero if none). The spec must distinguish **carryover provenance**:

- Move-feed / `source_event_id` **synthetic** deliveries dated to move/open, versus
- **Physical new** deliveries on this event.

If the F1 hay pool naively sums delivery quantity across events that re-record the same carryover, the same 7 bales become 21. Locked **Cv1** avoids that triple-count: count opening carryover once + net new physical deliveries only.

### Core rule (LOCKED)

At close, when feed checks imply pasture:

- **Opening anchor** = carried-over feed captured at event open (**zero if none**). That capture is the Move-wizard / prior-event path in **t1134u** / **t1136u**.
- **Hay pool for the event** = opening carryover + **net new** deliveries − close remaining, allocated across the event — **Cv1** (do not triple-count synthetic move-dated deliveries that duplicate the opening capture).
- **Pasture DMI** is **per span** = estimated demand − hay actually fed (that span’s pool). A mid-check allocates to the span since the prior anchor; close covers the last span (**Mc1**, Tim **t1153u**). Pasture DMI may vary across the event.
- **Sp-f (demand)** (Tim **t1164u** / **t1168**): feed checks stay the **hay span boundaries** (as-built). Inside each check-span, allocate that span’s hay **prorated by demand** across the overlapping **grazing** paddock/group windows (**Mx-a**: grazing / non-`no_pasture` only). Pasture DMI for a window in that span = that window’s demand in the span − its hay share. Sub-move close with stored feed already forces a feed check (**OI-0119**) → a clean span at that edge. Pasture-only closes and animal add/remove do **not** force checks → those interiors use this proration. **Sp-w is superseded** (window snaps are not themselves hay-span boundaries).
- **No** opening mid-check / prior mid-check is required for those days to be **known** under F1 (**Al1**).

OI-0246 **F1** (subtract hay eaten when measured; do not invent eaten; do not use raw deliveries as eaten) and OI-0253 **C0** (column still goes “—” when an in-window hay day is unknown) stay in force. This OI only amends **when** hay eaten is measured / the day is known. Locked **L1** (floor implied pasture DMI at 0 per event-day) still applies — do not invent a negative pasture DMI if hay fed exceeds demand.

### Out of this OI

- Landing this docs tip on main (separate Tim land card; OI-0254–0257 docs are already on main `744dc64`).
- OI-0253 **B1** paint / **C0** column sticky-on-unknown (kept).
- Still-open events with no close inventory — Tim’s rule is **at close**. Do not invent an open-event rule; leave those as today unless Tim amends.
- Measuring missing DM on batches (ops).
- Rewriting historical Move-wizard rows / fixing stored `sum_delivery_qty` (this OI is calc-path provenance for F1, not a data rewrite) unless Tim later asks.
- Any SQL / new column.
- Forcing a feed check on pasture-only sub-move close, or on animal add/remove — as-built they do not; **Sp-f** prorates inside the existing check-span instead.

## 2. Lock axes (LOCKED)

### **Al** — Anchor / when hay days become known

| Token | Meaning |
|---|---|
| **Al1** (locked) | Opening carryover captured at open (**zero if none**) + net new deliveries + close (or close inventory) is enough. Hay fed is that pool, allocated across the event (how deliveries are counted is **Cv1**; how a span’s hay splits across windows is **Sp-f**). Days in that span are **known** for F1. No mid-check required. Fixes Tim’s blank columns. |
| **Al0** | Keep today’s dual feed-check anchor only (delivery + close alone stays unknown). **Not chosen.** |

**Al1** wording includes Tim **t1134u**: the opening anchor is carryover from a prior event captured at open, not a required mid-event feed check. If nothing was moved in, opening carryover is zero. That opening capture is the same Move-wizard path seen on D/E-5 (**t1136u**).

### **Pd** — Pasture DMI from that span

| Token | Meaning |
|---|---|
| **Pd1** (locked) | Pasture DMI = estimated demand − hay actually fed (Tim **t1129u**), **per span** (Tim **t1153u**), and **per window inside the span** under **Sp-f** (window demand in the span − that window’s hay share). Existing **L1** floor at 0 still applies. |
| **Pd0** | Leave pasture inference as today once hay is known. **Not chosen.** |

### **Mc** — Mid-checks when they exist

| Token | Meaning |
|---|---|
| **Mc1** (locked) | Each mid-event feed check allocates to the span since the prior anchor; close / the final check covers the last span (the period between the last check and the close). Hay days in those spans are known. Pasture DMI is **per span** and may vary across the event — it may fall over the course of an event in one paddock, or go up and down across moves when one stored-feed anchor (bale grazing a paddock) is shared by multiple open-and-close grazing sub-move windows. We do **not** store DMI per day after a mid-check (Tim **t1153u**). |
| **Mc0** | Close-span allocation always wins even when mid-checks exist. **Not chosen.** |

Do **not** invent a new mid-check formula beyond that span rule. **Mc1** still reuses today’s elapsed-time shares between existing anchors; the new close-allocation uses the same elapsed-time share method, with opening carryover (zero if none) and close remaining as the anchors, for the last span (and for a span that lacks two mid-check anchors). **Sp-f** then prorates each span’s hay by demand across overlapping grazing windows; it does not add new hay-span boundaries.

### **Mx** — Mixed with OI-0256 Mx1 (`no_pasture` windows)

OI-0256 **Mx1** is locked on main `744dc64` (0254–0257 docs land): omit a `no_pasture` window from pasture DMI/AUD inference (infer pasture from other open windows); that window still participates in NPK and is **Mt1** (known Pasture 0) on itself. This axis is how close-allocation meets that rule.

| Token | Meaning |
|---|---|
| **Mx-a** (locked) | Allocate hay / infer pasture DMI only across **non-`no_pasture`** open windows (grazing paddocks). `no_pasture` windows stay **Mt1** (known Pasture 0) and still get NPK per Mx1. **Sp-f** proration uses this same grazing-only set. |
| **Mx-b** | Allocate across all windows first, then apply Mx1 zeroing on `no_pasture` (risk of double-counting). **Not chosen.** |

### **Cv** — Carryover provenance / triple-count

Real data (**t1136u**): Move-wizard carryover writes synthetic deliveries dated to move/open with a `source_event_id` chain. Summing delivery qty across that chain inflated 7 physical bales to 21.

| Token | Meaning |
|---|---|
| **Cv1** (locked) | F1 hay pool = opening carryover qty **once** + **net new physical deliveries only** − close remaining. Do **not** also sum synthetic Move-wizard / `source_event_id` deliveries that re-record the same opening capture. |
| **Cv2** | Some other rule that also does **not** triple-count. **Not chosen.** |

Naive “sum all delivery rows on the event / batch, including synthetic move-dated copies” is **not** offered: it recreates the 7→21 inflation and does not match “capture carryover at open.”

### **Sp** — Split of a hay-check span across grazing windows

**Sp-f (demand)** is the locked rule and **supersedes Sp-w**. Earlier informal alternatives (day-share / event-level hay, **Sp-a / Sp-c**) are **not** chosen. Demand is the proration basis (not days, not AUD). **Sp-f** keeps feed checks as the hay lines and prorates inside the span; it is not a rename of **Sp-w** (which would have made paddock/animal snaps into hay-span boundaries).

| Token | Meaning |
|---|---|
| **Sp-f (demand)** (locked) | Feed checks stay the hay span boundaries (as-built). Inside each check-span, allocate that span’s hay **prorated by demand** across overlapping **grazing** paddock/group windows (**Mx-a**). Pasture DMI for a window in that span = window demand in the span − hay share. Where no check sits at a window boundary, do not invent one — prorate inside the existing span. A sub-move close that already forces a feed check (stored feed, **OI-0119**) yields a clean span at that edge. |
| **Sp-w** | **Superseded.** Window snap (paddock open/close or animal add/remove) as a hay-span boundary. Kept only as history. |
| **Sp-a / Sp-c** | Day-share / event-level hay. **Not chosen.** |

Tim’s **t1164u** wording is the source of **Sp-f**; **t1168** / card **t1168s4534** locks it as **Sp-f(demand)**. **t1155u** remains in the authority trail (allocate across grazing paddocks open in the window; snaps exist for new numbers) but does **not** remain the hay-boundary rule.

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** (standing, locked) | No SQL / no new column. Calc path only. |

## 3. Locked package

**LOCKED: Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0** (Tim **t1168**, ~11:25 AM ET, card **t1168s4534**, via Orchestrator). **Sp-w superseded.** Prior lock steps: **t1153u** / card **t1149s4474** (~11:11 AM ET) locked **Al1+Pd1+Mc1+Mx-a+Cv1+D0**; **t1155u** / card **t1154s4493** (~11:15 AM ET) briefly folded **Sp-w**; **t1164u** (~11:22 AM ET) refined to feed-check lines + proration.

- Matches Tim **t1129u** (allocate hay fed across the event at close; pasture DMI = demand − hay fed) and **t1134u** (opening feed is prior-event carryover captured at open, else zero).
- **Cv1** is locked against the D/E-5 real data (count the 7 bales once as opening carryover; add only new physical deliveries; subtract close remaining).
- **Mc1** is locked with Tim’s **t1153u** span clarification: each check allocates to the span since the prior anchor; close covers the last span; pasture DMI is per span and may vary, including multiple grazing sub-move windows sharing one stored-feed anchor (bale grazing). We do not store DMI per day after a mid-check.
- **Mx-a** is locked: allocate / infer only across non-`no_pasture` open windows.
- **Sp-f (demand)** is locked with Tim’s **t1164u** / **t1168** rule: feed checks stay the hay lines; inside each check-span, prorate that span’s hay by demand across overlapping grazing paddock/group windows. Variation across windows is that window’s demand-share of the span’s hay, and pasture DMI = window demand − hay share (may go up or down). **Sp-w** is not the lock.
- Does not reopen OI-0253 **C0** or OI-0246 **F1**’s “don’t invent eaten / don’t use raw deliveries as eaten.”

### As-built gap (Build code facts, tip `744dc64`)

Hay spans today are **feed checks only** until **Sp-f** is implemented. That is the Build brief:

| Expectation vs as-built | Paddock open/close | Animal add/remove | Feed check |
|---|---|---|---|
| `event_paddock_windows` boundary | Yes (`openPaddockWindows` / `closePaddockWindow` / `splitPaddockWindow`) | No | n/a |
| `event_group_windows` boundary | No (unless the group joins/leaves) | Yes (`splitGroupWindow` / `closeGroupWindow`) | n/a |
| Demand (head/weight, `groupWindowsDailyDmiKg`) | Indirect | Yes | n/a |
| Hay / `feed-pools.js` span (`poolHistory` / `elapsedDayShares`) | No (unless a check is also written) | No | Yes |
| Pasture FOR-1 add/drop | Yes | No | n/a |

Forced feed check at sub-move close (**OI-0119**, `openSubmoveCloseSheet`): **yes when stored-feed entries exist** (`eventFeedEntries.length > 0`); writes `event_feed_checks` with `isCloseReading: false`; blocks Save if remaining is blank/NaN/neg. Pasture-only sub-move close does **not** force a check. Animal add/remove does **not** write a check. Full event close (`close.js` CP-30) cards a close-reading when entries exist (`isCloseReading: true`; defaults to 0; no OI-0119 blank-block) — not the same hard force as sub-move close. Prod: 2/2 stored-feed mid-event sub-moves had a same-day check; 0/2 pasture-only did; 31/31 stored-feed final closes had a close-reading.

**Implement Sp-f** = after the check-span hay pool is known, prorate that hay by demand across overlapping grazing (non-`no_pasture`) paddock/group windows inside the span; pasture DMI per window = window demand in the span − hay share. Do not invent new feed-check rows to create window boundaries.

No other mid-check, sub-move, or delivery-sum formula is proposed here.

## 4. Acceptance (when built)

1. A closed event with opening carryover (or zero), net new deliveries, and close remaining, and no mid-checks, has **known** hay days across the event (**Al1**) — Locations D / E-5 / F-1/2/3 no longer blank solely for lack of a prior mid-check.
2. Hay fed for that span follows the locked **Cv1** pool (opening carryover once + net new physical deliveries − close remaining); pasture DMI = estimated demand − that hay fed (**Pd1**), floored at 0 per locked **L1**, and is **per span**.
3. The D/E-5 May Corral Alfalfa Small Squares carryover counts as **7** bales on the receiving event, not **21**. Synthetic Move-wizard / `source_event_id` deliveries that duplicate the opening capture are not added again.
4. Mid-event feed checks, when present, allocate to the span since the prior anchor (**Mc1**); close covers the last span. Pasture DMI may vary across those spans, including multiple grazing sub-move windows sharing one stored-feed anchor.
5. **Sp-f (demand)**: feed checks remain the hay span boundaries. Inside each check-span, that span’s hay is prorated by demand across overlapping grazing paddock/group windows (**Mx-a**). Pasture DMI for a window in that span = window demand in the span − hay share. Sub-move close with stored feed already has a forced check (clean span). Pasture-only / animal-change interiors (no forced check) still show window variation via this proration. **Sp-w** is not implemented as the lock.
6. `no_pasture` windows are omitted from this hay/pasture allocation, stay known Pasture 0 (**Mt1**), and still participate in NPK (OI-0256 **Mx1**) (**Mx-a**).
7. OI-0253 **C0** still nulls the season column when an **in-window** hay day remains unknown for another reason (e.g. missing DM on the batch).
8. No new migration / no new column (**D0**). If Build finds a real schema gap, stop and ask; do not invent a column.

## 5. Tip instruction

**LOCKED / READY FOR BUILD** — **Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0** (Tim **t1168**, card **t1168s4534**; **Sp-w superseded**). **Do not land on main.** **Do not open a PR.** Never force-push. This tip is **separate** from the already-landed `docs/oi-0254-0257-feedback-batch` work (now on main `744dc64`). Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Base is `origin/main` `744dc64ab96c0e8a394f54338306d9b60e0f13d9`.
