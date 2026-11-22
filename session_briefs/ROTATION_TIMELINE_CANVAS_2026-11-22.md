# Rotation timeline canvas — scroll, readiness, ticks, collapse metrics (OI-0254)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 ~10:24 AM ET (Tim, via Orchestrator, card **t1107s4351** option 1 / typed **t1114u** “A on the card above”) — **Sc1+Rd1+Tk1+Cm1+Cm1a**. Opened ~10:10 AM ET from Tim feedback batch items 2+4+6 (**t1037u/t1039u/t1094u/t1067u/t1096u**). Docs tip only until Tim lands docs. No SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (after docs live on main).  
**Parent:** Forgejo `origin/main` `129b2dd190574b9b6c1cb75bb21ac058a2d84cc8` (OI-0253 docs live; OI-0252 live via PR #131; stamp `b2026-11-22.1502-2fe1e88`; RELEASED **48**).  
**Also related:** OI-0252 metrics layout (dropped metrics min-width → short 14-day canvas now fits; overflow still works — not broken scroll); OI-0246 calendar; estimated readiness paint from `9ce0e69` (Today→range.end shared band).  
**Schema / migration:** **D0 — none.** Canvas extent, paint, ticks, and a collapse control only.

## 1. Problem

Tim’s feedback batch (items **2**, **4**, **6**) on Locations **Rotation**:

| Cue | Ask |
|---|---|
| **t1037u / t1039u** | Scroll the timeline **left through all past events**; scroll **right out to the last ready-by** date from the close-event recovery range. |
| **t1094u** | Readiness band **per paddock** should use the **close-event estimated readiness range** entered when the event closed — **not** the shared Today→range.end band (pre-existing from `9ce0e69`; name Ready labels already staggered, timeline paint is not). |
| **t1067u** | Tick marks along the timeline top: **large** = month start, **medium** = Saturday (end of week), **small** = other days. |
| **t1096u** | Collapse/expand the DMI/metrics column on Rotation to see more timeline. **No** temporary metrics min-width softener (Tim declined; wait on scroll and implement the list). |

Build triage (**t1087u**): “scroll gone” after #131 = short default canvas now fits the wider viewport — overflow still works. Fold the short-canvas loss into this stretch OI. Same-day readiness start = pre-existing estimated paint; fix with per-paddock readiness (**Rd1**).

### Out of this OI

- Past-event click detail → **OI-0255**.
- 100% Stored Feed / `no_pasture` → **OI-0256**.
- DM Forecaster / CAP-1 stub → **OI-0257**.
- OI-0253 B1 unknown paint (separate LOCKED tip).
- Temporary restore of ~280px metrics floor (Tim declined **t1096u**).

## 2. Lock axes

### **Sc** — Scroll / canvas extent

| Token | Meaning |
|---|---|
| **Sc1** (LOCKED) | Canvas spans **all past events** on the left and out to the **last ready-by** date (from close-event recovery ranges) on the right. Scroll when the viewport is smaller. |
| **Sc0** (not chosen) | Keep today’s default short canvas (e.g. ~14-day / 560px) — does **not** match Tim’s ask. |

### **Rd** — Readiness band

| Token | Meaning |
|---|---|
| **Rd1** (LOCKED) | Per-paddock readiness band = that paddock’s **close-event estimated readiness range** (earliest→latest from the close). Stagger left from earliestReturn as needed. |
| **Rd0** (not chosen) | Keep shared **Today→range.end** estimated paint (pre-existing `9ce0e69`). |

### **Tk** — Tick marks

| Token | Meaning |
|---|---|
| **Tk1** (LOCKED) | Top ticks: **large** = month start; **medium** = Saturday (end of week); **small** = other days. |
| **Tk0** (not chosen) | No new tick hierarchy (keep current day marks only, if any). |

### **Cm** — Collapse metrics column

| Token | Meaning |
|---|---|
| **Cm1** (LOCKED) | Add a collapse/expand control for the DMI/metrics column on Rotation so more timeline is visible when collapsed. |
| **Cm0** (not chosen) | No collapse control. |

**Cm1 default (only if Cm1):**

| Token | Meaning |
|---|---|
| **Cm1a** (LOCKED) | Default **expanded** (today’s layout); user can collapse. |
| **Cm1b** (not chosen) | Default **collapsed**. |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** (standing) | No SQL / no migration. |

## 3. Design lock

**LOCKED: Sc1+Rd1+Tk1+Cm1+Cm1a** — Tim, ~10:24 AM ET, card **t1107s4351** option 1 / typed **t1114u**.

- Matches Tim’s typed asks for scroll, readiness, ticks, and collapse.
- **Cm1a** keeps today’s expanded metrics as the default so existing Rotation muscle memory stays; collapse is opt-in for more canvas.
- No temporary metrics-floor softener.
- **D0** no SQL (standing).

**Next:** Docs only on this tip until Tim yeses the land card. GTHO Build implements after docs are on main. OI-0255 / 0256 LOCKED; OI-0257 LOCKED narrow (Ag1+St1; Fx1 parked). Batch 0254–0257 tip ready for Tim land.

## 4. Acceptance (when built)

1. With many past events, the user can scroll left through **all** of them (**Sc1**).
2. Canvas right edge reaches the **latest ready-by** date among visible paddocks’ close-event recovery ranges (**Sc1**).
3. Each paddock’s readiness band uses that paddock’s close-event estimated range (**Rd1**), not a shared Today→range.end fill for every row.
4. Tick row shows month / Saturday / other-day hierarchy (**Tk1**).
5. Metrics column has collapse/expand; default expanded (**Cm1+Cm1a**).
6. No SQL (**D0**). No metrics min-width softener restored as a substitute for Sc1.

## 5. Tip instruction

**LOCKED** — **Sc1+Rd1+Tk1+Cm1+Cm1a**. Docs only on this tip (OI-0255/0256 LOCKED; OI-0257 LOCKED narrow; batch ready for Tim land). **Do not land on main** until Tim yeses the land card. **Do not** start Build from this tip until docs are on main. Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Suggested Build order after locks: **0254 → 0255 → 0256 → 0257**.
