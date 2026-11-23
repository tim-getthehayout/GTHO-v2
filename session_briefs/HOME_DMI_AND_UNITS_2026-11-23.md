# Home DMI card + units everywhere (OI-0277, OI-0278)

**Status (America/New_York, 2026-11-23):**

| OI | Item | Status |
|---|---|---|
| OI-0277 | Home DMI card: Total DMI + Pasture DMI, no double counting | **SPEC LOCKED / READY FOR BUILD** — **Hd3** (Tim, via Orchestrator, card **t1352s5286**, 7:38 AM ET) |
| OI-0278 | Units everywhere: every metric follows the farm's unit system, with units labeled | **SPEC LOCKED / READY FOR BUILD** — **Ua+Na+Pa+Fa+Da** (Tim **t1354u** / **t1355u** 7:42 AM ET scope; card **t1357s5308** 8:15 AM ET decisions) |

**Sources (Tim, via Orchestrator, 2026-11-23):** t1352s5286 (7:38 AM, 0277 **Hd3** + first 0278 **Un1** “lb with unit in headers”), t1354u + t1355u (7:42 AM, widened 0278: “all metrics must follow the choice of the user” / “everywhere”), t1357s5308 (8:15 AM, 0278 **Ua+Na+Pa+Fa+Da**). Units audit: Design, read-only, at `3373711` (~7:50 AM ET); its tables are Appendix A/B below.

**Branch tip:** `docs/oi-0277-0278-dmi-units` on `origin/main` `3373711a966f3210127f831d16fc18cb4bad3e43` (#159 docs, OI-0269..0276, live; code identical to `dbce180`). Docs only — lands through Orchestrator + Homelab Git Bridge after Tim’s land yes.
**D0 for both items: no SQL / no migration / no RLS change / no data write.** Stored data stays canonical metric (`*_kg`, `area_hectares`, `*_cm`) and is never converted or rewritten.

Line numbers are at `3373711`. Code read only.

---

## Build order (whole follow-up pass)

1. **OI-0269** hotfix (PR #160 in review)
2. **OI-0276**
3. **OI-0270**
4. **OI-0271**
5. **OI-0274** + **OI-0275** with **OI-0278-S1** (Calendar + List)
6. **OI-0273**
7. **OI-0277** with **OI-0278-S2** (Home)
8. **OI-0278-S3** (Events / feed / animals / Locations)
9. **OI-0278-S4** (NPK / amendments / reports / inputs / assistant / lock-in test)

OI-0278-S1 adds the shared helper (below); later slices only consume it. Each step may ship as its own PR. Every PR runs the usual gates (`node scripts/run-vitest.mjs run`, `npx eslint src/`, baseline 0 errors / 54 warnings).

---

## OI-0277 — Home DMI card (Hd3)

**Tim (via Orchestrator):** card **t1352s5286**, 7:38 AM ET — **Hd3**: show both **Total DMI** and **Pasture DMI**, in lb (farm unit), with no double counting.

**Today (`src/features/dashboard/index.js`):** `computeDesktopMetrics` (`:396–431`) sums, per event group window, DMI-2 (`head × weight × dmiPct`) × `daysBetweenInclusive(dateJoined, dateLeft || dateOut || today)` (`:425`), converts with `convert(…,'toImperial')` (`:430`), compacts to “12.3k” (`:431`) and shows it as the first tile with label `'lbs DM'` (`:518–521`). Faults:
- **Move days double-count.** Days are inclusive at both ends, so a move day counts in the old and the new window: 262 moves, about 32,600 kg (~17%).
- **Same-group overlapping stints double-count** (about 10,000 kg).
- **Whole-life counting.** Events filtered as overlapping the period pill (24h/3d/7d/30d/All) count every day of their life, not just days inside the period.
- **Land scope.** Includes hay / confinement days and archived locations.
- **Mislabel.** The comment at `:408` says “Pasture DMI”, but the number is total herd demand (DMI-2).
- **Class DMI% never applies.** The lookup reads `gw.animalClassId` (`:414`), which event group windows do not carry, so `cls` is null and `dmiPct` falls back to 2.5%.
- **Unit.** Always lb, even on a metric farm (OI-0278 row 12).

The Pasture % helper `computePasturePercent` (`:342–393`) uses the same `daysBetweenInclusive` stint loop (`:367`) and has the same move-day / overlap / whole-life faults.

**Locked behavior (Hd3):**
- **Two tiles:** **Total DMI** and **Pasture DMI**, each in the farm unit via the OI-0278 helper (`formatMeasure(kg,'weight',{compact:true})` → “12.3k lb” on Home tiles per **Na**; “5,512 kg” style on a metric farm). Labels name the metric; the unit sits with the value (**Ua** short units).
- **Count each group-day once, only inside the selected period.** Use the same daily farm-need math Feed and DMI-8 use: `groupWindowsDailyDmiKg` / `groupWindowsDailyDemand` (`src/calcs/window-helpers.js:316/350`), which filter via `farmDemandWindowsOn` (`:252`): leave day excluded (`dateLeft <= dt` skipped), event must be open on the day, a group counts at most once per day (latest-joined window wins). Days outside the period pill’s range never count.
- **Total DMI** = Σ over period days of the farm need for every counted group-day.
- **Pasture DMI** = Σ over group-days of `max(0, need − hay eaten that group-day)` — the implied-pasture rule (OI-0225 / OI-0258 Al1 allocation), identical to the calendar’s per-row implied pasture DMI summed by `aggregatePeriodTotals` (`rotation-calendar/location-metrics.js:805`). Build reuses that path; no second formula.
- **Land scope (Design rule):** Pasture DMI uses the same land scope as the calendar Period totals strip (pasture land; confinement / hay-only days contribute 0 pasture). Total DMI is herd need and counts every group-day wherever the animals are. Any remaining scope difference (e.g. archived locations if the calendar hides them) is stated in the tile’s `title` tooltip.
- **Pasture %** (`computePasturePercent`) moves to the same per-group-day counting so it agrees with the two tiles (Pasture DMI ÷ Total DMI over the period).
- The `:408` comment is corrected. **D0**.
- **Class DMI% (noted, not changed here):** the shared helper has the same fallback (`groupWindowsDailyDemand` reads `gw.animalClassId` at `window-helpers.js:322–323`, so `dmiPct` is 2.5% unless set). Hd3 deliberately uses the shared math so Home matches Feed, DMI-8 and the calendar. Making class DMI% apply is a farm-wide demand change for every surface at once and needs its own OI + Tim decision; Design raises it to Orchestrator separately.

**Acceptance:**
- On the same period, Home **Pasture DMI** reconciles with the calendar **Period totals** Pasture DMI for the same date range and land scope; where scope differs, the doc/tooltip states the difference explicitly.
- Home **Total DMI** equals Σ daily farm need (`groupWindowsDailyDmiKg`) over the period.
- Imperial farm shows lb; metric farm shows kg (OI-0278).

**Tests:** fixture with a move (leave day = next join day) and a same-group overlapping stint → Total DMI counts each group-day once (no move-day or overlap double count); period clipping (event longer than the period counts only in-period days); Pasture DMI = Σ max(0, need − hay) and equals `aggregatePeriodTotals` for the same fixture; Total DMI equals Σ `groupWindowsDailyDmiKg` over the period; both unit systems render.

**Size:** M. Rides with OI-0278-S2.

---

## OI-0278 — Units everywhere (Ua+Na+Pa+Fa+Da)

**Tim (via Orchestrator):** t1354u / t1355u 7:42 AM ET, verbatim: “all metrics must follow the choice of the user” / “everywhere”. Card **t1357s5308** 8:15 AM ET locked **Ua+Na+Pa+Fa+Da**. This supersedes the narrower **Un1** (“lb with unit in headers”, t1352s5286), which is now a subset.

**Rule:** every unit-bearing metric on every user screen (Home, rotation calendar, List, Events, feed, NPK, DMI, weights, areas, reports, amendments, inputs, the assistant’s answers) displays in the farm’s `operations.unit_system` (`getUnitSystem()`, `src/utils/preferences.js:13`) through the shared helper in `src/utils/units.js`, with its unit shown in the value or in its column / strip header. Stored data stays canonical metric and is never converted. Sorting stays on canonical metric values (conversion is monotonic). **D0.**

**Locked decisions:**
- **Ua** short labels everywhere: `lb`, `ac`, `kg`, `ha`, `lb/ac`, `kg/ha`, `in`, `cm` (replaces `lbs` / `acres` from `display()`).
- **Na** big numbers in full with thousands separators (“12,340 lb”). Compact “12.3k lb” only on Home tiles and phone.
- **Pa** purchase units (bale, ton, kg, lb, bag, gallon) stay as entered — they are not measurements. `ton` = short ton on an imperial farm and tonne on a metric farm (labeled “ton” vs “t”).
- **Fa** forage-type NPK removal shown as **lb/ton DM** on imperial farms (kg/t × 2.0, short ton), kg/t DM on metric.
- **Da** the developer audit page (`dev-mode/audit-units.js`) is exempt; it keeps its own Metric/Standard/Hybrid toggle.

**Not unit-bound (left alone):** AUDs, AU, %, days, $ totals, head counts, pH. Backup JSON (`data/backup-export.js`) stays canonical metric (machine format). There are no user CSV/PDF exports today; any future export uses the helper and puts units in column headers.

### Shared helper (in `src/utils/units.js` only; S1 adds it)

Existing: `convert` (`units.js:33`), `display` (`:57`, 2 dp, long labels, no separators, caller passes unitSystem), `unitLabel` (`:80`). Unit math outside `units.js` today: `location-metrics.js:43` `HA_TO_ACRES`, `feed/delivery.js` / `feed/check.js` `KG_TO_LBS`, `dashboard/index.js:494–497, 859–861` `* 2.20462`, `calcs/capacity.js:52` `shortfallLbsHay`.

Additions:
- `formatMeasure(valueMetric, family, { unitSystem = getUnitSystem(), decimals, compact, unitInHeader })` → “1,234 lb”; `null` / non-finite → “—”.
- `formatPerArea(valueMetricPerHa, family, opts)` → “x lb/ac” or “x kg/ha”. Per-area values are computed **per ha** upstream (never kg/ac).
- `unitSuffix(family, unitSystem)` → header text such as “(lb)”.
- New families: `pricePerWeight` ($/kg ↔ $/lb), `nutrientPerDm` (kg/t ↔ lb/ton, **Fa**).
- Default precision per family (in the helper): weight 0 dp with separators (1 dp under 10); area 1 dp (2 dp under 1); per-area 1 dp; NPK 1 dp; length 1 dp; $ 2 dp. Compact only when asked (Home tiles / phone, **Na**).
- One label style (**Ua**). Existing good call sites (`events/detail.js:301`, `animals/index.js:245–247`, `feed/run-rate-panel.js:59`, `reports/index.js:177/233`, `paddock-column.js:50`, `ui/dmi-chart.js:45–46`) move to the helper as they are touched.

### Slices

1. **S1 — Calendar + List** (with OI-0274 / OI-0275). Add the helper. Rows 1–9: METRIC_COLS headers/tooltips with unit (“DMI (lb)”, “N (lb)”), `renderMetricCol` values via `formatMeasure` (List shares `renderMetricsCell`), per-ha in `location-metrics.js` + sort keys (so OI-0274 “DMI/ac” is lb/ac or kg/ha, never kg/ac), Period totals strip with units, past-block DMI, “no acres” → “no area”, future-block / capacity lbs-hay → kg + helper, delete dead `sidebar.js`.
2. **S2 — Home** (with OI-0277). Rows 12–28: tiles, group cards, location cards, sub-paddocks, DMI chart label; drop direct `toImperial` and `* 2.20462`; fix double units (“2.00 acres ac”) and the `in"` forage height.
3. **S3 — Events / feed / animals / Locations.** Rows 30–31, 33–34, 37–40, 50–52, 54: “Est. available … lbs DM”, “Acres” sort label, “lbs lbs/day”, **Event detail NPK wrong value on metric farms** (`events/detail.js:980–986`: the metric path calls `toMetric` on kg → value ÷2.2 labeled kg), mass-based feed pools fixed “kg”, feed delivery/check fixed lb (`KG_TO_LBS`), animals/weight double labels, map import “ac from file”.
4. **S4 — NPK / amendments / reports / inputs / assistant / lock-in test.** Rows 43–49 (reports NPK “kg”, amendment preview “kg”, manure N/P/K + volumes, `$/kg` price history, forage NPK **Fa**); the 6 metric-only inputs (Appendix B) via `settings/unit-descriptor.js` (render in farm unit, save canonical metric); assistant read tools (`assistant/farm-reads.js`) return `unitSystem` plus pre-formatted display strings and the server prompt gets one line (“speak in the farm’s unit system”); the grep-contract lock-in test. Remove the unused `feed.weightPerUnit` “Weight/unit (kg)” key (`en.json:1006`).

Row 34 is the only wrong **number** (others are wrong unit/label). Tim’s farm is imperial, so it does not affect him today; it may ride S1 if Build prefers.

### Acceptance
1. All 42 violations in Appendix A render correctly under **both** imperial and metric (per-surface unit tests: same fixture, both systems).
2. Calendar/List headers and the Period totals strip show the unit (“Total DMI (lb)”); per-area shows lb/ac or kg/ha, never kg/ac.
3. Home matches OI-0277 Hd3 in the farm unit.
4. No double units (rows 20, 26, 33, 50–52) and the row 34 metric NPK value is correct.
5. The 6 inputs in Appendix B accept and show the farm unit and save canonical metric (round-trip tests); purchase units unchanged (**Pa**).
6. **Lock-in test** (grep contract, modeled on dev-mode audit-units) over `src/features/**` and `src/ui/**`, excluding `dev-mode/` (**Da**): no `'toImperial'` / `convert(…,'toImperial')`, no `2.20462` / `2.47105` / `KG_TO_LBS` / `HA_TO_ACRES`, and no literal `' lbs'`, `' lb'`, `' kg'`, `'/ac'`, `' ac'`, `'acres'`, `'kg/t'` in render code outside `units.js`.
7. The assistant read payload carries `unitSystem` plus formatted values.
8. Backup JSON, prod data and schema unchanged (**D0**).

**Size:** L overall (S1 M, S2 M with 0277, S3 M, S4 M).

---

## Appendix A — 42 display violations (units audit at `3373711`)

Class key: HM = hard-metric · HI = hard-imperial · UL = unlabeled · ML = mislabeled. Row numbers are the audit’s (13 OK rows omitted, so numbering has gaps). Line refs spot-checked on main `3373711`: rows 1, 3, 4, 12, 26, 30, 33, 34, 38, 43, 44, 48, 50, 52, and capacity.js:52.

| # | Screen | file:line (at `3373711`) | Metric | Current unit/label | Class | Fix | Slice |
|---|---|---|---|---|---|---|---|
| 1 | Calendar + List metrics | rotation-calendar/calendar-grid.js:72–77 | METRIC_COLS titles (DMI, N, P, K) | tooltip "(kg)", header "DMI"/"N" no unit | HM | Header/tooltip unit from helper: "DMI (lb)", "N (lb)" | S1 |
| 2 | Calendar + List metrics | calendar-grid.js:117–118, 150–156 (`renderMetricCol`) | dmiKg, nKg, pKg, kKg values | raw kg, no unit | HM | `formatMeasure(v,'weight')` (shared by List via `renderMetricsCell`) | S1 |
| 3 | Calendar + List metrics | calendar-grid.js:131–134 | per-acre parenthetical "(x.x/ac)" | **kg ÷ acres**, labeled "/ac" | ML | Per-area via helper: lb/ac or kg/ha | S1 |
| 4 | (source of #3) | location-metrics.js:43,116,782–786 | dmiPerAcre, audsPerAcre, n/p/kPerAcre | kg/ac computed from `HA_TO_ACRES` | ML | Compute per-ha (metric); convert at display; sort keys follow | S1 |
| 5 | Calendar Period totals strip | calendar-grid.js:877–915 (`renderPeriodTotalsStrip`) | Pasture/Stored/Total DMI, Total N/P/K | raw kg, no unit; tooltips "(kg)" | HM | Helper + unit in label ("Total DMI (lb)") | S1 |
| 6 | Calendar/List row area | calendar-grid.js:1072–1074, 1108 | missing-area text | "no acres" | HI | "no area" or helper label | S1 |
| 7 | Calendar past block | rotation-calendar/past-block.js:61–69, 121 | window DMI | "123 DMI" (kg, rounded at calendar-grid.js:1226) | HM | `formatMeasure` → "272 lb DMI" | S1 |
| 8 | Calendar future block | future-block.js:90–92, 185; calcs/capacity.js:52 | hay estimate/shortfall | "lbs hay" (CAP-1 stub; capacity emits lbs) | HI | Calc returns kg; display via helper | S1 |
| 9 | Calendar sidebar (dead; not imported) | rotation-calendar/sidebar.js:48 | N/P/K | "12/3/9" kg, no unit | UL | Delete file or fix if revived | S1 |
| 12 | Home desktop tile | dashboard/index.js:396–431, 518–521 | DMI tile | always lb, label "lbs DM"; value is DMI-2 **herd demand** but comment says Pasture DMI | ML | OI-0277 **Hd3**: Total DMI + Pasture DMI tiles via helper | S2 |
| 13 | Home desktop tile | dashboard/index.js:494–497, 533–536 | NPK/ac + N/P/K sub + acres | `*2.20462`, "/ac", "lbs", "ac" | HI | Per-area helper | S2 |
| 14 | Home desktop tile | dashboard/index.js:515, 539–540 | NPK $/ac + acres | "$/ac", "ac" | HI | "$/ac" or "$/ha" via helper | S2 |
| 15 | Home mobile tile | dashboard/index.js:546–599, 633–635 | NPK/acre | lb/ac, value "x /ac" with no weight unit | HI | Per-area helper with weight unit | S2 |
| 16 | Home group card | dashboard/index.js:821–826 | DMI consumed/target | always lb | HI | Helper | S2 |
| 17 | Home group card | dashboard/index.js:859–863 | NPK deposited | `*2.20462` "lbs" | HI | Helper | S2 |
| 18 | Home group card | dashboard/index.js:907, 977 | DMI target/day | always lb "lbs/day" | HI | Helper + "/day" | S2 |
| 19 | Home group card | dashboard/index.js:993–997 | NPK deposited | always lb | HI | Helper | S2 |
| 20 | Home location card | dashboard/index.js:1241, 1457, 1469, 1484 | forage height | `display()` + `"` → "4.0 in"" / metric "10.2 cm"" | ML | Drop the `"` | S2 |
| 21 | Home location card | dashboard/index.js:1327–1329, 1471, 1485 | ADA est | "/ac" always | HI | Per-area helper | S2 |
| 22 | Home location card | dashboard/index.js:1352–1355 | NPK | always lb | HI | Helper | S2 |
| 23 | Home location card | dashboard/index.js:1367, 1497–1499, 1623 | Pasture / Stored feed / DMI target | always "lbs DM", "lbs/day" | HI | Helper | S2 |
| 24 | Home location card | dashboard/index.js:1404 | area | always acres, label `areaUnit` (ha on metric) | ML | `formatMeasure(ha,'area')` | S2 |
| 25 | Home location card | dashboard/index.js:1448 | herd weight | always lb, label `wUnit` (kg on metric) | ML | Helper | S2 |
| 26 | Home sub-paddocks | dashboard/index.js:1514 | sub area | `display()` + `areaUnit` → "2.00 acres ac" | ML | Use one or the other | S2 |
| 30 | Locations card | locations/index.js:375–377 | Est. available DM | always "lbs DM" | HI | Helper | S3 |
| 31 | Locations legacy list sort | locations/index.js:234 | sort label | "Acres" | HI | "Area" | S3 |
| 33 | Event detail | events/detail.js:946–951 | DMI target/day | `display()` + `unit` → "12.3 lbs lbs/day" | ML | Drop the extra unit | S3 |
| 34 | Event detail | events/detail.js:980–986 | NPK | **metric path calls `toMetric` on kg → value ÷2.2 labeled kg** | ML | `formatMeasure` (wrong-value bug) | S3 |
| 37 | Feed pools (mass-based) | feed/pool-forms.js:19; events/edit-feed-check.js:462; events/detail.js:868 | pool remaining when massBased (unit falls back to 'kg', calcs/feed-pools.js:42,47,97) | "kg" always | HM | Mass pools display via helper | S3 |
| 38 | Feed delivery | feed/delivery.js:197–200 | as-fed / DM per line | `KG_TO_LBS`, "lbs" | HI | Helper | S3 |
| 39 | Feed delivery | feed/delivery.js:241–245 | total feed DMI | "lbs" | HI | Helper | S3 |
| 40 | Feed check | feed/check.js:163–165 | consumed DMI | "lbs DMI" | HI | Helper | S3 |
| 43 | Reports NPK | reports/index.js:337 | N/P/K per paddock | "kg" literal | HM | Helper | S4 |
| 44 | Amendment entry | amendments/entry.js:297 | NPK preview | "kg" literal | HM | Helper | S4 |
| 46 | Manure batches | amendments/manure.js:77–79 | batch N/P/K | number, no unit (kg) | UL | Helper | S4 |
| 47 | Manure batches | amendments/manure.js:98, 288 | remaining/volume, tx volume | "kg" | HM | Helper | S4 |
| 48 | NPK prices | amendments/npk-prices.js:87 | price history | "$/kg" | HM | $/lb on imperial, $/kg on metric (new `pricePerWeight` family) | S4 |
| 49 | Forage types | en.json:1590 `forageType.metaLine`; forage-type-sheet.js:43–53 | NPK removal | "kg/t DM" | HM | **Fa**: lb/ton DM on imperial (kg/t × 2.0; new `nutrientPerDm` family), kg/t DM on metric | S4 |
| 50 | Animals class list | animals/index.js:1567, 1575 | default weight | `display()` + `unitLabel` → "1100 lbs lbs" | ML | Drop the extra label | S3 |
| 51 | Animals bulk row | animals/index.js:1955, 1965 | current weight | `display()` + `unitLabel` (double) | ML | Drop the extra label | S3 |
| 52 | Weight sheet | health/weight.js:51 | current weight | `display()` + `wUnit` (double) | ML | Drop `wUnit` | S3 |
| 54 | Map import | map/import-sheet.js:69 | file area | "ac from file" | HI | Helper | S3 |

## Appendix B — 6 metric-only inputs (S4)

| Input | Where | Label today | Fix |
|---|---|---|---|
| Manure batch volume | amendments/manure.js:167, en.json:1094 | “Estimated Volume (kg)” | weight family via `unit-descriptor` |
| Manure composition | manure.js:185, en.json:1096 | “Composition (kg per batch)” | same |
| Manure transaction volume | manure.js:330, en.json:1108 | “Volume (kg)” | same |
| NPK prices | amendments/npk-prices.js:127–143, en.json:1113–1115 | “$/kg” | new `pricePerWeight` family ($/lb ↔ $/kg) |
| Forage-type NPK removal | forage-type-sheet.js:43–53, en.json:565/1576 | “kg/t DM” | new `nutrientPerDm` family (**Fa**: lb/ton DM on imperial) |
| Class excretion rates | animals/index.js:1647–1651 | “kg / 1000 kg BW / day” | ratio is unit-free: relabel only (“lb / 1000 lb BW / day”), no conversion |

Inputs that already convert correctly (unchanged): location area, strip area, event avg weight, group-window weight, animal weights, feed default and batch weight/unit, harvest weight/unit, spreader capacity, forage height, forage DM yield (`unit-descriptor`). User-chosen purchase units stay as entered (**Pa**); soil-test unit stays free text.

---

## OPEN_ITEMS changes

- Add rows + sections OI-0277 (**Hd3**) and OI-0278 (**Ua+Na+Pa+Fa+Da**), both **SPEC LOCKED / READY FOR BUILD**.
- OI-0278 supersedes **Un1** (t1352s5286) as a subset.
- Change-log row; DOCS_MAP refs (dashboard, events, feed, animals, amendments, reports, assistant, utils).
