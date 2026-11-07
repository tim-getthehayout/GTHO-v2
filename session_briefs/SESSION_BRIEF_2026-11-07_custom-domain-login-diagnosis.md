# SESSION_BRIEF — Custom-domain login diagnosis (getthehayout.com)

**Generated:** 2026-11-07
**Updated:** 2026-11-07 (session complete; Tim confirmed password reset on the live app)
**Source:** Grok diagnosis after the GitHub Pages cutover to https://getthehayout.com/
**Status:** Complete. Tim confirmed on 2026-11-07 that the forgot-password flow works on https://getthehayout.com/. A recovery email link opens the change-password form. Live stamp at this close-out, from https://getthehayout.com/version.json: `b2026-11-07.1612-f9b5948` (PR #87).

Do not record passwords, API keys, tokens, recovery links, or IP addresses in this file.

## What was decided

- The login rejection on https://getthehayout.com/ was a password mismatch. It is not a publishable-key bug and not a Site URL bug.
- The hash accepted a 15-character password. A 20-character vault entry was rejected. The publishable key and the custom domain both accept a correct password.
- Keep `VITE_SUPABASE_ANON_KEY`. Do not swap it back to the legacy anon JWT.
- Leave the v1 Supabase project unchanged.
- Tim can sign in with the new password set directly on `tim@6knot.com` on 2026-11-07. A password grant with that password against the live publishable key returned HTTP 200.
- This is a forgot-password flow. The user does not enter the current password. They request a reset by email, open the link, and set a new password (new password and confirmation only, then `updateUser`). Cancel abandons the reset: sign out, clear the recovery flag, and return to login.
- Dashboard (done by Tim, not git): Site URL is `https://getthehayout.com/` with a matching redirect allowlist. Localhost was left off the allowlist unless someone needs to test Forgot password from local `npm run dev`. A reset email sent before that dashboard change opened Safari on localhost and did not change the password.

## Symptom

After the live app moved to https://getthehayout.com/, login failed with “Login failed. Check your email and password.” The live client calls `signInWithPassword`, which POSTs `/auth/v1/token?grant_type=password`. Those requests returned HTTP 400 `invalid_credentials`.

Moving to a new origin dropped the previous github.io `localStorage` session, so a new sign-in was required. That explains the login screen. It does not explain a rejected password.

## Cause

`invalid_credentials` on a password grant means email+audience not found, the user has no password, the password hash does not match, or a password-verification hook rejects. It is not caused by Site URL, redirect allowlist, CORS, or Origin.

The account hash matched the password sent at 2026-11-07 11:41:02 UTC (6:41 AM America/New_York). The edge log for that HTTP 200 shows referer `https://tim-getthehayout.github.io/`, the same publishable key the custom domain uses, and `supabase-js-web/2.103.0`. The Auth log referer `http://localhost:3000` is the project Site URL, not the page the browser was on.

That success and every later browser failure from desktop Chrome and iPhone Safari had request body length 85. For `tim@6knot.com` the live client body is `{"email","password","gotrue_meta_security":{}}`, and 85 bytes is a 15-character password. The vault password Tim supplied was 20 characters. A 20-character password is a 90-byte body. Auth rejected that exact string with `invalid_credentials`. The browser never submitted it. The failed attempts were a different 15-character password.

A separate temporary account created with the live publishable key signed in with a known password (HTTP 200 for `Authorization: Bearer` plus `apikey`, and for `apikey` alone). One extra character returned HTTP 400 `invalid_credentials`. That account was deleted. Do not treat those requests, or other diagnostic POSTs, as Tim’s login attempts.

The password hash was replaced directly in Auth on 2026-11-07 after the reset email failed to load. Do not copy the old or new password into docs or chat.

## Ruled out

- Leftover v1 page. Live title, bundle, and project ref are v2.
- Publishable key unable to accept a correct password. Proven with a known password, then again with Tim’s new password.
- CORS. Preflight returns 200. Wrong passwords still reach Auth and return `invalid_credentials`.
- Service worker. `sw.js` does not intercept Auth POSTs.
- Captcha, MFA, OAuth, passkeys, and edge password-verification hooks. None were active.
- Password changed between the 6:41 AM ET success and the custom-domain failures. `updated_at` matched that sign-in until the later direct password replacement.
- Banned, deleted, or unconfirmed user.
- Login form wiring. Email is trimmed. Password is the raw field value. The form has no length limit.
- A pasted newline or extra space on the 20-character vault password. That would have made the body longer than 85 bytes. The browser requests stayed at 85.

## Follow-up

### 1. Auth URL configuration (dashboard, done by Tim, not git)

Done. Site URL is `https://getthehayout.com/` with a matching redirect allowlist. Localhost was left off the allowlist unless someone needs to test Forgot password from local `npm run dev`. When the diagnosis first closed, Site URL was still `http://localhost:3000`. The password-reset email opened Safari there, and nothing was listening. Pull request #80 left these Auth URLs unchanged on purpose. v1 is a different project. Leave v1 unchanged. This repository does not apply the dashboard change.

### 2. Password-reset UI (shipped)

PR #85 (https://github.com/tim-getthehayout/GTHO-v2/pull/85), merge `3b10758e8a830e2c073db1e5e5bdeb831f4aa5a6`. Live header stamp after that Pages deploy: `b2026-11-07.1539-3b10758`. The login screen can request a reset (`resetPasswordForEmail`). The change-password screen collects a new password and a confirmation, then calls `updateUser({ password })`.

PR #86 (https://github.com/tim-getthehayout/GTHO-v2/pull/86), merge `9808f843acf56c165bd9e0c85a97cf0aa0fa9414`. Live header stamp after that Pages deploy: `b2026-11-07.1556-9808f84`. Cancel on the change-password screen signs the user out, clears the recovery flag, and returns to login. That abandons the reset.

PR #87 (https://github.com/tim-getthehayout/GTHO-v2/pull/87), merge `f9b5948a6b3657f8bb0521413c0199634f93b4b0`, feature head `2c92ba36b45fb773154ec8bf1f64ec71c6c932cc`. Live header stamp after that Pages deploy: `b2026-11-07.1612-f9b5948`. Closes OI-0194.

Recovery-link bug: reset emails used a `redirectTo` that included `#/change-password`. After the GoTrue verify redirect that could produce a double-hash URL, so supabase-js failed to parse the tokens and the app showed login instead of the change-password form. The fix stopped putting the hash in `redirectTo` (hash-free origin plus `BASE_URL`; production `BASE_URL` is `/`, so the redirect is `https://getthehayout.com/`). Client-side recovery detection rewrites an inbox email that still has `#/change-password` to a clean token fragment before `createClient`. The screen opens from the recovery signal. Tim confirmed on 2026-11-07 that a recovery email link now opens the change-password form on the live app.

## What not to build

- Do not swap the GitHub secret or the baked publishable key for the legacy anon JWT.
- Do not treat Site URL as the cause of `invalid_credentials`.
- Saved browser and vault logins may still hold the old password. That is an operator update, not a code change. An old saved password will fail login again.

## Acceptance criteria

- Met. Dashboard Site URL is `https://getthehayout.com/` with a matching redirect allowlist. Localhost was left off the allowlist unless someone needs to test Forgot password from local `npm run dev`. That change is dashboard configuration, not this repository.
- Met. From the logged-out login screen, a person can request a reset for an email (PR #85).
- Met. The link in that email opens the change-password form on `https://getthehayout.com/`. `redirectTo` is the hash-free origin plus `BASE_URL`, not a hash route. Tim confirmed this on 2026-11-07 (PR #87).
- Met. That page accepts a new password and a confirmation and calls `updateUser({ password })`. It does not ask for the current password.
- Met. Cancel signs out, clears the recovery flag, and returns to login (PR #86).
- Met. The publishable key in the Pages build is unchanged.
- Met for this close-out. No password, key, token, or recovery link is written into the repo.

## Constraints

- Mode B: feature branch from latest `main`, pull request into `main`. Feature branches do not deploy.
- The Site URL change is Supabase dashboard configuration for project `sxkmultsfsmfcijvsauf`. It is not a migration.
- GTHO Build does not merge pull requests.
- Docs-only updates to this brief and `PROJECT_STATUS.md` go through Homelab Git Bridge.

## References

- Live app: https://getthehayout.com/ (stamp at this close-out `b2026-11-07.1612-f9b5948`, from version.json)
- Password-reset request and change-password screen: pull request #85 (merge `3b10758e8a830e2c073db1e5e5bdeb831f4aa5a6`, stamp `b2026-11-07.1539-3b10758`)
- Change-password Cancel: pull request #86 (merge `9808f843acf56c165bd9e0c85a97cf0aa0fa9414`, stamp `b2026-11-07.1556-9808f84`)
- Recovery-link fix: pull request #87 (merge `f9b5948a6b3657f8bb0521413c0199634f93b4b0`, feature head `2c92ba36b45fb773154ec8bf1f64ec71c6c932cc`, stamp `b2026-11-07.1612-f9b5948`, OI-0194)
- Domain cutover: pull request #80 (merge `b71a1a6`)
- Login overlay stamp: pull request #82 (merge `70f3ea4`)
- Closed diagnosis write-up: pull request #84 (merge `f16e4aa`); earlier status stamp `b2026-11-07.1405-2a1d751` (PR #83, merge `2a1d751`)
- `src/features/auth/index.js`, `src/features/auth/session.js`, `src/features/auth/recovery.js`, `src/data/supabase-client.js`
- `.github/workflows/deploy.yml` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `@supabase/supabase-js` 2.103.0

## Close-out

Shipped and confirmed 2026-11-07. Login `invalid_credentials` was a password mismatch. Site URL is the custom domain (dashboard, by Tim). Password reset is request, recovery link, new password plus confirmation. Cancel abandons the reset. The double-hash recovery link is fixed in PR #87. No schema change.
