# BUG: Dashboard Locations Tab — Display Issues and V1 Parity Gaps

**Priority:** P2
**Area:** v2-build / UI sprint
**Labels:** bug, ui, dashboard, v1-parity

---

## Issues Found (V2 vs V1 Comparison, 2026-04-17)

### Bug 1: "lbs lbs" double unit suffix

V2 shows `Weight: 4350 lbs lbs · 4.3 AU` and `avg 1450 lbs lbs` on both the location card weight line and the group sub-rows. The unit is being appended twice — once by the display/conversion function and once by the template string.

**V1 shows:** `Weight: 4,350 lbs · 4.3 AU` and `avg 1450 lbs`

**Fix:** Find where the weight display line is assembled in `renderLocationCard()` and remove the hardcoded " lbs" suffix since `display()` already appends the unit. Check both the main weight line and the per-group sub-line.

### Bug 2: Missing acreage next to location name

V1 header: `D  7.42 ac` — acreage appears right next to the location name in the card header.
V2 header: `D` — no acreage shown.

**Fix:** Add location acreage from `location.acreage` or `location.sizeHa` (converted) next to the name.

### Bug 3: Missing green capacity line

V1 shows a prominent green line:
```
Est. capacity: 80 AUDs · ~6 days remaining (incl. stored feed) · 4" · ADA est: 10.8/ac
```

V2 is missing this entire line. This is one of the most information-dense lines on the card — it tells the user at a glance how long the pasture will last.

**Fix:** This line requires the CAP-1 / FOR-3 calc results. It may be deferred until DMI-8 lands (see OI-0069), but the static portion (forage height, ADA) can be shown now. If the full calc isn't available, show what's computable and mark the rest as "—".

### Bug 4: Badge text inconsistency

V1 badge for pasture "D": `stored feed & grazing` (combined badge)
V2 badge for same pasture: `stored feed` (only one badge)

The v1 badge correctly reflects that this event has both stored feed entries AND is on pasture. V2 appears to only check one condition.

**Fix:** Check the badge logic in `renderLocationCard()`. Should show "stored feed & grazing" when event has feed entries AND is on pasture, "stored feed" for confinement events with feed, "grazing" for pasture-only events.

### Bug 5: Missing "Stored feed" in pasture breakdown

V1: `Pasture: 2,078 lbs DM · Stored feed: 638 lbs DM · DMI demand: 109 lbs/day`
V2: `Pasture: 2717 lbs DM · Stored feed: 2 lbs DM · DMI demand: 109 lbs/day`

The structure is correct but the stored feed number (2 lbs) looks wrong — v1 shows 638 lbs for the same event. This suggests the stored feed calc is not using the same formula. May be related to the `calcConsumedDMI` vs DMI-1 difference.

**Investigate:** Compare how v1's `calcConsumedDMI(allFeedEntries(ae), getEffectiveFeedResidual(ae), _lastFeedCheck(ae))` maps to v2's stored feed calculation.

### Bug 6: Missing number formatting (commas)

V1: `50,220 lbs` with locale-aware comma formatting
V2: `50220 lbs` with no formatting

**Fix:** Apply `.toLocaleString()` or equivalent number formatting to weight, pasture DM, and stored feed DM values.

### Bug 7: DMI chart bars are empty — DEFERRED (OI-0076)

V2's "DMI — LAST 3 DAYS" chart renders bar outlines but no filled bars (all gray/empty). The values above bars show "—" for all 3 days.

**Deferred:** Tim confirmed (2026-04-17) this is likely due to v1 migrated data not having the per-day breakdown format. Defer until fresh v2 test data is available. Tracked as OI-0076. May also depend on DMI-8 (OI-0069).

### Bug 8: Summary stats cards (top row) mostly empty

V2 shows only 2 of 5 stat cards populated (Pasture DMI and Feed Cost). The other 3 show "—" with placeholder text. V1 shows all 5: Pasture DMI, Feed Cost, Pasture %, NPK/Acre, NPK Value.

**Fix:** These stat cards need the same calc data as the location cards. Wire up:
- **Pasture %**: Average pasture percentage across open events
- **NPK/Acre**: Total NPK deposited divided by total acres
- **NPK Value**: Total fertilizer value from NPK-2 or inline calc

---

## Acceptance Criteria

- [ ] Weight displays as `N,NNN lbs` (single unit, comma-formatted)
- [ ] Location acreage shows next to name in card header (`D  7.42 ac`)
- [ ] Green capacity line renders (or partial with "—" for unavailable calcs)
- [ ] Event type badge shows "stored feed & grazing" when applicable
- [ ] Stored feed DMI value is correct (matches v1 formula)
- [ ] DMI chart shows data when available (not all empty bars)
- [ ] Top stat cards show Pasture %, NPK/Acre, NPK Value when data exists
- [ ] Number formatting with commas throughout

---

## No Schema Impact

Visual/display only. No CP-55/CP-56 impact.
