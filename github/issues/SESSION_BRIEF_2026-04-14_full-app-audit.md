# SESSION BRIEF — Full App Audit (Post-Build Tightening)

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** All build work through CP-58 is complete (747 tests). A separate session is running the data-integrity audits (entity↔schema, shape round-trips, store alignment, migration transforms, calc tests). This session covers the **application-level** audits — code quality, spec compliance, and v1 trap avoidance. The goal is to catch any drift or sloppiness before we do a real test migration and move into Polish.

**Prerequisite:** Run this AFTER the first audit session (SESSION_BRIEF_2026-04-14_pre-migration-audit.md) completes, so test counts don't conflict.

---

## What to do

Run seven audits. For each one: fix violations in-place when the fix is obvious and mechanical. If a violation is ambiguous or requires a design decision, add it to OPEN_ITEMS.md and move on. Commit after each audit (or batch related fixes into one commit).

---

### Audit 7 — i18n Coverage

**Goal:** No hardcoded English in user-facing feature code. Every string the user sees goes through `t()`.

**How:**
1. For each file in `src/features/` and `src/ui/`, search for string literals that look like user-facing text (button labels, headings, error messages, placeholder text, status messages).
2. Verify each is wrapped in a `t()` call.
3. Ignore: testid strings, CSS class names, event names, console messages, internal keys, Supabase table/column names.
4. Fix violations by adding the string to `src/i18n/en.json` and wrapping in `t()`.
5. Report count: how many violations found, how many fixed.

**Files to scan:** All 49 files in `src/features/` and all 4 files in `src/ui/`.

---

### Audit 8 — innerHTML Check

**Goal:** No `innerHTML` assignments with dynamic/user-supplied content anywhere in the app. All dynamic DOM uses `el()`, `text()`, `clear()` from `src/ui/dom.js`.

**How:**
1. `grep -rn 'innerHTML' src/` — list every occurrence.
2. For each hit, determine if the content is static (safe) or includes any variable/user data (violation).
3. Static HTML in a one-time setup (e.g., a fixed SVG or icon) is acceptable. Any innerHTML that includes template literals with variables, or concatenates user data, is a violation.
4. Replace violations with DOM builder calls.

---

### Audit 9 — Logger Discipline

**Goal:** No `console.log`, `console.error`, `console.warn` in feature or data code. Only `src/utils/logger.js` and test files may use `console.*`.

**How:**
1. `grep -rn 'console\.' src/` — list every occurrence.
2. Exclude: `src/utils/logger.js` (the logger itself) and any file in `tests/`.
3. Every other hit is a violation. Replace with the appropriate `logger.*` call (`logger.error(category, message, context)`, `logger.warn(...)`, `logger.info(...)`).
4. Report count.

---

### Audit 10 — Sync Completeness (queueWrite before save)

**Goal:** Every function that mutates `S.*` data calls `queueWrite()` for each record before calling `save()`. This is the #1 v1 trap — complex functions that touch multiple tables often queue some records but forget others.

**How:**
1. For each file in `src/features/`, find every function that calls `save()` or the store's persist method.
2. Trace backward: for every `push()`, array splice, or property assignment on store state in that function, verify there is a corresponding `queueWrite()` call (or `queueEventWrite()` for event + child tables).
3. Pay special attention to multi-table mutations:
   - `src/features/events/close.js` — closes event + creates observations + manure transactions + feed checks
   - `src/features/events/move-wizard.js` — closes source windows + creates new event + new windows + feed transfers
   - `src/features/events/submove.js` — creates sub-move windows + observations
   - `src/features/health/calving.js` — creates calf animal + group membership + calving record + optional class reassignment
   - `src/features/health/breeding.js` — creates breeding record
   - `src/features/health/treatment.js` — creates treatment record
   - `src/features/amendments/entry.js` — creates amendment + amendment_locations
   - `src/features/amendments/manure.js` — creates manure batch + transactions
4. Report: list every mutation function audited and whether it passed or has a missing queueWrite.

**This is the highest-value audit in this session.** A missing queueWrite means data exists locally but silently never syncs to Supabase.

---

### Audit 11 — Doc ↔ Code Alignment (UX Flows Spot-Check)

**Goal:** Verify the implemented feature code matches the approved specs. Full coverage of all 19 UX flow sections would be a multi-day effort — this audit is a targeted spot-check of the flows most likely to have drifted during iterative build.

**How:** For each flow below, read the spec section and compare against the implementation. Report any deviations as: (a) intentional simplification (note it), (b) missing feature (flag in OPEN_ITEMS.md), or (c) incorrect behavior (fix it).

| Priority | Spec section | Feature file(s) | Why check this one |
|----------|-------------|-----------------|-------------------|
| P1 | V2_UX_FLOWS.md §1 (Move wizard) | `src/features/events/move-wizard.js` | Most complex flow, most iterations during build |
| P1 | V2_UX_FLOWS.md §9 (Event close) | `src/features/events/close.js` | Multi-table mutation, feed check + NPK |
| P1 | V2_UX_FLOWS.md §14 (Health recording) | `src/features/health/*.js` | 7 sub-components, calving has calf creation side effects |
| P2 | V2_UX_FLOWS.md §7 (Survey workflow) | `src/features/surveys/index.js` | Draft → commit pipeline |
| P2 | V2_UX_FLOWS.md §17 (Dashboard) | `src/features/dashboard/index.js` | Built from a full rewrite (OI-0010), may have drifted from spec |
| P2 | V2_UX_FLOWS.md §16 (Field mode) | `src/features/field-mode/index.js` | Unique navigation model |

**Do NOT audit:** §19 (Rotation calendar — CP-54, not fully built yet), §18 (Farm switching — tested with GH-5), §20 (Export/Import — separately audited).

For each flow checked, report: "§N — [PASS / N deviations found]" with a one-line summary of each deviation.

---

### Audit 12 — Dead Code Scan

**Goal:** No orphan functions, unused imports, or vestigial code from earlier iterations.

**How:**
1. For each exported function in `src/features/`, `src/ui/`, `src/data/`, and `src/utils/`, verify it is imported or called somewhere.
2. Check the router in `src/ui/router.js` — every route handler should point to a function that exists. Every render function should be reachable from a route.
3. Look for commented-out code blocks longer than 5 lines — these should be removed (git has the history).
4. Report: list of dead exports, unreachable routes, and commented-out blocks.

---

### Audit 13 — Design Token Compliance (Spot-Check)

**Goal:** Feature code uses CSS custom properties (design tokens) from V2_DESIGN_SYSTEM.md, not hardcoded color/spacing values.

**How:**
1. `grep -rn '#[0-9a-fA-F]\{3,8\}' src/` — find hardcoded hex colors in JS files.
2. `grep -rn 'rgb\|rgba' src/` — find hardcoded rgb values.
3. For each hit, check if it's in a CSS file that defines tokens (acceptable) or in feature code that should reference tokens (violation).
4. Spot-check 3 feature files for hardcoded pixel values (`12px`, `16px`, etc.) that should use spacing tokens.
5. This is a spot-check, not exhaustive. Report the pattern — "found N hardcoded colors in feature code" — rather than fixing every instance. Fix the most egregious ones.

---

## After all audits

1. Run `npx vitest run` — all tests must pass.
2. Update OPEN_ITEMS.md with any new items found.
3. Commit all changes.
4. At the end of your final commit message, include a summary line: `Pre-migration full app audit: N violations found, M fixed, K flagged in OPEN_ITEMS.md`
