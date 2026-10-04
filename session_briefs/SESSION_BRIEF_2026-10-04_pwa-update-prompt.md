# SESSION_BRIEF — PWA update prompt

**Generated:** 2026-10-04
**Source:** Grok design session
**Status:** Implemented in `5c2db09`. Header stamp of status commit `61472d3` is `b2026-10-04.2104-61472d3`.

## What was decided

The Home Screen app never asks to update because v2 has no service worker, no manifest, and no version poll. Live Pages confirmed 2026-10-04: `sw.js`, `manifest.webmanifest`, and `version.json` are 404. The icon is a web clip holding a stale Vite shell.

Ship the v1 gate, scoped to `/GTHO-v2/`: a stable service worker that does not `skipWaiting()` until the user taps Update now, plus a `version.json` poll as the backstop. No Workbox. No auto-reload. No install nag.

Full decision is `github/issues/GH-59_OI-0192_pwa-update-prompt.md`. Do not invent design past that file.

## What to build / change

Implemented in `5c2db09` from `github/issues/GH-59_OI-0192_pwa-update-prompt.md`. The GitHub issue is GH-59. OI-0192 was closed in that commit.

## Acceptance criteria

The checklist in the spec, section 8. Lint and unit tests green. Report the header stamp after the Pages workflow succeeds. Tell Tim to remove and re-add the Home Screen icon once.

## Constraints and traps to avoid

- `controllerchange` from the first `clients.claim()` must not reload. Reload only after Update now set `sessionStorage['gtho_pwa_update_accepted']`.
- Do not register `sw.js?v=`. Embed the stamp in the worker file instead.
- Do not cache `version.json` or Supabase. Poll with `cache: 'no-store'` and a `?t=` query. Pages caches for 10 minutes.
- Do not await PWA init before first paint.
- `__BUILD_STAMP__ === 'dev'` skips registration.
- Banner is not a toast. z-index under the sheet.

## References

- `github/issues/GH-59_OI-0192_pwa-update-prompt.md`
- `PROJECT_STATUS.md` decision row 2026-10-04 PWA update prompt
- `V2_INFRASTRUCTURE.md` §7.3 and CP-59 in `V2_BUILD_INDEX.md` (update prompt only; do not expand the checkpoint)
- v1 reference, do not copy the `?v=` registration: `get-the-hay-out` `sw.js` and the registration block in its `index.html`

## OPEN_ITEMS changes

- OI-0192 was closed in `5c2db09`.

## Open questions for the implementer

- None. Icon mark, copy, scope, and apply behavior are decided in the spec.
