# OI-0192 — Home Screen PWA does not detect a deploy or ask to update

**Status:** accepted by Tim, 2026-10-04. Ready for a Build session. Do not invent further design.
**Closes:** the update-prompt half of CP-59 / `V2_INFRASTRUCTURE.md` §7.3. Does not add an install nag, push, or a new offline-data path.
**Schema:** none. No migration.

---

## 1. What Tim is seeing

The app added to the Home Screen does not notice a deploy and does not ask to update. The header stamp stays on the old build.

Checked 2026-10-04 against live Pages (`https://tim-getthehayout.github.io/GTHO-v2/`):

- `index.html` is a Vite shell pointing at hashed `assets/index-*.js` and `assets/index-*.css`.
- `/GTHO-v2/sw.js`, `/GTHO-v2/manifest.webmanifest`, and `/GTHO-v2/version.json` are 404.
- No manifest link, no `apple-mobile-web-app-capable`, no touch icon.
- Pages sends `cache-control: max-age=600` on the HTML. Headers cannot be changed on GitHub Pages.
- `src/` never calls `navigator.serviceWorker`. The stamp is `__BUILD_STAMP__` baked into the bundle by `vite.config.js`. It changes only if the browser fetches a new shell.

Add to Home Screen without a manifest and service worker is a web clip. iOS keeps that start document and often does not revalidate it, so the clip keeps requesting the old hashed bundle. There is nothing to ask.

v1 had the gate this spec ports. `get-the-hay-out/sw.js` does not `skipWaiting()` on install. The page shows "Update now", posts `SKIP_WAITING`, and reloads once on `controllerchange`. It rechecks on `visibilitychange`. v2 never got that.

## 2. Decision

Ship a real installable PWA scoped to `/GTHO-v2/`, and a user-confirmed update. Do not auto-reload. An open sheet must not be thrown away.

Two signals, either one is enough to show the banner:

1. A waiting service worker (bytes of `sw.js` changed because the build stamp is embedded in it).
2. `version.json` stamp differs from the baked `__BUILD_STAMP__`. This catches a shell that updated its poll code but has no waiting worker yet, and the iOS document cache.

"Update now" applies the waiting worker when there is one, otherwise cache-busts the document. "Later" hides the banner until the next resume.

No Workbox. No `vite-plugin-pwa`. No new runtime dependency.

## 3. Files

- `public/manifest.webmanifest` — copied through as-is.
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png` — generate in this change. Rounded square, fill `#3B6D11`, white "GTHO". No illustration, no new brand.
- `public/sw.js` — source template. A placeholder `__GTHO_BUILD_STAMP__` is replaced in the emitted `dist/sw.js` so the worker bytes change every deploy. Do not register `sw.js?v=`. That only works if the HTML that holds the version already updated.
- `vite.config.js` — small plugin, `closeBundle`, writes `dist/version.json` as `{ "stamp": "<same value as __BUILD_STAMP__>" }` and writes `dist/sw.js` with the placeholder replaced. Do not fingerprint `sw.js` or `version.json`.
- `index.html` — manifest link, `theme-color` `#3B6D11`, `apple-mobile-web-app-capable` = `yes`, `apple-mobile-web-app-status-bar-style` = `default`, `apple-mobile-web-app-title` = `GTHO`, apple touch icon. Keep the existing `app-version` meta.
- `src/pwa/update.js` — pure decision plus registration. Exported decision function is what the tests hit.
- `src/pwa/banner.js` — persistent bar. Not `showToast` (that disappears in 4 seconds).
- `src/main.js` — call `initPwa()` after the first paint. Do not await it before paint (OI-0149). Call it for the signed-out shell too, so the login screen can update.
- `src/styles/main.css` — banner only.
- `src/i18n/locales/en.json` — three keys.
- `tests/unit/pwa/update.test.js` — decision function only. No real service worker in Vitest.

## 4. Manifest

```json
{
  "id": "/GTHO-v2/",
  "name": "Get The Hay Out",
  "short_name": "GTHO",
  "start_url": "/GTHO-v2/",
  "scope": "/GTHO-v2/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3B6D11",
  "lang": "en",
  "icons": [
    { "src": "/GTHO-v2/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/GTHO-v2/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

Paths must include the Pages base. `import.meta.env.BASE_URL` is `/GTHO-v2/`.

## 5. Service worker

Cache name `gtho-<stamp>`.

- `install`: do not call `skipWaiting()`. Precache of `/GTHO-v2/` and `/GTHO-v2/index.html` is best-effort. A precache failure must not fail install.
- `activate`: delete caches whose names start with `gtho-` and are not the current name. Then `clients.claim()`.
- `fetch`: ignore non-GET. Ignore other origins (Supabase must not be intercepted). Do not cache `sw.js` or `version.json` — for `version.json`, `fetch` with cache mode `reload` and return that response.
- Navigation (`mode === 'navigate'` or `accept` contains `text/html`): network-first, write a clone into the cache, fall back to cache then to the cached index.
- Path contains `/assets/`: cache-first, then network, then store the ok response.
- Everything else same-origin: network only.
- `message`: if `event.data === 'SKIP_WAITING'`, call `skipWaiting()`.

## 6. When to banner

Export a pure function, name it `decideUpdateAction`.

Inputs: `localStamp`, `remoteStamp` (string or null if the poll failed), `hasWaitingWorker`, `updateDismissed` (Later already pressed this resume), `isDev` (`localStamp === 'dev'`).

Returns one of `none`, `apply-worker`, `reload-document`.

- `isDev` → `none`. Do not register a worker under `vite` dev.
- `updateDismissed` → `none`.
- `hasWaitingWorker` → `apply-worker`.
- `remoteStamp` is a non-empty string and differs from `localStamp` → `reload-document`.
- else → `none`.

Registration:

- `navigator.serviceWorker.register(base + 'sw.js', { scope: base })` where `base` is `import.meta.env.BASE_URL`.
- On `updatefound`, watch the installing worker. Banner only once it is `installed` and `navigator.serviceWorker.controller` already exists. First install has no controller and must not banner.
- On boot, on `visibilitychange` to `visible`, and on `pageshow`: `registration.update()`, then poll, then decide. No interval timer.
- Poll: `fetch(base + 'version.json?t=' + Date.now(), { cache: 'no-store' })`. The query string is required because Pages caches for 10 minutes and the cache key includes the query. Failure leaves `remoteStamp` null. Do not banner on a failed poll alone.

## 7. Banner and apply

Copy, via i18n:

- `pwa.updateReady` = `A new version of GTHO is ready.`
- `pwa.updateNow` = `Update now`
- `pwa.updateLater` = `Later`

Bar fixed to the bottom, above the bottom nav, with `padding-bottom: env(safe-area-inset-bottom)`. z-index under the sheet overlay so an open sheet's Save is not covered. One bar; do not stack.

Test ids: `pwa-update-banner`, `pwa-update-now`, `pwa-update-later`.

Later: hide the bar and set `updateDismissed` until the next `visible` / `pageshow`. Do not write a permanent dismissal. The next deploy must be able to ask again.

Update now:

- Set `sessionStorage['gtho_pwa_update_accepted'] = '1'` before asking the worker to take over.
- `apply-worker`: `postMessage('SKIP_WAITING')` to the waiting worker.
- `reload-document`: `location.replace` the current path plus `?update=<remoteStamp>`, preserving the hash. Drop any previous `update` param.
- `controllerchange`: reload only if that session flag is `1`, then clear it, and only reload once. `clients.claim()` on first activate must not reload. This is the trap that loops the app.

## 8. Acceptance

- [ ] Decision tests cover: dev → none; dismissed → none; waiting worker → apply-worker; stamp mismatch and no worker → reload-document; poll failed and no worker → none; matching stamp and no worker → none.
- [ ] `npm run lint` and `npm run test:unit` pass.
- [ ] Production build emits `dist/sw.js` (stamp baked in, placeholder gone), `dist/version.json` with the same stamp, `dist/manifest.webmanifest`, and the three icons.
- [ ] Built `index.html` links the manifest and the Apple tags.
- [ ] No Supabase request is handled by the worker (grep the fetch handler for an early origin return).
- [ ] File the GitHub issue from this spec, then rename this file to `GH-{n}_OI-0192_pwa-update-prompt.md`.
- [ ] Flip OI-0192 to closed in `OPEN_ITEMS.md` in the same commit that cites it (hook enforces this).
- [ ] Do not call it live until the Pages workflow succeeds. Report the header stamp. Tim confirms on the device.

## 9. After it is live — Tim, once

The icon already on the Home Screen was added without a manifest. iOS will not upgrade that clip by itself. After the stamp is on the device in Safari, remove the Home Screen icon and add it again. The next deploy after that re-add is the one that should show the banner on open. Say this in the session close. Do not claim the old icon will update itself.

## 10. Out of scope

Install prompt (`beforeinstallprompt`). Web push. Background sync. A Workbox migration. Changing Pages cache headers. Offline edits (the sync queue already covers that). Auto-reload. A settings "check for update" button — resume is the check.
