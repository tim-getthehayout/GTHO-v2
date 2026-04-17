# Feedback Screen — Desktop Only (SP-7)

**Labels:** `ui`, `feature`, `desktop-only`
**Sprint:** UI Improvements (2026-04-17)
**Parent spec:** `UI_SPRINT_SPEC.md` → SP-7
**Depends on:** SP-6 (feedback/help header buttons — the submission sheets and `submissions` entity must exist first)

---

## Overview

Build a desktop-only Feedback screen at `#/feedback` that emulates v1's feedback management UI. This is a dev/admin tool for reviewing submitted feedback, confirming fixes, exporting dev briefs, and managing the feedback lifecycle. Not shown on mobile.

**Includes two sheet dialogs** that are part of this screen (not SP-6):
1. **Resolve sheet** (§8) — opened from "Mark resolved" button on open items
2. **Edit submission sheet** (§9) — opened from the ✏️ edit button on any row; includes delete

The feedback/help *submission* sheets (for creating new items) are SP-6's responsibility. SP-7's sheets are for *managing* existing items.

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/features/feedback/index.js` | **Create** | Screen renderer: `renderFeedbackScreen()` |
| `src/features/feedback/feedback-list.js` | **Create** | Filtered list: `renderFeedbackList()` |
| `src/features/feedback/feedback-stats.js` | **Create** | Stats strip: `renderFeedbackStats()` |
| `src/features/feedback/confirm-section.js` | **Create** | Confirmation section: `renderConfirmSection()` |
| `src/features/feedback/dev-brief.js` | **Create** | Brief generator: `generateBrief()`, `copyBrief()` |
| `src/features/feedback/resolve-sheet.js` | **Create** | Resolve sheet: `openResolveSheet()`, `saveResolve()` |
| `src/features/feedback/edit-sheet.js` | **Create** | Edit sheet: `openEditSubmissionSheet()`, `saveEditSubmission()`, `deleteSubmission()` |
| `src/features/feedback/feedback-config.js` | **Create** | Shared constants: `CAT`, `AREA`, `SCREEN_AREA` |
| `src/features/feedback/feedback-badge.js` | **Create** | Badge updater: `updateFeedbackBadge()` |
| `src/ui/header.js` | **Modify** | Add Feedback nav item to desktop sidebar (not mobile bottom nav) |
| `src/main.js` | **Modify** | Register `#/feedback` route |
| `src/styles/main.css` | **Modify** | Add feedback-specific CSS |

---

## 1. Route & Nav Registration

### Route (main.js)

```js
import { renderFeedbackScreen } from './features/feedback/index.js';
route('#/feedback', renderFeedbackScreen);
```

### Sidebar Nav Item (header.js)

Add after Settings, before the sync strip. Desktop sidebar only — NOT in mobile bottom nav.

```js
// In the sidebar nav items array, after Settings:
sidebarNavItemBadge('#/feedback', '💬', t('nav.feedback'), 'nav-feedback', feedbackBadgeCount),
```

Where `feedbackBadgeCount` = count of submissions with `status === 'open' || status === 'resolved'`.

**testid:** `nav-feedback`
**Badge:** Red dot/count, same pattern as Todos badge.

---

## 2. Shared Constants (feedback-config.js)

### CAT — Category configuration

```js
export const CAT = {
  roadblock: { label: '🚧 Roadblock', badgeCls: 'badge-red',    pillCls: 'cp-roadblock' },
  bug:       { label: 'Bug',           badgeCls: 'badge-red',    pillCls: 'cp-bug' },
  ux:        { label: 'UX friction',   badgeCls: 'badge-amber',  pillCls: 'cp-ux' },
  feature:   { label: 'Missing feature', badgeCls: 'badge-purple', pillCls: 'cp-feature' },
  calc:      { label: 'Calculation',   badgeCls: 'badge-teal',   pillCls: 'cp-calc' },
  idea:      { label: 'Idea',          badgeCls: 'badge-green',  pillCls: 'cp-idea' },
  question:  { label: 'Question',      badgeCls: 'badge-teal',   pillCls: 'cp-question' },
};
```

### AREA — Display labels for area values

```js
export const AREA = {
  dashboard:    'Dashboard',
  animals:      'Animals',
  'rotation-calendar': 'Rotation Calendar',
  locations:    'Locations',
  feed:         'Feed',
  harvest:      'Harvest',
  'field-mode': 'Field Mode',
  reports:      'Reports',
  settings:     'Settings',
  sync:         'Sync / Data',
  other:        'Other',
};
```

Note: v1 had `home` → `Home`, `events` → `Events`, `pastures` → `Fields`, `todos` → `To-Dos`. V2 renames these per the v2 screen names.

### SCREEN_AREA — Auto-mapping from current route to area value

```js
export const SCREEN_AREA = {
  '/':          'dashboard',
  '/animals':   'animals',
  '/events':    'rotation-calendar',
  '/locations': 'locations',
  '/feed':      'feed',
  '/harvest':   'harvest',
  '/field':     'field-mode',
  '/reports':   'reports',
  '/settings':  'settings',
  '/feedback':  'other',
  '/todos':     'other',
};
```

---

## 3. Screen Layout (renderFeedbackScreen)

Route: `#/feedback`. Rendered into the main content area.

### Layout (top to bottom)

```
┌────────────────────────────────────────────────────────┐
│ CONFIRMATION SECTION (only if resolved items exist)    │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 🟢 Items awaiting your confirmation                │ │
│ │ "These were marked fixed. Please confirm or reopen"│ │
│ │ ┌──────────────────────────────────────────────┐   │ │
│ │ │ [badge] · version · by tester                │   │ │
│ │ │ Issue note text...                           │   │ │
│ │ │ Fix: resolution note...                      │   │ │
│ │ │ Resolved in bXXXX                            │   │ │
│ │ │ [This is fixed]  [Still broken]              │   │ │
│ │ └──────────────────────────────────────────────┘   │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ STATS STRIP                                            │
│ [N open] [N planned] [N awaiting] [N closed] [N 🆘]   │
│                                                        │
│ DEV SESSION BRIEF                                      │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Dev session brief                                  │ │
│ │ Formatted summary for your Claude iteration session│ │
│ │ [Generate brief] [Copy]                            │ │
│ │ ┌──────────────────────────────────────────────┐   │ │
│ │ │ monospace brief output...                    │   │ │
│ │ └──────────────────────────────────────────────┘   │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ALL SUBMISSIONS                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ All submissions    [Type ▾] [Area ▾] [Status ▾]   │ │
│ │ ─────────────────────────────────────────────────  │ │
│ │ [badge] [status] [support?] [area?] [regression?]  │ │
│ │ Issue note text...                                 │ │
│ │ Fix (version): resolution note                     │ │
│ │ 💬 Response from dev...                             │ │
│ │ Screen: X · Tester · Version · Date                │ │
│ │ [Mark resolved]                                    │ │
│ │ ─────────────────────────────────────────────────  │ │
│ │ ... more rows ...                                  │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## 4. Confirmation Section (confirm-section.js)

Shows when any submissions have `status === 'resolved'` (marked fixed by dev, awaiting user confirmation).

### renderConfirmSection(container)

- Query store for submissions where `status === 'resolved'`
- If none, hide the section (return empty)
- Render a teal banner + card per resolved item

### Per-item card contents

1. **Tag line:** category badge + version + "by {tester}"
2. **Issue note** (escaped)
3. **Resolution box** (teal background): "Fix: {resolutionNote}"
4. **Version line:** "Resolved in {resolvedInVersion}"
5. **Buttons:** "This is fixed" (teal) · "Still broken" (red outline)

### Actions

**"This is fixed" → confirmFixed(id):**
```
submission.status = 'closed'
submission.confirmedBy = current user name
submission.confirmedAt = now ISO
store.update('submissions', id, changes, validateFn, toSupabaseFn, 'submissions')
re-render screen
update badge
```

**"Still broken" → reopenIssue(id):**
```
// Close the original
original.status = 'closed'
original.confirmedBy = current user name
original.confirmedAt = now ISO
store.update(...)

// Create regression
store.add('submissions', {
  type: original.type,
  cat: original.cat,
  area: original.area,
  note: `[Regression] ${original.note}`,
  status: 'open',
  ctx: original.ctx,
  linkedTo: original.id,
  ... (auto-fill version, timestamp, submitter)
}, validateFn, toSupabaseFn, 'submissions')

re-render screen
update badge
```

### v1 HTML Reference

```html
<div id="confirm-section" style="display:none;">
  <div class="banner ban-teal" style="margin-bottom:10px;">
    <div style="font-size:14px;font-weight:600;color:var(--teal-d);margin-bottom:2px;">Items awaiting your confirmation</div>
    <div style="font-size:12px;color:var(--teal-d);opacity:0.85;">These were marked fixed. Please confirm or reopen.</div>
  </div>
  <div id="confirm-list">
    <!-- Per item: -->
    <div class="confirm-item">
      <div class="ci-tag"><span class="badge br">🚧 Roadblock</span> · b20260322.0936 · by Tim</div>
      <div style="font-size:14px;margin-bottom:6px;line-height:1.5;">Issue description here...</div>
      <div style="font-size:12px;color:var(--teal-d);background:var(--teal-l);padding:6px 10px;border-radius:var(--radius);margin-bottom:8px;">Fix: What was changed</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px;">Resolved in b20260401.1200</div>
      <div class="btn-row">
        <button class="btn btn-teal btn-sm" onclick="confirmFixed(123)">This is fixed</button>
        <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red);" onclick="reopenIssue(123)">Still broken</button>
      </div>
    </div>
  </div>
</div>
```

---

## 5. Stats Strip (feedback-stats.js)

### renderFeedbackStats(container)

Badge row showing counts. Only renders if there are any submissions.

```
[N open]  [N planned]  [N awaiting]  [N closed]  [🆘 N support]
 amber      green         teal         grey          teal
```

- `planned` badge only shown if count > 0
- `support` badge only shown if count > 0

### v1 HTML Reference

```html
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
  <span class="badge ba">3 open</span>
  <span class="badge bg">1 planned</span>
  <span class="badge bt">2 awaiting</span>
  <span class="badge bb">5 closed</span>
  <span class="badge bt">🆘 1 support</span>
</div>
```

---

## 6. Dev Session Brief (dev-brief.js)

### Card layout

- Section title: "Dev session brief"
- Subtitle: "Formatted summary for your Claude iteration session."
- Buttons: "Generate brief" (outline) · "Copy" (outline, hidden until generated)
- Output block: monospace `<pre>` area, hidden until generated, max-height 300px with scroll

### generateBrief()

Produces a plaintext summary formatted for Claude Code session import. Structure:

```
GET THE HAY OUT — DEV SESSION BRIEF
Generated: {date}
Version: {buildStamp}
Testers: {comma-separated names}
Open: N · Awaiting: N · Closed: N
════════════════════════════════════════

OPEN ITEMS (N)
────────────────────────────────────────

[🚧 ROADBLOCK] ← HIGH PRIORITY — FIX BEFORE ANYTHING ELSE
1. Issue note
   [screen:Dashboard event:North Paddock day12] area:Feed — Tim, b20260401.1200, Apr 15

[BUG]
1. Issue note
   [screen:Animals] area:Animals — Tim, b20260401.1200, Apr 14

... (category order: roadblock, bug, calc, ux, feature, idea)

════════════════════════════════════════
AWAITING CONFIRMATION (N)
────────────────────────────────────────
1. Issue note
   Fix in b20260401.1200: What was changed

════════════════════════════════════════
CLOSED (last 10)
────────────────────────────────────────
1. Issue note
   Fixed in b20260401.1200: What was changed. Confirmed: Tim

════════════════════════════════════════
CONTEXT
Operation: {name}, {headCount} head {type}
Paddocks: N · Feed types: N
Events: N total · Open todos: N
```

### copyBrief()

Copies brief text to clipboard. Button text changes to "Copied!" (green) for 2 seconds.

### v1 HTML Reference

```html
<div class="card">
  <div class="sec">Dev session brief</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:12px;">Formatted summary for your Claude iteration session.</div>
  <div class="btn-row" style="margin-bottom:10px;">
    <button class="btn btn-outline" onclick="generateBrief()">Generate brief</button>
    <button class="btn btn-outline" id="copy-btn" style="display:none;" onclick="copyBrief()">Copy</button>
  </div>
  <div id="brief-out" style="display:none;">
    <div class="brief-box" id="brief-text"></div>
  </div>
</div>
```

---

## 7. Submission List (feedback-list.js)

### Filter Dropdowns (3 filters)

**Type filter:**
- All types (default), Feedback, Support

**Area filter:**
- All areas (default), Dashboard, Animals, Rotation Calendar, Locations, Feed, Harvest, Field Mode, Reports, Settings, Sync / Data, Other

**Status/category filter:**
- All (default), Open, Planned, Resolved, Closed, Roadblocks, Bugs, UX, Features, Calc, Ideas, Questions, Has Dev Response

All three filters apply simultaneously. List re-renders on any filter change.

### renderFeedbackList(container, filters)

Items sorted newest-first (reverse chronological).

### Per-row layout

```
┌──────────────────────────────────────────────────────────────┐
│ [cat badge] [status badge] [support?] [area?] [regression?] │  ← row-head (left)
│                                                         [✏️] │  ← edit button (right)
│ Issue note text here...                                      │
│ Fix (b20260401.1200): Resolution note                        │  ← if resolved/closed
│ Confirmed: Tim                                               │  ← if confirmed
│ 💬 Response from dev                                          │  ← if devResponse exists
│   Latest response text                                       │
│   ▸ See full thread (3)                                      │  ← expandable thread
│ Screen: Dashboard · Tim · b20260401.1200 · Apr 15            │  ← row-detail
│ [Mark resolved]                                              │  ← if status === 'open'
└──────────────────────────────────────────────────────────────┘
```

### Badge color mapping

| Badge class | Used for | Background | Text |
|-------------|----------|------------|------|
| `badge-amber` (ba) | open | `--amber-l` | `--amber-d` |
| `badge-green` (bg) | planned | `--green-l` | `--green-d` |
| `badge-teal` (bt) | awaiting, calc, question, support | `--teal-l` | `--teal-d` |
| `badge-grey` (bb) | closed, area | `--bg2` | `--text2` |
| `badge-red` (br) | roadblock, bug, regression | `--red-l` | `--red-d` |
| `badge-purple` (bp) | feature | `--purple-l` | `--purple-d` |

### Support ticket styling

Rows with `type === 'support'` get a 3px teal left border: `border-left: 3px solid var(--teal)`.

### Dev response block

If `devResponse` exists, show a teal-background block with:
- Header: "💬 Response from dev" (11px, bold)
- Latest response text
- If thread has > 1 message: expandable "▸ See full thread (N)" toggle
- Thread messages: each with text + meta line (author · timestamp)

### Empty state

"No items in this filter" centered text.

### v1 HTML Reference (single row)

```html
<div class="row fb-item-support" data-fbid="123">
  <div class="row-head">
    <span>
      <span class="badge br">Bug</span>
      <span class="badge ba">open</span>
      <span class="badge bt" style="font-size:10px;">🆘 support</span>
      <span class="badge bb" style="font-size:10px;opacity:0.85;">Feed</span>
      <span class="badge br">regression</span>
      <span style="font-size:10px;color:var(--text2);margin-left:4px;">🔴 High</span>
    </span>
    <button style="border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:13px;padding:4px 6px;border-radius:var(--radius);" onclick="openEditSubmissionSheet(123)" title="Edit">✏️</button>
  </div>
  <div style="font-size:14px;margin-top:4px;line-height:1.5;">Issue description here</div>
  <!-- Resolution (if resolved/closed) -->
  <div style="font-size:12px;color:var(--teal-d);background:var(--teal-l);padding:4px 8px;border-radius:var(--radius);margin-top:4px;">Fix (b20260401.1200): What was changed</div>
  <!-- Confirmed (if closed + confirmed) -->
  <div style="font-size:11px;color:var(--text2);margin-top:3px;">Confirmed: Tim</div>
  <!-- Dev response block -->
  <div class="fb-dev-resp">
    <div style="font-size:11px;font-weight:600;margin-bottom:4px;opacity:0.8;">💬 Response from dev</div>
    <div style="font-size:13px;">Latest response text</div>
    <button onclick="..." style="background:none;border:none;color:var(--teal-d);font-size:11px;cursor:pointer;padding:4px 0 0;">▸ See full thread (3)</button>
    <div class="fb-thread">
      <div class="fb-thread-msg dev"><div>Message text</div><div class="fb-thread-meta">dev · Apr 15, 02:30 PM</div></div>
      <div class="fb-thread-msg user"><div>Message text</div><div class="fb-thread-meta">Tim · Apr 15, 01:00 PM</div></div>
    </div>
  </div>
  <!-- Context line -->
  <div class="row-detail" style="margin-top:4px;">Screen: Dashboard · Tim · b20260401.1200 · Apr 15</div>
  <!-- Resolve button (only if open) -->
  <button class="btn btn-outline btn-xs" style="margin-top:8px;" onclick="openResolveSheet(123)">Mark resolved</button>
</div>
```

### v1 Filter HTML Reference

```html
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
  <div class="sec" style="margin:0;">All submissions</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
    <select id="fb-type-filter" onchange="renderFeedbackList()" style="font-size:12px;padding:5px 8px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:inherit;">
      <option value="all">All types</option>
      <option value="feedback">Feedback</option>
      <option value="support">Support</option>
    </select>
    <select id="fb-area-filter" onchange="renderFeedbackList()" style="font-size:12px;padding:5px 8px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:inherit;">
      <option value="all">All areas</option>
      <option value="dashboard">Dashboard</option>
      <option value="animals">Animals</option>
      <option value="rotation-calendar">Rotation Calendar</option>
      <option value="locations">Locations</option>
      <option value="feed">Feed</option>
      <option value="harvest">Harvest</option>
      <option value="field-mode">Field Mode</option>
      <option value="reports">Reports</option>
      <option value="settings">Settings</option>
      <option value="sync">Sync / Data</option>
      <option value="other">Other</option>
    </select>
    <select id="fb-filter" onchange="renderFeedbackList()" style="font-size:12px;padding:5px 8px;border:0.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-family:inherit;">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="planned">Planned</option>
      <option value="resolved">Resolved</option>
      <option value="closed">Closed</option>
      <option value="roadblock">Roadblocks</option>
      <option value="bug">Bugs</option>
      <option value="ux">UX</option>
      <option value="feature">Features</option>
      <option value="calc">Calc</option>
      <option value="idea">Ideas</option>
      <option value="question">Questions</option>
      <option value="has-response">Has Dev Response</option>
    </select>
  </div>
</div>
```

---

## 8. Resolve Sheet (resolve-sheet.js)

Standard sheet overlay. Opened when clicking "Mark resolved" on an open item.

### Fields

1. **Hidden ID** — submission ID
2. **Textarea** — "What was changed to fix this?" (required, min-height 80px)
3. **Version label** — auto-filled with current build stamp (read-only display)
4. **Buttons:** "Mark resolved" (teal) · "Cancel" (outline)

### saveResolve()

```
submission.status = 'resolved'
submission.resolutionNote = textarea value
submission.resolvedInVersion = current build stamp
submission.resolvedAt = now ISO
store.update('submissions', id, changes, validateFn, toSupabaseFn, 'submissions')
close sheet
re-render screen
update badge
```

### v1 HTML Reference

```html
<div class="sheet-wrap" id="resolve-sheet-wrap">
  <div class="sheet-backdrop" onclick="closeResolveSheet()"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div style="font-size:16px;font-weight:600;margin-bottom:14px;">Mark as resolved</div>
    <input type="hidden" id="resolve-id"/>
    <div class="field"><label>What was changed to fix this?</label><textarea id="resolve-note" style="min-height:80px;"></textarea></div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:14px;">Tagged to version: <strong id="resolve-ver-label"></strong></div>
    <div class="btn-row">
      <button class="btn btn-teal" onclick="saveResolve()">Mark resolved</button>
      <button class="btn btn-outline" onclick="closeResolveSheet()">Cancel</button>
    </div>
  </div>
</div>
```

---

## 9. Edit Submission Sheet (edit-sheet.js)

Standard sheet overlay. Opened when clicking the ✏️ edit button on any row.

### Fields

1. **Hidden ID**
2. **Type toggle** — Feedback / Support pills (same as SP-6 but editable)
3. **Category pills** — same 7 categories with color-coded selected states
4. **Area dropdown** + **Priority dropdown** (side by side)
5. **Status dropdown** — Open, Planned, Resolved, Closed
6. **Note textarea** (min-height 80px)
7. **Save / Cancel buttons**
8. **Delete button** — separated by a border-top divider, red outline, full-width

### saveEditSubmission()

Updates all editable fields via store.update(). Re-renders screen + updates badge.

### deleteSubmission(id)

Confirm dialog: "Delete this item? This cannot be undone."
If confirmed:
- `store.remove('submissions', id, 'submissions')`
- Close sheet, re-render, update badge

### v1 HTML Reference

```html
<div class="sheet-wrap" id="edit-sub-wrap">
  <div class="sheet-backdrop" onclick="closeEditSubmissionSheet()"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div style="font-size:16px;font-weight:600;margin-bottom:10px;">Edit submission</div>
    <input type="hidden" id="edit-sub-id"/>
    <input type="hidden" id="edit-sub-type" value="feedback"/>
    <input type="hidden" id="edit-sub-cat" value="idea"/>
    <!-- Type toggle -->
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="fb-type-pill edit-type-pill sel" id="edit-type-feedback" onclick="_editSelType('feedback',this)" style="flex:1;padding:7px;border:1.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;">💬 Feedback</button>
      <button class="fb-type-pill edit-type-pill" id="edit-type-support" onclick="_editSelType('support',this)" style="flex:1;padding:7px;border:1.5px solid var(--border2);border-radius:var(--radius);background:var(--bg);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;">🆘 Support</button>
    </div>
    <!-- Category pills -->
    <div style="font-size:13px;color:var(--text2);margin-bottom:6px;">Category</div>
    <div class="cat-pills" style="margin-bottom:12px;">
      <button class="cat-pill edit-cat-pill cp-roadblock" data-cat="roadblock">🚧 Roadblock</button>
      <button class="cat-pill edit-cat-pill cp-bug" data-cat="bug">Bug</button>
      <button class="cat-pill edit-cat-pill cp-ux" data-cat="ux">UX friction</button>
      <button class="cat-pill edit-cat-pill cp-feature" data-cat="feature">Missing feature</button>
      <button class="cat-pill edit-cat-pill cp-calc" data-cat="calc">Calculation</button>
      <button class="cat-pill edit-cat-pill cp-idea" data-cat="idea">Idea</button>
      <button class="cat-pill edit-cat-pill cp-question" data-cat="question">Question</button>
    </div>
    <div class="two">
      <div class="field">
        <label>Area</label>
        <select id="edit-sub-area">
          <option value="">— pick area —</option>
          <option value="dashboard">Dashboard</option>
          <option value="animals">Animals</option>
          <option value="rotation-calendar">Rotation Calendar</option>
          <option value="locations">Locations</option>
          <option value="feed">Feed</option>
          <option value="harvest">Harvest</option>
          <option value="field-mode">Field Mode</option>
          <option value="reports">Reports</option>
          <option value="settings">Settings</option>
          <option value="sync">Sync / Data</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="field">
        <label>Priority</label>
        <select id="edit-sub-priority">
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Status</label>
      <select id="edit-sub-status">
        <option value="open">Open</option>
        <option value="planned">Planned</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
    </div>
    <div class="field"><label>Note</label><textarea id="edit-sub-note" style="min-height:80px;"></textarea></div>
    <div class="btn-row">
      <button class="btn btn-green" onclick="saveEditSubmission()">Save changes</button>
      <button class="btn btn-outline" onclick="closeEditSubmissionSheet()">Cancel</button>
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:0.5px solid var(--border);">
      <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red);width:100%;">🗑 Delete this item</button>
    </div>
  </div>
</div>
```

---

## 10. CSS (add to main.css)

```css
/* ── Feedback screen ── */

/* Badge colors (may already exist — reuse if so) */
.badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; }
.badge-green  { background:var(--green-l); color:var(--green-d); }
.badge-amber  { background:var(--amber-l); color:var(--amber-d); }
.badge-teal   { background:var(--teal-l); color:var(--teal-d); }
.badge-purple { background:var(--purple-l); color:var(--purple-d); }
.badge-red    { background:var(--red-l); color:var(--red-d); }
.badge-grey   { background:var(--bg2); color:var(--text2); border:0.5px solid var(--border); }

/* Submission list rows */
.fb-row { border-bottom:0.5px solid var(--border); padding:11px 0; }
.fb-row:last-child { border-bottom:none; }
.fb-row-head { display:flex; justify-content:space-between; align-items:flex-start; }
.fb-row-detail { font-size:12px; color:var(--text2); margin-top:3px; line-height:1.5; }

/* Support ticket left border */
.fb-item-support { border-left:3px solid var(--teal) !important; padding-left:8px; }

/* Dev response / thread */
.fb-dev-resp { background:var(--teal-l); border-left:3px solid var(--teal); border-radius:var(--radius); padding:8px 10px; margin-top:8px; font-size:13px; color:var(--teal-d); }
.fb-thread { margin-top:6px; display:none; }
.fb-thread.open { display:block; }
.fb-thread-msg { padding:6px 10px; border-radius:var(--radius); font-size:12px; margin-bottom:4px; line-height:1.5; }
.fb-thread-msg.dev { background:var(--teal-l); color:var(--teal-d); }
.fb-thread-msg.user { background:var(--bg2); color:var(--text); }
.fb-thread-meta { font-size:10px; opacity:0.7; margin-top:2px; }

/* Confirmation section */
.fb-confirm-item { padding:12px 14px; background:var(--bg); border:0.5px solid var(--border); border-radius:var(--radius-l); margin-bottom:8px; }
.fb-confirm-tag { font-size:11px; font-weight:600; margin-bottom:8px; }

/* Brief output */
.fb-brief-box { background:var(--bg2); border:0.5px solid var(--border); border-radius:var(--radius); padding:12px; font-size:12px; line-height:1.65; white-space:pre-wrap; font-family:Menlo,monospace; color:var(--text); max-height:300px; overflow-y:auto; margin-bottom:10px; }

/* Category pills (shared with SP-6 sheets — may already exist) */
.cat-pills { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.cat-pill { padding:6px 14px; border-radius:20px; font-size:13px; font-weight:500; cursor:pointer; border:0.5px solid var(--border2); background:transparent; color:var(--text2); font-family:inherit; }
.cp-bug.sel { background:var(--red-l); color:var(--red-d); border-color:var(--red); }
.cp-ux.sel { background:var(--amber-l); color:var(--amber-d); border-color:var(--amber); }
.cp-feature.sel { background:var(--purple-l); color:var(--purple-d); border-color:var(--purple); }
.cp-calc.sel { background:var(--teal-l); color:var(--teal-d); border-color:var(--teal); }
.cp-idea.sel { background:var(--green-l); color:var(--green-d); border-color:var(--green); }
.cp-roadblock.sel { background:var(--red-l); color:var(--red-d); border-color:var(--red); }
.cp-roadblock { font-weight:700; }
.cp-question.sel { background:var(--teal-l); color:var(--teal-d); border-color:var(--teal); }

/* Type toggle pills (shared with SP-6) */
.fb-type-pill { background:transparent; border:1.5px solid var(--border2); padding:8px; border-radius:var(--radius); font-family:inherit; font-size:13px; font-weight:500; color:var(--text2); cursor:pointer; }
.fb-type-pill.sel { background:var(--green); color:white; border-color:var(--green); }
```

---

## 11. i18n Keys

All user-facing strings must use `t()`. Add these keys:

```js
// nav
'nav.feedback': 'Feedback',

// screen titles
'feedback.title': 'Feedback',
'feedback.confirmTitle': 'Items awaiting your confirmation',
'feedback.confirmSubtitle': 'These were marked fixed. Please confirm or reopen.',
'feedback.statsOpen': '{count} open',
'feedback.statsPlanned': '{count} planned',
'feedback.statsAwaiting': '{count} awaiting',
'feedback.statsClosed': '{count} closed',
'feedback.statsSupport': '🆘 {count} support',

// dev brief
'feedback.briefTitle': 'Dev session brief',
'feedback.briefSubtitle': 'Formatted summary for your Claude iteration session.',
'feedback.generateBrief': 'Generate brief',
'feedback.copy': 'Copy',
'feedback.copied': 'Copied!',

// list
'feedback.allSubmissions': 'All submissions',
'feedback.allTypes': 'All types',
'feedback.allAreas': 'All areas',
'feedback.all': 'All',
'feedback.noItems': 'No items in this filter',
'feedback.markResolved': 'Mark resolved',
'feedback.thisIsFixed': 'This is fixed',
'feedback.stillBroken': 'Still broken',
'feedback.devResponse': '💬 Response from dev',
'feedback.seeThread': '▸ See full thread ({count})',
'feedback.hideThread': '▴ Hide thread',

// resolve sheet
'feedback.resolveTitle': 'Mark as resolved',
'feedback.resolvePrompt': 'What was changed to fix this?',
'feedback.resolveVersion': 'Tagged to version: {version}',
'feedback.resolveBtn': 'Mark resolved',

// edit sheet
'feedback.editTitle': 'Edit submission',
'feedback.saveChanges': 'Save changes',
'feedback.deleteItem': '🗑 Delete this item',
'feedback.deleteConfirm': 'Delete this item? This cannot be undone.',

// labels
'feedback.category': 'Category',
'feedback.area': 'Area',
'feedback.priority': 'Priority',
'feedback.status': 'Status',
'feedback.note': 'Note',
```

---

## 12. Store Integration

SP-7 reads and mutates `submissions` via the store. The entity file (`src/entities/submissions.js`) should already exist from SP-6. If not, it needs:

- `FIELDS` definition matching V2_SCHEMA_DESIGN.md §11.2
- `validate()` — at minimum: note required, type in ['feedback', 'support'], status in ['open', 'planned', 'resolved', 'closed']
- `toSupabaseShape()` / `fromSupabaseShape()` — camelCase ↔ snake_case mapping
- Store registered with `'submissions'` entity type

All mutations must follow the store pattern:
```
store.add('submissions', record, validate, toSupabaseShape, 'submissions')
store.update('submissions', id, changes, validate, toSupabaseShape, 'submissions')
store.remove('submissions', id, 'submissions')
```

---

## 13. Acceptance Criteria

- [ ] `#/feedback` route registered, renders the feedback screen
- [ ] Desktop sidebar shows "Feedback" nav item with 💬 icon after Settings
- [ ] Feedback nav item has red badge with count of open + resolved items
- [ ] Feedback nav item is NOT in mobile bottom nav
- [ ] Confirmation section shows items with `status === 'resolved'`
- [ ] "This is fixed" closes the item (status → closed, confirmedBy + confirmedAt set)
- [ ] "Still broken" closes the original AND creates a new regression item with `linkedTo`
- [ ] Stats strip shows correct counts for open / planned / awaiting / closed / support
- [ ] Dev brief generates correctly formatted plaintext (roadblocks first)
- [ ] Copy button copies brief to clipboard, shows "Copied!" for 2s
- [ ] Type filter filters by feedback/support
- [ ] Area filter filters by area value
- [ ] Status/category filter works for all 13 options including "Has Dev Response"
- [ ] Each row shows correct badge colors, support border, regression tag, priority label
- [ ] Dev response block renders with expandable thread
- [ ] "Mark resolved" opens resolve sheet, saves correctly
- [ ] Edit sheet opens with all fields pre-filled, saves all changes
- [ ] Delete with confirmation dialog works
- [ ] All 5 store call params present (add: 5, update: 6, remove: 3)
- [ ] All user-facing strings use `t()`
- [ ] All DOM built with `el()` — no innerHTML with user data
- [ ] Screen re-renders correctly after any mutation

---

## 14. Schema Impact

None. Uses existing `submissions` table (V2_SCHEMA_DESIGN.md §11.2).

## 15. CP-55/CP-56 Impact

None. No new tables or columns.
