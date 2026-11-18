# OI-0230 — Sync durability: silent save loss and the 23 Jun Resync revert

**Date:** 2026-11-18 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **APPROVED (Tim, 2026-11-18 1:00 PM ET, via Orchestrator):** "Yes, have Design write the sync durability OI and brief, and start Build on queue-first, 0-row failure and the Resync fix". Resync design confirmed (Tim, 2026-11-18 1:10 PM ET, via Orchestrator): "Ok on the sync fix". PR 1 = A + B + D (§4). Docs only in this commit; no code, no SQL, no data change.
**Scope limits:** docs and code only. No DB change, migration or RLS work without Tim's yes plus a backup. PR 1 goes through Git Bridge with Tim's merge approval; Design reviews.
**PR 1: MERGED — PR #82, `d22e004` (2026-11-18).** Tim approved merge and publish at 3:56–3:57 PM ET, via Orchestrator. As-built below verified against `git show d22e004:<path>` (implementation commits `0f7176b`, `cb54028`); this doc does not assert a deployment/build stamp. Old devices must update before relying on this behaviour. No DB change in PR 1.
**Base:** Forgejo `main` `b4cb9335` (PR #80). Every file:line below was read on `b4cb9335` with `git show`. Diagnosis was SELECT-only on prod.
**Related:** OI-0231 (docs map and PR docs rule; this item's base-doc fixes are its first cleanup), OI-0226 (PR B #78 per-row ordering is the base this builds on; **PR C**, the DB guard and stale-write refusal, is the server backstop), OI-0184 (dead-letter queue, auto-drain, red indicator), OI-0049 / OI-0050 (where "Resync to server" came from), OI-0054 (insert vs update vs upsert), OI-0141 (sync indicator), OI-0214 (FA-01–FA-11 form fixes, never verified through sync), the confirmed-bred report (Tim, 2026-11-18 12:36 PM ET).
**Working files (Design, not in the repo):** `SAVE-PATH-AUDIT.md` (findings F1–F15), `CONFIRMED-BRED-INVESTIGATION.md` (R1–R3), `CONFIRMED-BRED-RECOVERY.md` (device export steps; written 2026-11-18, Orchestrator holds it), `PR-SYNC-DURABILITY-REVIEW.md` (Design's PR 1 review, 2026-11-18 2:15 PM ET). §7 summarises what Tim still needs to answer.
**Base docs (OI-0231):** Design's docs-only follow-up now records PR #82 as-built across ARCH, INFRA, UX, DS, SCHEMA and DOCS_MAP. Sections 1–2 remain the historical diagnosis on the original base; §4 is the merged behaviour, §5 the acceptance plan (not a claim of production E2E execution).

## 1. Background

### 1.1 What Tim saw
Tim recorded preg checks with Edit Animal "Confirmed bred" (he believes early spring, Safari on his Mac). Prod has `animals.confirmed_bred = true` on **0 of 97** animals, and every backup since Nov 11 shows the same. The form and mapping are correct end to end (`src/features/animals/index.js:1850`, `:2058`, `:2088`; `src/entities/animal.js:19`, `:96`, `:127`). The marks were lost after Save, in sync.

### 1.2 What prod shows
- **No cow row has been physically written since 23 Jun 2026** (Postgres `xmin` on `animals`). Any mark made after 23 Jun never reached the server; if it survives, it is in a device's browser storage.
- **23 Jun 2026, 4:27:48 PM and 4:28:54 PM ET: Settings → "Resync to server" pressed twice** from one browser tab (log session `768b6e3d`) open since 6 May, on stale build `b2026-05-08.1052-532aa21`, whose pulls had been failing. Each press re-sent its whole local copy (`pushAllToSupabase complete {queued: 1148}`) as full-row upserts with the copy's **own old `updated_at`**. Every row that existed then was rewritten with a copy from about 19 May.
- **About 980 rows still carry that version** (916 in 11 main tables, 63 reference rows): `animals` 86, `animal_group_memberships` 102, `groups` 8, `events` 41, `event_group_windows` 150, `event_paddock_windows` 67, `event_feed_entries` 15, `event_feed_checks`/`_items` 76/41, `animal_weight_records` 86, `animal_calving_records` 27, `paddock_observations` 217. What was lost is any edit to an existing row made on **another device** between about 19 May and 23 Jun. Evidence suggests little else was active then (no other-device creates in the window), so real losses are probably few and concentrated in Edit Animal fields: confirmed bred, weaned, sires, notes.
- OI-0184's dead-letter surfacing (`819b329`) was committed the same day at 7:20 PM ET, after the Resync; the stale tab ran sync code from before it.
- Fingerprints that fit lost or never-entered data: `confirmed_bred` all false; `weaned` never true and `weaned_date` always null; `sire_*` always null on animals and calving records; zero rows in breeding, heat, BCS, treatment and animal-note tables. Tim is "Not sure" whether he entered any of these in v2 (§3 decision 5).

### 1.3 Where "Resync to server" came from
Added 14 Apr 2026 in `2daa3e75` (OI-0050) as a **one-time onboarding recovery** for records created locally before sync worked (`push-all.js:5-7`). It never became safe for general use:
- `pushAllToSupabase` (`src/data/push-all.js:99-128`) calls `adapter.push(table, toSb(record))` for **every** local record (`:115`, default op `upsert`), **not awaited**, then `flush()` (`:124`). There is no read of the server's `updated_at`, so an older local copy overwrites a newer server row and moves `updated_at` backwards.
- The Settings button (`src/features/settings/index.js:405-419`) has **no confirm step**, and shows "Synced {count} records" (`settings.resyncDone`) whatever happened to the sends.
- It does **not** call `retryDeadLetters()`. The comment at `src/data/custom-sync.js:696` ("for 'Push All' / explicit `retryDeadLetters()`") is wrong; **Build fixes that comment in PR 1.**
- Last-write-wins exists only on **pull** (`mergeRemote`, `src/data/store.js:596-625`, `remoteTime >= localTime` at `:612`). Nothing on the push path or the server compares stamps across devices; #78's newest-sent guard is per tab and in memory (`custom-sync.js:199-208`).

## 2. Root causes (audit S1–S3, re-verified on `b4cb9335`)

S1 = can silently lose or revert saved data now; S2 = hides loss or makes it likely; S3 = narrower or latent.

| # | Sev | Finding | Evidence | PR |
|---|---|---|---|---|
| F1 | S1 | "Resync to server" blindly re-pushes the whole local copy as full rows with its old stamps (§1.3). Caused the 23 Jun revert. | `push-all.js:99-128`; `settings/index.js:405-419` | **D** |
| F2 | S1 | **Online saves live only in memory until sent.** `persistMutation` calls `syncAdapter.push()` unawaited (`store.js:106-110`). Online, `push` goes straight to `_enqueueRowPush` → `_pushToRemote` and never calls `_enqueue` (`custom-sync.js:237-247`); 5 attempts × up to 15 s plus 1+2+4+8 s backoff ≈ 90 s (`:536-569`). A reload, tab close, "Update now", crash or sleep in that window loses the write from sync, and the local row's newer `updatedAt` stops pulls correcting it. Online **deletes** are not queued either: a failed online delete just returns an error (`:292-315`). | as cited | **A** |
| F3 | S1 | **An update that matches 0 rows counts as success.** `_sendWrite` sends `.update(record).eq('id', id)` with no row check (`custom-sync.js:518-526`); no error → `success` → `_markSent` prunes queue and dead letters (`:550-552`, `:489`). RLS filters the row when there's no live session (anon key) or no membership, or the row doesn't exist. No session check before sending. | as cited; prod `*_update USING (operation_id IN (members of auth.uid()))` | **B** |
| F4 | S2 | Failed pulls are reported as success: `pullAll` logs and returns `[]` (`custom-sync.js:276-284`), so `_doPullAllRemote` counts no error and stamps `gtho_last_pulled_at` (`pull-remote.js:108-126`); header shows green "Last refresh". Pulls are not paginated (1,000-row cap; `submission_field_states` has 1,935). | as cited | C (later) |
| F5 | S1 | Full-row last-write-wins with no server guard: `store.update` merges into the local row and sends every column (`store.js:243`, `:261`); a stale device that edits one field writes old values into all others. | as cited | E + OI-0226 PR C (later) |
| F6 | S2 | Stale builds run for weeks ("Later" hides the update bar for the tab; `src/pwa/update.js:69-76`). | as cited | F — **declined** |
| F7 | S2 | Dead letters are hard to see and easy to lose: auto-drain stops after 3 (`custom-sync.js:19`, `:698-746`); logout warns only on the queue (`src/ui/header.js:256-278`); a delete that fails 5 times in `flush` is dropped with no dead letter (`custom-sync.js:629-636`). | as cited | G (later) |
| F8 | S2 | No server trace of failing devices: 200-entry local log buffer, uploaded only after a successful pull. | `src/utils/logger.js`, `pull-remote.js:125-132` | H (later) |
| F9 | S2 | **Durable writes are journaled but never pushed:** `runDurableWrite` commits to `_sync_queue` (`store.js:66-92`, `local-storage.js:69-82`) and waits for the next `online`, tab-visible or boot flush (`main.js:398-416`) or a red-dot tap (`header.js:352-354`). Callers: group weights (`animals/index.js:1335`), amendments (`amendments/entry.js:421`), feed check (`feed/check.js:296`), manual feed (`events/feed-entry-inline-form.js:179`), move feed out (`events/move-feed-out.js:303`), calving (`health/calving.js:212`), pool forms and ledger (`feed/pool-forms.js:65`, `feed/pool-ledger.js:102`, `:146`), and close, move, sub-move and delivery when pool writes are on (`events/close.js:362`, `events/move-wizard.js:968`, `events/submove.js:388`, `feed/delivery.js:608`). The assistant paths already flush right after their local apply (`assistant/client/conversation.js:97-98`, `wiring.js:22`). | as cited | **A** |
| F10 | S3 | `writeQueue` / `writeDeadLetters` swallow storage errors (`custom-sync.js:45-51`, `:76-82`), so a save can change the local row while its queue entry is silently lost. | as cited | **A** (the queue write half) + H |
| F11 | S3 | Pull pagination (see F4). | | C |
| F12 | S3 | Re-login builds a second `CustomSync` while the `online`/visibility listeners keep the first (`main.js:242-243` vs `:398-416`). | as cited | G (PR 1 must not make it worse, §4) |
| F13 | S2 | `INSERT … WITH CHECK (true)` for role `public` on 49 farm tables; `anon` has INSERT/UPDATE grants. | prod `pg_policies` | I (later) |
| F14 | S3 | `todos.created_by`, `batch_adjustments.adjusted_by` never set. | `entities/todo.js`, `entities/batch-adjustment.js` | J (later) |
| F15 | S3 | `mergeRemote` lets remote win on equal or missing stamps, ignores pending queue entries, and never removes rows deleted on the server (no tombstones). | `store.js:596-625` | C/E (later) |

**One more defect PR 1 must fix (found for this brief):** at the end of a flush the queue is rewritten as `[...remaining, ...newlyJournalled]`, and `newlyJournalled` keeps only entries with a `durable_key` (`custom-sync.js:643-649`). A **non-durable** entry enqueued while a flush is awaiting the network (today: an offline save mid-flush; after A: every save) is **overwritten and lost**.

## 3. Tim's decisions

Tim, 2026-11-18 1:00 PM ET, via Orchestrator:

1. **Yes:** Design writes the sync durability OI (OI-0230) and this brief; **start Build on PR 1: queue-first (A), 0-row update is a failure (B) and the Resync fix (D).**
2. **Resync stays:** keep the "Resync to server" button, but it **only pushes rows newer than the server's `updated_at` and never replays stale full rows.**
   - **Resync design confirmed (Tim, 2026-11-18 1:10 PM ET, via Orchestrator: "Ok on the sync fix"):** send only this device's unconfirmed work (pending queue, dead letters, rows changed since the last confirmed server ack), only if newer than the server copy, with a confirm sheet and real sent / failed results. The full-store push is removed. §4 D.
3. **Declined:** no minimum-build enforcement (F) and **no logout block** (G no longer refuses logout or farm switch).
4. **Devices:** a phone, a Mac and Omarchy.
5. **Ever entered weaning, sires, heat, BCS or treatments in v2:** "Not sure".

Earlier answers that shape recovery (12:56 PM ET, via Orchestrator): preg checks "early spring"; browser "Safari"; a backup from before 23 Jun "Not sure".

Tim, 2026-11-18 1:15 PM ET, via Orchestrator (recovery):

6. **Devices in detail:** an **iPhone Home Screen app** and a **Mac Dock app** (each keeps its own storage, separate from Safari tabs and not subject to Safari's 7-day rule; §6 Phase 1). The Linux Chrome device seen in the logs on Nov 9–10 was **Tim on Omarchy**.
7. **Exports:** Tim will do the Finder searches and the offline exports himself, per the recovery report §7A / §7B (`CONFIRMED-BRED-RECOVERY.md`, Design working file).
8. **Paper or vet records** for the preg checks: "not sure".
9. **v1:** leave it alone. The v1 Supabase is not opened; no v1 data is used for recovery.

Tim, 2026-11-18 1:35 PM ET, via Orchestrator:

10. **Docs rule (OI-0231):** "Yes, keep all three options" (update the mapped docs, link the Design docs change, or `Docs unaffected because …`).
11. **Recovery method:** "I'll re-enter them by hand." **No DB update** for the confirmed-bred marks (§6 Phase 3, preferred route).
12. **"Not sure" fields:** if the exports show no weaning, sire, heat, BCS or treatment entries, "Yes, never entered": they are treated as never entered in v2, not as lost.
13. **Confirmed-bred date:** "Yes, add a confirmed date." Specced as **OI-0232** ([brief](CONFIRMED_BRED_DATE_2026-11-18.md)); the migration is file only and needs Tim's yes plus a backup to apply.
14. **Server guards:** "Yes, spec both": **E** (the stale-write guard on all farm tables, = OI-0226 PR C widened) and **I** (tighter insert RLS, **OI-0233**). Spec: [SYNC_SERVER_GUARDS_2026-11-18.md](SYNC_SERVER_GUARDS_2026-11-18.md). Each apply needs Tim's yes plus a backup.

Numbering: **OI-0230**, because OI-0229 is reserved by the unpushed implied-pasture docs branch (`445a025b`).

## 4. PR 1 scope: A + B + D

PR 1 changes client sync only: `src/data/custom-sync.js`, `src/data/store.js`, `src/data/local-storage.js`, `src/data/push-all.js`, `src/features/settings/index.js`, `src/main.js` and `src/ui/header.js` as needed, i18n, tests. **No migration, no RLS, no data change.** As-built at `d22e004`; the implementation also adds `src/data/unacked.js`.

**Must stay intact:** #78's per-row gate and in-order chain (every version goes out in order, nothing coalesced, different rows in parallel), the newest-sent guard and in-memory delete tombstones, the shared write-order clock (`write-order.js:56-60`, seeded from the persisted queue and dead letters), the 15 s request timeout, `_effectiveOp`'s update → upsert when the row's create is still queued or dead-lettered (`custom-sync.js:439-460`), OI-0184's dead-letter rules (5 sends then dead-letter; auto-drain at most 3 per letter; red indicator; per-row newest retry), durable-write journaling and receipts (`local-storage.js:50-82`), and the unit-table guards.

### A. Queue-first (F2, F9, F10 queue half)

1. **Every save is written to the persisted queue (`localStorage` `_sync_queue`) before any network send**: inserts, updates, upserts and **deletes**, from `persistMutation`, `setUnitSystem`/user preferences (`store.js:323`, `:401`), `pushBatch`, Resync (D) sends and durable writes. Online and offline take the same path: enqueue, then flush. No save exists only in memory.
2. **The enqueue fails loudly.** If the queue write throws (quota), the save fails visibly like `saveToStorage` does (`local-storage.js:11-14`) and the local row is not left changed with no queue entry. (`writeQueue`'s silent catch must not apply to the enqueue of a new save. Dead-letter write errors stay with H.)
3. **A queue entry leaves the persisted queue only when** it was sent successfully (B's definition), it was moved to the dead-letter queue, or #78's rules drop it as superseded (older than a sent version, or deleted). Remove a sent entry **promptly after its own success**, not only when the whole flush ends, so a reload mid-flush doesn't re-send what already landed.
4. **Re-sending after a reload is harmless.** A queue entry whose write already landed (the tab died before pruning) may be sent again. A primary-key duplicate (`23505`, `_pkey` / `(id)=`) on a re-sent `insert` is treated as success (`classifyWrite`); onboarding remains insert-only. Durable creates remain upserts. Per-tab ordering guards remain, but this is not a server stale-write guarantee.
5. **Nothing enqueued during a flush is lost.** Fix the end-of-flush rewrite (`custom-sync.js:643-649`): every entry added while a flush runs (durable or not) survives, and is sent by that flush or by a follow-up flush started **as soon as the current one ends** (not at the next trigger).
6. **Prompt flush.** After every save, and after every durable-write commit (`store.js:83-87`), start a flush when online without waiting for `online`, tab-visible or a tap. Required for **all** durable-write callers listed in F9 (group weights, amendments, feed checks, manual feed, move feed out, calving, pool writes, and close, move, sub-move and delivery under pool writes). Do it once, centrally (in the store or the adapter), not in each feature. `scheduleFlush()` batches to a microtask at the end of the current task. The assistant paths keep their own `flush()` calls.
7. **Survives reload, tab close, PWA "Update now" and sleep.** Whatever was enqueued is sent on the next start by the existing boot flush (`main.js:415`) or the next trigger. No extra unload handler is required.
8. **Ordering and the clock.** Queue order is the write order. Sending from the queue goes through #78's row gates, so per-row order holds across a reload. Every new entry takes `enqueued_at` from `nextWriteOrder()`. The four tables with no `updated_at` (`event_feed_check_items`, `batch_moves`, `batch_adjustments`, `todo_assignments`) keep their write-order fallback.
9. **Dead-letter rules unchanged:** a write still dead-letters after 5 failed sends with its `origin_at` and error. A dead-lettered entry leaves the queue; it is not also counted as queued.
10. Any new flush trigger added in PR 1 (e.g. the auth resume in B) uses the current adapter (`getSyncAdapter()`), not a captured instance, so it can't widen F12.

### B. A 0-row update is a failure; check the session first (F3)

1. **Session check before sending.** Before a flush sends anything (and before Resync's server read, D3), confirm there is a signed-in session with a usable access token (`supabase.auth.getSession()`, which refreshes an expired token when it can). `hasSession()` is checked once per flush pass, not before every write; it requires an access token and rejects an expired `expires_at`. a request that comes back with an auth error is handled as in 2.
2. **No session, or an expired or invalid JWT** (no session before sending, or the server answers with an auth/JWT error such as "JWT expired"): **keep the write queued.** Don't send it (or don't count that answer as an attempt), don't increment `attempts`, and **never dead-letter for an auth reason.** The header shows the exact string "Signed out · {count} changes waiting" and grey `.sync-off` dot; Settings shows "Signed out". A non-empty dead-letter queue still takes precedence (red). Auth matching is narrowed to HTTP 401, PGRST301/302/303 and expired/invalid/malformed JWT/token messages, not every permission or database error. When the session comes back (`SIGNED_IN` or `TOKEN_REFRESHED` from `onAuthStateChange`, `features/auth/session.js:182-195`, or the next flush trigger), flush.
3. **Detecting 0 rows.** `_sendWrite` uses `.update(record).eq('id', record.id).select('id')`; empty or non-array returned `data` is a 0-row failure, including the single-shot dead-letter path. Inserts and upserts retain their error-based success handling.
4. **0 rows with a valid session** (RLS blocked it, or the row isn't on the server: deleted by another device, or its create never landed and isn't queued): **move it to the dead-letter queue at once** (retrying won't help) with a clear reason, "Not saved: the server has no row this device can change (0 rows updated)", and machine-readable reason `zero_rows`. It is **not** marked sent: no `_markSent`, no success-pruning of other versions, no newest-sent stamp; the failed entry itself leaves the queue for the dead-letter queue. It shows in the red indicator count. **Never drop it silently.**
5. **A 0-row letter replays only as an `update`, never as an upsert**, in auto-drain and in manual retry (queued as `update` with `update_only`). Otherwise a retry would recreate a row another device deleted. Other letters keep today's upsert replay.
6. **Deletes:** a delete that matches 0 rows with a valid session counts as success (the row is gone either way); no separate 0-row count is needed. (Design call; F7's dropped failed deletes stay with G.)
7. A successful update (≥ 1 row) behaves exactly as today: `_markSent`, prune older queued saves and older letters.

### D. "Resync to server": send only this device's unconfirmed work (F1)

**Decided (Tim, 2026-11-18 1:00 PM ET and 1:10 PM ET, via Orchestrator):** keep the button; **remove the full-store push**; the button sends **only this device's unconfirmed work**, each item **only if it is newer than the server copy**, with a **confirm sheet** before and a **real, awaited sent / skipped / failed result** after. The button keeps its place in Settings → Sync & Data and its label. `pushAllToSupabase`'s walk of every local record (`push-all.js:99-128`) is deleted, not guarded.

1. **The unconfirmed set** (the only candidates; nothing else on the device is ever sent by Resync):
   - every entry in the pending queue (`_sync_queue`);
   - every dead letter (`_dead_letter_queue`), including auto-drain-exhausted ones;
   - every row **changed locally since its last confirmed server ack**.
2. **Ack marker (as-built, `_sync_unacked`).** Before PR 1 no persisted server ack existed per row: `gtho_v2_write_receipts` are durable-write **local-save** receipts (`savedRecordId`, `localSavedAt`, `syncQueuedAt`; `local-storage.js:59-62`, and `store.js:86` says "Never infer server acknowledgement"), `gtho_v2_write_journal` is transient crash recovery (`local-storage.js:46-64`), and #78's newest-sent maps are per tab and in memory (`custom-sync.js:199-208`). PR 1 adds `unacked.js`, a **persisted per-row unacked marker**: when a save is enqueued (A), mark (table, id) with that version (`updated_at`, or write order on the four tables with no `updated_at`); when a send for the row is confirmed (B's definition of success), clear the mark if the acked version is the same or newer. It must survive reload, be written in the same step as the queue entry (A2), and never be cleared by a 0-row result, a dead letter or a superseded drop. Rows with a mark and no queue entry or letter (e.g. a queue entry lost to the old end-of-flush rewrite or a swallowed storage error) are exactly what Resync exists to catch.
   - **No back-fill (Design call):** the marker starts empty when PR 1 ships. Edits stranded **before** PR 1 have no mark and are not sent by Resync; they are recovered through §6 (export, diff, re-enter). Guessing them from "local newer than server" would bring back the full-store compare Tim's decision removed.
3. **Preconditions.** Online and a valid session (B1), else show why and do nothing. Resync plans under the adapter's flush lock, then releases it before showing the confirm sheet. At Send it takes the lock again and re-plans from fresh queue, dead letters, marks and server stamps. If any count (`send`, `skip`, `existing`, `gone`, `cantCompare`) changed, it shows the fresh sheet again instead of sending. Otherwise it applies the fresh plan under the same lock. Normal sync is not blocked while a person considers the sheet.
4. **Server read.** For the (table, id) pairs in the unconfirmed set only, read `id` and `updated_at` (`id` only on the four tables with no `updated_at`), batched per table. If any read fails, **abort before sending anything** and name the table.
5. **Classify each item** (the newest version per row; older versions of the same row are superseded by it as in #78):
   - **send (newer):** the row exists on the server and the item's `updated_at` is **strictly later** than the server's (both parse).
   - **skip (server same or newer):** server stamp equal or later. Never sent.
   - **send (create):** the row is **missing** on the server and the item is a create (`insert` / `upsert` queue entry, an insert-shaped letter, or a marked row whose create was never acked).
   - **don't send (gone):** the row is missing on the server and the item is an **update** (including B's `zero_rows` letters): the row was deleted elsewhere or is out of reach. It is never turned into a create. It stays (or goes) in the dead letters with its reason.
   - **can't compare:** a stamp is missing or unparseable. Not sent. **Also (clarified 2026-11-18, PR 1 review blocker 3):** a dead letter with **no recorded operation** (every letter written before PR 1) and no insert shape, whose row is missing on the server, is *can't compare*, not *gone*: it is left exactly as it is (never rewritten into a `zero_rows` / update-only letter), counted and listed. An unknown operation is not an update.
   - **The four tables with no `updated_at`** (`event_feed_check_items`, `batch_moves`, `batch_adjustments`, `todo_assignments`): send **only if missing on the server** (as a create); an existing server row is **never overwritten**.
   - **Never resend a row only because it is missing on the server.** A missing row is sent only when it is in the unconfirmed set as a create. Deletes are hard deletes with no server tombstone (`remove()` → `delete`, `store.js:273-284`; `.delete().eq('id', id)`, `custom-sync.js:308`; the only tombstone is in memory per tab, `:202-204`; `mergeRemote` never drops a local row the server no longer has, `store.js:596-625`), so anything wider would resurrect deletes.
6. **Confirm sheet (as-built; nothing is sent by Resync without confirmation).** Title "Resync to server". Exact plural strings from `src/i18n/locales/en.json` (the app substitutes `{count}`):
   - "{count} unsynced changes on this device are newer than the server and will be sent."
   - "{count} are already the same or newer on the server and will be skipped."
   - "{count} are already on the server and will be skipped." (only when `existing > 0`: existing rows on the four no-stamp tables, not a timestamp comparison)
   - "{count} were deleted on the server or can't be reached and won't be sent." (if any)
   - "{count} couldn't be compared and won't be sent." (if any)
   - Singular strings at count 1: "{count} unsynced change on this device is newer than the server and will be sent.", "{count} is already the same or newer on the server and will be skipped.", "{count} is already on the server and will be skipped.", "{count} was deleted on the server or can't be reached and won't be sent.", "{count} couldn't be compared and won't be sent."
   - Buttons "Cancel" and "Send {count} changes" (singular "Send {count} change"); with zero to send, only "OK". Cancel, OK, leaving the screen or replacing/removing the sheet counts as Cancel: no Resync send or skip/drop is applied. Normal sync may still run while the sheet is open.
7. **Sending.** Stored payloads keep their **own** `updated_at`. Existing rows send updates; a never-acked create missing on the server is sent as a create even if its newest payload is an update (converted to `upsert`; insert-only `operations` keeps its shape). Each row counts once. Entries go through the queue and row gates. `entrySigs` / `letterSigs` let skip/gone remove only the versions actually compared, never a new save made after planning. The optional `.lt('updated_at')` conditional update is **not built**: deferred to E / OI-0226 PR C. Replanning at Send shrinks but does not eliminate the read-to-write race.
8. **Result (awaited).** Exact main string: "Sent {sent}. Skipped {skipped}. Failed {failed}." Additional nonzero lines: "Not sent (deleted on the server or out of reach): {count}.", "Couldn't compare: {count}.", "Waiting for sign-in: {count}." Auth waits remain queued, not failed. Skips (including `existing`) leave only their compared queue/letter versions and enter `_resync_skipped`; newer marks survive. Exact button: "Export skipped" (JSON kind `gtho-resync-skipped`), plus "OK". Log a `resync` info count line with no ids, then normal pull. Progress strings: "Checking the server…", "Sending…". Refusals: "You're offline. Resync needs a connection.", "You're signed out. Sign in, then Resync.", "Couldn't read {table} from the server. Nothing was sent.", "Sync isn't available right now." Catch message: "Resync didn't finish. Nothing more will be sent."
9. **Not airtight.** These are **client-side** checks. A stale tab, a second tab, or a device clock that runs fast or slow can still make an older edit look newer (or a newer one look older), and the read-to-write gap is a race. The real backstop is **OI-0226 PR C's server stale-write guard** (refuse an update older than the stored `updated_at`), a **DB change that needs Tim's yes plus a backup**; E extends it to all farm tables.
10. **Known limit K1 (not closed by PR #82):** a create reaches the server but its reply is lost; another device deletes it; this device still has an unconfirmed-create mark and Resync recreates it. PR C owns closure. Its server-side mechanism is still a Design gate (server-guards brief, final section): an update-only stale guard cannot see an absent row. No claim that K1 is closed today.
11. **Comment corrected:** dead-letter auto-drain documentation now says Resync compares letters rather than calling `retryDeadLetters()`.

**Normal sync is unchanged by D.** The ordinary flush still sends queue entries without a server compare (as today). An old offline queue on a device that has been away for months will still go out on reconnect; that is why §6 Phase 0 says to export before going online, and why PR C matters.

### Out of scope for PR 1 (later PRs)

| Slice | What | Gate |
|---|---|---|
| **C** | Real pull errors (`pullAll` returns or throws errors; stamp last-pulled only when every table succeeds), pagination with `.range()`, an amber "Couldn't refresh since hh:mm" state (F4, F11). | none (client) |
| **E** | Changed-fields-only updates (send the changed columns plus `updated_at`, from a base copy per edit) **plus** OI-0226 PR C's DB stale-write refusal, extended to all farm tables (F5). | DB part needs Tim's yes plus a backup |
| **G** | A **sync problems sheet** listing each queued and dead-lettered write (table, record label, error, age) with Retry and Export; dead-letter failed deletes; one `CustomSync` per page (F7, F12). **No logout block** (declined). | none |
| **H** | Telemetry: a compact sync-failure counter with build and a device id; `writeDeadLetters` failures surface (F8, F10). | none |
| **I** | RLS tightening: membership `WITH CHECK` on INSERT for the 49 tables; revoke `anon` DML (F13). Separate security item. | Tim's yes plus a backup |
| **J** | The never-set columns: `todos.created_by`, `batch_adjustments.adjusted_by` from the session (F14). | none |
| **F** | Minimum supported build. | **Declined** (Tim, decision 3) |
| — | Logout / farm-switch block while changes are unsynced. | **Declined** (Tim, decision 3) |

Also later: an end-to-end save harness (real `CustomSync` against a real PostgREST + RLS stack, two devices, every form round-tripped), which would also close OI-0214's "never verified through sync" gap.

## 5. Acceptance tests for PR 1

Unit tests with a mock Supabase client unless noted. The existing suite stays green (Node 20 and 26, PGlite, lint 0 errors, both builds), including `sync-row-ordering`, `sync-dead-letter`, `sync-indicator`, `pull-remote*`, `assistant/durable-*` and `unit-reference-flows`.

**A — queue-first**
- A1. Online Edit Animal save; the mock request never resolves; drop the adapter and reload (new `CustomSync`, clock reset) within 100 ms. `_sync_queue` holds the entry; the boot flush sends it; the server row has the new value.
- A2. Same for tab close during backoff (after a first failed attempt) and for "Update now" mid-send.
- A3. The queue write throws (quota): the save fails visibly; the local row and state are unchanged.
- A4. Each durable writer (group weights, amendment, feed check, calving, a pool transfer) reaches the server **with no `online`, visibility or tap event**, within the debounce plus one send.
- A5. Saves made while a flush is awaiting the network, one online and one offline (non-durable, no `durable_key`), are still in the queue when that flush ends, and a follow-up flush sends them.
- A6. A create that landed but whose entry wasn't pruned (simulate a reload after success) is re-sent: no dead letter, server row unchanged.
- A7. #78 regression: WINDOW_INTEGRITY §3 (b) tests 1–4 pass; ten rapid updates to one row with random delays **and a reload after the fifth**: the server ends with the tenth value.
- A8. Write order: a no-`updated_at` table row saved twice, reload between: sent in order; the clock never steps back.
- A9. Online delete with a reload before the response: the row is deleted on the next start.
- A10. Offline save then reconnect: unchanged behaviour.

**B — 0 rows and auth**
- B1. No session: a flush makes **no** request; the entry stays queued with `attempts` unchanged; no dead letter; header shows signed-out with the count. After `SIGNED_IN` it's sent and pruned.
- B2. Expired JWT: the server answers with a JWT-expired error: queued, not dead-lettered, `attempts` unchanged; after `TOKEN_REFRESHED` sent.
- B3. RLS 0-row (valid session, row not visible to the user): dead-lettered at once with the `zero_rows` reason; not marked sent; older queued saves for the row **not** pruned; red count +1.
- B4. Update to an id deleted on the server: as B3; auto-drain and manual retry replay it as `update` only; the row is **never recreated**.
- B5. Update while the row's create is still queued: sent as upsert (`_effectiveOp`) and succeeds.
- B6. Normal 1-row update: marked sent, older queued saves pruned (as today).
- B7. The dead-letter drain (`_singlePush`) applies the same 0-row and auth rules.
- **Two devices (B8).** Device A deletes a group window; stale device B edits it and syncs: B's update dead-letters visibly; the server row stays deleted.
- **Two devices (B9).** Device B's session lapsed; Tim ticks Confirmed bred on B and saves; nothing is lost; after re-login on B it lands and device A sees it after a pull.

**D — Resync sends only unconfirmed work**
- D1. Mixed unconfirmed set: a queued update newer than the server, a queued update older than the server, a dead letter equal to the server, a marked row with no queue entry and newer than the server, a queued create missing on the server, and a `zero_rows` letter whose row is gone. The sheet shows N = 3, M = 2, G = 1; after **Send** exactly those 3 land; the older and equal ones don't change the server (values and `updated_at`); the gone row is **not** recreated.
- D2. **Rows outside the set are never sent:** a local row with no queue entry, no letter and no mark, newer than the server or missing on the server, is not read, counted or sent.
- D3. **The 23 Jun replay:** a stale copy from "19 May" with an empty queue, no letters and no marks: N = 0, nothing written.
- D4. Cancel writes nothing and leaves the queue, letters and marks as they were.
- D5. The four no-`updated_at` tables: a queued create missing on the server is sent; a queued change to an existing server row is never sent.
- D6. A failed server read (500) aborts with nothing sent. No session: Resync refuses; no read, no send.
- D7. Sent items keep their local `updated_at`.
- D8. The result is awaited: with one send failing (500 × 5) and one hitting 0 rows, the sheet shows "Sent X. Skipped M. Failed 2." and both are in the dead letters with reasons. An auth failure mid-run is reported as waiting for sign-in, not failed.
- D9. Skipped items leave the queue and letters and appear in the "skipped by Resync" export.
- D10. The ack marker: survives reload; is cleared only by a confirmed send of the same or a newer version; isn't cleared by a 0-row result, a dead letter or a superseded drop.
- D11. Resync twice in a row: the second shows N = 0.
- **Two devices (D12).** A ticks Confirmed bred and syncs. Stale B (no pull since) edits the same cow's notes with its clock behind, so B's row is stamped earlier than A's. B's Resync skips it and lists it under skipped; the server keeps `true`.
- **Two devices (D13).** Same, but B's edit is stamped later than A's: Resync sends it, and B's full row carries the stale `confirmed_bred = false`. This test **documents the known limit** (D9) that E and OI-0226 PR C close: assert it is reported as sent, not that it is safe.

## 6. Recovery plan (Phase 0 / 1 / 3)

Full device steps: `CONFIRMED-BRED-RECOVERY.md` (Design working file, written 2026-11-18; Orchestrator holds it; Tim follows its §7A / §7B himself, 1:15 PM ET). Key points:

**PR #82 is merged (`d22e004`); old devices must update before using its Resync.** Do not use Resync as a recovery tool: it cannot back-fill pre-PR-1 unacked marks and K1 / full-row and clock limits remain. Preserve old device storage before any reconnect / normal flush. Merge approval is not evidence that every device has updated.

**Phase 0: contain (now, no code).** On every device (Mac, Dock app, iPhone Safari and Home Screen app, Omarchy) until its copy is saved:
- **Do:** turn the device's network off **before** opening or focusing the app (the app flushes on start, on `online` and on tab-visible, `main.js:398-416`; queued entries are old full rows that could undo newer changes); use the same browser and profile as before; check both https://getthehayout.com and, if ever used, the old https://tim-getthehayout.github.io/GTHO-v2/ address (separate storage).
- **Don't:** press "Resync to server"; tap the red sync dot (it replays dead letters); clear site data, cookies or cache; log out; remove or reinstall the app or home-screen icon; use a private window or another profile; go back online with the app open before the file is saved.

**Phase 1: export and diff (read-only).**
- **Mac, Safari tab:** Safari → Settings → Advanced → "Show features for web developers"; Develop → Show Web Inspector → Storage → Local Storage → getthehayout.com; then Console: run the export snippet from the recovery doc (it skips the `sb-…-auth-token` login key; never copy or share that key). On Safari, `copy(…)` to the clipboard and pasting into a plain-text file is a fallback if the download doesn't start.
- **Mac, Safari 7-day rule:** Safari deletes a site's script-written storage after 7 days of Safari use with no visit to the site. If Tim opened the app in that Safari profile at least every 7 days since spring, the data is there; if not, it may be gone. A web app added to the Dock or Home Screen keeps its own separate storage and isn't subject to it. The export takes minutes, so do it anyway: an empty result is itself an answer.
- **Phone (iPhone):** iPhone Settings → Apps → Safari → Advanced → Web Inspector on; cable to the Mac, trust it; **Airplane Mode on (Wi-Fi off)** before opening the app. On the Mac: Safari → Develop → [iPhone name] → the page. A **Home Screen app** has its own storage separate from Safari tabs and shows under the iPhone by its app name while it's open; export **both** if both were used. Use the console `copy(…)` route, since a download would land on the phone.
- **Omarchy (Linux):** Omarchy ships Chromium (its web apps are Chromium app windows, likely on the same profile). Network off (Wi-Fi off or `nmcli networking off`), open the app in the usual browser, F12 → Application → Local storage → https://getthehayout.com; Console, type `allow pasting`, paste the snippet. In Firefox: F12 → Storage → Local Storage, same snippet.
- **Keys that matter:** `gtho_v2_<entity>` (local rows, e.g. `gtho_v2_animals` with `confirmedBred`, `updatedAt`), `_sync_queue`, `_dead_letter_queue`, `gtho_v2_write_journal`, `gtho_last_pulled_at`, `_log_buffer`, and the tab's `gtho_session_id` (first 8 characters tell us whether it is the 23 Jun tab `768b6e3d`).
- **Diff (Design, SELECT only):** for each table, match local rows to prod by `id`: local `updatedAt` later than prod `updated_at` = a stranded or reverted edit (list changed fields); local-only ids = never-synced creates or rows deleted elsewhere; list every queue and dead-letter entry. Also look for any pre-23-Jun backup file (`gtho-v2-backup__…json`) or v1 export. The v1 Supabase is off limits.

**Phase 3: recover.** Tim confirms the list per item. Then **re-enter in the app on a freshly updated, freshly pulled device (preferred)**, not a DB update (Tim, 1:35 PM ET via Orchestrator). **Never replay old full rows, never press Resync and never tap retry on old dead letters to recover.** If nothing survives, Tim re-enters from paper or vet records. Locked Q3 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator): wait until OI-0232's date field ships, then hand re-enter the marks with dates.

## 7. Open questions for Tim

Answered 2026-11-18 1:15 and 1:35 PM ET (recorded in §3, items 6–14): devices and Home Screen / Dock apps, who does the exports, old files and Finder searches (Tim, per recovery §7A/§7B), recovery method (by hand), the "not sure" fields (never entered if the exports show none), the confirmed-bred date (yes, OI-0232), the later DB items (spec E and I). Paper or vet records: "not sure" (no further question).

Still open:
1. **Exports timing.** When will the Mac Dock app, the Mac Safari tab (if used), the iPhone Home Screen app and Safari, and Omarchy be exported (network off first)? Design checks each file read-only when it arrives.

Answered Q1–Q6 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator): untick clears date; calving clears tick and date; wait for date field then hand re-enter; restore keeps backup timestamps; reject saves more than 10 minutes ahead with a fix-your-clock message; **OI-0233 first, then OI-0226 PR C**. See OI-0232 brief §8 and server-guards brief final section. Restore exemption mechanism and K1 closure remain Design gates, not unanswered Tim choices. Each migration apply needs Tim's explicit yes plus a verified backup; this docs change needs its own land yes.

## OPEN_ITEMS changes

- OI-0230 added: "Sync durability: silent save loss and the 23 Jun Resync revert". APPROVED (Tim, 2026-11-18 1:00 PM ET; Resync design confirmed 1:10 PM ET; via Orchestrator). PR 1 (A + B + D) handed to Build.
- OI-0231 added (docs map, PR docs rule, monthly drift check; Tim 1:09 PM ET via Orchestrator). This item's base-doc corrections are OI-0231's first cleanup. Linked to OI-0226 (PR C is the DB guard) and the confirmed-bred report. OI-0229 is reserved by the unpushed implied-pasture branch.
- 2026-11-18 follow-up (GTHO Design, docs only): Tim's 1:15 and 1:35 PM ET answers recorded (§3); §7 trimmed to what is still open; header line 8 corrected (Design flips the "(intended)" labels after merge); §4 D5 legacy-letter rule and D7 `.lt()` deferral recorded; §6 "don't press Resync until PR 1 lands" caution. New: OI-0232 (confirmed-bred date), OI-0233 (insert RLS, I); E recorded under OI-0226 PR C. PR 1 (`43003de4`) in review, CHANGES REQUESTED.

- 2026-11-18 as-built follow-up: PR #82 merged at `d22e004`; §4 verified against merged code, including round-2 counts, singular strings, Send replan, signatures and Cancel-on-navigation; K1 retained. Q1–Q6 locked via Orchestrator in their briefs.
