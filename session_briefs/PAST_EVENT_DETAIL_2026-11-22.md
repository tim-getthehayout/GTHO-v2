# Past event detail on Rotation (OI-0255)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 ~10:41 AM ET (Tim, via Orchestrator, card **t1114s4371**) — **Ui1+Dt1**. Opened ~10:10 AM ET from Tim feedback batch item 1 (**t1032u**; batch ended **t1096u**). Docs tip only until Tim lands docs. No SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (LOCKED / READY FOR BUILD; Build may start ahead of docs land, after OI-0254).  
**Parent:** Forgejo `origin/main` `da22c6d5978fa9864142d5bb99b7e5f3f817ae5a` (OI-0254 code LIVE via PR #135; OI-0253 docs live; OI-0252 PR #131 live; RELEASED **48**).  
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
| **Ui1** (LOCKED) | Modal / sheet detail over the calendar (fits phone + desktop; matches other GTHO sheets). |
| **Ui2** (not chosen) | Inline expand under the block on the timeline. |
| **Ui3** (not chosen) | Navigate away to the full event screen. |

### **Dt** — Which fields

| Token | Meaning |
|---|---|
| **Dt1** (LOCKED) | Opening + closing pasture readings **and** key event fields already on the event/PW (dates, groups, location). Do **not** invent a long field list — if Tim needs more after seeing Ui1, ask rather than guess. |
| **Dt0** (not chosen) | Opening + closing readings only (minimal). |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** (standing) | No SQL / no migration. |

## 3. Design lock

**LOCKED: Ui1+Dt1** — Tim, ~10:41 AM ET, card **t1114s4371**.

- Sheet/modal matches existing mobile patterns and does not steal timeline space (**Ui2**) or yank the user off Rotation (**Ui3**).
- **Dt1** covers Tim’s stated ask; expand fields only if he asks after trying it.
- **D0** no SQL (standing).

**Next:** Docs only on this tip until Tim yeses the land card. GTHO Build may start ahead of docs land, after OI-0254. OI-0256 LOCKED; OI-0257 LOCKED narrow (Ag1+St1; Fx1 parked). Batch 0254–0257 tip ready for Tim land.

## 4. Acceptance (when built)

1. Clicking a past event on Rotation opens a modal/sheet detail (**Ui1**).
2. User can see opening and closing pasture readings and key event fields already on the event/PW (dates, groups, location) (**Dt1**).
3. No SQL (**D0**). Does not change OI-0254 canvas extent by itself.

## 5. Tip instruction

**LOCKED / READY FOR BUILD** — **Ui1+Dt1**. Docs only on this tip (OI-0256 LOCKED; OI-0257 LOCKED narrow; batch ready for Tim land). **Do not land on main** until Tim yeses the land card. Build may start ahead of docs land; order after **OI-0254** (code already LIVE on main `da22c6d`). Never edit `src/`, `tests/`, or `supabase/` on this docs tip.
