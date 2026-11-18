# Server guards: stale-write refusal (E, OI-0226 PR C) and insert RLS (I, OI-0233)

**Date:** 2026-11-18 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC ONLY (Tim, 2026-11-18 1:35 PM ET, via Orchestrator: "Yes, spec both").** Nothing here is applied. Each part's migration is **file only**; **each prod apply needs Tim's explicit yes plus a verified backup**, asked separately through Orchestrator.
**Base:** original audit on Forgejo `main` `3714d96b`; OI-0230 PR 1 is now merged as PR #82, `d22e004`. Client behaviour re-read at that SHA; historical audit references retain their original base. Prod `sxkmultsfsmfcijvsauf` read **SELECT-only** on 2026-11-18 about 2:30 PM ET (`pg_policies`, `has_table_privilege`, `information_schema`, `pg_proc`, per-table stamp counts).
**Related:** OI-0230 (sync durability; slices E and I), OI-0226 (PR C), OI-0054 (insert vs upsert; why INSERT is `WITH CHECK (true)`), OI-0058 (operation_members RLS recursion), OI-0212 / OI-0216 (044 unit-table RLS, the scoped pattern to copy), OI-0217 (transactional restore), V2_INFRASTRUCTURE §5.1, V2_APP_ARCHITECTURE §5.2.

---

## Part E — Server stale-write refusal on every farm table

### E.0 Reconciliation with OI-0226 PR C (no new OI)

OI-0226 scope (d) already holds "server refuses an update older than the stored `updated_at`; client dead-letters it". OI-0230 slice E said "OI-0226 PR C's DB stale-write refusal, **extended to all farm tables**", plus changed-fields-only updates on the client. This part **is** that refusal. Bookkeeping:
- **DB half:** stays under **OI-0226 PR C**, scope widened from group windows to every table in E.1. The window-vs-event date guard (PR C's other half) is unchanged and still needs its Step 0 audit and Tim's yes on the J3 - 4 rows.
- **Client half:** **OI-0230 slice E** (error handling, edit-on-top stamping, changed-fields-only updates).
- **Suggested PR split (Build may merge them):** **PR C1** = stale-write trigger + its client handling (no Step 0 dependency); **PR C2** = window date guard after the Step 0 audit. Both file-only migrations; each apply is a separate Tim's yes plus backup.
- **Deferred here from PR 1:** the optional conditional update `.lt('updated_at', local)` (brief §4 D7; Build's PR 1 question 3) is **not** built in PR 1 and is **superseded** by this guard: `.lt()` works only on `update` (Resync and durable writes also send `upsert`), and a 0-row answer is ambiguous with B's `zero_rows`. The trigger refuses older writes on every path, upserts included, and closes Resync's read-to-write gap fully.

### E.1 Tables

All **54** non-assistant public tables that have `updated_at` (prod, verified): `ai_bulls`, `amendment_locations`, `amendments`, `animal_bcs_scores`, `animal_breeding_records`, `animal_calving_records`, `animal_classes`, `animal_group_memberships`, `animal_heat_records`, `animal_notes`, `animal_treatments`, `animal_weight_records`, `animals`, `batch_location_balances`, `batch_nutritional_profiles`, `batches`, `dose_units`, `event_feed_checks`, `event_feed_entries`, `event_group_windows`, `event_paddock_windows`, `events`, `farm_settings`, `farms`, `feed_types`, `forage_types`, `groups`, `harvest_event_fields`, `harvest_events`, `historical_animal_basis`, `historical_feedings`, `input_product_categories`, `input_product_units`, `input_products`, `locations`, `manure_batch_transactions`, `manure_batches`, `npk_price_history`, `offline_voice_notes`, `operation_members`, `operations`, `paddock_observations`, `soil_tests`, `spreaders`, `submission_field_states`, `submission_repro_steps`, `submissions`, `survey_draft_entries`, `surveys`, `todos`, `treatment_categories`, `treatment_types`, `user_preferences`, `voice_entry_attempts`.

**Excluded, with reasons:**
- The 16 `assistant_*` tables with `updated_at`: written by the assistant edge functions under their own locks and restore fence (`assistant_restore_write_guard`); not client-synced rows. Build confirms none is written by `CustomSync`; any that is joins the list.
- `app_logs`, `release_notes`, `assistant_restore_fences`: no `updated_at`; logs are write-once.
- **The four farm tables with no `updated_at`** (`event_feed_check_items`, `batch_moves`, `batch_adjustments`, `todo_assignments`): nothing to compare. In code only `batch_adjustments` is ever updated (`src/features/feed/index.js:1577`); the other three are insert/delete only. **Design call: no guard on these four now.** They keep #78's write-order fallback and Resync's "create only, never overwrite" rule (brief §4 D5). Known limit, same family as PR B's N6. Adding `updated_at` to them is a schema + CP-55/CP-56 change; revisit only if slice G/H telemetry shows conflicts there. A blanket "refuse every UPDATE" rule is **not** used: durable writes and dead-letter replays send creates as `upsert`, so a re-sent create would hit `ON CONFLICT DO UPDATE` and be refused (breaks PR 1 A4).

### E.2 The rule (requirements; Build writes the SQL)

1. One shared trigger function, `BEFORE UPDATE` on each table in E.1 (it also fires on the update branch of `INSERT … ON CONFLICT DO UPDATE`, so upserts are covered).
2. **Refuse when `NEW.updated_at < OLD.updated_at`** (strictly older): raise an error with a dedicated SQLSTATE (proposed `GT409`) and message `stale_write`, naming the table. The row is unchanged.
3. **Equal stamps are allowed.** Needed for PR 1 A4 (a re-sent write that already landed), and for CP-56 restore pass 2 on two-pass tables (`backup-import.js` updates self-FK columns without touching `updated_at`). An `UPDATE` that doesn't set `updated_at` keeps `OLD.updated_at` and passes.
4. **Future stamps:** refuse `NEW.updated_at > now() + interval '10 minutes'` on **INSERT and UPDATE** with a second SQLSTATE (proposed `GT410`, message `clock_ahead`). A device whose clock runs fast would otherwise stamp rows in the future and lock every other device out of them. **Locked Q5 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator): exactly 10 minutes is allowed; strictly more than 10 minutes is rejected.** This is not permission to change the tolerance.
5. **No server re-stamping.** The trigger never rewrites `updated_at` to `now()`: an offline edit made earlier and synced later must keep its own stamp, or it would beat newer edits and break pull-side last-write-wins (`store.js:612`). (The save-path audit offered "a server-side `updated_at` trigger **or** check"; this spec picks the check.)
6. Ordinary service-role and SQL-editor writes are subject to the same rule; the controlled CP-56 restore exception must preserve original stamps (E.4), not become a general write bypass. Column-limited recovery updates (OI-0230 Phase 3) set `updated_at = now()` (preferred, so devices pull them) or leave it unchanged; both pass.
7. Pre-apply audit (SELECT only, re-run right before apply): rows with `updated_at > now()` = **0 on all 54 tables** and rows with `updated_at < created_at` = **0** (verified 2026-11-18). Any non-zero count stops the apply and comes to Tim.

### E.3 Client handling (OI-0230 slice E; ships and is published **before** the DB apply)

1. **Classify** `GT409` as outcome `stale` (not retryable): no further attempts, **dead-letter at once** with reason `stale_write` (same path as PR 1 B4's `zero_rows`), not marked sent, no pruning, unacked mark kept; red count +1. Auto-drain and manual retry **skip** `stale_write` letters (they can't succeed). Then run a normal pull so the device shows the server's newer row.
2. **Resync** classifies a `stale_write` letter as "skip (server same or newer)" after its read: removed from the letters and kept in the "skipped by Resync" export (`_resync_skipped`), never sent.
3. Classify `GT410` as `clock_ahead`: dead-letter at once, keep the original payload and unacked mark, never count as sent, no auto-drain or blind manual retry. **Proposed user-facing copy (Design spec, not a PR #82 string):** "This device's clock is more than 10 minutes ahead of the server. Fix your clock, then save again." Show it in a persistent error notice in Settings → Sync & Data for this device's `clock_ahead` letters, and in slice G's sync problems sheet when G ships. The existing header stays red and keeps its exact generic count string "Sync failed · {count} pending"; tapping/retrying must also expose the clock notice, not silently re-send. G must not be a prerequisite for seeing the clock notice. A corrected-clock re-save creates a new stamped edit; do not silently restamp or discard the rejected payload. If signed out before a server refusal, PR #82's auth rule still leaves the write queued (not a clock dead letter).
4. **Edit-on-top stamping (closes slow-clock false refusals).** Every update of an existing row stamps `updatedAt = max(now, previous local updatedAt + 1 ms)`. Today `store.update`, `setUnitSystem` and the user-preference save stamp plain wall-clock time (`src/data/store.js:243`, `:312`, `:392`; also on PR 1's head). The write-order clock (`write-order.js:56-60`) orders queue entries (`enqueued_at`) only; it does **not** stamp `updatedAt`. With edit-on-top stamping, an edit made on top of the server's version is always newer than that version even when the device clock is behind; only an edit made on a **stale** copy can be refused, which is the point.
5. **Changed-fields-only updates** (slice E, brief §4 out-of-scope table): an update sends the changed columns plus `updated_at` from a per-edit base copy. With the guard this limits D13 (a stale device whose stamp is newer still wins) to the fields it actually edited.
6. Planned stale-write detail copy: "The server has a newer version" with Export and Discard in Settings / G's sync problems sheet. The header retains its generic red count. Clock notice placement and proposed copy are fixed by E.3.3 for the spec review; neither new message is as-built in PR #82.
7. **Old builds** (no `GT409` handling; minimum build was declined) treat the refusal as a generic error: 5 attempts, dead letter, upsert replay refused again, red indicator. Nothing is overwritten; this is the accepted fail-safe.

### E.4 Restore (CP-56)

**Locked Q4 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator):** CP-56 keeps the backup's original `updated_at` timestamps. The stale-write and future-clock guards must neither reject a legitimate restore nor restamp its rows, including pass 2. This does not exempt ordinary saves.

As read at `d22e004`, `src/data/backup-import.js` skips reference and unit tables in its delete pass (`deleteTableRows`, `:183-184`) and restores them by id-conflict `upsert` (`:290`, `:311`); every other table is deleted then inserted. An older backup over newer unit or reference rows would fail an ordinary stale-write trigger. Merely running restore before the guard applies is not a durable solution: restores must keep working after rollout. **Open for Design / Build proposal before PR C approval:** specify an authorized, transaction-scoped restore-only exemption (or a verified ordering/path with equivalent semantics) covering all CP-56 writes, including unit upserts and original future-dated stamps; document it in V2_MIGRATION_PLAN §5.7 and prove authorization / expiry. No mechanism is selected here: a client-set header, column or PostgREST GUC bypass is forbidden. Do not claim a new RPC, delete-unit path or trigger bypass exists. **PR C apply is blocked until this is resolved and round-trip tested.**

### E.5 Rollout, backup, rollback

0. **Locked Q6 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator): OI-0233 Part I permissions fix is first, then OI-0226 PR C / Part E stale-save guard.** I's client prerequisite, separately approved apply and verification must finish before E's DB apply. Every migration apply needs Tim's explicit yes plus a verified backup; no blanket approval here.
1. Resolve E.4 restore exemption, then client slice E (E.3) merged and **published**; Tim's devices updated (Settings build stamp checked through Orchestrator).
2. Re-run the E.2.7 audit (SELECT only). Zero, or stop.
3. Backup (pg_dump or the 044-style SQL/JSON table backup) of every E.1 table. Tim's explicit yes via Orchestrator.
4. Apply the migration; verify the trigger exists on all 54 tables (`information_schema.triggers`); smoke test: Tim saves one animal note; one deliberately stale update from a test client is refused with `GT409`.
5. **Rollback:** drop the 54 triggers and the function (the migration file carries the down script in a comment). No data changes, so rollback is lossless. The client keeps working without the guard (E.3 handling is simply never triggered).

### E.6 Acceptance tests

DB (PGlite harness, migration applied):
1. Update with an older `updated_at` → `GT409`, row unchanged. Equal → allowed. Newer → allowed.
2. `INSERT … ON CONFLICT DO UPDATE` with an older stamp → `GT409`.
3. Insert or update with `updated_at` 11 minutes ahead → `GT410`; 9 minutes and exactly 10 minutes ahead → allowed (freeze server time for the boundary test).
4. An update that does not set `updated_at` (two-pass restore shape) → allowed.
5. Catalog test: the trigger is on exactly the E.1 tables; none on the four no-`updated_at` tables.
6. CP-56 round trip after guard rollout, including an older backup over newer unit rows and original future-dated stamps (E.4): original `updated_at` preserved in every pass, no refusal, no restamping; ordinary saves cannot use the restore exception.
Client (mock client returning the codes):
7. `GT409` → dead letter `stale_write` at once, attempts not incremented further, not marked sent, mark kept, red +1; auto-drain and retry don't send it; a pull follows.
8. Resync with a `stale_write` letter → counted as skipped, in the skipped export, never sent.
9. Edit-on-top: local row stamped by another device at T; device clock at T − 1 h; edit → stamp T + 1 ms; accepted by the PGlite guard.
10. Brief §5 **D13** flips from "documents the known limit" to: stale B's Resync or normal flush can't move `confirmed_bred` back (with E's changed-fields-only and the guard).
11. `GT410` → original payload dead-lettered as `clock_ahead`, mark retained, no retry loop; Settings notice appears even before G exists, header stays red with its generic count; corrected-clock re-save works.
12. A pre-E client against the guarded DB: refusal ends in a red dead letter; server row unchanged.

---

## Part I — Tighter insert RLS and no `anon` writes (OI-0233)

**Sequence locked Q6 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator):** deliver and verify Part I before Part E / OI-0226 PR C. Onboarding order change (I.3) ships before this apply. Each migration apply still needs Tim's explicit yes plus a verified backup.

### I.0 Verified state (prod, SELECT only, 2026-11-18)

- 77 public tables, RLS enabled on all.
- **49 tables** have an INSERT policy `WITH CHECK (true)` for role `public` (anon included): `ai_bulls`, `amendment_locations`, `amendments`, `animal_bcs_scores`, `animal_breeding_records`, `animal_calving_records`, `animal_classes`, `animal_group_memberships`, `animal_heat_records`, `animal_notes`, `animal_treatments`, `animal_weight_records`, `animals`, `app_logs`, `batch_adjustments`, `batch_location_balances`, `batch_moves`, `batch_nutritional_profiles`, `batches`, `event_feed_check_items`, `event_feed_checks`, `event_feed_entries`, `event_group_windows`, `event_paddock_windows`, `events`, `farm_settings`, `farms`, `feed_types`, `forage_types`, `groups`, `harvest_event_fields`, `harvest_events`, `input_product_categories`, `input_products`, `locations`, `manure_batch_transactions`, `manure_batches`, `npk_price_history`, `operations`, `paddock_observations`, `soil_tests`, `spreaders`, `submissions`, `survey_draft_entries`, `surveys`, `todo_assignments`, `todos`, `treatment_categories`, `treatment_types`. Matches the save-path audit (F13).
- **`anon` holds INSERT, UPDATE, DELETE and SELECT on 53 tables**: the 49 plus `historical_animal_basis`, `historical_feedings`, `operation_members`, `user_preferences` (the two historical tables' policies are `TO authenticated`, so RLS already blocks anon there; the grant is still too wide). Schema-wide, `anon` and `authenticated` also hold TRUNCATE, TRIGGER and REFERENCES (Supabase default grants; PostgREST exposes no TRUNCATE).
- Already scoped (the pattern to copy): the assistant tables, `dose_units`, `input_product_units` (044), `historical_*` (045), `offline_voice_notes`, `voice_entry_attempts`, `submission_field_states`, `submission_repro_steps`: INSERT `TO authenticated WITH CHECK (operation_id IN (SELECT operation_id FROM operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL))`, no anon grants.
- **Found beyond the audit (membership escalation):** `operation_members_insert` is `WITH CHECK (user_id = auth.uid())` for `public`, so **any signed-in user can insert a membership row for any operation** (any role, `accepted_at` set) and then read and write that farm. `operation_members_update` is `USING (user_id = auth.uid())` with no `WITH CHECK`, so a member can change their own `role`, `operation_id` or `is_dev`. `operations_insert` is `WITH CHECK (true)`. Today prod has 1 operation and 1 member, so no misuse is possible to see; the hole is real.
- Invites go through `claim_invite_by_token` and `claim_pending_invite`, both `SECURITY DEFINER` (verified), so ordinary joins don't need a client INSERT on `operation_members`.

### I.1 Policy changes (requirements; Build writes the SQL; all `TO authenticated`)

1. **Operation-scoped tables** (the 49 minus `operations`, `app_logs`; 47 tables incl. `submissions`): INSERT `WITH CHECK` = the same membership predicate as that table's UPDATE policy, written with `(SELECT auth.uid())`. Whether to also require `accepted_at IS NOT NULL` (as 044/045 do) on these legacy tables is a Build proposal; pick one rule for INSERT, UPDATE and DELETE together and say which.
2. **`operations`:** INSERT stays open to **signed-in** users only (`TO authenticated WITH CHECK (true)`): a new farm has no member row yet (OI-0054 chicken-and-egg). Exception, recorded.
3. **`operation_members`:** INSERT allowed only as the **bootstrap owner row** of an operation that has no members yet (`user_id = auth.uid()`, role `owner`, checked through a `SECURITY DEFINER` helper so the policy does not query its own table, OI-0058). Every other join goes through the claim RPCs. UPDATE: a member can't change their own `operation_id`, `user_id`, `role` or `is_dev` (trigger or owner-only policy; Build picks).
4. **`app_logs`:** INSERT `WITH CHECK (user_id = auth.uid() AND (operation_id IS NULL OR <member of operation_id>))`. `log-flush.js` already sends `user_id` / `operation_id` (`src/data/log-flush.js:60-61`, insert `:117`) after a pull, so it has a session. Logs written before sign-in stay in `_log_buffer` until a session exists (INFRA §3.4). Exception to the member rule: `operation_id` may be NULL.
5. **`user_preferences`:** keep `user_id = auth.uid()`, change role `public` → `authenticated`.
6. Unchanged: assistant tables, unit tables, historical tables, `release_notes` (no INSERT policy; server-only).

### I.2 Grants

- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;` keep `anon` SELECT (RLS returns nothing without a session; Build greps for any pre-sign-in read before deciding whether SELECT can go too).
- `ALTER DEFAULT PRIVILEGES … REVOKE` the same from `anon`, so a new table doesn't come back with anon writes.
- `authenticated` keeps INSERT/UPDATE/DELETE/SELECT; revoking its TRUNCATE/TRIGGER/REFERENCES is defence in depth (Build's call, say which).

### I.3 Client prerequisite (ships before the apply)

Onboarding creates rows in this order: `operations` (`src/features/onboarding/index.js:300`), `farms` (`:308`), `farm_settings` (`:315`), then `operation_members` (`:326`), `user_preferences` (`:333`), then seed classes and categories. With member-scoped INSERT, `farms` and `farm_settings` would be refused until the member row lands, and PR 1 sends different rows in parallel (up to 6). **Requirement:** onboarding sends `operations` → `operation_members` first and confirmed (awaited), then everything else; no dead letter on a clean onboarding. (OI-0054's insert-not-upsert rule for onboarding stays.)

### I.4 Exceptions summary

| Table | Rule | Why |
|---|---|---|
| `operations` | INSERT for any signed-in user | no member row can exist before the farm |
| `operation_members` | bootstrap owner row only; joins via claim RPCs | stops self-join of other farms |
| `app_logs` | own `user_id`; `operation_id` may be NULL | logs from login/onboarding |
| `user_preferences` | own `user_id` | user-scoped, no operation |
| `release_notes`, `assistant_*`, unit and historical tables | unchanged | already server-only or scoped |

### I.5 Testing (PGlite RLS harness, extends the existing 30/37/16 suites)

1. Member inserts into each of the 47 tables: allowed. Non-member (another operation) insert: refused (`42501`). Anon insert/update/delete: permission denied.
2. Onboarding end to end as a fresh user (I.3 order): every row lands; zero dead letters.
3. A second user can't insert an `operation_members` row for the first user's operation; can't raise their own role.
4. `claim_invite_by_token` and `claim_pending_invite` still add an invited member.
5. CP-56 restore as the owner: succeeds (insert path).
6. `app_logs` insert with own `user_id` and NULL operation: allowed; with another user's id: refused.
7. Catalog test: no INSERT policy in `public` with `with_check = 'true'` except `operations`; `anon` holds no INSERT/UPDATE/DELETE grant on any public table.

### I.6 Backup, apply, rollback

1. Pre-apply snapshot of `pg_policies` and table grants (Design's SELECT snapshot from 2026-11-18 is on Design's box, `gtho-cleanup/2026-11-18/rls-snapshot.json`; re-take it right before apply) plus a schema dump of `public`.
2. Pre-apply audit (SELECT): every operation-scoped row's `operation_id` belongs to an operation with at least one accepted member (today 1 operation, 1 member).
3. Tim's yes via Orchestrator; apply; verify with the I.5.7 catalog query on prod and one normal save by Tim.
4. **Rollback:** a down script that recreates the previous policies and grants from the snapshot. No data change, so rollback is lossless.

---

## Locked answers and remaining Design gates

**Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator** (answers given 3:56–3:57 PM ET): Q4 keep backup timestamps (E.4); Q5 reject strictly more than 10 minutes ahead, show a fix-your-clock message (E.2.4, E.3.3); Q6 permissions first, stale-save guard second (I, then E). No remaining product question for Tim in those three answers. These locks are not migration-apply or docs-land approval.

**Open for Design, not answered by an implementation claim:**
- E.4: authorized restore exemption / ordering mechanism, to be proposed and reviewed before PR C.
- **K1 (PR #82 known limit):** an unconfirmed create whose reply was lost can be recreated by Resync after another device deletes it. PR C owns closing this, but a `BEFORE UPDATE` stale-stamp trigger alone cannot reject an INSERT of a now-absent row. Design / Build must specify the server-side deleted-create protection and its backup/restore implications before claiming K1 closed. No tombstone or RPC implementation is invented in this spec. Add the lost-reply → other-device delete → Resync acceptance case to PR C; server must not recreate the row, and recovery data must be retained.
