# #377 — Stored forage budgeting: the rest of OI-0221 after OI-0281

**Status:** **LOCKED** by Tim, 2026-11-28 7:43 AM ET, on Orchestrator card **t1752s6901**: **Sl1 + Bu3 + Fh1 + Hc1 + J1 + Pf1 + Lk1**. Bu3 was Tim's choice over Design's recommendation of Bu1. Build order is slice 1 (forecast), then slice 2 (cost and scorecard), then slice 3 (lock, migration **055**). Writing or applying 055 needs a verified backup plus Tim's separate yes. Design · base `origin/main` `89e4d0e` (schema 52 released).

**Sources:** OI-0221 in the frozen [OPEN_ITEMS.md @ ba4470b](https://git.sarnford.com/Homelab/GTHO-v2/src/commit/ba4470b6bd0954ea5e5e8c0b4527fc5acf605500/OPEN_ITEMS.md) · [proposal 2026-11-16](STORED_FORAGE_BUDGET_PROPOSAL_2026-11-16.md) · [OI-0281 brief](STORED_FEED_BUDGET_2026-11-23.md) (shipped as #436, migration 052).

## What is already done (not reopened)
- **OI-0281 / #436:** the plan (date-range lines, % of need or fixed kg DM/day), planned vs eaten, savings (green, or amber when over), the Feed card and the Home savings tile. This answers OI-0221's **E** and part of **F**: the plan is saved and editable, but not locked.
- **D10 / OI-0247 (#402):** the period is set by the farm season default (049), and any period can be viewed.
- **OI-0222 / #451:** last winter's history (045 tables, `winter-history.js`) and Home All from Oct 1, 2025.
- **OI-0224 / OI-0225:** the run-rate panel and implied pasture DMI.
- **Decided earlier and still binding:** D4 forecast idea, D5 cost ($56/bale fallback, $45/bale last season, recorded batch cost), D8 run-rate panel on the scorecard (one shared component), and N–S (pills 7/14/30/60, pace ≤95% green, 95–105% neutral, >105% amber, waste % lower-is-better, no new streaks, one panel per screen).

## What is left
1. **Forecast:** on-hand today against the remaining planned need, giving surplus or deficit, plus "Hay covers through <date>" and staleness handling.
2. **Cost and scorecard:** $ beside DM, prior-year comparison, the run-rate panel inside the scorecard, the pace badge, months-under-plan and $ saved, and a "Stored feed by month" report.
3. **Lock and budgeted on-hand:** lock or re-lock the plan, the opening on-hand figure, and on-hand vs budget with its variance explained. This is the only part that needs a migration.

## Locked answers (t1752s6901)
- **Sl1:** three PRs, in order: forecast (no migration), then cost plus scorecard (no migration), then lock plus opening on-hand (migration 055).
- **Bu3, both shown:** wherever "used" appears for this season, show **eaten** (Σ Al1 `storedDmiKg` from feed checks, measured days) and **fed** (hay that left the stack: deliveries minus returns, carries ignored) side by side, with labels.
  - The OI-0281 savings number stays on **eaten**, as locked in #436. Fed is shown beside it and does not replace it.
  - Last winter has feedings only, so its eaten column shows "no feed checks" rather than 0.
  - Design default, not asked of Tim: the pace badge (O) compares **eaten**/day against planned/day, the same basis as savings. The fed rate is shown beside it with no colour.
  - Slice 1 needs no used-basis number. Bu3 applies from slice 2.
- **Fh1:** forecast = on-hand DM today − remaining planned stored DM from tomorrow through the period end. It's green when that's a surplus and red when it's a deficit, shown in lb DM and ≈ bales, with $ added in slice 2.
- **Hc1:** "Hay covers through <date>" by walking on-hand through the plan. The days-on-hand goal stays, and carry-over days past the period end are shown.
- **J1:** up to 30 days since a count is normal, 31–60 days is amber. Over 60 days, unknown weight or DM, or a location mismatch hides the forecast and shows "Count your hay".
- **Pf1:** a "Fill from last season" button. Nothing is saved until Tim saves (slice 2).
- **Lk1:** lock and re-lock with a note. Opening on-hand is reconstructed and Tim confirms or overrides it. Receipts count on both sides (slice 3, migration 055).

## Questions as offered (recommendation first; locked picks above)

**Sl — slicing.**
- **Sl1 (rec):** three PRs in the order above. Slices 1–2 need no migration. Slice 3 takes migration **055** (053 is #388, 054 is #437), which needs a backup plus Tim's yes.
- Sl2: one big PR at the end.

**Bu — what "used" means across the scorecard.** OI-0281 locked **eaten** (Σ Al1 `storedDmiKg` from feed checks). The 2026-11-17 answers B/N said **fed** (hay that left the stack), because last winter has feedings only.
- **Bu1 (rec):** eaten everywhere for this season (the plan card, OI-0280 and the scorecard). Last winter is shown as fed, labelled "fed (last winter, no feed checks)", and the pace badge compares eaten/day against planned/day.
- Bu2: fed everywhere, so the plan card and scorecard use different numbers.
- Bu3: show both side by side.

**Fh — the forecast headline (slice 1).**
- **Fh1 (rec):** surplus or deficit = actual on-hand DM today − remaining planned stored DM from tomorrow to the period end (% lines × need with today's herd held flat; amount lines as entered; uncovered days 0). It's green when positive and red when it's a deficit (O already allows red here only). It's shown in lb DM, ≈ bales of the main batch, and $ once slice 2 lands. This needs no opening on-hand.
- Fh2: wait for slice 3 and lead with on-hand vs budget.

**Hc — "Hay covers through <date>".**
- **Hc1 (rec):** walk today's on-hand forward through the planned daily stored need. The last day fully covered is the date. If it reaches the period end, show "covers the season + N days carry-over". The days-on-hand goal stays as it is for now (answers K).
- Hc2: replace the days-on-hand banner now.

**J — stale or unknown on-hand.**
- **J1 (rec):** counted within 30 days is normal. 31–60 days shows an amber "last counted N days ago". Over 60 days, never counted, any live batch with unknown weight or DM, or `remaining` disagreeing with located balances means the forecast is hidden. The plan card stays, with a "Count your hay" button that opens Reconcile.
- J2: always show, with only a tag.

**Pf — pre-fill the plan from history (old A).**
- **Pf1 (rec):** a "Fill from last season" button in Edit plan proposes one % line per month from last winter's eaten-or-fed ÷ need. It saves nothing until Tim saves. Ships in slice 2.
- Pf2: no pre-fill.

**Lk — slice 3: lock, opening on-hand and receipts (old F, G, H).** Recorded now and confirmed again before migration 055 is written.
- **Lk1 (rec):** lock or re-lock with a change note. Opening on-hand is reconstructed at period start (today's `remaining` + DM eaten since − received since + shrink since) and Tim confirms or overrides it at lock. Receipts count on both sides as they arrive, so the variance is eating performance plus shrink.
- Lk2: no lock. The plan stays editable forever and slice 3 is dropped.

**Already settled, no question:** run-rate window I = 30 days fixed for the forecast line (P). Where it lives (L): the Feed card plus a desktop Reports view, with the Home tile staying as OI-0281 shipped it. Animal basis (D): DMI. Month attribution (C): feeding date.

## Acceptance sketch (slice 1)
- Plan Oct 1 – Mar 31 at 100%, on-hand 120,000 lb DM, remaining planned 100,000 lb DM: shows +20,000 surplus, green.
- On-hand below remaining planned shows a deficit in red, with the bales equivalent.
- No plan saved: the forecast is hidden and the plan card prompts to create one.
- Last count 75 days ago, or a live batch with no DM%: the forecast is hidden and "Count your hay" is shown.
- "Covers through" lands on the right day for a plan that steps from 100% to 50% in April. Metric and imperial both work (OI-0278).
- The read-only, no-migration release gate stays at 52.

## Slice 1 build rulings (Design, 2026-11-28, PR #500)
- **Empty stock:** live batches with `remaining` ≤ 0 are ignored for unknown weight or DM, for location mismatch, and for the purchase-date "count". Adjustments on any live batch still count.
- No live stock hides the forecast with a "no hay on hand" note and no button. A period that has ended shows no forecast block.
- "Count your hay" opens the batch Adjust sheet with reason Reconcile, targeting the mismatched batch, then the unknown batch, then the main batch. A batch with no location-balance rows is not a mismatch.
- **Carry-over days** = floor(leftover ÷ planned DM on the period's last day when a line covers it and it's > 0, else today's need). A divisor of 0 shows nothing.
- The calc is registered as **FED-8** (`V2_CALCULATION_SPEC.md` §4.6).
