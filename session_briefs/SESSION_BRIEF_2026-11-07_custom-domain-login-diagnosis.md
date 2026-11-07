# SESSION_BRIEF — Custom-domain login diagnosis (getthehayout.com)

**Generated:** 2026-11-07  
**Source:** GTHO Build diagnosis after the GitHub Pages cutover to https://getthehayout.com/  
**Status:** Diagnosis complete. Cause proven. Two follow-ups are in progress: the Site URL dashboard change, and the in-app recovery UI.

## Resolution

`invalid_credentials` was a password mismatch. It was not the custom domain and not the publishable key. The stored hash accepted a 15-character password. A 20-character vault entry was rejected. Tim is logged in with a new password set directly on the account. This session does not send a recovery email.

Two follow-ups are being applied:

1. **Site URL (dashboard, not git).** In the GTHO-v2 project, Authentication → URL Configuration: set Site URL to `https://getthehayout.com/`, allow that origin on the redirect list, and keep `http://localhost:3000` for local dev. This PR does not apply that dashboard change. Site URL does not cause `invalid_credentials`, and it still needs this update so recovery links return to the live app.
2. **In-app recovery UI (this change).** Login can request a reset (`resetPasswordForEmail`, `redirectTo` the current origin plus `#/change-password`). A change-password screen calls `updateUser({ password })` when a recovery session arrives (`type=recovery`, `verifyOtp`, or the `PASSWORD_RECOVERY` event) and then opens the app on that session.

The findings below are the diagnosis record. The resolution above is the current instruction.

## What was decided

- Find the real cause of login failure on https://getthehayout.com/. Tim rejected workarounds.
- Do not send a password-reset email unless Tim asks. The in-app request control does not send one by itself.
- Tim confirmed he types `tim@6knot.com`.
- Tim said the vault login saved for https://getthehayout.com/ is the same password that worked on local development the morning of 2026-11-07. The vault entry was longer than the password the hash accepted.
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
- Password changed between the 6:41 AM ET success and the custom-domain failures. At that time the hash and `updated_at` were unchanged. The password was later set directly on the account. See Resolution.
- Banned, deleted, or unconfirmed user.
- Login form wiring / variable shadowing in the live minified overlay. `handleSubmit` passes the email and password fields correctly; the success callback is `onSuccess`, not a shadowed input. Email is `.trim()`’d; password is raw `.value` (not trimmed).
- Client construction: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)` with no extra options. `.github/workflows/deploy.yml` bakes those GitHub secrets into the Pages build. `@supabase/supabase-js` is `^2.103.0` (lockfile 2.103.0 / auth-js 2.103.0). Vite `base` is `/`.

## Known config gap that does not explain this error

GTHO-v2 Site URL still appears to be `http://localhost:3000` (GoTrue logs missing Referer as Site URL). That is a real leftover from the domain move. It does not cause `invalid_credentials`. It should still be set to `https://getthehayout.com/` in Authentication → URL Configuration, with that origin on the redirect allowlist and `http://localhost:3000` kept for local dev. That dashboard change is not applied by the recovery-UI change. Pull request #80 (base-path / custom domain) left Supabase Auth URLs unchanged on purpose.

## Publishable-key hypothesis — closed

Production Pages bakes the project’s publishable key (`sb_publishable_…`, type publishable, name `default`) from the GitHub secret `VITE_SUPABASE_ANON_KEY`. The same project also has a legacy JWT anon key (not disabled). Local `npm run dev` often uses the legacy JWT anon key from `.env`.

The live JavaScript contains the publishable key, not the legacy JWT. This hypothesis is closed: `invalid_credentials` was a password mismatch, not the key type. Do not swap the publishable key back to the legacy anon JWT.

Dummy password-grant POSTs that used the publishable key all returned `invalid_credentials`. Those tests used invented passwords, so they could not distinguish “wrong password” from “this key type never accepts a correct password.” The later account check did: the hash accepted a 15-character password, and a 20-character vault entry was rejected.

Never commit, paste, or chat the anon key, publishable key, password, recovery links, or IP addresses.

## What to build / change

The password mismatch is already resolved on the account. The two follow-ups in the resolution section are the remaining work: the Site URL dashboard change, and the in-app reset request plus change-password screen. Do not swap the publishable key back to the legacy anon JWT. Do not change deploy.yml secrets.

## Acceptance criteria

- Login “Forgot password?” collects an email and calls `resetPasswordForEmail` with `redirectTo` on the current origin’s `#/change-password` route.
- A recovery session (`type=recovery`, `verifyOtp`, or `PASSWORD_RECOVERY`) shows a change-password form that calls `updateUser({ password })` and then opens the app.
- No database migration. No Site URL edit in git.

## Constraints and traps to avoid

- Do not swap `VITE_SUPABASE_ANON_KEY` back to the legacy anon JWT, and do not change deploy.yml secrets.
- Do not send a recovery email from an agent session. The in-app control sends one only when someone uses it.
- Do not put credentials, API keys, tokens, recovery links, or IP addresses in chat, commit messages, pull request bodies, or docs.
- Do not present diagnostic POSTs that used dummy passwords or GTHO Build’s own browser as Tim’s login attempts.
- Mode B: feature branch from latest `main`, pull request into `main`. Feature branches do not deploy. Homelab Git Bridge manages and merges implementation pull requests.
- GTHO Build does not merge pull requests or apply migrations without Tim / Git Bridge.

## References

- Live app: https://getthehayout.com/ (after #82: stamp `b2026-11-07.1316-70f3ea4`, merge `70f3ea400fcd654b1462475e496cbafb6590c703`)
- Domain-root cutover: pull request #80 (merge `b71a1a6`)
- Login overlay build stamp: pull request #82
- `src/features/auth/index.js`, `src/features/auth/session.js`, `src/data/supabase-client.js`
- `.github/workflows/deploy.yml` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `PROJECT_STATUS.md` (current state still named the #80 stamp `b2026-11-07.1216-b71a1a6` when this diagnosis was written; live stamp after #82 is `b2026-11-07.1316-70f3ea4`)

## Open questions for the implementer

Resolved. The publishable key was not the cause. Auth rejected the submitted password because it did not match the stored hash: the hash accepted a 15-character password, and a 20-character vault entry was rejected.

Still outside this repo: the Site URL dashboard change in the resolution section. auth-js 2.103’s default implicit flow also overwrites the `#/change-password` hash with the recovery tokens, so the screen opens from `type=recovery` / `PASSWORD_RECOVERY` rather than from the hash router matching that route. Whether the dashboard allowlist ignores that hash fragment is not settled in the app code.
