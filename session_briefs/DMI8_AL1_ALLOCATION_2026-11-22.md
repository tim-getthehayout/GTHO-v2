# DMI-8 / feed-forage use Al1 allocation (OI-0260)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 ~1:00 PM ET (America/New_York), Tim card **t1244s4822**, via Orchestrator, verbatim: “Lock OI-0260 Ch1+Fw0+Cp0+D0: both charts + days-remaining; keep current forward forecast; CAP-1 out”. Docs tip only — do not land until Tim land yes; do not open a PR from this tip.
**Authority:** Tim card **t1244s4822** at ~1:00 PM ET (America/New_York), via Orchestrator. Opened by GTHO Design from OI-0258 PR **#143** Build soft notes / caveat #5 + Tim ask via Orchestrator (~12:45 PM ET America/New_York): when will the “DMI-8 Al1 follow-up” be done?
**Package (LOCKED):** **Ch1+Fw0+Cp0+D0**.
**Branch tip:** `docs/oi-0260-dmi8-al1` (parent `origin/main` `edc0b94ea7d61de4d2a46174e381520d305c1346` — OI-0258 PR #143 tip, which includes OI-0259 #142 `e3f8c48`).
**Related:** OI-0258 lock **Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0**. Event DMI-8 / `poolDailyObservation` unchanged in the OI-0258 ship.

---

## 1. Problem

OI-0258 gave Locations **F1** a “known hay” rule: at close (or completed hay spans), hay fed = opening carryover captured at open (**zero if none**) + net new physical deliveries − close remaining (**Cv1**: count carryover once; do not also sum synthetic Move-wizard / `source_event_id` deliveries). Those days are known for F1 with no mid-check required (**Al1**). Pasture DMI = estimated demand − hay actually fed (locked **L1** floor at 0 stays), **per span**, with **Sp-f(demand)** proration of each check-span’s hay across overlapping grazing windows (**Mx-a**).

Build’s PR #143 soft notes / caveat #5 parked a split: **Al1 for event DMI-8 / feed-forage charts = follow-up, not done.** Event DMI-8 / `poolDailyObservation` were **unchanged** in the OI-0258 ship. After 0258 lands, Locations F1 can show known hay from that allocation while event DMI-8 chart bars and feed-forage / days-remaining / estimated demand still follow the pre-0258 path. That is the hole this OI proposes to close.

---

## 2. Locked package

One story: event **DMI-8** chart bars and **feed-forage / days-remaining / estimated demand** consume the **same Al1+Cv1+Sp-f(demand)** hay allocation OI-0258 already gave Locations F1. Closed (or completed) hay spans with opening carryover (zero if none) + net new physical deliveries − close remaining are **known** hay for those surfaces too; pasture = demand − hay share (**L1** floor 0), per span / Sp-f window rules already locked in OI-0258. **D0** no SQL / no migration.

Axis ids (Tim locked **Ch1+Fw0+Cp0+D0** on card **t1244s4822**):

| Axis | Options | Locked |
|---|---|---|
| **Ch** (which surfaces) | **Ch1** — wire **both** DMI-8 charts **and** days-remaining / estimated-demand (feed-forage) to Al1 (one story). **Ch-c** — chart-only; leave days-remaining / estimated demand on the pre-0258 path. | **Ch1** |
| **Fw** (forward estimates after the last known span) | **Fw0** — keep existing forecast behavior. **Fw1** — derive run-rate from the Al1 known span. | **Fw0** (keep existing forward forecast) |
| **Cp** (CAP-1 / DM forecaster) | **Cp0** — **out** of this OI (separate if needed). **Cp1** — in. | **Cp0** (out) |
| **D0** | No SQL / no migration. | **D0** (standing) |

**Locked:** **Ch1+Fw0+Cp0+D0**.

---

## 3. Acceptance (locked)

1. On a closed (or completed) hay span, event **DMI-8** chart bars use the same Al1 known-hay pool as Locations F1: opening carryover (zero if none) + net new physical deliveries − close remaining (**Cv1**), allocated with **Sp-f(demand)** / **Mx-a** already locked in OI-0258.
2. **Days-remaining / estimated demand** (feed-forage) use that same allocation — not a second hay story (**Ch1**).
3. Pasture on those surfaces = demand − hay share, floored at locked **L1** (0), per span / Sp-f window rules already locked in OI-0258.
4. Forward estimates after the last known span follow **Fw0**: existing forecast behavior (not an Al1-span run-rate).
5. CAP-1 / tan future-block forecast stub is **out** (**Cp0**).
6. No new migration / column (**D0**). If Build finds a real schema gap, stop and ask.
7. OI-0258 lock axes are not reopened. OI-0256 **Mx1**, synthetic alfalfa cleanup, and Move Step 3 (OI-0259) are unchanged.

---

## 4. D0

**D0** — no SQL / no migration / no new column. Calc wiring in DMI-8 / feed-forage (+ tests) only. If Build finds a real schema gap, stop and ask; do not invent a migration in this OI.

---

## 5. Out of scope (call out explicitly)

- Reopening OI-0258 lock axes (**Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0**). This OI **consumes** that allocation on additional surfaces; it does not amend when a hay day is known for F1, how carryover is counted, or how a span’s hay is prorated.
- OI-0256 **Mx1**.
- CAP-1 / tan future-block forecast stub (**Cp0** locked out; separate if needed).
- Synthetic alfalfa data cleanup (t1171u / OI-0258 track).
- Move Step 3 (OI-0259).

---

## 6. Open Qs — resolved by Tim lock

Tim card **t1244s4822** (~1:00 PM ET, via Orchestrator), verbatim: “Lock OI-0260 Ch1+Fw0+Cp0+D0: both charts + days-remaining; keep current forward forecast; CAP-1 out”.

1. **Ch1** — wire **both** DMI-8 charts **and** days-remaining / estimated-demand (feed-forage) to Al1 — not chart-only. Resolved.
2. **Fw0** — keep existing forecast behavior after the last known span (not **Fw1** Al1 run-rate). Resolved.
3. **Cp0** — CAP-1 / DM forecaster **out** of this OI. Resolved.

---

## 7. Depends / queue

**Depends on:** OI-0258 code live (PR #143 tip `edc0b94ea7d61de4d2a46174e381520d305c1346`). At the time this tip was opened, that tip was already `origin/main` (OI-0259 #142 `e3f8c48` is a parent of the merge).

**Queue:** Docs **LOCKED / READY FOR BUILD**. Build slot: **after** the pending merge stack **#138 / #132 / #134** (Tim did not ask for sooner). **Do not land this docs tip until Tim land yes.** Do not open a PR from this tip.

**Rough size:** Medium — calc wiring in DMI-8 / feed-forage (+ tests); no SQL.

---

## 8. Tip instruction

**LOCKED / READY FOR BUILD** — package **Ch1+Fw0+Cp0+D0** (Tim card **t1244s4822**). **Do not land on main until Tim land yes.** **Do not open a PR.** Never force-push. Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Parent is `origin/main` `edc0b94ea7d61de4d2a46174e381520d305c1346`. Hand Build the brief for a slot after the #138/#132/#134 merge stack.

Cite: Build PR #143 caveat #5 (Al1 for event DMI-8 / feed-forage charts = follow-up, not done; `poolDailyObservation` unchanged in the OI-0258 ship). OI-0258 lock **Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0**. Tim lock **t1244s4822** (~1:00 PM ET, via Orchestrator): “Lock OI-0260 Ch1+Fw0+Cp0+D0: both charts + days-remaining; keep current forward forecast; CAP-1 out”.
