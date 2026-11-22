# Past-block unknown DMI paint + column F1 sticky (OI-0253)

**Status:** **LOCKED** 2026-11-22 ~9:52 AM ET (Tim, via Orchestrator, card **t1060s4208**) — **B1+C0** (**D0** already closed = F1 window-scoped / not the t1044u column bug). Opened ~9:40 AM ET from Tim regression **t1028u** + Build triage; Season clarify **t1044u**; **D CLOSED** Build ~9:41 AM ET. Docs landed on main `129b2dd` (restacked onto `2fe1e88`, OI-0252 #131 live; restack ~10:03 AM ET). No SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (after docs live on main).  
**Parent:** Forgejo `origin/main` `2fe1e8897dc4e2dcab413b157292d619ecee0c7d` (OI-0252 live via PR #131; stamp `b2026-11-22.1502-2fe1e88`; compiled `RELEASED_SCHEMA_VERSION` **48**). Prior parent `36bc946` (OI-0250 PR #129; stamp `b2026-11-22.1431-36bc946`).  
**Also related:** OI-0246 season formula **S1+F1(DMI)+…+Z1** ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md)); OI-0249 partial unknown (PR #126) — **does not** zero pasture DMI math; OI-0250 strip **Sz** (missing-DM feed → 0 stored; strip pasture ignores F1 sticky); OI-0252 metrics layout (PR #131 live — layout only).  
**Schema / migration:** **D0 — none.** Paint + optional column-policy code only. No new column, no migration, no data write.

## 1. Problem

Tim (**t1028u**, 2026-11-22 ~9:30 AM ET, via Orchestrator), on live tip that included OI-0249 A+C:

> “I am seeing zero pasture DMI in 5dfadff. STrange as it was already working and now it is not?”

Later Tim clarified (**t1044u**) the zeros were seen **after** he set Season metrics to **04/02/2026–10/07/2026** (not the budget-year default). Live `36bc946` screenshot reported to Design: strip Pasture DMI **98266**, but **E-1…E-5** DMI column **—** and NOW blocks **“Pasture 0%”**.

### What this is / is not

| Claim | Verdict |
|---|---|
| OI-0249 math intentionally zeros pasture DMI | **No.** Lock **Zp+Gg**: sum known slices; skip only missing-weight group; mark partial. Design earlier verdict: not lock-intended zero. |
| OI-0250 strip / Sz zeros pasture | **No.** Strip still shows pasture when F1 sticky nulls the **column**; Sz ignores F1 sticky for strip pasture. |
| Calendar **past blocks** paint unknown as `dmi 0` / `Pasture 0%` | **Yes (code cite).** When `dmiKnown` is false, past-block wiring forces numeric zeros into the label. |
| Season column **F1 sticky** blanks DMI for the whole window if any day has unmeasured hay | **Yes (locked OI-0246 F1 + list-parity).** Column only; strip path diverges under Sz. |
| Tim was on budget-year default → many known-0 paddocks | **D CLOSED — not the t1044u column bug.** Early triage said zeros matched the budget-year default (2026-10-01→2027-09-30). **Withdrawn** after **t1044u** (Season was **04/02/2026–10/07/2026**). Build ~9:41 AM ET: F1 sticky is **inside the metric window only**; unmeasured hay outside that window does **not** null the Apr–Oct column. Recompute on `36bc946` + prod dump: E-1…E-5 column DMI **known** (`hayUnkIn=0`); strip totals match Tim (Total 100130, N 546). Build **cannot reproduce** Tim’s E-column em-dash on that window. Nov 17–22 hay only nulls E when the window includes those days (e.g. default Oct 1–Sep 30). |
| Pasture 0% NOW is a separate NOW DMI path | **No.** Build: Pasture 0% NOW = calendar-grid season `m.dmiKnown` paint → axis **B**, not a separate NOW DMI path. |

### Out of this OI (ops / other tips)

- **A — Measure DM** on recent hay rows (e.g. Nov 17–22): Tim ops, not Design lock.
- **Window UI choice:** Tim can pick Season / custom ranges in the bar (OI-0246 **Pb**). Not a Design lock axis on this tip.
- **Past-event click → starting/closing values** and Rotation scroll-left/right ready-by recovery: held in Orchestrator’s **feedback pile** — **do not fold into OI-0253**.
- **100% Stored Feed / `no_pasture` restore** (Tim **t1052u**; lock card **t1060s4208**): pile for after the feedback batch. **Not** this OI. No OI yet.
- **#129 strip aggregate edge** (`aggregatePeriodTotals` treating never-present `stripPastureDmiKg:0` as known → farm Pasture DMI “0” instead of — when every grazed loc is F1-null): Design nodded **yes** as a tiny Build follow-up (matches **Z1** “—” for missing). **Not** a Tim B/C lock; ship separately if Build prefers.

## 2. Current state (citations — do not invent)

Read on `origin/main` `36bc946`.

| Piece | Where | What it does today |
|---|---|---|
| Past-block paint | `calendar-grid.js` (~783–794) → `past-block.js` | `dmiLabel = m.dmiKnown && m.dmiKg != null ? round(m.dmiKg) : null`, then `dmi: dmiLabel != null ? dmiLabel : **0**`, `pasturePct: … ? 100 : **0**`. Unknown → label **“Pasture 0% · … · 0 DMI”**. |
| F1 measured hay | `location-metrics.js` `measuredHayOnEventDay` | `none` / `measured` / `unknown` (missing close DM / holds without DM). |
| F1 season-sticky (column) | `location-metrics.js` (~415, 559–582, 640–646) | Any unmeasured-hay day sets `dmiHayUnknown` and season-sticky-nulls the **column** DMI (`dmiKnown` false). Comment: list-parity locks not reopened; **strip ignores F1 sticky** (Sz). |
| Z1 never-present | OI-0246 lock | Never present in window → known **0**; missing inputs → **“—”**, never silent 0. Past-block paint currently violates the spirit of Z1 for **unknown** by forcing 0 into the string. |
| OI-0250 Sz strip | same metrics module + `calendar-grid.js` totals strip | Missing-DM feed → 0 stored (not partial); strip pasture still attributable when column is F1-null. |

## 3. Goals / non-goals

**Goals**

- Stop calendar **past blocks** from painting **unknown** pasture DMI as **0 / 0%** (show **—** or omit the Pasture/DMI digits).
- Decide whether the **season metrics column** keeps **F1 season-sticky** null (**C0**) or aligns with strip **Sz** (sum known days; missing-DM hay = 0 stored, no season-blank) (**C1**).
- Keep **D0** — paint / policy code only; no SQL.

**Non-goals**

- Reopening OI-0249 weight/partial math.
- Redesigning OI-0250 strip layout or OI-0252 stack/width.
- Past-event detail UI (feedback pile).
- **100% Stored Feed / `no_pasture` restore** (feedback pile after the batch; not this OI).
- Forcing Tim to change Season window (ops/UI).
- Reopening axis **D** (F1 window-scope + no SQL) — **CLOSED** ~9:41 AM ET.

## 4. Design axes (Tim lock)

### B — Past-block UX when DMI unknown

| Token | Meaning |
|---|---|
| **B1** (LOCKED) | Never paint unknown as **0 / 0%**. When `dmiKnown === false` (or equivalent), show **—** for Pasture% / DMI (or omit those segments). Do **not** pass `dmi: 0` / `pasturePct: 0` as a stand-in for unknown. Known zero (never grazed / Z1 never-present) may still show **0**. |
| **B0** (not chosen) | Keep today’s paint (unknown → Pasture 0% · 0 DMI). |

### C — Column F1 season-sticky vs Sz

| Token | Meaning |
|---|---|
| **C0** (LOCKED) | **Keep** F1 season-sticky for the **column**: any unmeasured-hay day in the metric window → column DMI **—** for the season (current OI-0246 / list-parity). Strip stays Sz. Smallest change with **B1**. |
| **C1** (not chosen) | **Stop** F1 season-sticky on the column; align column with OI-0250 **Sz** — missing-DM hay counts as **0** stored for that day, sum known days, do **not** blank the whole season for one bad hay day. Larger policy change; may need careful partial/Z1 wording. |

### D — F1 window scope + no SQL (**CLOSED**)

| Token | Meaning |
|---|---|
| **D0 CLOSED** (Build ~9:41 AM ET) | F1 sticky is **inside the metric window only**. Unmeasured hay outside **04/02/2026–10/07/2026** does **not** null the Apr–Oct column. Recompute on `36bc946` + prod dump with Season 04/02–10/07: E-1…E-5 column DMI **known** (`hayUnkIn=0`); strip totals match Tim (Total 100130, N 546). Build **cannot reproduce** Tim’s E-column em-dash on that window. Nov 17–22 hay only nulls E when the window includes those days (e.g. default Oct 1–Sep 30). Pasture 0% NOW = calendar-grid season `m.dmiKnown` paint → axis **B**, not a separate NOW DMI path. No migration / no SQL / no data rewrite. |

## 5. Design lock

**LOCKED: B1+C0** (**D0** already closed) — Tim, ~9:52 AM ET, card **t1060s4208**.

- **B1:** Past blocks must not lie with “Pasture 0%” when DMI is unknown — matches Z1 “—” for missing, and Tim’s screenshot (column already — while blocks say 0%).
- **C0:** Keep column sticky when in-window hay days lack DM; strip already shows pasture under Sz. **C1** was the alt; not chosen.
- **D0 CLOSED:** F1 is window-scoped; not the t1044u E-column bug. No SQL. Pasture 0% NOW is axis **B** paint.

**Next:** Docs only on this tip until Tim yeses the land card. GTHO Build implements after docs are on main. Stored-feed / `no_pasture` restore stays in the feedback pile (after the batch; not this OI).

## 6. Acceptance (when built)

1. With Season metrics **04/02/2026–10/07/2026** (or any window), a past block whose location metrics have `dmiKnown === false` must **not** render **“Pasture 0%”** or **“0 DMI”** as the unknown stand-in (**B1**).
2. Known-zero / never-present (Z1) still may show **0** where the value is truly known zero.
3. Under **C0** (locked): column DMI remains season-sticky on unmeasured hay in the metric window (—); strip behavior unchanged (Sz).
4. No SQL / no migration / no `supabase/` edits (**D0**).
5. Does not change past-event click detail or implement **100% Stored Feed / `no_pasture` restore** (separate feedback pile).

## 7. Tip instruction

**LOCKED** — **B1+C0** (**D0** already closed). Docs only on this tip. **Do not land on main** until Tim yeses the land card. **Do not** start Build from this tip until docs are on main. Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Do not fold 100% Stored Feed / `no_pasture` restore into this OI.

