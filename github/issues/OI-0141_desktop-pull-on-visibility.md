# OI-0141 — Desktop tab silently goes stale; `pullAllRemote()` only fires on boot + `online` event; sync indicator reads "green" while remote is hours-to-days behind

**Priority:** P1 (silent multi-device drift — reproduced on Tim's desktop 2026-05-01)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0141.
**Labels:** `bug`, `sync`, `multi-device`, `v2-build`
**Status:** Phase 1 DESIGN LOCKED. Phase 2 (Supabase realtime subscriptions) deferred.

## Summary

Two intertwined gaps cause desktop tabs (and any long-lived browser tab) to silently render stale data:

1. **`pullAllRemote()` only runs on app boot (`src/main.js:212`) and on `window.online` event (line 208).** No tab-focus / visibility-change pull, no periodic timer, no Supabase realtime. A tab opened yesterday and never closed will keep yesterday's localStorage snapshot forever, plus any local writes from that tab.
2. **The sync indicator reflects only the *outgoing push queue*.** `src/ui/header.js:398-402` reads `adapter.getStatus()`, which returns `idle` when nothing is pending to push. Reports nothing about pull freshness. So a tab with no local writes shows "green / Synced" forever even when remote state has been updated by other devices.

Together: green dot, no error, no warning, just incorrect data on screen. Indistinguishable from a working app from the user's side.

Fix Phase 1: visibility-change pull + honest indicator + manual-refresh-on-tap. Phase 2 (realtime subscriptions for sub-second cross-device propagation) is its own future OI when Phase 1 ships and we see whether visibility-pull adequately covers field cases.

## Reproducer (live, 2026-05-01)

Tim has the app open on desktop and iPhone. Today on iPhone he saved a new feed entry (Apr 30 14:30 / G-2 / 1.0 bale, `f6916c6a-…`). Yesterday on iPhone he saved a feed check (Apr 30 08:23 / G-3 / 0.55 remaining, `3313f3c3-…`). Both wrote successfully to Supabase. Mobile renders both. Desktop shows neither — only the older Apr 29 entry. Both clients display green "Synced" sync dot in the header.

## Decisions (Phase 1, DESIGN LOCKED)

1. **Visibility-change pull.** Listen on `document.visibilitychange`; when the tab returns to `visible` and `navigator.onLine !== false`, fire `syncAdapter.flush()` then `pullAllRemote()`. Cheapest fix that covers the dominant "I came back to my open tab" case.
2. **Honest sync indicator.** Track last successful pull timestamp; surface it in the desktop sync strip's label (`Synced · last refresh 14:32`); flip from green `sync-ok` to amber `sync-stale` when last pull is older than **15 minutes**; flip back on next successful pull.
3. **Manual refresh on tap.** Tapping the sync dot/strip currently navigates to Settings. Replace with `await pullAllRemote()` + status text update. Settings remains reachable via the nav.

Phase 2 (deferred): Supabase realtime subscriptions. Higher fidelity but adds connection-management complexity; spec when Phase 1 ships and field experience tells us whether it's needed.

## Acceptance criteria — Phase 1

### Visibility-change pull

- [ ] `document.addEventListener('visibilitychange', …)` registered exactly once at app boot in `src/main.js`, after the existing `window.addEventListener('online', …)` block.
- [ ] Handler is async; checks `document.visibilityState === 'visible'` and `navigator.onLine !== false` before firing.
- [ ] On qualifying events: `await syncAdapter.flush(); await pullAllRemote();`
- [ ] Manual repro: open the app on two browsers; in browser A make a write; switch to browser B's tab → assert the write appears in browser B within ~1 second of foregrounding.

### Honest indicator

- [ ] `src/data/pull-remote.js` exports `getLastPulledAt(): number | null` (epoch ms). Updated to `Date.now()` on every successful `pullAllRemote()` completion. Persisted to localStorage so it survives tab refresh, but not required to be globally synced (per-device freshness).
- [ ] `src/ui/header.js` `renderDesktopSyncStrip()` (line ~398) consumes `getLastPulledAt()`:
  - When status is `idle` AND last-pulled-at is within 15 min → label `Synced · last refresh HH:MM`, `sync-ok` dot (green).
  - When status is `idle` AND last-pulled-at is >15 min OR null → label `Stale · refresh now`, new `sync-stale` dot (amber).
  - When status is `syncing` / `error` / `offline` → existing labels unchanged.
- [ ] `renderHeaderSyncBadge()` (mobile, line ~267) gets the same `sync-stale` state on the dot color (the mobile badge has no label, color-only); tooltip `title` reflects the same state strings.
- [ ] `STALE_THRESHOLD_MS = 15 * 60 * 1000` defined as a module constant in header.js (or pulled from a shared config).
- [ ] CSS class `.sync-stale` added with the existing `--amber` token; matches the tonal weight of `.sync-pending` and `.sync-ok` so the indicator reads at a glance.

### Manual refresh on tap

- [ ] Tapping the sync dot (mobile) or sync strip (desktop) triggers a manual `pullAllRemote()` instead of `navigate('#/settings')`.
- [ ] During the pull: dot shows `sync-pending` (existing class), label reads `Refreshing…`.
- [ ] On success: dot returns to `sync-ok`, label updates with the new last-pulled-at timestamp.
- [ ] On error: dot shows `sync-err` (existing class), label reads `Refresh failed`. Existing error-handling pattern in the adapter applies.
- [ ] Settings remains accessible via the existing nav (gear icon / hamburger / sidebar — wherever it lives now).

### i18n

- [ ] `src/i18n/locales/en.json` adds `sync.lastRefreshAt` (template `Synced · last refresh {time}`), `sync.stale` (`Stale · refresh now`), `sync.refreshing` (`Refreshing…`), `sync.refreshFailed` (`Refresh failed`).

### Tests

- [ ] `tests/unit/sync-indicator.test.js` (new): renders correct state for each of `idle-fresh`, `idle-stale`, `syncing`, `error`, `offline`; threshold flip at 15 min boundary; lastPulledAt formatting.
- [ ] `tests/unit/pull-remote-timestamp.test.js` (new): `pullAllRemote()` updates the lastPulledAt timestamp on success; does not update on failure; `getLastPulledAt()` reads correctly across module reloads (localStorage-backed).
- [ ] `tests/e2e/multi-tab-pull-on-visibility.spec.js` (new, follows CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI"): two browser contexts; context A writes a row; context B's tab is in background; foreground context B; assert the row appears in context B's UI within 2 seconds; assert the lastPulledAt value updated.
- [ ] Full test suite passes: `npx vitest run`.

### Manual verification (Tim's case)

- [ ] On the deploy, Tim's existing desktop tab: switch away, switch back → the missing Apr 30 feed entry and feed check appear within ~1 second.
- [ ] After the visibility pull, the sync strip reads `Synced · last refresh HH:MM` with the current local time.
- [ ] Leaving the tab idle for 16+ minutes flips the indicator to amber `Stale · refresh now`. Tapping it triggers a pull and returns it to green.

## Files to edit

- `src/main.js` — register `visibilitychange` listener after the `online` listener
- `src/data/pull-remote.js` — export `getLastPulledAt()`; record timestamp on success; localStorage-backed
- `src/ui/header.js` — both render functions consume the new state; switch dot/strip onClick from `navigate('#/settings')` to `triggerManualPull()`; add `STALE_THRESHOLD_MS` constant
- `src/styles/*` — add `.sync-stale` class
- `src/i18n/locales/en.json` — 4 new keys
- 2 new unit test files + 1 new e2e test file

## Not in scope (Phase 2 — separate OI)

- **Supabase realtime subscriptions** for sub-second propagation. Phase 1's 15-min threshold + visibility-pull + manual-refresh covers the dominant cases. Realtime adds connection management (channel teardown on logout, reconnection on flaky networks, per-table channel limits), which is a separate spec when we see field need.
- **Periodic timer-based pull** while tab is foregrounded (e.g., every 5 min). Visibility-change covers most cases; if a tab stays foregrounded for hours without user interaction, the indicator amber-flip + manual-refresh affordance handles it. Add a timer only if field testing shows visibility alone is insufficient.
- **Last-pulled-at synced cross-device.** Per-device freshness; no row in Supabase.

## Schema change

NONE.

## CP-55/CP-56 impact

NONE.

## Checklist for Claude Code

- [ ] Phase 1 implemented per the acceptance criteria above
- [ ] All new tests pass; full suite green
- [ ] Manual repro: 2 browser contexts, write-then-foreground assertion succeeds within 2 seconds
- [ ] CLAUDE.md §"Architecture Audit" §6 extended with a sync-indicator invariant: *"Sync indicator must report both push and pull state. Green = push queue empty AND last pull within stale threshold. Amber stale = push empty but pull older than threshold."* Plus a grep contract that the dot/strip onClick triggers `pullAllRemote`, not `navigate('#/settings')`.
- [ ] OPEN_ITEMS.md OI-0141 flipped to closed in the same commit (orphan-flip rule per CLAUDE.md §"OPEN_ITEMS.md Closure Discipline")
- [ ] Piggyback sweep: grep OPEN_ITEMS.md for sibling OIs referencing `pullAllRemote`, `sync-status`, `visibilitychange`, or `header.js` sync code — flip any now-moot entries
- [ ] PROJECT_CHANGELOG.md row added
- [ ] TASKS.md updated if tracked
- [ ] GitHub issue closed with `gh issue close {N} --comment "Completed in commit {hash}. All acceptance criteria met, {N} tests passing. Multi-tab visibility-pull verified."`
