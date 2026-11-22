# Farm Settings season-default dates (OI-0247)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-22 ~5:37 AM ET, via Orchestrator, card **t841s3483**, direction **Db**). This docs tip is ready for Tim’s land of **docs**. Migration **apply** is a **separate** Tim yes + verified backup; a docs land does **not** authorize apply.  
**Owner:** GTHO Design → GTHO Build (after docs land on main **or** from this locked tip ahead of land per Orchestrator coordination; Orchestrator land card for docs — land only after Tim yes; Orchestrator brings the apply path separately).  
**Parent:** Forgejo `origin/main` `52540a358f511bf46bceacbd7dcc7c94918acd04` (compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0225 §2.3 / Q5 ([IMPLIED_PASTURE_DMI_2026-11-17.md](IMPLIED_PASTURE_DMI_2026-11-17.md)); OI-0221 D10 ([STORED_FORAGE_BUDGET_PROPOSAL_2026-11-16.md](STORED_FORAGE_BUDGET_PROPOSAL_2026-11-16.md)); OI-0246 W1 ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md)).  
**Schema / migration:** **Yes** — a per-farm season default (start/end **month/day**) on `farm_settings`. This tip describes **intent only**; it does **not** invent SQL/DDL or a migration filename. Next numbered migration after the then-current ceiling (compiled released stamp on this parent is **48**; do not reopen or widen **047** / **048**). File-only until Tim’s **separate** yes + verified backup. Hard-coded **Oct 1 – Sep 30** remains until this OI ships **and** the migration is applied.

## 1. Problem

Locations + rotation already has a “Season default” control and a W1 metric window that fall back to a hard-coded **Oct 1 – Sep 30** (`DEFAULT_BUDGET_PERIOD` / `periodContaining`). Tim can pick another window to view, but there is no farm Settings place to edit the **default** those controls load.

This was already decided on 2026-11-17 (implied-pasture **Q5**): the default period is a **per-farm setting, editable in Settings** (start and end month/day; Oct 1 – Sep 30 by default), and viewing any period with a date picker must **not** change that default. OI-0221 D10 recorded the same rule but parked the setting in “the budget migration (046 or later).” That budget work is still **PROPOSED**. Locations needs the setting now.

**Origin:** Tim via Orchestrator, 2026-11-22 ~5:31 AM ET (**t837u**): the chosen window reset when leaving the calendar, and he also needs a way to edit the season default dates that get loaded. Device-local remember of the **viewed** window is OI-0246 **Pb** (no SQL; list-parity tip). This OI is only **Db**.  
**Direction locked:** Tim, card **t841s3483**, ~5:37 AM ET — **Pb + Db**. **Db:** “Season default is a per-farm Settings start/end month-day (matches his Nov 17 decision). SQL + backup + separate Tim yes; NOT this land.”  
**Split:** OI-0246 list-parity land stays **La+Ta+Cb+Rb+Pb** only (no SQL). This OI is the farm Settings default. Do **not** put this work on the list-parity docs or code branch.

## 2. Current state (citations — do not invent)

Read on tip `52540a358f511bf46bceacbd7dcc7c94918acd04`.

| Piece | Where | What it does today |
|---|---|---|
| Hard-coded default | `src/calcs/budget-period.js` `DEFAULT_BUDGET_PERIOD` | `{ startMonth: 10, startDay: 1, endMonth: 9, endDay: 30 }`. `periodContaining(today, def)` resolves that month/day pair to a concrete start/end containing today (year-wrap allowed). |
| Locations metric window | `src/features/events/rotation-calendar/location-metrics.js` `defaultMetricWindow` | Always `periodContaining(today, DEFAULT_BUDGET_PERIOD)` — Oct 1 – Sep 30. |
| “Season default” button | `src/features/events/rotation-calendar/calendar-grid.js` (`metric-window-reset`) | Clears the picked window (`setMetricWindow(null, null)`), which reloads the hard-coded default. |
| Feed viewed period | `src/features/feed/budget-period-store.js` | Device-local last viewed start/end (`gtho_v2_budget_viewed_period`). If none, falls back to `periodContaining(today, DEFAULT_BUDGET_PERIOD)`. Viewing writes only that device key — not a farm default (Q5 already). |
| Farm Settings UI | `src/features/settings/index.js` `renderFarmSection` | Existing Farm Settings card (`settings.farmSettings`) already writes per-farm defaults on `farm_settings` (AU weight, residual, recovery, NPK prices, manure, feed-day goal, forage scale, bale-ring diameter). No season start/end fields today. Preg-check and return-to-cycle are adjacent cards on the same Settings screen. |
| `farm_settings` | migrations **001**, **047**, **048** | One row per farm; later settings were **additive columns** (not jsonb). RLS already covers the table. Compiled released stamp on this parent is **48**. |

## 3. Product (Db — LOCKED)

- **One farm default period:** start month/day + end month/day, stored with the farm, editable in Settings, synced across Tim’s devices. The operation has one farm today, so per farm = per operation (same Q5 note).
- **Factory default:** Oct 1 – Sep 30 (Q4 / current `DEFAULT_BUDGET_PERIOD`). Existing farms get that default until someone edits it.
- **Viewing is not saving the default (Q5):** picking a period on Locations + rotation, or on the feed budget/forecast form, is calc and display only. It must not write the farm Settings default or any locked budget.
- **“Season default” button:** once this setting exists and is applied, the button (and `defaultMetricWindow`) load **this farm setting**, resolved through `periodContaining` for the year containing today. Until then, keep the hard-coded Oct 1 – Sep 30.
- **Same setting for feed budget:** OI-0221 D10 / OI-0225 §2.3 already named this default. This OI delivers it **now**, independent of still-PROPOSED OI-0221 slice 2 (budget tables). When slice 2 ships, it **reuses this setting** — it must not invent a second farm default period.

## 4. Settings UI locus

Put the editors on the existing **Settings → Farm Settings** card (`renderFarmSection`), with the other per-farm planning defaults (near feed-day goal is the natural neighbourhood).

- Two controls: **season start** month/day and **season end** month/day — not a full calendar year, because the stored default is a recurring seasonal window.
- Save uses the existing Farm Settings write path (`farmSettings` / `farm_settings`).
- Hide or disable the editors until the new columns are in the released ceiling (same Pg0-style gate as other additive `farm_settings` fields). Do not write keys the live schema does not have.
- This is not a Tools backfill and not a new Settings section unless layout forces a small adjacent card; Design’s lean is the Farm Settings card itself.

## 5. `farm_settings` fields (intent — not DDL)

Persist four values that match the shape `periodContaining` already takes:

- start month, start day
- end month, end day

**Intent:**

- Additive fields on the existing `farm_settings` row (the same pattern as 047 / 048 typed columns). Jsonb keys are an acceptable alternative only if Build has a documented reason; Design’s lean is additive typed fields, not a new table and not a second settings row.
- Defaults: October 1 – September 30.
- Year-wrap is allowed (Oct–Sep is the current farm year).
- Resolve and validate through the existing helpers (`periodContaining`, `validatePeriod` with the budget 1–366 day rule). Feb 29 follows the helpers’ current clamp (end-of-February in a non-leap year).
- RLS: leave existing `farm_settings` policies as they are.
- No historical backfill: a new column default is enough; no row rewrite of feeding, basis, or budgets.
- Do **not** invent column names, CHECK constraints, or a migration number in this tip. Build writes the SQL at implementation, as the next numbered migration after the then-current ceiling, and adds the usual CP-55 / CP-56 schema step.

## 6. Interaction with the viewed windows

| Surface | Default (this OI, after apply) | Viewed / picked period | Writes the farm default? |
|---|---|---|---|
| Locations + rotation W1 metrics | Farm setting via `periodContaining(today, farmDefault)`. “Season default” reloads that. | The date pickers (and, once list-parity **Pb** lands, the device-local remembered window) | **No** |
| Feed budget / scorecard (OI-0221) | Same farm setting | Device-local `budget-period-store` picker, and later the form’s start/end picker (Q5) | **No** |
| Settings → Farm Settings | The stored default itself | n/a | **Yes** — this is the only editor |

Until apply, both surfaces keep using hard-coded `DEFAULT_BUDGET_PERIOD`.

**Pb vs Db:** OI-0246 **Pb** is “this browser remembers the chosen start/end across Calendar \| List and leaving/returning” (device-local, no SQL). That is the **viewed** Locations window. It must not be treated as the farm default, and this OI must not replace or fight it. After both ship: first load / “Season default” uses the farm setting; a later picked window may persist in the browser until the user hits “Season default” or clears it.

## 7. Apply gates

1. Docs land (this tip) — only after Tim yeses the docs land card. **Does not** apply SQL and **does not** change production data.
2. Build writes the migration file + Settings editors + consumers (`defaultMetricWindow`, “Season default”, feed default fallback) on a separate implementation branch. File is held as written-only.
3. Verified backup of the live database (existing Migration Execution Rule / AGENTS.md).
4. Tim’s **explicit yes at apply time** — Orchestrator brings this separately. Not implied by the docs land, by Db on **t841s3483**, or by shipping the code.
5. Apply, then the usual released-stamp bump. `RELEASED_SCHEMA_VERSION` stays **48** until that bump. Editors stay gated until the released ceiling includes the new fields.

## 8. Non-goals

- Not part of the OI-0246 list-parity land (**La+Ta+Cb+Rb+Pb** only). Do not implement this on the list-parity branch.
- No SQL, no migration file, and no code in this docs tip.
- Do not change Calendar name-click behaviour (OI-0246 **Cb** leaves Calendar alone).
- Do not make viewing or picking a period write the farm default (Q5).
- Do not invent a second default period when OI-0221 slice 2 (saved budgets, forecast, scorecard) ships — reuse this setting.
- OI-0221 budget tables, lock/unlock, monthly shares, and the history report remain OI-0221.
- No backfill of historical budgets or feeding rows.
- Hard-coded Oct 1 – Sep 30 stays until this OI’s migration is applied.

## 9. Acceptance (after docs land + apply, not for this tip)

- [ ] Farm Settings shows start/end month-day editors; save persists on `farm_settings` and syncs.
- [ ] New farms, and existing farms that have not been edited, default to Oct 1 – Sep 30.
- [ ] Locations + rotation “Season default” and `defaultMetricWindow` use the farm setting.
- [ ] Feed budget / scorecard default fallback uses the same setting.
- [ ] Picking a viewed period on Locations or the budget form does not change the Settings default.
- [ ] Until apply, behaviour is unchanged (hard-coded Oct 1 – Sep 30).
- [ ] Migration applied only after verified backup + Tim’s yes; released stamp bumped separately.

## 10. Related

- OI-0225 §2.3 / Q5 (Tim, 2026-11-17 9:18 AM ET): default period changeable from Settings; view any period on the form; viewing changes nothing stored.
- OI-0221 D10 (approved; OI-0221 as a whole still PROPOSED): this OI takes the Settings default out of the waiting budget migration.
- OI-0246 W1 / list-parity **Pb**: viewed window persist is device-local; **Db** is this OI.
- Parent main: `52540a358f511bf46bceacbd7dcc7c94918acd04`

---

**Tip instruction:** **LOCKED (Db)**. Ready for Tim’s land of **docs**. Do **not** land on main until Tim yeses the docs land card. Do **not** apply a migration without Tim’s separate yes + verified backup. A docs land does **not** authorize apply. Do **not** fold this into the OI-0246 list-parity tip. Hard-coded Oct 1 – Sep 30 remains until this OI ships and is applied.
