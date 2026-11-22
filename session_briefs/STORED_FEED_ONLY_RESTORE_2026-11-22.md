# Restore 100% Stored Feed / `no_pasture` (OI-0256)

**Status:** **PROPOSED** 2026-11-22 ~10:10 AM ET (Tim feedback batch item 3, **t1052u**; pile lock **t1060s4208**; batch ended **t1096u**). Awaiting Tim lock.  
**Owner:** GTHO Design → GTHO Build (after Tim locks + docs live on main).  
**Parent:** Forgejo `origin/main` `129b2dd190574b9b6c1cb75bb21ac058a2d84cc8` (OI-0252 PR #131 live; RELEASED **48**). OI-0253 is on this parent (**B1** paint is complementary, not a substitute for this flag).  
**Also related:** Design brief 2026-04-12 (bale-grazing anchor = this flag); mig **029** / OI-0113 dropped `stored_feed_only` on `event_observations`; v1 `ev.noPasture` → `event_paddock_windows.no_pasture`; i18n `observations.storedFeedOnly` = “100% Stored Feed” (orphan); DMI-8 confinement uses `location.type` only (metrics ignore `no_pasture` today).  
**Schema / migration:** Column **already exists** (`event_paddock_windows.no_pasture` boolean; prod **7** rows true: Corral×4, G-2×2, G-3×1). **D0** expected — wire UI + paint + metrics to the existing column; no new column. Confirm at implement time; do not invent a second flag.

## 1. Problem

Tim (**t1052u**, ~9:46 AM ET): current events can legitimately have **no pasture DMI** (no residual) when rotating through pasture feeding bales. There used to be a checkbox when creating events on pasture to flag **100% stored feed** — the event painted in the stored-feed color and did **not** require pasture opening/closing data.

Research (Design + Build, same morning):

| Fact | Detail |
|---|---|
| Schema | `event_paddock_windows.no_pasture` boolean still present; **7** prod rows true. |
| v1 | Mapped `ev.noPasture` → this column. |
| Dropped | `stored_feed_only` on `event_observations` removed in mig **029** (OI-0113). |
| UI | i18n string still exists; **no** JS checkbox wired. |
| Metrics / calendar | Do **not** special-case `noPasture` today. |
| Design brief | 2026-04-12: bale-grazing anchor = this flag. |

OI-0253 **B1** (never paint unknown as Pasture 0%) is complementary: NOW bale-grazing with `no_pasture` should become **known** Pasture DMI=0 / 100% stored under **Mt1**, not “unknown.” Restoring the checkbox does **not** replace B1 for true unknowns.

### Out of this OI

- OI-0253 B1/C0 paint for unknown (separate).
- Timeline canvas / past-event detail / forecaster → OI-0254/0255/0257.
- Re-adding `stored_feed_only` on observations (superseded by `no_pasture`).

## 2. Lock axes

### **Lv** — Flag level

| Token | Meaning |
|---|---|
| **Lv1** [rec] | Per-**paddock-window** checkbox → `event_paddock_windows.no_pasture` (matches schema + docs + prod rows). |
| **Lv0** | Event-level only (would fight the existing column / multi-paddock events). |

### **Sk** — Skip residual readings

| Token | Meaning |
|---|---|
| **Sk1** [rec] | When flagged, skip **both** open and close pasture residual readings (Tim: not required). |
| **Sk2** | Skip close-only. |
| **Sk3** | Skip open-only. |

### **Pn** — Paint

| Token | Meaning |
|---|---|
| **Pn1** [rec] | Paint tan / stored-feed color (Tim’s remembered UX). Feed attribution still visible in metrics (**Mt1**). |
| **Pn2** | Keep green pasture paint + text like “Pasture 0% · Feed 100%” (clearer % copy; Tim may still prefer **Pn1**). |

### **Mt** — Metrics / DMI attribution

| Token | Meaning |
|---|---|
| **Mt1** [rec] | When `no_pasture`, treat pasture DMI as **known 0** and attribute intake to **100% stored feed** (not unknown / not F1 sticky from missing residual). |
| **Mt0** | Leave metrics as today (ignore flag) — does **not** fix Tim’s ask. |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** [rec] | No new SQL / no new column — wire to existing `no_pasture`. |

## 3. Design recommendation

**Lv1+Sk1+Pn1+Mt1+D0**

- Matches schema, v1 mapping, and Tim’s remembered checkbox + tan paint + skip open/close.
- **Pn1** over **Pn2** to match remembered UX; **Mt1** still makes Feed % clear in the metrics column.
- Settles legitimate NOW “no residual / bale grazing” cases; does not replace OI-0253 B1 for true unknown DMI.

## 4. Acceptance (when locked + built)

1. Creating/editing a pasture paddock-window shows a **100% Stored Feed** checkbox wired to `no_pasture` (**Lv1**).
2. When flagged, open/close residual prompts follow **Sk*** (rec: both skipped).
3. Timeline paints per **Pn*** (rec: tan/stored-feed).
4. Metrics treat pasture as known 0 / 100% stored (**Mt1**); not “—” from missing residual alone.
5. Existing prod rows (`no_pasture=true`) pick up the new paint/metrics without a data rewrite.
6. No new migration (**D0**) unless Build discovers a real schema gap — stop and ask; do not invent a second flag.

## 5. Tip instruction

**PROPOSED** — Design lean **Lv1+Sk1+Pn1+Mt1+D0**. Docs only. Awaiting Tim lock. Suggested Build order: after **OI-0254** / **OI-0255** (UI can share event sheet work with 0255).
