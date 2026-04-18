# SESSION BRIEF — Locations Tab Final Pass (2026-04-18)

**Goal:** close out the three remaining OI-0075 bugs (3, 5, 7) in a single dashboard render-path pass and fully close OI-0075. Calcs already exist; this is investigation + wiring.

**Closes:** OI-0075 (full close, removing the partial-close caveat from the previous session).

---

## Important — calc inventory before you start

A pre-handoff audit found that **all required calcs are already registered**. Do not write new calcs. Reference them via `getCalcByName(...)`:

| Calc | File / line | Returns |
|---|---|---|
| CAP-1 (capacity) | `src/calcs/capacity.js:6` | `{ dmAvailableKg, dmDemandKg, coverageFraction, coversHours, shortfallLbsHay, surplusHours }` |
| FOR-3 (estimated days) | `src/calcs/feed-forage.js:246` | (per spec) |
| FOR-6 (forecast DM) | `src/calcs/feed-forage.js:429` | (per spec) |
| DMI-1 / DMI-1a / DMI-2 / DMI-3 / DMI-4 / DMI-5 / DMI-6 / DMI-7 / DMI-8 | `src/calcs/feed-forage.js` | (per spec) |
| NPK-1 (per-acre or per-event NPK) | `src/calcs/core.js:7` | `{ nKg, pKg, kKg }` (note: not `n/p/k` — see OI-0073 Part C) |
| NPK-2 (NPK value) | `src/calcs/advanced.js:7` | (per spec) |
| ANI-1 / ANI-2 / ANI-3 | `src/calcs/core.js` | (per spec) |

**The work is in `src/features/dashboard/index.js`, not `src/calcs/`.** If you find yourself wanting to add a new calc registration, stop and re-read this section.

---

## Read first

1. `github/issues/GH-22_locations-tab-display-fixes.md` — the bug catalogue (canonical statement of what bugs 3/5/7 should look like)
2. `OPEN_ITEMS.md` → OI-0075 — the partial-close note and the carve-out reasoning
3. `src/features/dashboard/index.js` — particularly:
   - Lines around 253–384 (top stat cards rendering, the working Pasture % path at 303)
   - Lines around 406–481 (the placeholder Pasture % path at 414 — this may be the dead/wrong one)
   - Lines around 950–972 (event type badge logic — `stored feed` vs `stored feed & grazing`)
   - Lines around 1115–1120 (capacity line construction — the `if (availableDmKg > 0 && dailyDmiKg > 0)` gate)
4. `/sessions/ecstatic-funny-pasteur/mnt/get-the-hay-out/index.html` — v1 reference for `calcConsumedDMI(allFeedEntries(ae), getEffectiveFeedResidual(ae), _lastFeedCheck(ae))` (search for the function name to find the formula)

---

## Bug 3 — Green capacity line not rendering

**The line builder already exists** at `src/features/dashboard/index.js:1117`:

```js
let capText = `Est. capacity: ${Math.round(estAuds)} AUDs · ~${daysRemaining} days remaining`;
```

It's wrapped in `if (availableDmKg > 0 && dailyDmiKg > 0)`. So when the line doesn't render, **one of those two values is computing to 0 or null** for the test data on Tim's dashboard.

### Investigation

Walk backwards from line 1116 and identify how `availableDmKg` and `dailyDmiKg` are derived. Likely candidates:

- `availableDmKg` probably comes from FOR-6 (forecast DM) via the paddock window's forage type. If the paddock has no forage type set, FOR-6 can't compute.
- `dailyDmiKg` probably comes from DMI-3 / DMI-2 across active group windows. If there are no active group windows or animal classes are missing fields, DMI-2 returns 0.

### Required outcome

Pick the option that matches what's actually broken:

- **If the gate is the right gate but the inputs are legitimately missing** (no forage type, no animals, etc.) — leave the gate alone but render an inline hint instead of nothing: `Capacity: set forage type to estimate` or `Capacity: no animals on event`. Don't render `—` silently; tell the user what's missing.
- **If the gate is too strict** (e.g., it's checking for `> 0` when it should be `!= null`) — fix the gate and let the line render with whichever component is available.
- **If the inputs really are computing to 0 because of a wiring bug** — fix the wiring.

The capacity line should render whenever there's a meaningful "capacity" answer to give the user, including the partial answer "we can't compute this because X is missing — fix X."

### Acceptance

- [ ] Capacity line renders for at least one of Tim's existing test events on the Locations tab today.
- [ ] When inputs are legitimately missing, the line tells the user *why* instead of disappearing.
- [ ] Existing capacity-line behavior on events that already render correctly is unchanged (regression check).

---

## Bug 5 — Stored feed DMI value mismatch with v1

**v1 formula** (from `/sessions/ecstatic-funny-pasteur/mnt/get-the-hay-out/index.html`):

```
calcConsumedDMI(allFeedEntries(ae), getEffectiveFeedResidual(ae), _lastFeedCheck(ae))
```

Search v1's index.html for `calcConsumedDMI` and read the implementation. It returns a number representing the DM (kg or lbs depending on context) of stored feed consumed since the last feed check, accounting for residual.

**v2 currently** computes a different number for the same event. The spec file's note: *"V1: `Stored feed: 638 lbs DM`. V2: `Stored feed: 2 lbs DM`. Same event."*

### Investigation

In `src/features/dashboard/index.js`, find the line that produces the `Stored feed: N lbs DM` display. Identify which v2 calc it's calling — likely DMI-1, DMI-5, or a hand-rolled summation.

Compare the v1 formula's three inputs (`allFeedEntries`, `getEffectiveFeedResidual`, `_lastFeedCheck`) to what the v2 code is actually passing. The discrepancy is almost certainly in one of:

- **Time window** — v1 sums entries since the last feed check; v2 may be summing all entries on the event.
- **Residual handling** — v1 subtracts residual at check time; v2 may not be applying residual at all.
- **DM% application** — v1 applies `dmPct` to the as-fed quantity; v2 may be displaying as-fed weight rather than DM.

### Required outcome

The v2 stored-feed display value should match v1 to within rounding tolerance for the same source data. If a calc is missing the inputs to match v1, port the missing piece — either as a wrapper around an existing v2 DMI calc, or as a small helper in `src/calcs/feed-forage.js` (only if it's a genuinely new computation; prefer reusing DMI-5).

### Acceptance

- [ ] Stored feed DMI for at least one event Tim can compare against v1 produces the same value (within rounding).
- [ ] Test added in `tests/unit/calcs/` that fixtures a feed-entries-plus-check scenario and asserts the v2 stored-feed calc returns the v1-equivalent number.
- [ ] Display label remains `Stored feed: N lbs DM` (or `kg DM` for metric users).

---

## Bug 7 — Top stat cards: Pasture %, NPK/Acre, NPK Value

**There are two Pasture % render paths in the file:**

- Working path: `src/features/dashboard/index.js:303` — `// Pasture % (avg from closed events, or estimate from open)`
- Placeholder path: `src/features/dashboard/index.js:414` — `const pastureVal = '\u2014';` with comment `// Pasture % — placeholder`

The top stat card is rendering through the placeholder path (414). Either:

- **Replace the placeholder** with a call into the working logic at line 303 (extract a shared function if needed), or
- **Delete the placeholder render path** if it's dead and route the top stat card through the working path.

NPK/Acre and NPK Value are similar — the calcs exist (NPK-1, NPK-2) and are referenced elsewhere in the same file (NPK-1 at lines 254, 699, 826, 951; NPK-2 at lines 255, 729, 952). The top stat cards just aren't calling them.

### Investigation

1. Identify which `renderXxx` function builds the top stat cards row.
2. Locate the three placeholder values (Pasture %, NPK/Acre, NPK Value).
3. Replace each with a real calc call following the same pattern used elsewhere in the file (mind the OI-0073 Part C lesson — NPK-1 returns `{nKg, pKg, kKg}`, not `{n, p, k}`; use the defensive `result.nKg ?? result.n ?? 0` pattern).

### Required outcome

- **Pasture %** — averaged across open events on the operation. Color-graded per the existing color logic at line 303 (read it, don't reinvent).
- **NPK/Acre** — total NPK (N + P + K, in lbs/kg per the user's unit system) deposited across open events ÷ total acres of those events.
- **NPK Value** — total fertilizer-equivalent value across open events (NPK-2 × current prices from `npk_price_history`).

### Acceptance

- [ ] All three top stat cards display real values when data exists, em-dash when it legitimately doesn't (no animals, no events, etc.).
- [ ] No `NaN` displays — apply the `?? 0` defensive pattern from OI-0073 Part C.
- [ ] Test coverage: at least one test asserting each of the three values renders correctly given a fixture with two open events.

---

## OPEN_ITEMS changes

After commit, update OI-0075 in `OPEN_ITEMS.md`:

```
**Status:** closed — 2026-04-18, commit `<HASH>` (closes after the partial close in the previous session). Bugs 3/5/7 shipped: capacity line gate fixed (or rendering hint added when inputs missing); stored-feed DMI matches v1 calcConsumedDMI; top stat cards (Pasture %, NPK/Acre, NPK Value) wired to NPK-1, NPK-2, and the working Pasture % logic at dashboard/index.js:303. <one-line summary of what each bug ended up needing>.
```

Also append a Change Log row:

```
| 2026-04-18 | Pre-testing cleanup follow-up | OI-0075 fully closed (bugs 3, 5, 7 wired in dashboard render path; calcs already existed, this was wiring + investigation) |
```

If the GH-22 issue is still open, close it:

```
gh issue close 22 --comment "All seven bugs landed. Bugs 1/2/4/6 in commit e124952; bugs 3/5/7 in commit <HASH>."
```

---

## Delivery gate

- [ ] All three bug fixes verified manually on Tim's existing test data (at least one event each) before commit
- [ ] PROJECT_CHANGELOG.md row added
- [ ] OPEN_ITEMS.md OI-0075 status closed + Change Log row appended
- [ ] GH-22 closed
- [ ] `npx vitest run` clean
- [ ] No new `console.error` (use `logger.error`)
- [ ] No `innerHTML` with dynamic content
- [ ] All user-facing strings via `t()`
- [ ] Pre-commit param-count sanity (store `add`/`update`/`remove`)

---

## Out of scope (do not pull in)

- DMI chart empty bars (OI-0076) — separate, data-dependent
- New calc registrations — calcs exist; don't add more
- Refactoring the dashboard render structure — scoped changes only per CLAUDE.md
- Bug 4 (badge text) — already shipped in commit e124952; verify regressions only

---

## Files affected (likely)

- `src/features/dashboard/index.js` — primary render-path edits across the three bugs
- Possibly `src/calcs/feed-forage.js` — only if Bug 5 turns out to need a small wrapper helper around DMI-5; do NOT add a brand-new DMI calc
- `tests/unit/features/dashboard.test.js` — coverage for capacity-line conditions, stored-feed DMI value, top stat card wiring
- `tests/unit/calcs/feed-forage.test.js` — only if a wrapper landed
- `OPEN_ITEMS.md`, `PROJECT_CHANGELOG.md`
