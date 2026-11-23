# SESSION_BRIEF — OI-0282 farm-scoped GTHO connector, usage capture and onboarding

**Generated:** 2026-11-23 (America/New_York / ET) by Design
**Status:** **PROPOSED — Tim's locked inputs recorded (L1–L4); six lock questions open (Ts, Wr, Cp, Sf, Qp, Sg). Build starts nothing until Tim locks them and the docs land.** Any migration, RLS/policy change, Supabase Auth setting or edge-function secret needs Tim's separate yes at apply time, plus a verified backup for anything touching the database.
**Source:** Tim t1390u, t1391u, t1395u (12:32–12:39 PM ET), t1397u (12:41 PM ET), locked inputs 12:40–12:41 PM ET, t1398u (12:46 PM ET, farm-side setup), t1399u (12:47 PM ET, bot side owned by the GTHO team), all via Orchestrator.
**Base:** Forgejo `origin/main` = `c7581ce98b415d62b7973b6ece883b9d969ae176` (#167 live as `b2026-11-23.1738-c7581ce`; RELEASED 48).

Tim, verbatim: “they would have a bot on their own farm data not mine. We would need a connector that allows them to do that on their farm. And a way for us to capture the data from that interaction.” Onboarding (t1397u): “Save in to GThO out but we will audit it after having done so in order to iterate the process and improve it before they use it”.

## 1. Outcome

Each farm gets its own Grok Bot that uses GTHO through one **farm-scoped GTHO connector** (a remote MCP server). In the test phase the connector is wide (reads anything on that farm, writes base data, no human confirm on ordinary saves) so real use shows what the final connector must be. Every call is **captured**, and Design turns the capture into the narrowed connector spec (P3). A **shared onboarding bot** reads a new farm's documents and saves its base data straight into GTHO; every onboarding write is tagged to the session and source document, reviewed afterwards by Tim and Design, and can be corrected or undone per session.

## 2. Locked inputs (Tim, 12:40–12:41 PM ET via Orchestrator) — decided, not questions

- **L1 — one bot account per farm.** Each farm's bot signs in as its own GTHO account that is a member of that farm only. Its data access is that farm's data, enforced by the database (RLS), not by connector code alone.
- **L2 — live production database.** Testing runs on prod, limited to the farm by RLS. There is no test DB. Consequence: OI-0233 (insert RLS + member self-join fix) is a **hard gate** (§6).
- **L3 — one shared onboarding bot for all farms**, with per-farm access that is time-boxed to one onboarding session and revoked afterwards (§5.2).
- **L4 — onboarding saves directly, then is audited** (t1397u). No staging area. Post-save audit: session/source tags on every write, an audit report reviewed by Tim and Design after each onboarding, and correct/undo per session. Tim iterates on his own farm and the second test farm before any outside farm uses it.

## 3. Existing coverage (checked on `c7581ce`)

| Area | What exists | Gap for this OI |
|---|---|---|
| In-app assistant (OI-0195, 0207, 0211 shipped; 0208 queued; 0210 scoping) | Edge functions `supabase/functions/gtho-assistant`, `-apply`, `-audio`, `-transcribe` composed from `src/features/assistant/server/*`; migrations 040/041 add operation-scoped assistant tables (conversations, transcript turns, proposals/revisions, review cards/confirmations, execution results, field mappings, billing, testing audio/consents, voice entry attempts). Caller identity = verified Supabase JWT → accepted `operation_members` (`server/identity.js`), plus env allowlist `GTHO_ASSISTANT_OPERATIONS`. | Built for the PWA chat. Server code reads with the **service role** scoped by operation (`server/farm-data.js`, 11 entities). Not usable as an outside connector and not RLS-as-user. |
| Typed action layer (OI-0215) | Proposal `ASSISTANT_ACTION_LAYER_PROPOSAL_2026-11-10.md` on local branch `docs/assistant-action-layer` `3130849` — **never landed on main, not on origin**, on hold since 2026-11-16 (stored-forage priority). Its §10 “MCP-readiness — later”: OAuth delegating the user's identity, membership recheck every call, prepare → preview → human confirm → commit, no reuse of the browser receipt endpoint as a write API. §7 reporting: named reads + guarded open query over approved views; warns views bypass RLS by default. | Registry not built. Tim's “no roadblocks while testing” overrides its per-write human confirm **for the test phase only** (Wr). Its view-security proof is still required before any open SQL (§4.3). |
| Named reads | `src/features/assistant/farm-reads.js` `FARM_READ_TOOLS`: `animal-reproductive-evidence`, `open-animal-set`, `paddock-grazing-evidence`. | Reused as connector reads. Feed/DMI/readiness reads need wrapping of `src/calcs`. |
| Save paths | All farm writes are **client-side**: `src/data/store.js` `add/update` + sync push under the user's JWT. `gtho-assistant-apply` only acknowledges the browser's save. Entity modules (`src/entities/*.js`: `FIELDS`, `create`, `validate`, `toSupabaseShape`) and `src/calcs` are pure JS and already import into Deno edge functions. | No server-side farm write path exists. Compound saves (move/close, feed check + items, delivery) live in feature screens; extracting them is OI-0215 registry work (P1b). |
| Auth / membership | Supabase Auth users; `operation_members` (`role` owner/admin/team_member, `accepted_at`, `invite_token`, `is_dev`); invite links in `settings/member-management.js` (CP-66). RLS by accepted membership. | **OI-0233 (SPEC 2026-11-18, not built):** 49 tables have INSERT `WITH CHECK (true)`; `anon` holds writes on 53; any signed-in user can add themselves to any operation; members can change their own role. Must be applied before bot accounts exist on prod (§6). No OAuth server, no connector tokens. |
| Feedback | `submissions` + pinned `feedback-module` v0.1.3; client `writeFeedbackSubmission()`. | Connector gets a `feedback.file`-style tool writing `submissions` as the bot. |
| Logs | `app_logs` (write-once error log, own `user_id`). Assistant retention plan: finished artifacts expire after 90 days (`assistant/retention.js`). | No tool-call / usage log. `app_logs` is an error log, not fit for capture. |
| Onboarding / import | `src/features/onboarding/index.js` wizard creates operations → farms → farm_settings → operation_members → user_preferences → seeded classes, treatment/input categories, forage types (client). `settings/v1-import.js` (v1 JSON), CP-55/56 backup export/import (`src/data/backup-*.js`); OI-0217 transactional restore open. | No document ingest, no bulk base-data API, no dedupe, no onboarding checklist, no session tags/undo. |
| Concurrency | OI-0230 PR 1 merged; OI-0226 PR C (DB stale-write guard) not started. | A connector update can be overwritten by an unsynced phone edit (last write wins) until PR C. Mitigated in §4.4. |
| MCP / connector / OAuth / API keys / usage telemetry | **None** in spec or code (only historical “Supabase MCP” build tooling mentions). | All new. |

## 4. 0282-C — farm-scoped GTHO connector

### 4.1 Hosting (Design default; not a Tim question)
**H1 (default): Supabase Edge Function `gtho-mcp`** (Streamable HTTP MCP) in the same project and deploy path as the assistant functions. Public HTTPS that Grok Bot can reach, next to the database, imports `src/entities` and `src/calcs` like the assistant already does. Alternative H2 — a small Node service on the VPS behind Caddy — adds new public surface and DNS/Caddy work owned by Homelab Build; homelab apps stay home-only. Revisit only if Edge limits (time, memory) block bulk onboarding.

### 4.2 Auth (Design default under L1)
- **Supabase Auth OAuth 2.1 server** (beta; enabling it is a production Auth setting → Tim's yes) with a small in-app consent page. The farm's Grok Bot connector does a one-time OAuth sign-in **as the farm's bot account**; tokens refresh automatically. Every connector call uses that account's JWT, so **RLS applies as the bot account**. The connector never uses the service role for farm data.
- **Farm pin:** the connector resolves the account's accepted memberships on every call and serves exactly one operation; 0 or more than 1 → refuse (`one-farm-per-account`). Bot accounts are `team_member` (cannot manage members; after OI-0233 cannot change their own role).
- **Credentials outside chat:** under Sg A/C bot logins are created by the farm owner from the in-app “Connect an assistant” screen (§4.6); under Sg B the farmer's own login is used; sign-in secrets live in the vault, never in chat, docs or logs. Revocation = remove membership + sign the account out; the next call fails closed.
- **Fallback if Grok Bot's connector OAuth cannot complete against Supabase's OAuth server:** a GTHO-issued per-connection token (stored hashed) that maps to the bot account's own refresh session. This keeps RLS-as-user but stores a session credential at rest; it needs a Design security review before use. Decide after a P1 spike.

### 4.3 Tool surface (lock **Ts**; Design rec Ts1)
- **Reads (all options):** `farm_info` (farm, units, schema version, connector version); `describe` (entities and fields from `FIELDS`, plain meanings, units); `list` / `get` / `find` over every farm entity in the sync registry (filters, paging ≤ 500 rows, RLS as the bot); named calculated reads reusing `src/calcs` only (existing three + `event_feed_outlook`, `paddock_readiness`, `feed_inventory`, later `dmi_target_vs_actual` from OI-0280). The model never computes farm numbers itself.
- **Guarded read-only SQL over approved views: deferred.** OI-0215 §7's view-security proof (views bypass RLS by default) must be done first; the generic list/find tools give breadth meanwhile.
- **Writes (Ts1):** `create` / `update` / `archive` on **base-data entities** (farm settings, locations/paddocks with area, groups, animal classes, animals, group memberships, feed types, forage types, feed batches/inventory, weights, BCS, notes, treatments, heat/breeding/calving records, surveys, todos). Each write = entity `create()` defaults → `validate()` → `toSupabaseShape()`; the server sets `id`, `operation_id`, `farm_id`; the model never supplies them. **Event-structure records** (events, paddock/group windows, feed entries, feed checks + items, batch moves/adjustments) are **read-only** until workflow tools that reuse the app's own save code exist (P1b: feed check, delivery, move/close). An unsupported ask is logged as a gap.
- Ts2: raw read/write on every table under RLS, events and windows included. Widest, but per-row writes can break window integrity (OI-0226 invariants) and the PWA's calculations.
- Ts3: only typed actions + named reads (OI-0215 shape). Safest, but nothing ships until the registry is built, and it defeats “watch real usage first”.

### 4.4 Write safety (lock **Wr**; Design rec Wr1)
- **Wr1:** no human confirm on ordinary single creates/edits. **No hard delete** — archive only. A **preview step** (server returns the exact changes plus a single-use preview token; commit must quote it) only for bulk writes over 25 rows and for archive. Every write logged with a before/after image so it can be undone. Updates carry the row's `updated_at` they read; if it changed since, refuse with `conflict` (protects against phone edits until OI-0226 PR C).
- Wr0: no preview at all, hard deletes allowed.
- Wr2: preview + commit on every write (closest to OI-0215 §10, slowest for the bot).

### 4.5 Limits and stamps (Design defaults)
60 calls/min and 5,000/day per connection; bulk ≤ 200 rows per call; reads ≤ 500 rows per page; 10 s per call. Writes refuse if `operations.schema_version` is above the connector's compiled ceiling (same rule as the PWA). Every response and log row carries connector version, tool version and schema version.

### 4.6 Farm-side setup path (Tim t1398u, 12:46 PM ET: “How will the user create the required bots on their account? A skill and connector?”)

1. **Two shareable Grok Bot templates, published by us.** **“GTHO Farm Assistant”**: instructions + GTHO skills (how to use each tool, the confirm habits under Wr, the farm's units, always state the intent line, report anything it can't do with the gap tool, file feedback). **“GTHO Onboarding”**: document-intake walkthrough (herd lists, paddock maps, feed inventory → dry-run → commit), the onboarding checklist, session start/end, source-document tagging. The farm adds a template to **its own Grok Bot account**. Templates carry **no credentials** and no farm data.
2. **Connector.** The farm adds the GTHO connector in Grok Bot by its remote MCP URL. Grok Bot runs the OAuth sign-in, which lands on the **GTHO (Supabase) login page**; tokens go straight from GTHO to Grok Bot's connector store. Credentials never pass through chat, the bot, templates or logs.
3. **Who signs in — lock Sg (§8 Q6).** A (rec) dedicated GTHO bot login per farm, made from an in-app “Connect an assistant” screen; B the farmer's own login; C B on Tim's farm for P1, A required before any outside farm.
   - **Reconciling L1/L3:** under A (and C after P1), L1's “separate bot account per farm” is a separate **GTHO login** that is a member of that farm only, and the one-farm pin holds in the database. The onboarding login (L3) is created the same way from the farm's screen, scoped to that farm only, and **auto-disabled at session end**. Under B, L1 holds only at the Grok Bot account level: the GTHO identity is the farmer's, bot writes are indistinguishable from the farmer's in audit (only the OAuth client id differs), revoking means disconnecting in Grok Bot or changing the password, an owner login gives the bot owner rights, and a farmer who belongs to two farms is refused by the one-farm pin.
   - **“Connect an assistant” screen (A/C):** Settings → Members, owner/admin only. “Add assistant login” creates an invite for a bot login with a limited `team_member`-like role on **this farm only**, through the OI-0233-safe invite/claim path (no self-join). It lists each assistant login (Farm Assistant / Onboarding session), its last use and connected client, with **Revoke** (removes membership + signs it out; one click). The onboarding kind carries a session end that auto-disables it. It never shows a password or token in the app or chat; the login's sign-in secret is set by the owner on the GTHO login page.
4. **Distribution (test phase).** Templates shared by link (Grok Bot's shareable template), not a public listing. Connector added by **direct URL**, not listed in a public catalog. **Orchestrator sequences the work and, with Tim's yes, creates Tim's farm bot from the “GTHO Farm Assistant” template in P1 and the shared onboarding bot from “GTHO Onboarding” in P2** (exact bot-creation actor to be confirmed by Orchestrator).
5. **Sizing:** the “Connect an assistant” screen (A/C) is in P1 (or at the end of P1 under C, before P2); template text and skills are Design work (docs, no Build).

6. **Ownership (Tim t1399u, 12:47 PM ET): the farm bots and the onboarding bot stay with the GTHO team; Chief of Staff has dropped this.**
   - **GTHO Design** owns the bot side as spec: the two templates' instructions and skills, versioned in the repo as docs (not code) under `bots/templates/` with a `README.md` (one folder per template, e.g. `bots/templates/gtho-farm-assistant/` and `bots/templates/gtho-onboarding/`, each with `INSTRUCTIONS.md`, `skills/*.md` and a version + changelog line); the farm setup guide (`bots/FARM_SETUP_GUIDE.md`: add template, add connector by URL, sign in, Connect an assistant, revoke); and the weekly usage-capture review that turns logs into the connector spec (P3).
   - **GTHO Build** owns the `gtho-mcp` connector, capture tables/RPC and the in-app “Connect an assistant” screen.
   - **Orchestrator** sequences the work and, with Tim's yes, creates Tim's farm bot from the template in P1 and the onboarding bot in P2 (exact bot-creation actor to be confirmed by Orchestrator).

## 5. 0282-U — usage capture, post-save audit and onboarding

### 5.1 Capture (lock **Cp**, Design rec Cp1; lock **Sf**, Design rec Sf1)
New operational tables (migration → Tim's yes + backup at apply):
- `connector_calls`: operation, actor (bot account), OAuth client, session (nullable), tool, tool/connector/schema version, **intent** (the bot's one-line “what the farmer asked”, a required tool argument), args, result summary, row count, error code/message, latency, time.
- `connector_writes`: call, operation, session, **source document** (name/label given by the bot), entity, row id, op (create/update/archive/undo), before, after.
- `connector_gaps`: `report_gap` tool — what was asked, why the connector could not do it.
- `onboarding_sessions`: operation, onboarding account, started/ended, status, source documents, audit sign-off, full-log consent (+ time).
- Rows are inserted only through a `SECURITY DEFINER` function that stamps actor/operation from the JWT and checks membership, so bots cannot forge or edit logs. Farm members read their own farm's rows. Tim reads other farms' rows only per **Sf**. Retention: 90 days raw (same as assistant artifacts); onboarding write logs kept until that session's audit is signed off, then 90 days; weekly digests kept. Excluded from CP-55 backups (operational telemetry, not farm data); MIG doc note at build time.
- Grok Bot chat transcripts are not visible to the connector. **Cp1:** tool calls in full + intent line + gap reports + feedback filed by the bot. Cp0: tool calls only, no intent text. Cp2: Cp1 plus asking each farm to share Grok Bot transcripts by hand.
- **Sf1:** Tim and Design see a second farm's full capture (values included) only with that farm's OK, recorded at onboarding and revocable; without it they see a redacted view (tools, errors, timings, intents with values removed). Sf0: always redacted. Sf2: full logs without asking (not recommended). Tim's own bot never sees another farm's farm data under any option (L1).

### 5.2 Shared onboarding bot access (Design default under L3)
- **Per-farm onboarding login per session:** for each new farm, a fresh onboarding login (e.g. “GTHO Onboarding — <farm>”) that is a `team_member`-like member of **that farm only**. Under Sg A/C the farm owner creates it from the farm's “Connect an assistant” screen (§4.6), with a session end that auto-disables it; until that screen exists (Sg C on Tim's farm and the second test farm), Tim creates it and the farm owner invites it through the OI-0233-safe invite path. Because L3 locks a per-session login, onboarding uses one under every Sg option, including B. The shared onboarding bot connects its GTHO connector by signing in as that login at session start (OAuth on the GTHO login page). At session end: membership removed, login disabled and signed out, connector disconnected, session marked ended. Isolation stays in the database: an onboarding login is never in two farms, and the one-farm pin (§4.2) refuses otherwise.
- Rejected: one long-lived onboarding account that joins and leaves farms in turn. A missed removal would leave it in two farms and RLS would then show both.
- The farm owner signs up and runs the existing 4-step wizard first (creates operation, farm, membership, seed classes); the bot does not create operations.

### 5.3 What onboarding needs from the connector (P2)
- Document ingest is done by the bot with Grok Bot's own file tools (PDF, spreadsheets, photos of herd lists, paddock maps, feed inventory). The connector receives structured rows only.
- `bulk_create` per base-data entity (≤ 200 rows) with **dry-run** (validation results per row, nothing saved) and commit; natural-key **dedupe** (location/group/class/feed-type name per farm, animal tag per farm, batch label + date) — duplicates are reported, not silently merged; clear per-row validation errors in plain field terms; optional bot-supplied row reference echoed back.
- `onboarding_checklist` read: farm settings + units, locations with area, groups, classes with weights/DMI, animals with class and group, feed types and inventory batches; what's missing.
- `start_onboarding_session` / `end_onboarding_session`; every write in a session carries session + source document.

### 5.4 Post-save audit (L4)
- **Audit report** per session (in-app Settings → Onboarding audit for farm members and Tim; same data in the capture tables): rows created/changed per entity, source document per row, validation warnings, dedupe hits, gaps, and suspicious values (area 0 or > 2,000 ac, weight outside class range, duplicate tags).
- **Correct:** ordinary edits in the app, or via the connector, logged against the session.
- **Undo session:** dry-run first (lists what would be reverted and any blockers), then commit only with Tim's explicit yes: created rows removed if nothing outside the session references them (else listed as blockers); updated rows restored to their before image if unchanged since; archives reversed. Undo writes are logged as `undo`.
- Tim and Design review each session's report and sign it off; findings feed the onboarding bot's instructions. Tim's farm, then the second test farm, before any outside farm.

## 6. Security gates
1. **OI-0233 applied before any bot account exists on prod** (L2): closes INSERT `WITH CHECK (true)` on 49 tables, `anon` writes on 53, the `operation_members` self-join and self role change. Without it a bot account could insert into another farm or add itself to one. Already specced (`SYNC_SERVER_GUARDS_2026-11-18.md` Part I); apply = Tim's yes + verified backup.
2. **Farm-isolation tests** (new, required in P1 and P2): two operations, two bot accounts; prove each account cannot read, insert, update or archive the other farm's rows through every tool; one-farm pin refuses 0/2 memberships; capture rows are not readable across farms except per Sf; undo cannot touch another session's or farm's rows.
3. No service role for farm data. Capture RPC is the only definer path and is insert-only.
4. Every migration, policy change, Auth setting (OAuth server) and function secret: Tim's yes at apply time; database changes also need a verified backup. Credentials are issued outside chat.

## 7. Phases, sizes and queue (lock **Qp**; Design rec Qp1)
| Phase | Content | Size |
|---|---|---|
| P0 | OI-0233 build + apply (already specced) | S–M, 1 PR + apply |
| P1 | Tim's farm: `gtho-mcp` + OAuth consent page + “Connect an assistant” screen (Sg A; under Sg C before P2) + one-farm pin + reads + base-data writes (Wr) + capture tables/RPC + gap/feedback tools + **Design: template v0 text + skills (`bots/templates/`) and farm setup guide** + isolation tests; Orchestrator (with Tim's yes; actor to be confirmed) creates Tim's farm bot from the template | M–L, ~4 PRs + 1 migration |
| P1b | Workflow tools reusing app save code: feed check, delivery, move/close (OI-0215 registry foundation) | L |
| P2 | Second farm + shared onboarding bot: onboarding sessions/accounts, bulk create + dry-run + dedupe, checklist, audit report, undo session, Sf consent and reviewer access | M |
| P3 | Weekly Design usage-capture review/digest (top tools, top intents, failed calls, gaps, generic-call sequences that should be one action) → new OI: narrowed connector spec | S per cycle |

- **Qp1 (rec):** separate track interleaved with the DMI/units work: 0279 → **OI-0233** → **0282-P1** alongside 0277 + 0278-S2 → 0281 → 0280 → **0282-P2** → 0278-S3 → S4 → P1b/P3 as captured usage directs.
- Qp2: after the current queue (after 0278-S4).
- Qp3: now, ahead of 0279.

## 8. Lock card questions (plain language)
1. **Ts — How much can a farm's bot do while we test?** A (rec): read everything on its farm and add/edit the farm's base records (paddocks, groups, animals, feed types, inventory, weights, notes, treatments) with the app's own checks; grazing events, moves and feed checks stay read-only until we add proper tools for them. B: read and write every table directly, events included. C: only a short list of named actions.
2. **Wr — Safety on bot saves?** A (rec): no confirm on normal saves; nothing is ever hard-deleted (archive only); a preview step only for big batches (over 25 rows) and archives; every save logged so it can be undone. B: no checks at all, deletes allowed. C: preview and confirm every save.
3. **Cp — What do we record?** A (rec): every bot call in full, a one-line note of what the farmer asked, “couldn't do this” reports and feedback; raw kept 90 days, weekly summaries kept. B: calls only, no request notes. C: A plus asking farms to share their chat transcripts by hand.
4. **Sf — Can you see the second farm's recordings?** A (rec): full detail only if that farm says OK at onboarding (they can withdraw); otherwise values are hidden. B: always hidden values. C: full detail without asking.
5. **Qp — When does this get built?** A (rec): right after per-class DMI (0279): farm-isolation fix (OI-0233), then your farm's bot alongside the Home DMI work; second farm + onboarding after the stored-feed plan and dashboard line. B: after all the current DMI/units work. C: now, before 0279.
6. **Sg — Who does the bot sign in as?** A (rec): a separate GTHO “bot login” for each farm, made by the farm owner on a new “Connect an assistant” screen in the app; it can only see that farm, it's removed with one click, and the audit shows which saves came from the bot. B: the farmer connects with their own GTHO login — simplest, no new screen, but the bot's saves look like the farmer's, an owner login gives the bot owner rights, and stopping it means disconnecting in Grok Bot or changing the password. C: B on your farm now for speed, and A required before any outside farm.

## 9. Acceptance (summary)
- [ ] OI-0233 applied and verified before the first bot account exists.
- [ ] Farm-isolation suite passes for every tool (two farms, two accounts).
- [ ] Every call writes a capture row; every write has before/after and session/source when in onboarding.
- [ ] Undo session dry-run and commit tested, including blockers; commit only with Tim's yes.
- [ ] No service role for farm data; no credentials in chat, docs or logs.
- [ ] Writes refuse above the compiled schema ceiling; update conflicts refused.

## References
`OPEN_ITEMS.md` OI-0195, 0207, 0208, 0210, 0211, 0215 (local proposal `3130849`), 0217, 0226, 0230, 0233; `session_briefs/SYNC_SERVER_GUARDS_2026-11-18.md`; `SESSION_BRIEF_2026-11-08_oi-0195-voice-ai-foundation.md`; `V2_INFRASTRUCTURE.md` §8; `V2_SCHEMA_DESIGN.md` §1.4, §11.1–11.2; Supabase docs “OAuth 2.1 Server” and “MCP Authentication” (opened 2026-11-23; OAuth server is beta).
