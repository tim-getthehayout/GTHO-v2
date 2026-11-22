# Retire the standalone Locations menu item + one feed-type dialog (OI-0265)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 6:38 PM ET + 6:39 PM ET + 6:42 PM ET + 6:44 PM ET (America/New_York). Tim, 2026-11-22 6:38 PM ET, via Orchestrator, card **t1285s5011**: “Q2 A: Surveys link in List tools opens #/surveys with Edit; inputs use #/amendments” (Q1 skipped on the card) + Tim, 2026-11-22 6:39 PM ET, via Orchestrator, typed **t1286u** (Q1): “for the first question lets simply replicate the missing items exactly as they are in the legacy locations screen” + Tim, 2026-11-22 6:42 PM ET, typed **t1288u**: “one item i just foudn is the edit feed type from the feed screen is different than teh one from the locations form. It should use teh dialog from the feeds screen that should be used.” + Tim, 2026-11-22 6:44 PM ET, typed **t1289u**: “actually the edit from the locations screen is launched from within the feed types dialog. Not directly from the locations screen.” Codes: **Nv1 + Lk1 + Lg1 (Q1) + Sv-A/In-A (Q2) + Rd1 + Ft1**. Design readings are marked **(Design reading)** — each is a veto line on Tim's land card.
**Opened:** ~6:38 PM ET by GTHO Design from Tim **t1282u** (6:34 PM ET, via Orchestrator): “lets archive the locations menu item now that we have consolidated”.
**Branch tip:** `docs/oi-locations-nav-retire`, stacked on `docs/oi-past-block-per-window` (OI-0264) off `origin/main` `b02c6276a233c3d6d2934892384f70b97663b6d4`. Docs only — do not land until Tim land yes.
**No SQL / no migration / no data change.**

Line numbers are at main `b02c627` (`src/` identical to `1555ab9`).

---

## What exists today

**Nav entries for `#/locations`:** `src/ui/header.js:60` (desktop sidebar, `nav-locations`), `:76` (old header nav, `nav-locations`, `t('nav.locations')`), `:536` (mobile bottom nav, `bnav-locations`); label `src/i18n/locales/en.json:105` `nav.locations`; screen-name map `header.js:698`. Route `src/main.js:381` `#/locations` → `renderLocationsScreen`. Locations & Rotation is `#/events` (`main.js:380`). OI-0263 already repoints `header.js:61` / `:77` (Map).

**In-app links to `#/locations`:**

| Where | Today | Becomes |
|---|---|---|
| `calendar-grid.js:620-624` Season bar link “Locations · Surveys · Map” | `navigate('#/locations')` | removed (Survey/Map/Surveys are in List tools) **(Design reading)** |
| `calendar-grid.js:1020`, `:1054`, `:1077` future-block “Survey” action | `navigate('#/locations')` | `openSurveySheet(loc.id, operationId)` in place |
| `calendar-grid.js:1151` empty-state “+ Add location” | `navigate('#/locations')` | `openLocationSheet(null, operationId, farmId)` |
| `dashboard/index.js:1585`, `events/detail.js:441` missing forage type | `navigate('#/locations')` | open that paddock's location edit sheet (`openLocationSheet(loc, …)`) |
| `harvest/index.js:251` “Feed types” | `navigate('#/locations')` + close harvest sheet (never opens feed types) | `openFeedTypesSheet(operationId)` (Ft1) |

**Only on the legacy screen (`src/features/locations/index.js`):**
- **Locations tab** (`renderLocationsTab` `:158-294`):
  - Inputs & amendments header + “Apply input” + last 8 inputs (`:160-179`).
  - Toolbar `:185-193`: “+ Add”, “Map”, “📋 Survey”, “🌾 Harvest”, “⚙ Feed types”, search “Filter locations…”.
  - **Type pills** `:195-208`: All / Pasture / Mixed-Use / Crop / Confinement / Storage (`t('location.filter.storage')`); filter rule `:250-255` (confinement/storage by `type`, others `type === 'land' && landUse === value`).
  - **Farm pills** (multi-farm only) `:210-226`: “All farms” + one per farm, amber when active; filter `:257-258`.
  - Sort header `:228-240`: Name · Acres | Survey (rating).
  - List `:246-291`: non-archived, filter → farm → search (name / field code) → sort; empty “No locations match this filter”.
  - **Card** `buildLocationCard` `:297-400`: name + type badge (pasture / mixed-use / crop / Confinement / Storage) + field code (“no code”) + “active” badge; detail line (confinement: “Confinement · N% capture”; else acres/ha · soil type · forage type); soil-test line (non-confinement: “✓ Soil tested <date> · N:P:K unit” or “No soil test yet”); est. available DM + survey line (pasture/mixed with height, forage type, area); right side: survey rating chip, **Edit** (`openLocationSheet`; the sheet has **Delete location** `:527`), and for non-confinement **📋 Survey** + **✎ Soil**.
- **Surveys tab** (`renderSurveysTab` `:106-156`): draft banner with **Resume** (`openSurveySheet(null, op)`) / **Discard** (confirm “Discard this survey draft?”, removes draft entries + survey); “+ New Survey”; committed surveys (date · N paddocks · names) each with **Edit** (`openSurveySheet(null, op, { editSurveyId })`).
- Re-render on `locations`, `paddockObservations`, `soilTests`, `forageTypes`, `feedTypes` (`:99-103`).

**Locations & Rotation List today** (`calendar-grid.js:500-575`): tools “+ Add”, “Map”, “📋 Survey”, “🌾 Harvest”, “⚙ Feed types”, “Apply input”; search; pills **All / Pasture / Mixed-Use only**; a bare label “Inputs & amendments”. Rows are pasture/mixed only (`filterManagementLocations`, `location-metrics.js:76-86`; `calendar-grid.js:219`). No farm pills. The Events screen re-renders only on `events` (`events/index.js:151`) and List “+ Add” passes no `onSaved`, so **a newly added location does not appear until the screen remounts**.

**`#/surveys`** (`surveys/index.js`, `main.js:388`): lists drafts (Add entry / Finish / Delete) and committed surveys (badge only — **no Edit**). **`#/amendments`** (`main.js:390`, `amendments/entry.js:18`) lists inputs.

**Prod (SELECT, 2026-11-22):** non-archived locations: 33 pasture, 1 crop, 1 confinement, 2 storage (4 stranded if the screen goes). 3 feed types, all hay; 2 have `harvest_active = false`.

## Feed types (Ft — t1288u / t1289u)
Path today: Locations (legacy toolbar `:191` or L&R List tools `calendar-grid.js:557`) → **Feed types dialog** (`openFeedTypesSheet`, `locations/index.js:1075-1195`: list + inline add/edit form) → **Edit** → the **inner form**. The Feeds screen (`#/feed`) uses its own list (`feed/index.js:447-503`) and **edit dialog** (`openFeedTypeSheet` `:510-656`, save `:658-702`).

| | Inner form (Feed types dialog) | Feeds-screen edit dialog (canonical) |
|---|---|---|
| Layout | inline under the list in the same sheet; “Add feed type” / “Edit feed type” | its own sheet; “Create” / “Edit feed type” title |
| Name | text, “Round bale” placeholder; UI rejects empty | text; empty left to entity validate |
| Category | 3 options: Hay/forage, Silage, Grain/supp | 5: Hay, Silage, Grain, Supplement, Other |
| Unit | feed-unit picker + `normalizeFeedUnit` | same |
| DM % | number; **auto-filled from the forage type's DM %** | number; no auto-fill |
| Default weight | number in user units → kg | same |
| N / P / K % | **absent** | present |
| Cutting # | select None / 1–4 | free number |
| Forage type | all forage types (incl. archived), “— Custom / none —” | non-archived only, “no forage type” |
| Harvest active | **absent — always saves `harvestActive: true`** | On / Off toggle (keeps existing value) |
| Delete | “Delete” in the edit form | on the Feeds list row (not in the dialog) |
| Number parse | `optionalFormNumber` | `parseFloat` |
| Save path | `update` / `add` `feedTypes` with `FeedTypeEntity.validate` / `toSupabaseShape` | same store calls |

**Data effects of the inner form:** editing a type there **turns Harvest active back on** (2 of 3 prod types are Off), and a `supplement` / `other` type has no matching option so it re-saves as **hay**. It cannot set N/P/K (it leaves existing values alone). The dialog list also shows archived types and always shows weight in lbs.

---

## Locked spec

### Nv1 — remove the Locations menu item (t1282u)
Remove `header.js:60` (sidebar), `:76` (header nav), `:536` (bottom nav). `nav.locations` (`en.json:105`) removed if unused **(Design reading)**; `header.js:698` screen-name map keeps `'#/locations'` harmlessly or drops it (Build's choice).

### Lk1 — repoint every in-app link (table above)
All six links open the right sheet in place or are removed; none navigate to `#/locations`.

### Lg1 — replicate the missing legacy items exactly (Q1, t1286u)
- **(Design reading) placement:** in the **Locations & Rotation List view** (not Calendar). The pill row becomes the legacy six — **All / Pasture / Mixed-Use / Crop / Confinement / Storage** — with the legacy filter rule (`locations/index.js:250-255`). Farm pills (`:210-226`) appear on the List view for multi-farm users only, same look and rule.
- **Pasture / Mixed-Use** rows stay the current List rows (metrics etc.).
- **Crop / Confinement / Storage** render with the legacy card exactly (`buildLocationCard` `:297-400` — same badge, field code, detail line, soil-test line, rating chip, **Edit** → location sheet with **Delete location**, **📋 Survey** + **✎ Soil** for non-confinement, exactly as legacy, including on crop/storage). No calendar row, no metrics.
- **(Design reading) order:** under **All**, the legacy cards come **after** the pasture/mixed rows, sorted by name; the List search filters both. **(Design reading)** reuse, don't copy: export `buildLocationCard` from `locations/index.js` and call it from the List so it stays identical.
- **(Design reading)** the Calendar view keeps pasture/mixed only (unchanged).
- **(Design reading)** if a farm has no pasture/mixed but has other types, the List view still renders (the “No pasture locations yet” empty state applies to Calendar only).
- **Saved locations appear at once:** the List re-renders on `locations`, `paddockObservations`, `soilTests`, `forageTypes`, `feedTypes` (same set as legacy `:99-103`), so a new crop / confinement / storage location shows after save under All and its pill.
- **(Design reading)** the legacy “Inputs & amendments” last-8 list is not copied; per Q2 A past inputs live on `#/amendments` (below).

### Sv-A / In-A — surveys and inputs (Q2 A, t1285s5011)
- List tools gain **“Surveys”** → `#/surveys`. `#/surveys` gains, for parity with the legacy tab: **Edit** on each committed survey (`openSurveySheet(null, operationId, { editSurveyId })`), and on a draft **Resume** (`openSurveySheet(null, operationId)`) and **Discard** (confirm “Discard this survey draft?”; removes draft entries + survey). Existing draft actions stay.
- **(Design reading)** the List view's bare “Inputs & amendments” label becomes a link to `#/amendments` (“Apply input” stays).

### Rd1 — old links (Q1 locked, so no interim)
`#/locations` **redirects to `#/events` List view**, the same way OI-0263 redirects `#/map`. The interim “All locations” link is dropped. **(Design reading)** `renderLocationsScreen` stays exported but unrouted (harmless; existing unit tests import it — `manual-amendment-shortcut`, `locations-area-hectares`, `metric-area-display`, `manual-soil-tests`); delete it in a later cleanup. `locations/index.js` stays for its sheets.

### Ft1 — one feed-type edit dialog (t1288u, t1289u)
- The **Feed types dialog** (`openFeedTypesSheet`) stays the list/manager entry point from Locations & Rotation (List tools “⚙ Feed types”) and the harvest sheet link.
- Its **Edit** opens the **Feeds-screen edit dialog** (`openFeedTypeSheet(ft, operationId)`), exported from `feed/index.js` with its sheet DOM created on demand (today the sheet DOM exists only inside the Feed screen) and stacked above the Feed types dialog.
- **(Design reading) Add too:** the dialog's inline add/edit form is retired; a **“+ Add feed type”** button opens the same Feeds dialog with no type.
- **(Design reading) rows:** the dialog's list uses the Feeds-screen row (non-archived only; category · unit · DM % · weight in the user's units · cut · harvest) with **Edit** and **Delete** (Delete uses the Feeds confirm `feed.confirmDeleteFeedType`), and refreshes when `feedTypes` changes.
- **(Design reading) harvest link:** `harvest/index.js:251` opens the Feed types dialog over the harvest sheet without closing it; the harvest feed-type picker refreshes on return.
- No data change: existing types keep their saved values; from now on edits keep Harvest active, category, N/P/K as set on the Feeds dialog.

### Stacking
After OI-0263 (`header.js:61/:77`, Map views/redirect, same `calendar-grid.js` List tools) and OI-0264 (`calendar-grid.js` past blocks). Build branches after both merge or stacks on them.

### Tests
1. Header: sidebar, header nav and bottom nav have no `nav-locations` / `bnav-locations` (update `tests/unit/ui/header.test.js:319,338`).
2. `#/locations` redirects to `#/events` List view (update `tests/unit/main-boot.test.js:122`, `tests/e2e/smoke.spec.js`, `tests/unit/locations-list-nav.test.js`).
3. Season bar link gone; future-block Survey opens the survey sheet for that paddock; empty-state “+ Add location” opens the location sheet; dashboard / event-detail missing forage type opens that location's edit sheet; harvest “Feed types” opens the Feed types dialog.
4. List pills: six legacy pills; Crop / Confinement / Storage show only those types as legacy cards (badge, detail, Edit, Survey/Soil per legacy); Pasture / Mixed-Use show List rows; All shows both, cards after rows.
5. Farm pills only when there are 2+ farms; filter by farm.
6. A new storage location saved from List “+ Add” appears immediately under All and Storage.
7. `#/surveys`: committed survey has Edit opening the bulk-edit sheet; draft has Resume and Discard (confirm, removes entries + survey).
8. List “Surveys” → `#/surveys`; “Inputs & amendments” → `#/amendments`.
9. Feed types dialog: Edit opens the Feeds-screen dialog (has N/P/K, 5 categories, Harvest active toggle); saving a type with Harvest active Off keeps it Off; a `supplement` type keeps its category; “+ Add feed type” opens the Feeds dialog empty; archived types are not listed; Delete removes with confirm; list refreshes after save.

### Fix size
M (nav + redirect + 6 links + List pills/cards/farm pills + surveys parity + feed-type dialog reuse + tests).
