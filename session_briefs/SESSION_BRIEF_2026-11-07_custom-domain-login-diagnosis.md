# SESSION_BRIEF — Custom-domain login diagnosis (getthehayout.com)

**Generated:** 2026-11-07  
**Source:** GTHO Build diagnosis after the GitHub Pages cutover to https://getthehayout.com/  
**Status:** Diagnosis — no implementation decided. Do not treat this as a build spec.

This is a findings write-up for Grok project chat (and any later Build session pointed at it). Root cause is not fully proven. Do not invent a code or config change from this document.

## What was decided

- Find the real cause of login failure on https://getthehayout.com/. Tim rejected workarounds.
- Do not send a password-reset email unless Tim asks.
- Do not change v1 or v2 Supabase Auth Site URL / redirect allowlists unless diagnosis proves that is the cause and Tim asks.
- Tim confirmed he types `tim@6knot.com`.
- Tim said the vault login saved for https://getthehayout.com/ is the same password that worked on local development the morning of 2026-11-07.
- Tim rejected the theory that v1 credentials are being mixed up with v2.

## Symptom

After moving the live app to https://getthehayout.com/ via GitHub Pages, login fails with the generic UI message “Login failed. Check your email and password.”

Tim first reported a direct paste of the password that worked before the migration. Later checks: private mode still fails; hand-typing both email and password still fails.

The live page is GTHO v2 (not leftover v1). After pull request #82 the live header stamp is `b2026-11-07.1316-70f3ea4` (stamp time is UTC). Title is “GTHO v2”. Moving to a new origin correctly dropped the previous github.io `localStorage` session, so Tim must log in again. That explains needing to sign in, not why Auth rejects the password.

## What Auth actually returns

The live client calls `signInWithPassword`, which POSTs `/auth/v1/token?grant_type=password` to the GTHO-v2 Supabase project.

Those requests return HTTP 400 `invalid_credentials`. The UI maps any login error to i18n `auth.loginFailed`. Empty fields use `error.generic`.

Per GoTrue (`ResourceOwnerPasswordGrant` / `FindUserByEmailAndAudience`, observed GoTrue v2.197.0), `invalid_credentials` on a password grant means one of: email+audience not found (email is lowercased), user has no password, password hash mismatch, or a password-verification hook rejects. It is not caused by Site URL, redirect allowlist, CORS, or Origin.

## Last success vs first failures (America/New_York)

- Last successful password login on GTHO-v2: 2026-11-07 11:41:02 UTC = 6:41 AM ET. Auth log referer `http://localhost:3000`, Chrome/155 on Linux, plus a matching edge `POST | 200` and OPTIONS 200 — a real browser CORS login against the same v2 project from local Vite.
- `auth.users.updated_at` equals that `last_sign_in_at`. The password hash was not changed after that success.
- No other v2 password grants were found in the windows checked from about 2026-11-04 13:30 UTC through 2026-11-06 13:30 UTC. Intervening `/token` activity was `refresh_token` (some logged with referer `http://localhost:3000`, which is the Site URL fallback when Referer is absent — session refreshes, not new password logins).
- First https://getthehayout.com/ password-grant failures: 2026-11-07 12:42:26 UTC and 12:42:33 UTC (7:42 AM ET), then 12:54:59 UTC (7:54 AM ET), from desktop Chrome/155. Then iPhone Safari at 13:06:33, 13:15:14, and 13:17:49 UTC (8:06, 8:15, and 8:17 AM ET). A vault-filled submit from GTHO Build’s browser test failed at 13:44:40 UTC (8:44 AM ET). All were `invalid_credentials`. The first custom-domain failure was already that error, not a lockout.

## Account state on GTHO-v2 (project `sxkmultsfsmfcijvsauf`)

User `tim@6knot.com`:

- id `a41ee49a-23e5-4757-a37c-91cef8666d22`
- confirmed 2026-04-13
- `banned_until` null, `deleted_at` null
- `aud` = `authenticated`, `role` = `authenticated`
- has a password (`has_password` true); bcrypt `$2a$` hash length 60 (do not copy or commit the hash)
- identity provider: email, identity email `tim@6knot.com`

A leftover `auth.one_time_tokens` confirmation token from 2026-04-13 is original signup leftover, not a later password change.

`auth.audit_log_entries` was empty; useful history is in auth logs.

GTHO v1 (separate project `oihivpwftpngbhwpjsqt`) also has `tim@6knot.com` (last sign-in 2026-10-04) and other addresses on that older project. Tim said mixing v1 and v2 credentials is not the issue. Do not list other people’s v1 emails in chat or follow-up docs.

## Ruled out

- Leftover v1 page on the custom domain. Live title, bundle, and Supabase project ref are v2 only.
- CORS. Preflight returns 200 and `Access-Control-Allow-Origin` echoes the requesting Origin. Dummy password-grant POSTs from several Origins were accepted as CORS and still returned `invalid_credentials`.
- Service worker. `sw.js` intercepts same-origin GETs only, not Auth POSTs. Private mode still fails.
- Captcha, MFA, OAuth, passkeys. GoTrue public settings: email enabled, `disable_signup` false, `mailer_autoconfirm` true, no captcha, no OAuth, no passkeys.
- Edge password-verification hooks. No edge functions listed; no `supabase_functions` hook tables found.
- Password changed after the 6:41 AM ET success. Hash/`updated_at` unchanged.
- Banned, deleted, or unconfirmed user.
- Login form wiring / variable shadowing in the live minified overlay. `handleSubmit` passes the email and password fields correctly; the success callback is `onSuccess`, not a shadowed input. Email is `.trim()`’d; password is raw `.value` (not trimmed).
- Client construction: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)` with no extra options. `.github/workflows/deploy.yml` bakes those GitHub secrets into the Pages build. `@supabase/supabase-js` is `^2.103.0` (lockfile 2.103.0 / auth-js 2.103.0). Vite `base` is `/`.

## Known config gap that does not explain this error

GTHO-v2 Site URL still appears to be `http://localhost:3000` (GoTrue logs missing Referer as Site URL). That is a real leftover from the domain move and should be cleaned up later, but it does not cause `invalid_credentials`. Pull request #80 (base-path / custom domain) left Supabase Auth URLs unchanged on purpose.

## Unproven hypothesis

Production Pages bakes the project’s publishable key (`sb_publishable_…`, type publishable, name `default`) from the GitHub secret `VITE_SUPABASE_ANON_KEY`. The same project also has a legacy JWT anon key (not disabled). Local `npm run dev` often uses the legacy JWT anon key from `.env`.

The live JavaScript contains the publishable key, not the legacy JWT. supabase-js 2.103.0 should support publishable keys, and Supabase docs say user auth is unchanged when swapping anon → publishable. That has not been proven against this project with Tim’s actual password.

Dummy password-grant POSTs that used the publishable key all returned `invalid_credentials`. Those tests used invented passwords, so they cannot distinguish “wrong password” from “this key type never accepts a correct password.”

A same-password comparison (legacy JWT anon with Bearer vs publishable with Bearer vs publishable apikey-only), using the vault-filled login on https://getthehayout.com/, did not run: the browser tool refused to execute a page script that would read the filled password and post Auth attempts. So this hypothesis is still open.

If a later test shows the legacy anon key succeeds and the publishable key fails with the same password, the live GitHub secret / baked publishable key is the likely production cause versus the 6:41 AM ET localhost success. If both key types fail, Auth is rejecting the submitted password against the unchanged bcrypt hash.

Never commit, paste, or chat the anon key, publishable key, password, recovery links, or IP addresses.

## What to build / change

Nothing yet. This document is diagnosis only.

Grok project chat should decide the next diagnostic step or, if a cause is proven, write a real implementation brief before any code or Supabase/GitHub-secret change.

## Acceptance criteria

Not applicable until a fix is designed. A later implementation brief must say exactly what to change.

## Constraints and traps to avoid

- Do not invent a production key swap, Site URL change, redirect-allowlist change, or app code change from this diagnosis.
- Do not send a password-reset or recovery email unless Tim asks.
- Do not put credentials, API keys, tokens, recovery links, or IP addresses in chat, commit messages, pull request bodies, or docs.
- Do not present diagnostic POSTs that used dummy passwords or GTHO Build’s own browser as Tim’s login attempts.
- Mode B if implementation is later designed: feature branch from latest `main`, pull request into `main`. Feature branches do not deploy. Homelab Git Bridge manages and merges implementation pull requests.
- GTHO Build does not merge pull requests or apply migrations without Tim / Git Bridge.

## References

- Live app: https://getthehayout.com/ (after #82: stamp `b2026-11-07.1316-70f3ea4`, merge `70f3ea400fcd654b1462475e496cbafb6590c703`)
- Domain-root cutover: pull request #80 (merge `b71a1a6`)
- Login overlay build stamp: pull request #82
- `src/features/auth/index.js`, `src/features/auth/session.js`, `src/data/supabase-client.js`
- `.github/workflows/deploy.yml` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `PROJECT_STATUS.md` (current state still named the #80 stamp `b2026-11-07.1216-b71a1a6` when this diagnosis was written; live stamp after #82 is `b2026-11-07.1316-70f3ea4`)

## Open questions for the implementer

- Does the same correct password succeed against GTHO-v2 when sent with the legacy JWT anon key and fail with the publishable key (or the reverse)? That comparison has not been completed.
- If both key types fail, why does Auth reject a password Tim says is unchanged since the 6:41 AM ET localhost success, while the stored hash is also unchanged?
