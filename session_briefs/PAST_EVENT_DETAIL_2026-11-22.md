# Past event detail on Rotation (OI-0255)

**Status:** **PROPOSED** 2026-11-22 ~10:10 AM ET (Tim feedback batch item 1, **t1032u**; batch ended **t1096u**). Awaiting Tim lock. No SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (after Tim locks + docs live on main).  
**Parent:** Forgejo `origin/main` `2fe1e8897dc4e2dcab413b157292d619ecee0c7d` (OI-0252 PR #131 live; RELEASED **48**). OI-0253 LOCKED tip `129b2dd` may land separately.  
**Also related:** OI-0254 timeline canvas; OI-0246 calendar click rules (**Cb**); event observation / paddock-window readings.  
**Schema / migration:** **D0 — none.** Read-only detail UI over existing event / PW / observation fields.

## 1. Problem

Tim (**t1032u**): on Rotation, click a **past event** to see the data behind it — opening/starting and closing values.

Today the timeline shows the block but does not surface the readings that produced the season metrics / readiness for that stay.

### Out of this OI

- Timeline scroll / readiness / ticks / collapse → **OI-0254**.
- 100% Stored Feed checkbox → **OI-0256**.
- Editing the past event in place (unless Tim later expands **Dt**).
- Inventing extra fields beyond opening+closing + key event fields — ask Tim if more is needed (**Dt1**).

## 2. Lock axes

### **Ui** — How the detail opens

| Token | Meaning |
|---|---|
| **Ui1** [rec] | Modal / sheet detail over the calendar (fits phone + desktop; matches other GTHO sheets). |
| **Ui2** | Inline expand under the block on the timeline. |
| **Ui3** | Navigate away to the full event screen. |

### **Dt** — Which fields

| Token | Meaning |
|---|---|
| **Dt1** [rec] | Opening + closing pasture readings **and** key event fields already on the event/PW (dates, groups, location). Do **not** invent a long field list — if Tim needs more after seeing Ui1, ask rather than guess. |
| **Dt0** | Opening + closing readings only (minimal). |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** [rec] | No SQL / no migration. |

## 3. Design recommendation

**Ui1+Dt1+D0**

- Sheet/modal matches existing mobile patterns and does not steal timeline space (**Ui2**) or yank the user off Rotation (**Ui3**).
- **Dt1** covers Tim’s stated ask; expand fields only if he asks after trying it.

## 4. Acceptance (when locked + built)

1. Clicking a past event on Rotation opens the chosen UI (**Ui1/2/3**).
2. User can see opening and closing pasture readings for that stay (**Dt1** or **Dt0**).
3. No SQL (**D0**). Does not change OI-0254 canvas extent by itself.

## 5. Tip instruction

**PROPOSED** — Design lean **Ui1+Dt1+D0**. Docs only. Awaiting Tim lock. Suggested Build order: after **OI-0254** (or parallel if no file clash).
