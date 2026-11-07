# SESSION_BRIEF — Custom-domain login diagnosis (getthehayout.com)

**Generated:** 2026-11-07
**Updated:** 2026-11-07 (diagnosis closed; follow-up approved)
**Source:** Grok diagnosis after the GitHub Pages cutover to https://getthehayout.com/
**Status:** Diagnosis closed. Follow-up approved: Auth Site URL, then a reset flow. This is the spec for that follow-up.

Do not record passwords, API keys, tokens, recovery links, or IP addresses in this file.

## What was decided

- The login rejection on https://getthehayout.com/ was a password mismatch. It is not a publishable-key bug and not a Site URL bug.
- Do not swap `VITE_SUPABASE_ANON_KEY` back to the legacy anon JWT.
- Do not change the v1 Supabase project.
- Tim can sign in with the new password set directly on `tim@6knot.com` on 2026-11-07. A password grant with that password against the live publishable key returned HTTP 200.
- Tim approved a follow-up session for the two gaps below. Do not send another recovery email until both are in place. The reset email already sent opened Safari on localhost and did not change the password.

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

## Still open

### 1. Auth URL configuration (dashboard, not git)

GTHO-v2 Site URL is still `http://localhost:3000`. The password-reset email opened Safari there, and nothing was listening. Pull request #80 left these Auth URLs unchanged on purpose. v1 is a different project. Do not change v1.

- Set Site URL to `https://getthehayout.com/`.
- Allow that origin on the redirect list.
- Keep `http://localhost:3000` for local dev.

### 2. The app cannot finish a password reset

`src/features/auth/index.js` is login and signup only. Nothing calls `resetPasswordForEmail`. Nothing handles a recovery session and calls `updateUser({ password })`.

Changing the Site URL alone makes the next email open the live site and then stop on the normal login form.

- Add a way to request a reset from the login screen.
- Add a change-password screen the recovery link can open on the live origin.

## What not to build

- Do not swap the GitHub secret or the baked publishable key for the legacy anon JWT.
- Do not treat Site URL as the cause of `invalid_credentials`.
- Do not send a recovery email until both fixes above are in place.
- Saved browser and vault logins may still hold the old password. That is an operator update, not a code change. An old saved password will fail login again.

## Acceptance criteria

- Dashboard Site URL is `https://getthehayout.com/`. Local dev remains allowed.
- From the logged-out login screen, Tim can request a reset for his email.
- The link in that email opens `https://getthehayout.com/`, not localhost.
- That page accepts a new password, calls `updateUser({ password })`, and a later password grant with that password returns HTTP 200.
- The publishable key in the Pages build is unchanged.
- No password, key, token, or recovery link is written into the repo.

## Constraints

- Mode B: feature branch from latest `main`, pull request into `main`. Feature branches do not deploy.
- The Site URL change is Supabase dashboard configuration for project `sxkmultsfsmfcijvsauf`. It is not a migration.
- GTHO Build does not merge pull requests.
- Docs-only updates to this brief and `PROJECT_STATUS.md` go through Homelab Git Bridge.

## References

- Live app: https://getthehayout.com/ (stamp `b2026-11-07.1405-2a1d751`, PR #83, merge `2a1d751`)
- Domain cutover: pull request #80 (merge `b71a1a6`)
- Login overlay stamp: pull request #82 (merge `70f3ea4`)
- `src/features/auth/index.js`, `src/features/auth/session.js`, `src/data/supabase-client.js`
- `.github/workflows/deploy.yml` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `@supabase/supabase-js` 2.103.0
