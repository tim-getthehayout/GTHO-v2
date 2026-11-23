# Hotfix: hide the voice module controls that sit over the screen (OI-0268)

**Status:** **LOCKED / READY FOR BUILD** (America/New_York) — **Hv1+Ha0+D0**.
**Opened:** 8:07 PM ET 2026-11-22 by GTHO Design from Tim, via Orchestrator:
- **t1318u** (8:07 PM ET): “Can we do a hot fix to hide the voice module controls? Especially on mobile they are in my way all the time.”
**Locked:** 8:12 PM ET 2026-11-22, card **t1319s5157**:
- “Voice bar: A, hide the floating mic bar everywhere”
- “Typed chat: keep the header Assistant button”

**Branch tip:** `docs/oi-0268-hide-voice-controls`, on `origin/main` `3585d4d2f61dfb4306943f11f417929c5141fcaf` (OI-0267 live). Docs only — do not land until Tim land yes.
**No SQL / no migration / no data change. D0.**

Line numbers are at main `3585d4d`. Code read only.

---

## What is on screen today

Two launchers share one assistant session. Only one of them floats over the page.

| Control | Where | What it does |
|---|---|---|
| Global push-to-talk (mic + Log + status) | `push-to-talk.js` `mountPushToTalk` ~56, id `gtho-push-to-talk`, mounted from `wiring.js:50` onto `document.body` on **every screen** | Starts **voice**. Log opens unfinished voice notes. After a mic failure it can offer “Type instead?” and open the typed sheet. |
| Header “Assistant” button | `header.js` `renderAssistantControl` ~678, `header-assistant-btn`, in the sub-row next to Feedback and Get Help (`header.js:126–144`) | Opens **typed** chat (`panel.js` `openAssistant` mode `text`): farm entry, questions, feedback, how-to. Not floating. |

**Position of the PTT** (`main.css:3955–3971`): `position: fixed; z-index: 300; left: 50%`.
- Phone (`max-width: 899px`, same breakpoint as the bottom nav): `gtho-ptt--compact`, **72px** mic, `bottom: calc(76px + env(safe-area-inset-bottom))` — parked just above `.bottom-nav` (`z-index: 100`). This is the control “in the way.”
- Desktop: `gtho-ptt--floating`, **56px** mic at `bottom: 24px`, draggable. Position remembered in `localStorage` `gtho-ptt-position` (placement only).

**Existing gates (none is a hide/show pref):**
- Build flag `VITE_GTHO_ASSISTANT=1` (Pages deploy var). Off = no assistant chunk, and no header Assistant button either.
- Backend `deps.api.config()` must return 200 (403 for a non-allowlisted operation keeps both hidden).
- Field mode hides the header sub-row and bottom nav, **not** the PTT.
- No Settings row, no `user_preferences` column, no localStorage visibility key.

---

## Lock: Hv1 + Ha0 + D0

Hide the floating mic / Log bar **everywhere**. Keep the header Assistant button so typed chat still works. Feedback and Get Help stay. No database change. `VITE_GTHO_ASSISTANT` is unchanged.

**Implementation:** only skip `mountPushToTalk` in `wiring.js:50` (or have it return null). Keep `push-to-talk.js` and its CSS — do not delete the module — so the bar can be restored later.

**Not chosen:** **Hv2** (mobile only), **Hv3** (hide by default plus a per-device toggle), **Ha1** (also hide the header Assistant button).

**Do not** turn off `VITE_GTHO_ASSISTANT` for this hotfix. That also removes typed Assistant for every user of the build and needs another Pages republish to undo.

## What stays reachable

- Header **Feedback** and **Get Help**, and desktop `#/feedback`.
- Header **Assistant** → typed chat.
- All normal farm screens and forms.

**Not reachable while the PTT is hidden:** voice capture, the Voice log, and offline voice notes started from that bar.

## Acceptance / tests

- `#gtho-push-to-talk` is absent on mobile and desktop after mount.
- The header Assistant button still opens typed chat (config-on + flag-on).
- Feedback and Get Help still work.
- `push-to-talk.js` is retained in the tree (not deleted) so the bar can be restored later.
- No SQL. `VITE_GTHO_ASSISTANT` unchanged.

## Stacking and size

- Independent of PR #154 / OI-0265: that PR’s `header.js` change only deletes the three Locations nav entries (~60, 76, 536). Assistant / PTT lines are untouched.
- Independent of OI-0266 (calendar scroll). If this hotfix later edits CSS, it is the PTT block at `main.css:3955`, not the calendar styles.
- **Size:** XS.
