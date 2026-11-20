# OI-0238 — Partial-day estimated demand (hour-prorate first/last)

**Status:** SPEC LOCKED (Tim, 2026-11-20 ~6:15 AM ET, via Orchestrator)  
**Owner:** GTHO Design → GTHO Build after docs land  
**Schema / migration:** none  
**CP-55 / CP-56:** none (compute-on-read)

## Tim lock (exact card)

> OI-0238: C hour-prorate first/last; first-day clock = delivery time (15:00); keep end-of-today; plus A label

## Why

On event `ff115ee9` (E-1…E-5, 12 bales lot 1012 dated 2026-11-19 15:00), Tim saw **~2.98 days remaining** while napkin math said **almost 4**. Design confirmed the DMI-8 → FOR-4 math matched the locked **whole calendar-day** estimated burn (Nov 19 + Nov 20 = 2.0 demand-days → 2.98 left). Tim: he fed yesterday afternoon so 24 h had not elapsed. Wall-clock from 15:00 through end of today is **1.375** demand-days → **~3.61** days after today.

This is **not** a code bug against OI-0209 / DMI-8 as previously locked. It is a product change: estimated demand on partial first/last days becomes hour-prorated.

## Locked rules

### C — Hour-prorate estimated DMI-8 demand on partial first and last days

1. **Middle calendar days** (strictly after dateIn and before today / dateOut): still **1.0 ×** `groupWindowsDailyDmiKg(date)`.
2. **First calendar day (dateIn):** demand fraction = real hours from the **first-day clock** to local midnight ÷ hours in that local day (DST-aware; same `localInstantMs` / elapsed-hours family as DMI-5 / OI-0227 D).
3. **First-day clock (Tim):** earliest stored-feed **delivery** instant on dateIn (`event_feed_entries` with `entry_type = delivery` / inventory feeding delivery rows; use row `date`+`time`). For the motivating E event that is **15:00** → fraction **9/24 = 0.375**.
4. **Today (open event, projection through end of today):** still burns **through end of local today** (full remaining hours of today from midnight → 24:00). **No live clock countdown** (OI-0209 stands).
5. **Last calendar day (dateOut / close):** fraction = midnight → close instant (paddock `timeClosed` / group `timeLeft` via TIM-3 family); missing time → local midnight convention only where TIM-3 / DMI-5 already do.
6. **FOR-4** formula unchanged: `(remainingStoredDmKg + forageEstimateKg) / groupDmiKgPerDay`. Only the cascade’s remaining buckets change because first/last demand fractions change.
7. **Acceptance target for the E event (as of 2026-11-20):** remaining after end of today ≈ **3.61** (not 2.98). Full stack still ≈ 4.98 demand-days from delivery.

### A — Label (pasture capacity line)

Pasture / mixed dashboard capacity line (`Est. capacity: … · ~N days remaining`) must carry the same meaning as confinement:

- Caption / suffix: **end-of-today daily-model estimate** (and/or **~N days after today**).
- Confinement feed-remaining line already has this; pasture must match so Tim’s napkin math is not fighting the label.

### Measured path unchanged

**DMI-5** (and FED-6 summing DMI-5) stays on elapsed-hours between checks. OI-0238 only changes the **estimated** demand allocation inside DMI-8’s cascade walk (and callers that currently pass whole TIM-1 days into NPK).

### NPK-1 / NPK-3 → TIM-3 (presence)

- **NPK-1 / NPK-3 callers** stop using `daysBetweenInclusive × 24` as a proxy.
- Use **TIM-3** (or equivalent) from paddock/group **open/close times** — **presence**, not delivery.
- Days-remaining first-day clock (delivery) and NPK duration (presence) are **intentionally different clocks**.

### Chart bars

DMI-8 estimated bars on dateIn / dateOut / today use the **same** demand fraction as the cascade (delivery clock on dateIn when a delivery exists; see edge cases).

## Edge cases (LOCKED — Tim confirmed 2026-11-20 ~6:16 AM ET: "When animals arrived is fine")

**(a) No stored-feed delivery on dateIn** (pasture-only, or first delivery on a later calendar day): first-day estimated-demand clock falls back to earliest **presence** open — paddock `timeOpened`, else group `timeJoined`. Missing time → local midnight (DMI-5 convention). Delivery clock applies only when at least one delivery exists on that dateIn.

**(b) NPK vs days-remaining:** confirmed split — days-remaining / estimated DMI-8 first-day burn uses **delivery** when present; NPK-1/3 use **presence** via TIM-3.

**(c) Multiple deliveries on dateIn:** earliest delivery instant wins for the first-day clock.

**(d) Delivery before presence open on dateIn:** still use delivery time for the days-remaining / estimated first-day fraction (Tim lock). Presence before that instant is NPK/presence territory only.

## Out of scope

- Live “from now” countdown (OI-0209 forbids).
- Changing bale weight, DM%, utilization, or implied-pasture rules.
- Migrations, RLS, CP-55/56 table lists.
- Re-dating Tim’s E event rows (data unchanged).

## Files (Build — product behaviour, not invention)

| Area | Likely touch (Build owns code) |
|---|---|
| DMI-8 estimated walk | `src/calcs/feed-forage.js` — fraction on allocateDay for dateIn / dateOut / today-EOD |
| Shared day-fraction helper | Prefer one helper next to `localInstantMs` / TIM-3; Design does not invent the helper shape |
| Feed-days projection | `src/calcs/event-feed-days.js` / callers — inherits DMI-8 remainders |
| Pasture capacity label | `src/features/dashboard/index.js` (~capacity line); Event Detail if it mirrors |
| NPK callers | `src/features/events/detail.js`, reports, `audit-resolvers.js` — TIM-3 presence durations into NPK-1/3 |
| Tests | Unit coverage: E-event fixture → ~3.61; pasture-only fallback to presence; NPK hours ≠ delivery clock when they differ |

## Acceptance

- [ ] E event `ff115ee9` (or fixture with same instants): end-of-today remaining ≈ **3.61** (2-decimal FOR-4), not 2.98.
- [ ] Pasture capacity line shows end-of-today / after-today wording.
- [ ] Confinement feed-remaining caption unchanged in meaning.
- [ ] Pasture-only event: first-day fraction from presence open, not midnight-by-default when times exist.
- [ ] NPK-1/3 for an afternoon start use presence duration &lt; full TIM-1 days×24 for the same span.
- [ ] DMI-5 measured bars unchanged for an existing bracketed-check fixture.
- [ ] No migration; no schema; CP-55/56 untouched.

## Related

OI-0209 (end-of-today, no live clock), OI-0119 / DMI-8, OI-0227 D (elapsed hours for measured stored), TIM-3, FOR-4, FED-6 (consumes DMI-5 only).

## Origin

Tim bug report 2026-11-20 ~6:09 AM ET (“2.98 vs almost 4”); clarification ~6:14 AM ET; lock ~6:15 AM ET via Orchestrator.
