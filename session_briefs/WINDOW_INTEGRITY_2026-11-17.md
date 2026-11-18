# OI-0226 — Window integrity: group windows never outlive their event

**Date:** 2026-11-17 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **APPROVED (Tim, 2026-11-17 11:01 AM ET, via Orchestrator):** "Yes, have Design spec the window-integrity item for Build after the forecast fix". Docs only; no code, no SQL, no data change in this commit.
**Sequencing:** Build starts this **after** the forecast orphan-window fix PR (`fix/forecast-orphan-windows`) merges. That PR owns the cull-sheet orphan-split skip and the forecast masking; this item owns prevention.
**Base:** Forgejo `main` `2f341de7` (PR #70 merge). Every file:line below was read on `2f341de7`. Diagnosis was SELECT-only on prod.
**Related:** OI-0224 (FED-6 run rate, the panel that showed 2,042), OI-0137 (back-dated entries close the current window), OI-0185/OI-0186 (close pre-flight and date-conflict one-tap fix), OI-0184 (sync dead-letter queue and auto-drain), OI-0205 (`maybeSplitForGroup` adopts only a window on an open event), OI-0101 (move-wizard date-in/date-out mirror).
**PR status (2026-11-18):** PR A merged as [#75](https://git.sarnford.com/Homelab/GTHO-v2/pulls/75) at `21f7caad`. PR B merged as [#78](https://git.sarnford.com/Homelab/GTHO-v2/pulls/78) at `7bf29a9d`; Design accepted its approach (§7). PR C not started.
**Addendum (2026-11-17, Design, found in PR #75 review):** §6 extends slice (a) to paddock windows in PR A, in the same batch as the group-window clamp, and adds PR A acceptance tests plus an open reports note. Not a new Tim product decision.

## 1. Background

### 1.1 What Tim saw

The FED-6 run-rate panel forecast **2,041.56 lb DM/day** (shown as 2,042) when the herd's real demand was **about 1,334** (1,333.56, the average of the 8 measured days Nov 5, 6, 7, 8, 11, 13, 14 and 15; 1,446.00 lb/day on each of Nov 11–15). The 708 lb/day difference was a stray **open** Cow-Calf Herd group window on the F - 1..5 event, which closed Jul 27 09:00. `groupWindowsDailyDmiKg` counts any window with `date_joined ≤ d` and no `date_left`, without checking whether its event is open, so the herd was counted twice every day since Jul 27, at live head count and weight.

### 1.2 Today's cleanup (done, 2026-11-17)

Tim approved all five rows (10:51 AM ET, via Orchestrator): "Yes, close out all five: A1, A2, B1, and B2/B3 shrunk to zero length, with a backup first". Orchestrator took a table backup of `event_group_windows` (snapshot 10:52:26 AM ET) and applied one guarded transaction at **10:54 AM ET**. Every post-check passed: 5 rows changed, **0 deletes**, `event_group_windows` still has 267 rows, and the herd's current window on the open D+E event was not touched. The forecast now reads 1,333.56 lb/day. Devices pick the change up on their next pull (`updated_at` set to the apply time).

All five are Cow-Calf Herd windows on the F - 1..5 and K - 1..5 events:

| row | event (closed) | before | after | how it got that way |
|---|---|---|---|---|
| A1 `ccd9df1d` | F - 1..5 (Jul 27 09:00) | joined 07-27 → **open** | left 07-27 09:00 | Calving split created it Jul 29 (joined today); the one-tap date-conflict fix moved its join to 07-27; the back-dated move's close of this row never reached the server (bug 2) |
| A2 `e4283e46` | F - 1..5 | 07-27 → **07-29** | left 07-27 09:00 | Closed by the Jul 29 calving split at today; the move then back-dated F's close to 07-27 and did not revisit closed windows (bug 1) |
| B1 `2affde00` | K - 1..5 (Aug 10 09:00) | 08-03 10:00 → **09-16** | left 08-10 09:00 | Normal move in; closed by the Sep 16 calving split while K was still open; the Nov 3 back-entry set K's close to 08-10 (bug 1) |
| B2 `47a7873b` | K - 1..5 | **09-16 → 09-22** | zero-length 08-10 09:00 | Created by the Sep 16 split while K was open; joined after the close once Nov 3 back-dated it (bug 1) |
| B3 `048a953d` | K - 1..5 | **09-22 → 10-09** | zero-length 08-10 09:00 | Same as B2 (Sep 22 split). This one inflated Oct 1–8 by about 739 lb/day |

Option 1 (zero length at the close, no delete) was chosen because the PWA has no tombstones: `mergeRemote` never drops a local row missing on the server, so a deleted row would keep counting on devices and could be re-pushed.

### 1.3 Two root causes (neither is the cull sheet)

1. **A backdated close only clamps OPEN windows (A2, B1, B2, B3; proven).** When an event's close is set or moved earlier:
   - the pre-flight `checkWindowCloses` (`src/features/events/window-close-guard.js:69`) only looks at windows with no `dateLeft`;
   - the move wizard hoists only open source windows (`move-wizard.js:576–580`) and closes only those (`move-wizard.js:725`);
   - the close sheet does the same (`close.js:252–254`).

   A window that a split had already closed **after** the new close keeps its later `date_left`, and sometimes its later `date_joined`.
2. **Two unordered writes to the same row (A1; effect proven, mechanism inferred).** On a back-dated move, the date-conflict one-tap fix (`date-conflict-dialog.js:51–63`, `applyOneTapFix` writes `{dateJoined: outDate, timeJoined: null}`) and the move's close are two separate `update()` calls on the same window. Each goes through `persistMutation` (`store.js:100–110`), which calls `syncAdapter.push()` without awaiting it, and each push is a full-row `upsert(..., { onConflict: 'id' })` (`custom-sync.js:242`). Nothing orders pushes per row and the server has no stale-write check, so **the last request to arrive wins**, even if it carries the older `updated_at`. The server kept the fix payload (open). `applyOneTapFix` also runs outside the durable write, which is used only when `poolWritesEnabled() && !review` (`move-wizard.js:820`).

**Shared root:** nothing on the client or the server ties a group window to its event's close.

**The forecast fix masks this but does not prevent it.** "Count a group only while its event is open" and "count each group once a day" (in `fix/forecast-orphan-windows`) correct the forecast and DMI, but bad windows can still be created, and every other reader of windows (event detail, history, audits, the OI-0222 backfill and the season basis) still sees them. The cull-sheet orphan-split skip is in the forecast fix PR, not here.

---

## 2. The rules (one place)

Instants compare as (date, time). **When a time is missing on either side, compare dates only.** Days are half-open: a window counts on day d when `date_joined ≤ d < date_left`.

- **R1 Bounds.** If the event's `date_out` is set: `date_joined ≤ date_out`, `date_left` is set, and `date_left ≤ date_out`.
- **R2 No open window on a closed event** (follows from R1).
- **R3 Backdated close** — §3 (a).
- **R4 Reopen** — §3 (a).
- **R5 One place at a time (warn, don't block)** — §3 (c).
- **R6 No stale overwrite** — §3 (d).

---

## 3. Spec

### (a) Backdated-close clamp across all of an event's windows

**When:** an event's close is set, or moved earlier, from any path: the move wizard (including back-entry, which is a back-dated move), the close sheet, and any other path that writes `events.date_out` (Build: grep for every writer of `dateOut` on events and list them in the PR).

**Behaviour:** every group window on that event is reconciled **in one write** (one store mutation batch, one durable write where available), **closed windows included**:

| window state vs the new close C | action |
|---|---|
| open (`date_left` NULL), joined ≤ C | close at C (`date_left`/`time_left` = C), stamping live head/weight as today (OI-0091) |
| closed, left instant > C, joined ≤ C | clamp `date_left`/`time_left` to C; head and weight unchanged |
| closed or open, left ≤ C | unchanged |
| **joined instant > C** | **not changed silently.** Listed in the review for the user to resolve |

**Review list for "joined after the close":** the pre-flight (`checkWindowCloses`) covers **all** of the event's windows, not just open ones. Each conflicting window is shown by group name with its dates. Options:
- **Zero-length at the close (default):** `date_joined`/`time_joined` = `date_left`/`time_left` = C. This is the app's existing zero-day shape and the same shape used in today's cleanup. No delete.
- **Cancel** the close or move.

There is no silent fix and no delete. Today's one-tap fix for a window that joined after the out date (the A1 case: set the join to the out date, then the close ends it there) is this same zero-length result; it stays, but it becomes part of the same ordered write (b).

**Reopen (event `date_out` cleared):** reopen only windows whose left instant equals the old close **exactly** (date and time; today `reopen-event.js:64` matches `date_left === oldDateOut` on the date only). Design detail on top of Tim's line:
- a window that is **zero-length at the old close** (joined = left = old close, as made by the clamp) stays closed;
- a window whose group already has a later window on another event stays closed and is listed;
- a window the clamp shortened is reopened as open, not restored to its earlier `date_left`.

**Moving a close later** (not clearing it): treat as reopen-then-close: windows that ended exactly at the old close move to the new close, subject to the same two exceptions; everything else is unchanged.

**Acceptance tests (unit plus one flow test each):**
1. Event with an open window and a closed window whose `date_left` is after the new close: after the backdated close both end at C, in one write (one notify, one batch of queued pushes).
2. The B1 case: closed window 08-03 10:00 → 09-16; close set to 08-10 09:00 → window ends 08-10 09:00.
3. The B2/B3 case: window joined 09-16 on an event closed back to 08-10 09:00 → shown in the review; the default makes it zero-length at 08-10 09:00; Cancel leaves everything unchanged (event included).
4. Windows ending before C are untouched (`updated_at` unchanged).
5. Close sheet and move wizard give identical results for the same data.
6. Reopen: a window ending exactly at the old close reopens; one ending earlier does not; a zero-length window at the old close does not; a window whose group has a later window elsewhere does not and is listed.
7. Time handling: a window with no `time_left` on the close date is not treated as after the close (date-only rule).

See also the 2026-11-17 addendum (§6): paddock-window clamp in PR A with a required prod-sequence test, a `pool.arrival` earlier-arrival refusal test, a time-aware reopen test, and the open reports 'DMI by group' count.

### (b) One ordered save for the one-tap fix and the close or move

The one-tap conflict fix and the close or move that follows write a given window as **one ordered save**. More generally: **a later local write to a row must never be overtaken by an earlier one in the sync queue.** Build picks the mechanism and says which in the PR:
- **coalesce per row:** pending pushes for the same table + id collapse to the latest full row before sending; or
- **chain per row:** a push for a row waits for the previous push for that row to settle.

Either way the fix and the close are queued together; the fix must not run as a separate unawaited push outside the move's durable write. *(2026-11-18: Design accepted PR B's ordering in the sync adapter in place of this durable-write wording; see §7.)* The ordering guarantee must hold whether or not `poolWritesEnabled()` is on and in review mode (today only `poolWritesEnabled() && !review` uses `runDurableWrite`, `move-wizard.js:820`). Offline queueing and the OI-0184 dead-letter queue keep their current behaviour.

**Acceptance tests:**
1. **A1 race reproduction:** a window joined after the out date; run the one-tap fix and the close back to back with the first push artificially delayed (mock adapter that resolves out of order). The server copy ends **closed** at the close, with the newest `updated_at`.
2. Ten rapid updates to one row with randomised network delays: the server ends with the last local value.
3. Writes to different rows are not serialised behind each other (no global queue lock).
4. Offline: fix and close queued offline, then reconnect → server ends closed.

### (c) Arrival defaults to departure, with overlap warnings

- **Move wizard:** the destination arrival date/time **defaults to the departure** date/time, and stays mirrored until the user edits it. Today the OI-0101 one-way mirror (`move-wizard.js:210–224, 253–271`) lets a touched date-in drift from the date-out with no warning; that is how the 18 arrival-before-departure overlaps in §4 were made.
- An arrival **earlier than departure is still allowed** for real corrections, but shows a non-blocking warning: **"This group would be in two places from X to Y."** (X = arrival, Y = departure, short dates.)
- **Anywhere** a save would leave a group with two windows covering the same day (half-open days; move wizard, place wizard, retro-place, edit group window, back-entry), show the same non-blocking warning naming the other event. It is a warning, not a block, because back-entry legitimately passes through transient overlaps.
- **Unchanged:** the existing refusal of an earlier arrival when feed is transferred under pool writes (`move-wizard.js:548`, `pool.arrival`) stays as it is. The existing edit-group-window refusals of a join or leave after the event closed stay.

**Acceptance tests:**
1. Open the move wizard: arrival equals departure (date and time).
2. Set arrival one day before departure: the warning shows with the right dates; Save still succeeds; no warning when equal.
3. Retro-place or edit that overlaps another window of the same group: warning shows; Save still succeeds.
4. Pool-write transfer with an earlier arrival is still refused with the existing message.

### (d) Database guard plus stale-write refusal — gated on clean data

**Gate:** nothing in (d) is applied until a **SELECT-only audit** on prod shows **zero violations** of the guard rule below. The audit query and its expected result are part of PR C.

**Step 0: the 5 time-quirk rows from May.** These are zero-day under the day rule (no DMI effect) but trip time comparisons:
- **4 windows on the J3 - 4 event** (closed 2026-05-19 07:23; Cow-Calf Herd, Shenk Cows, Replacement Heifers, Shenk Yearling Heifers): joined 05-19 **09:50**, left 05-19 07:23. With both times set they fail `date_joined ≤ date_out` and joined ≤ left.
- **1 Mixed Calves window on the Corral event** (closed 2026-05-06, no time): joined 05-06 13:45, left 05-06 (no time). It passes under the date-only rule (no time on the close).

The rule compares dates only when a time is missing, so the Corral row passes as is. The J3 - 4 rows still fail. Design's recommended handling: normalise them to zero length at the close (`time_joined` = 07:23). **Any normalisation of these rows needs Tim's yes plus a backup first**, asked through Orchestrator when PR C is ready. If Tim says no, the guard cannot go live on its time-precise form, and Design will re-spec.

**The guard (trigger on `event_group_windows` insert and update):** check each written row against **its own event's current** `date_out`:
- when `date_out` is set: `date_joined ≤ date_out`, `date_left` is not NULL, and `date_left ≤ date_out` (instant compare when both times are set, dates only otherwise);
- when `date_out` is NULL: no bound.

It never looks at neighbouring events or other windows. **No rule on `events` itself:** client upserts arrive in any order, so an event's close can legitimately land before its windows' closes. The one legitimate write the guard refuses is a reopen whose window update lands before the event's `date_out` is cleared; the reopen must push the event first, and the OI-0184 auto-drain retry succeeds once it lands.

**Stale-write refusal (same migration):** the server refuses an update to an `event_group_windows` row whose incoming `updated_at` is older than the stored row's. The client sends refused writes (stale or guard) to the dead-letter queue and shows a clear error naming the group and event; it never drops them silently. **Clock-skew risk:** this relies on client `updated_at`, so a device whose clock runs behind could have current edits refused; the DLQ message must make that visible. A server-stamped `updated_at` plus a client version counter is an acceptable alternative; Build proposes, Design reviews.

**Migration:** the next number after 045 (**046** if still free when PR C is written; OI-0221's budget migration also targets "046 or later", so whichever lands first takes 046). File only in PR C; follow the 044/045 two-step (file held below the ceiling, then the ceiling bump and apply). It adds functions and triggers only, no columns. **CP-55/CP-56 impact: none** (no shape change); Build confirms in the PR. **Each prod apply needs Tim's yes plus a backup first.** There is no `updated_at` trigger on `event_group_windows` today.

**Future (not in this item):** closes, moves and reopens become one server-side transaction (RPC), which removes the ordering dependency entirely. The same stale-write risk exists on `events` and `event_paddock_windows`; extend the refusal there in a later item if Tim wants.

**Acceptance tests:**
1. Audit query returns 0 rows on a seeded clean dataset and returns each seeded violation (open on closed event, left after close, joined after close).
2. Trigger: insert or update that breaks R1 is refused; a valid close, clamp and zero-length write is accepted; a NULL time compares by date only.
3. Event row landing before its windows' closes: no refusal; windows then land and pass.
4. Reopen with the event first: accepted; window first: refused, then the DLQ retry succeeds.
5. Stale write: an update with an older `updated_at` than stored is refused and lands in the DLQ with a visible message; an equal or newer one is accepted.

---

## 4. Out of scope

- **The 27 older March–July overlaps** (same group on two events on the same day). **9** came from the Apr 14 v1 import; **18** came from arrival-before-departure moves (6 from May 8 and May 14 moves, 12 from the Jul 19 back-entry). None comes from bug 1 or bug 2. They stay as history unless Tim asks; the forecast fix's once-a-day counting masks them in DMI. (c) prevents new ones.
- **Class DMI rates** are a separate item.
- The cull-sheet orphan-split skip and the forecast masking are in `fix/forecast-orphan-windows`.
- **Prod cleanup of the two paddock windows that end after their event** (`1a5630f6`, `87a5d63a`; see §6). Any cleanup needs Tim's yes plus a backup, asked through Orchestrator; not in PR A.

## 5. Suggested slicing (Design reviews each)

| PR | Scope | Migration |
|---|---|---|
| **A** | (a) clamp, review list and reopen rules, plus (c) arrival default and overlap warnings (client) | none |
| **B** | (b) per-row sync ordering | none |
| **C** | (d) Step 0 audit, the 046-or-next migration file (guard + stale-write refusal), client DLQ handling for refused writes | yes; each prod apply needs Tim's yes plus a backup |

A and B can go in either order; C goes last, after A and B are live and the audit is clean.

PR A also includes the 2026-11-17 addendum (§6): clamp closed paddock windows that outlive a backdated close, in the same batch as the group-window clamp, plus the added acceptance tests.

## OPEN_ITEMS changes

- OI-0226 added (APPROVED, Tim 2026-11-17 11:01 AM ET via Orchestrator), sequenced after `fix/forecast-orphan-windows`. Build flips it per PR (A, B, C) and closes it when PR C's migration is applied and verified.
- 2026-11-17 addendum (Design, found in PR #75 review): slice (a) extends to paddock windows in PR A; OI-0226 entry in `OPEN_ITEMS.md` points here. Reports 'DMI by group' over-count is marked open under this item.

---

## 6. Addendum — 2026-11-17 (Design, found in PR #75 review)

Found while reviewing OI-0226 PR A ([PR #75](https://git.sarnford.com/Homelab/GTHO-v2/pulls/75)) at `37d7b00a` on main `803a822a`. This extends the already-approved spec. It is not a new Tim product decision.

### 6.1 Extend slice (a) to paddock windows, in PR A, same batch as the group-window clamp

Today both main and PR A only close or pre-flight **open** paddock windows on a backdated event close:

- `src/features/events/close.js:261` on PR #75 `37d7b00a` (the same filter is `close.js:243` on main `803a822a`) only closes paddock windows with no `dateClosed`.
- `src/features/events/window-close-guard.js:95` on both refs only checks those open windows (the `!w.dateClosed` filter is at `:94`).

On a backdated event close at instant C, in the **same write batch** as the group-window clamp:

| paddock window state vs C | action |
|---|---|
| **closed**, opened at or before C, closes after C | clamp `date_closed`/`time_closed` to C |
| opened after C | keep the existing date-conflict dialog (not clamped silently) |
| **open** | close at C, as today |

**Required test:** replay of the prod sequence: a paddock window is closed at 12:01 on Nov 17, then its event is closed back to Nov 16 12:02 at 12:03; the paddock window must end at the event close.

**Evidence (prod, 8-character prefixes):** 2 of 150 paddock windows currently end after their event:

- `1a5630f6` (E - 3) on event `eeb2febe` today (2026-11-17);
- `87a5d63a` (J2, Jul 4 to Jul 6 on an event closed Jul 5 09:00).

**Out of scope:** prod cleanup of those two rows. Any cleanup needs Tim's yes plus a backup, asked through Orchestrator.

### 6.2 PR A acceptance additions

1. A `pool.arrival` earlier-arrival refusal test (`move-wizard.js:620` on PR #75 `37d7b00a`; the same refusal is `move-wizard.js:548` on main `803a822a`, already required by §3 (c) test 4). The existing refusal stays unchanged.
2. A time-aware reopen test: a window left on the old close **date** at an **earlier time** than the close must not reopen. (§3 (a) already requires an exact instant match; today's `reopen-event.js:64` still matches on the date only.)

### 6.3 Open: reports 'DMI by group' still sums closed-event windows

`src/features/reports/index.js` ~L192–222 (same on main `803a822a` and PR #75 `37d7b00a`) builds 'DMI by group' by walking **all events** and **all** of their group windows, including windows on closed events. That over-counts the same way the pre-PR-#72 forecast did. Handle this under OI-0226, likely in PR A or as a small follow-up. **Open.**

---

## 7. Design acceptance of PR B's approach (2026-11-18)

PR B merged as [#78](https://git.sarnford.com/Homelab/GTHO-v2/pulls/78) at `7bf29a9d` after four Design review rounds. This is a Design call inside the approved spec, not a new Tim product decision.

- **Where the ordering lives.** §3 (b) said the one-tap fix "must not run as a separate unawaited push outside the move's durable write". Design accepted ordering in the sync adapter (`src/data/custom-sync.js`) instead: the fix and the close stay separate store writes, and the per-row gate sends them to the server in the order they were made, whether or not `poolWritesEnabled()` is on and in review mode.
- **Chain-only per-row ordering.** Of the two mechanisms in (b), PR B uses the chain. Every version of a row (table + id) is sent, in order, through that row's gate; nothing is coalesced. Writes to different rows still go in parallel (acceptance 3). A payload older than the newest one already sent for the row is dropped. The dead-letter drain and manual retry go through the same gate; a success clears that row's older dead letters and prunes strictly older queued saves, and retry keeps the newest letter per row. Online deletes go through the gate and leave an in-memory tombstone, so an older save can't bring the row back.
- **Write-order fallback.** Rows on the four tables with no `updated_at` (`event_feed_check_items`, `batch_moves`, `batch_adjustments`, `todo_assignments`) are ordered by local write order instead. One shared monotonic clock in `src/data/write-order.js` stamps both the sync queue and durable writes: `nextWriteOrder()` = max(now, last + 1), never steps back, and seeds from the persisted queue and dead letters after a reload.
- **Request timeout.** Every remote sync request has a 15 s timeout (`SYNC_REQUEST_TIMEOUT_MS`). A timed-out request is aborted and counts as a failure, so the normal retry and dead-letter path runs and a hung request can't hold its row's chain.
- **Known limit N6.** A dead letter on a table with no `updated_at`, queued before this upgrade, whose correction already landed under the old sync code, replays once on the first drain: it has no write order to compare against, and the client can't fix that. PR C (the DB guard and stale-write refusal, §3 (d)) is the backstop and is still to come.
