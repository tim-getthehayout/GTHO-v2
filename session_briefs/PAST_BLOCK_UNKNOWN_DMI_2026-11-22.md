# Past-block unknown DMI paint + column F1 sticky (OI-0253)

**Status:** **PROPOSED** (opened 2026-11-22 ~9:40 AM ET, GTHO Design, via Orchestrator from Tim regression **t1028u** + Build triage; Tim Season window clarify **t1044u**) — Design lean **B1+C0+D0**. Awaiting Tim lock. **B/C lock framing may be re-carded** after Build re-triages whether F1 sticky reaches outside Tim’s Season window. Docs tip only. **D0** = no SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (after Tim lock + docs live on main).  
**Parent:** Forgejo `origin/main` `36bc946d4fd6cef21d02bafed7790b7d644a1502` (OI-0250 code live via PR #129; stamp `b2026-11-22.1431-36bc946`; compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0246 season formula **S1+F1(DMI)+…+Z1** ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md)); OI-0249 partial unknown (PR #126) — **does not** zero pasture DMI math; OI-0250 strip **Sz** (missing-DM feed → 0 stored; strip pasture ignores F1 sticky); OI-0252 metrics layout (PR #131 in flight — layout only).  
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
| Tim was on budget-year default → many known-0 paddocks | **Withdrawn as the explanation for this report.** Tim’s window was **04/02/2026–10/07/2026** (**t1044u**). Build is **re-triaging** whether F1 sticky / unknown hay reaches **outside** that window. **Do not treat the window explanation as closed.** |

### Out of this OI (ops / other tips)

- **A — Measure DM** on recent hay rows (e.g. Nov 17–22): Tim ops, not Design lock.
- **Window UI choice:** Tim can pick Season / custom ranges in the bar (OI-0246 **Pb**). Not a Design lock axis on this tip.
- **Past-event click → starting/closing values** and Rotation scroll-left/right ready-by recovery: held in Orchestrator’s **feedback pile** — **do not fold into OI-0253**.
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
- Forcing Tim to change Season window (ops/UI).
- Declaring the window explanation closed before Build re-triage returns.

## 4. Design axes (Tim lock)

### B — Past-block UX when DMI unknown

| Token | Meaning |
|---|---|
| **B1** (Design lean) | Never paint unknown as **0 / 0%**. When `dmiKnown === false` (or equivalent), show **—** for Pasture% / DMI (or omit those segments). Do **not** pass `dmi: 0` / `pasturePct: 0` as a stand-in for unknown. Known zero (never grazed / Z1 never-present) may still show **0**. |
| **B0** | Keep today’s paint (unknown → Pasture 0% · 0 DMI). |

### C — Column F1 season-sticky vs Sz

| Token | Meaning |
|---|---|
| **C0** (Design lean) | **Keep** F1 season-sticky for the **column**: any unmeasured-hay day in the metric window → column DMI **—** for the season (current OI-0246 / list-parity). Strip stays Sz. Smallest change with **B1**. |
| **C1** | **Stop** F1 season-sticky on the column; align column with OI-0250 **Sz** — missing-DM hay counts as **0** stored for that day, sum known days, do **not** blank the whole season for one bad hay day. Larger policy change; may need careful partial/Z1 wording. |

### D0 — No SQL

| Token | Meaning |
|---|---|
| **D0** | No migration / no SQL / no data rewrite. Code: past-block paint (+ optional column sticky policy under **C1**). |

### Withdrawn / open triage note (not a lock token)

**Window explanation:** Early triage said Tim’s zeros matched the **new budget-year default** (2026-10-01→2027-09-30) with many known-0 paddocks. **Withdrawn** after **t1044u** — Tim’s Season metrics were **04/02/2026–10/07/2026**. Orchestrator is holding firm B/C card framing until Build reports whether **F1 sticky / unknown hay** is incorrectly reaching **outside** that window. If re-triage changes the options, Design will amend this tip / re-card; **do not treat the window explanation as closed.**

## 5. Design recommendation

**B1+C0+D0**

- **B1:** Past blocks must not lie with “Pasture 0%” when DMI is unknown — matches Z1 “—” for missing, and Tim’s screenshot (column already — while blocks say 0%).
- **C0:** Keep column sticky for a small fix; strip already shows pasture under Sz. **C1** stays the alt if Tim wants column = strip.
- **D0:** No SQL expected.

**Hold:** Do not brief Build to implement until Tim locks **and** Build’s F1-vs-window re-triage has either confirmed the B/C framing or Design has amended tokens.

## 6. Acceptance (when locked + built)

1. With Season metrics **04/02/2026–10/07/2026** (or any window), a past block whose location metrics have `dmiKnown === false` must **not** render **“Pasture 0%”** or **“0 DMI”** as the unknown stand-in (**B1**).
2. Known-zero / never-present (Z1) still may show **0** where the value is truly known zero.
3. Under **C0**: column DMI remains season-sticky on unmeasured hay (—); strip behavior unchanged (Sz). Under **C1**: column no longer season-blanks on one missing-DM hay day; aligns with Sz day rules — covered by unit tests Build adds.
4. No SQL / no migration / no `supabase/` edits (**D0**).
5. Does not change past-event click detail (separate feedback pile).

## 7. Tip instruction

**PROPOSED** — Design lean **B1+C0+D0**. Docs only on this tip. **Do not land on main** until Tim yeses the land card after lock. **Do not** start Build from this tip until Tim locks and window/F1 re-triage is settled enough that B/C tokens still apply. Never edit `src/`, `tests/`, or `supabase/` on this docs tip.

