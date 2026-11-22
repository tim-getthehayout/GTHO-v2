# Rotation timeline canvas — scroll, readiness, ticks, collapse metrics (OI-0254)

**Status:** **PROPOSED** 2026-11-22 ~10:10 AM ET (Tim ended feedback batch **t1096u**: “lets wait on the scroll and implement the list of feedback items as that should fix it”). Awaiting Tim lock. No SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (after Tim locks + docs live on main).  
**Parent:** Forgejo `origin/main` `2fe1e8897dc4e2dcab413b157292d619ecee0c7d` (OI-0252 live via PR #131; stamp `b2026-11-22.1502-2fe1e88`; RELEASED **48**). OI-0253 LOCKED tip `129b2dd` may land separately.  
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
| **Sc1** [rec] | Canvas spans **all past events** on the left and out to the **last ready-by** date (from close-event recovery ranges) on the right. Scroll when the viewport is smaller. |
| **Sc0** | Keep today’s default short canvas (e.g. ~14-day / 560px) — does **not** match Tim’s ask. |

### **Rd** — Readiness band

| Token | Meaning |
|---|---|
| **Rd1** [rec] | Per-paddock readiness band = that paddock’s **close-event estimated readiness range** (earliest→latest from the close). Stagger left from earliestReturn as needed. |
| **Rd0** | Keep shared **Today→range.end** estimated paint (pre-existing `9ce0e69`). |

### **Tk** — Tick marks

| Token | Meaning |
|---|---|
| **Tk1** [rec] | Top ticks: **large** = month start; **medium** = Saturday (end of week); **small** = other days. |
| **Tk0** | No new tick hierarchy (keep current day marks only, if any). |

### **Cm** — Collapse metrics column

| Token | Meaning |
|---|---|
| **Cm1** [rec] | Add a collapse/expand control for the DMI/metrics column on Rotation so more timeline is visible when collapsed. |
| **Cm0** | No collapse control. |

**Cm1 default (only if Cm1):**

| Token | Meaning |
|---|---|
| **Cm1a** [rec] | Default **expanded** (today’s layout); user can collapse. |
| **Cm1b** | Default **collapsed**. |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** [rec] | No SQL / no migration. |

## 3. Design recommendation

**Sc1+Rd1+Tk1+Cm1+Cm1a+D0**

- Matches Tim’s typed asks for scroll, readiness, ticks, and collapse.
- **Cm1a** keeps today’s expanded metrics as the default so existing Rotation muscle memory stays; collapse is opt-in for more canvas.
- No temporary metrics-floor softener.

## 4. Acceptance (when locked + built)

1. With many past events, the user can scroll left through **all** of them (**Sc1**).
2. Canvas right edge reaches the **latest ready-by** date among visible paddocks’ close-event recovery ranges (**Sc1**).
3. Each paddock’s readiness band uses that paddock’s close-event estimated range (**Rd1**), not a shared Today→range.end fill for every row.
4. Tick row shows month / Saturday / other-day hierarchy (**Tk1**).
5. Metrics column has collapse/expand; default expanded (**Cm1+Cm1a**).
6. No SQL (**D0**). No metrics min-width softener restored as a substitute for Sc1.

## 5. Tip instruction

**PROPOSED** — Design lean **Sc1+Rd1+Tk1+Cm1+Cm1a+D0**. Docs only on this tip (with OI-0255/0256/0257). **Do not land on main** until Tim yeses the land card after lock. Never edit `src/`, `tests/`, or `supabase/` on this docs tip. Suggested Build order after locks: **0254 → 0255 → 0256 → 0257**.
