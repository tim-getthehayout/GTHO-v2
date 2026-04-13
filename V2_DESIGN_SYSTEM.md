# GTHO v2 — Design System

**Status:** APPROVED — reviewed Session 10 (2026-04-12). 6 issues resolved.
**Source:** v1 `index.html` CSS (518 lines), live app screenshots (9 screens)
**Purpose:** Document the visual language so v2 can reproduce (or intentionally evolve) every design decision. Claude Code builds UI components from these tokens and patterns.

---

## 1. Design Tokens

### 1.1 Color Palette

Six semantic color families. Each has a base, dark (-d), and light (-l) variant. Light variants serve as tinted backgrounds for badges, banners, and selected states.

| Family | Base | Dark (-d) | Light (-l) | Usage |
|--------|------|-----------|------------|-------|
| Green | `#639922` | `#3B6D11` | `#EAF3DE` | Primary action, active states, success, grazing |
| Amber | `#BA7517` | `#854F0B` | `#FAEEDA` | Warnings, pending states, sub-moves |
| Teal | `#1D9E75` | `#0F6E56` | `#E1F5EE` | Secondary actions, health, dev responses |
| Purple | `#534AB7` | `#3C3489` | `#EEEDFE` | Feature category, tertiary badges |
| Red | `#E24B4A` | `#A32D2D` | `#FCEBEB` | Errors, destructive actions, bugs |
| Blue | `#185FA5` | `#0C447C` | `#E6F1FB` | Info, in-progress states |

Additional: `--green-l2: #97C459` (used for banner borders and sidebar active accent).

### 1.2 Neutral Palette

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--bg` | `#ffffff` | `#1a1a18` | Page background |
| `--bg2` | `#f5f5f3` | `#242420` | Card insets, chips, secondary surfaces |
| `--bg3` | `#eeede9` | `#2c2c28` | Progress bar backgrounds, tertiary surfaces |
| `--text` | `#1a1a18` | `#e8e6de` | Primary text |
| `--text2` | `#6b6b67` | `#9c9a92` | Secondary text, labels |
| `--text3` | `#9c9a94` | `#6b6b67` | Tertiary text, placeholders, chevrons |
| `--border` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.1)` | Subtle dividers, card borders |
| `--border2` | `rgba(0,0,0,0.2)` | `rgba(255,255,255,0.18)` | Input borders, stronger dividers |

**Dark mode note:** Light (-l) variants invert to dark tinted backgrounds in dark mode (e.g., `--green-l` becomes `#1a2e0a`). This preserves semantic meaning while keeping sufficient contrast.

### 1.3 Typography

| Property | Value |
|----------|-------|
| Font stack | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| Base size | `16px` on html/body |
| Code font | `Menlo, monospace` (used in brief-box only) |

**Size scale (px):** 9, 10, 11, 12, 13, 15, 16, 18, 20, 24, 36

| Size | Weight | Usage |
|------|--------|-------|
| 36px | — | Auth overlay logo |
| 24px | — | (reserved) |
| 20px | 600 | Metric values (`.mv`), auth headings |
| 18px | 700 | Header title (`.hdr-title`) |
| 16px | 600 | Auth buttons, settings headings |
| 15px | 600 | Button text, input text, quantity values |
| 13px | 500–600 | Nav items, pills, secondary buttons, row detail |
| 12px | 500–600 | Labels, section headers, report tabs, sub-text |
| 11px | 600 | Uppercase section headers (`.sec`), badges, status text |
| 10px | — | Bottom nav labels, nav badges, meta text |
| 9px | — | Smallest (badge minimums) |

**Weights used:** 500 (medium), 600 (semibold), 700 (bold)

**Letter spacing:** `-0.3px` on header titles, `0.06em` on uppercase section labels.

### 1.4 Spacing

No formal spacing scale — values are ad hoc. Patterns observed:

| Value | Usage |
|-------|-------|
| 2px | Nav item gaps, tiny margins |
| 3px | Header subtitle margin, badge/label vertical gaps |
| 4px | Label margins, badge padding, xs button padding |
| 5px | Batch selector margin, filter pill gaps |
| 6px | Pill gaps, wizard dot gaps, chip margin |
| 7px | Sidebar sync strip gap |
| 8px | Button row gaps, grid gaps, checkbox wrap padding |
| 9px | Input padding, nav item padding |
| 10px | Card inset padding, grid gaps, metric cell margin |
| 12px | Content padding, card padding, field margin |
| 14px | Card padding, chip margin-bottom, sidebar sync strip padding |
| 16px | Content padding, card padding, header padding |
| 18px | Sidebar logo padding |
| 20px | Empty state padding, confirm item padding |
| 24px | Sheet bottom padding, auth overlay padding |
| 28px | Desktop content padding, auth card padding |
| 32px | Auth card padding |
| 40px | Desktop content bottom padding |

**v2 recommendation:** Normalize to an 8px-based scale: 2, 4, 8, 12, 16, 24, 32, 48. Map existing values to nearest step.

### 1.5 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `8px` | Default (inputs, buttons, chips, inset cards) |
| `--radius-l` | `12px` | Cards, banners |
| `--radius-xl` | `16px` | Sheets, auth overlay |
| `50%` | — | FAB, avatars, wizard dots, sync dots, pill shapes |
| `20px` | — | Filter pills, category pills, status pills |
| `4px` | — | Badges |
| `3px` | — | Rotation calendar cells, progress bars |

### 1.6 Shadows & Elevation

Minimal shadow use — the app relies on borders and background tints for visual hierarchy.

| Element | Shadow |
|---------|--------|
| FAB | `0 2px 10px rgba(0,0,0,0.2)` |
| Auth card | `0 8px 32px rgba(0,0,0,0.18)` |

### 1.7 Transitions

| Property | Duration | Easing | Element |
|----------|----------|--------|---------|
| `background, color` | `0.1s` | default | Nav items, report tabs |
| `transform` | `0.2s` | default | Chevron rotation |
| `background` | `0.15s` | default | Filter chips |

One animation: `cal-active` keyframe — opacity pulse between 1.0 and 0.8 for active rotation calendar cells.

### 1.8 Threshold Color Mapping

Some values drive color dynamically based on thresholds. These patterns use the color families from §1.1 but are applied conditionally at render time. Source of truth for threshold values: V2_CALCULATION_SPEC.md.

| Metric | Red | Amber | Green | Teal | Source |
|--------|-----|-------|-------|------|--------|
| Forage quality score | ≤ 30 (poor) | 31–50 (fair) | 51–70 (good) | > 70 (excellent) | SUR-1 |
| Feed days on hand | < 33% of goal | 33–99% of goal | ≥ goal | — | V2_UX_FLOWS.md §13 |

**Implementation pattern:** The render layer reads the computed value, selects the color family, and applies the appropriate base or light variant depending on context (badge background uses `-l`, text uses `-d`, progress bar fill uses base).

---

## 2. Layout System

### 2.1 Breakpoint

Single breakpoint: **900px**.

| Viewport | Layout | Navigation | Max content width |
|----------|--------|-----------|-------------------|
| < 900px (mobile) | Flexbox column | Bottom nav bar | 480px centered |
| ≥ 900px (desktop) | CSS Grid: `220px 1fr` | Sidebar | 1100px max |

### 2.2 Mobile Layout

```
┌──────────────────────────┐
│ .hdr (sticky top)        │  padding-top: safe-area
│ title, subtitle, actions │
├──────────────────────────┤
│ .content (scrollable)    │  padding: 12px
│                          │  padding-bottom: 80px + safe-area
│                          │
├──────────────────────────┤
│ .bnav (fixed bottom)     │  z-index: 100
│ 5 icon+label items       │  padding-bottom: safe-area
└──────────────────────────┘
```

- `.app` container: max-width 480px, centered
- Bottom nav items: flex column, 10px label, 22×22 icon
- FAB: fixed, 44×44px, bottom offset `60px + safe-area + 10px`

### 2.3 Desktop Layout

```
┌─────────┬──────────────────────┐
│ sidebar │ .hdr (header)        │
│ 220px   ├──────────────────────┤
│ logo    │ .content (scrollable)│
│ nav     │ padding: 20px 28px   │
│ sync    │ max-width: 1100px    │
│         │                      │
└─────────┴──────────────────────┘
```

Grid: `grid-template-columns: 220px 1fr`

Desktop-specific behaviors:
- Group cards: always expanded (no chevron/collapse), 2-column grid with 14px gap
- Stats row: 5-column grid (mobile: 2-column)
- Settings/Pastures/Events/Feedback cards: max-width 760px
- FAB: horizontally centered in content column (`left: calc(220px + ((100vw - 220px) / 2))`)
- Sheets: `padding-left: 220px` on wrap to center in content area

### 2.4 Safe Area Handling

PWA-critical for iOS notch/home indicator:

| Token | Usage |
|-------|-------|
| `--safe-top` | `env(safe-area-inset-top, 0px)` — header top padding |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` — bottom nav padding, content scroll padding, FAB position |

### 2.5 Grid Patterns

| Class | Columns | Gap | Usage |
|-------|---------|-----|-------|
| `.two` | `1fr 1fr` | 10px | Form field pairs (date in/out, pre/post graze) |
| `.three` | `1fr 1fr 1fr` | 8px | Three-column stat layouts |
| `.m-grid` | `1fr 1fr` (mobile), `repeat(5,1fr)` (desktop) | 8–10px | Dashboard stat cells |
| `#home-groups` | — (mobile), `1fr 1fr` (desktop) | 14px | Group card grid |

---

## 3. Component Patterns

### 3.1 Cards

| Variant | Class | Background | Border | Radius | Padding |
|---------|-------|-----------|--------|--------|---------|
| Standard | `.card` | `--bg` | `0.5px solid --border` | `--radius-l` (12px) | `14px 16px` |
| Inset | `.card-inset` | `--bg2` | none | `--radius` (8px) | `12px 14px` |
| Banner | `.banner` | color `-l` variant | `0.5px solid` color | `--radius-l` | `12px 14px` |
| Group card | `.grp-card` | `--bg` | `0.5px solid --border` | `--radius-l` | — (sections have own padding) |

Banner color variants: `.ban-green`, `.ban-amber`, `.ban-teal`, `.ban-red`, `.ban-blue`.

### 3.2 Buttons

| Variant | Class | Style | Padding | Font |
|---------|-------|-------|---------|------|
| Full-width | `.btn` | Block, rounded | `12px` | 15px, 600 |
| Color filled | `.btn-green`, `.btn-amber`, `.btn-teal`, `.btn-blue`, `.btn-red` | Colored bg, white text | — | — |
| Outline | `.btn-outline` | Transparent bg, border | — | — |
| Small | `.btn-sm` | Inline, narrower | `7px 16px` | 13px |
| Extra small | `.btn-xs` | Inline, compact | `4px 10px` | 12px |

Active state: `opacity: 0.82`. Button row (`.btn-row`): flex with 8px gap, each button `flex: 1`.

### 3.3 Badges

| Class | Background | Text | Radius |
|-------|-----------|------|--------|
| `.bg` (green) | `--green-l` | `--green-d` | 4px |
| `.ba` (amber) | `--amber-l` | `--amber-d` | 4px |
| `.bt` (teal) | `--teal-l` | `--teal-d` | 4px |
| `.bp` (purple) | `--purple-l` | `--purple-d` | 4px |
| `.br` (red) | `--red-l` | `--red-d` | 4px |
| `.bb` (neutral) | `--bg2` | `--text2` + border | 4px |
| `.bbl` (blue) | `--blue-l` | `--blue-d` | 4px |

Padding: `2px 8px`. Font: 11px, weight 600.

### 3.4 Form Inputs

| Property | Value |
|----------|-------|
| Padding | `9px 12px` |
| Border | `0.5px solid --border2` |
| Radius | `--radius` (8px) |
| Font size | 15px |
| Focus | `border-color: --green` |
| Label | 13px, `--text2`, 4px margin-bottom |
| Textarea | `min-height: 72px`, `line-height: 1.5`, vertical resize |

Number inputs: native spinners hidden, custom `+/-` buttons (`.qty-btn`: 32×32, `--border2` border, 18px font).

Sliders: `accent-color: --green`, inline with value display (`.slider-out`: 15px, 600 weight).

### 3.5 Sheets (Modals)

Bottom-sheet pattern — slides up from bottom on mobile, centered modal on desktop.

| Property | Value |
|----------|-------|
| Wrap | Fixed, `inset: 0`, flex center, `z-index: 200` |
| Backdrop | `rgba(0,0,0,0.4)`, absolute fill |
| Sheet body | `width: min(92vw, 680px)`, `max-height: 90vh`, `overflow-y: auto` |
| Radius | `--radius-xl` (16px) |
| Padding | `16px 16px 24px` |
| Handle | 36×4px, `--border2` background, `radius: 2px`, centered, `margin-bottom: 16px` |

Z-index stacking:
- Base sheets: 200
- Move wizard, close paddock, feed check, sub-move: 210
- Stacked sheets: 220
- User picker: 300
- Auth overlay: 500

Field mode: sheets expand to full-screen on mobile (`width: 100%`, `border-radius: 0`).

### 3.6 Navigation

**Bottom nav (mobile):**
- Fixed bottom, full width (max 480px), `z-index: 100`
- Flex row, each item: column layout, 22×22 icon, 10px label
- Active: `--green` color
- Badge: absolute positioned, `--red` background, 9px white text

**Sidebar (desktop):**
- 220px wide, flex column
- Logo strip: 32×32 icon (green bg, rounded), 14px bold name, 11px subtitle
- Nav items: 9px 12px padding, 8px radius, 13px 500 weight
- Hover: `--bg2` background
- Active: `--green-l` bg, `--green-d` text, 600 weight
- Sync strip: bottom, border-top, 11px text, `--text2`

**Header bar (both mobile and desktop):**

Left cluster — identity (two lines stacked, `flex-direction: column`, `gap: 2px`):
- Line 1: operation name. 18px/700, `--text`, letter-spacing `-0.3px`. Truncate with ellipsis if overflow.
- Line 2: farm picker button. 14px/500, `--text2`, `display: inline-flex, align-items: center, gap: 4px`. Chevron ▾ is a 10px glyph with `--text3` color. Plain text (no chevron, no background) in single-farm ops. Transparent background in multi-farm ops; `--bg2` on hover; focus ring `--green` 2px.

Right cluster — actions (`display: flex, gap: 10px, align-items: center`):
- Sync dot (§3.14)
- Build stamp. 11px, `--text2`. Format: `bYYYYMMDD.HHMM`. Hidden below 360px viewport.
- Field Mode button. `btn btn-green btn-xs`.
- User menu button. 28×28 circle, `--bg2` background, 1px `--border` border, `border-radius: 50%`. Initials in 11px/600 `--text2`, centered. Focus ring `--green` 2px.

**Farm picker (sheet on mobile, dropdown on desktop):**
- Mobile: full-screen sheet per §3.5.
- Desktop: dropdown menu — `position: absolute`, anchored below the farm picker button with 4px gap, `min-width: 240px`, `--bg` background, 1px `--border`, `--radius-l`, shadow `--shadow-md`, `z-index: 200`.
- Rows: 44px tall (touch target), 12px horizontal padding, 13px/500, hover `--bg2`.
- Active row: checkmark on the right, `--green` text on the label.
- "All farms" pinned to top, divider before "+ Add farm" at bottom.

**User menu popover:**
- 240px wide, anchored below user menu button with 4px gap.
- `--bg` background, 0.5px `--border`, `--radius-l`, shadow `--shadow-md`, `z-index: 200`.
- Rows (44px tall, 12px padding):
  - Email row: 13px/500 email (2-line ellipsis), 11px/400 `--text3` "Signed in" label below.
  - Divider: `--border` 0.5px.
  - Log Out: 13px/500, left-aligned, color `--text` default, `--red` on hover. If unsynced writes exist, Log Out triggers a confirm dialog before clearing session.

**Cross-farm event marker (§11 event card, §18.6 flow):**
- 11px, `--text2`, `display: inline-flex, align-items: center, gap: 4px`.
- Arrow glyph (←/→) in 10px, `--text2`. Farm name in 11px/500.
- Rendered below the event title and above the paddock summary.
- Clickable: hover underlines the farm name; tap navigates to paired event.

### 3.7 Filter Pills / Chips

| Variant | Class | Default | Active/Selected |
|---------|-------|---------|-----------------|
| Filter pill | `.fp` | `--border2` border, `--text2` | `--green` bg, white text |
| Category pill | `.cat-pill` | Same as filter | Color-coded per category |
| Group filter | `.agc-chip` | `--bg2` bg, `--border2` border | `--green` bg, white text |
| Status pill | `.status-pill` | — | Color-coded: open=amber, progress=blue, closed=green |

All pill shapes: `border-radius: 20px`.

### 3.8 Metric Cells

Dashboard stats (`.m-cell`):
- Background: `--bg2`
- Radius: `--radius` (8px)
- Padding: 12px
- Label (`.ml`): 11px, `--text2`
- Value (`.mv`): 20px, 600 weight

### 3.9 Rows / List Items

Standard row (`.row`):
- Bottom border: `0.5px solid --border`
- Padding: `11px 0`
- Last child: no border
- Header (`.row-head`): flex space-between
- Detail (`.row-detail`): 12px, `--text2`, 3px top margin, `line-height: 1.5`

### 3.10 Progress Bars

`.prog`: 5px height, `--bg3` background, 3px radius.
`.prog-fill`: 100% height, colored, 3px radius.

### 3.11 Empty States

`.empty`: centered, `20px 16px` padding, `--text2`, 13px, `line-height: 1.6`.

### 3.12 Wizard Pattern

Dot navigation (`.wiz-dots`): flex centered, 6px gap.
Dot (`.wiz-dot`): 8×8px circle, `--border2` default, `--green` when active.
Steps (`.wiz-step`): hidden by default, `.on` to show.

### 3.13 Group Cards (Home Screen)

Complex card with expandable body:
- Color bar: 4px wide, per-group color, left side
- Header: flex row, clickable, gap 10px, `12px 14px` padding
- Body: hidden by default (mobile), shown on expand or always on desktop
- Chevron: `--text3`, rotates 180° on expand
- Location bar (`.grp-loc-bar`): `--bg2`, `--radius`, `9px 12px`
- Actions: flex wrap, each button `flex: 1, min-width: 80px`

### 3.14 Sync Indicator

Dot-based (`.sync-dot`): 8×8px circle.
States: `.sync-ok` (green), `.sync-pending` (amber), `.sync-off` (text3), `.sync-err` (red).

### 3.15 Strip Grazing Progress (v2 only)

New pattern — no v1 equivalent. Displays strip grazing state within a paddock card on the event card (see V2_UX_FLOWS.md §2.4, §11). Schema source: `event_paddock_windows` fields `is_strip_graze`, `strip_group_id`, `area_pct` (see OI-0001).

**Layout:** Nested under the primary paddock card. Each strip renders as a horizontal bar, stacked vertically. Bar widths are proportional to `area_pct` (strips can be unequal sizes).

**Strip states and colors:**

| State | Fill color | Text color | Meaning |
|-------|-----------|------------|---------|
| Active (grazing) | `--green` base | white | Animals currently on this strip |
| Completed | `--bg3` | `--text2` | Strip has been grazed and closed |
| Upcoming | `--bg2` | `--text3` | Strip not yet opened |

**Label:** "Strip N of M — [Location Name]" displayed above the strip bars.

**Bar dimensions:** Full width of the paddock card body, height ~12px per strip, `--radius-sm` (4px) corners, 2px vertical gap between strips.

---

## 4. Screen Inventory (from Live App Audit)

### 4.1 Home Screen

**Desktop:** Farm title + sync indicator + build version + Field mode toggle in header. Farm Overview section: 5-column stats row (Pasture DMI, Feed Cost, Pasture %, NPK/Acre, NPK Value). View toggle: Groups | Locations. 2-column group card grid. Each group card: name, head count, avg weight, location → expanded body with paddock location bar (green "grazing" badge, day count, feeding count, dollar amount, AU, AUDS, DMI, sub-move info, DMI target, pasture vs feed percentage bar, NPK deposited) → action buttons (Move, Split, Weights, Edit). FAB (+) bottom-right.

**Mobile:** Same content, but single-column. Group cards collapsed by default with chevron. Stats in 2-column grid (4 items, wrapping). Bottom nav: Home, Animals, Events, Fields, Feed, (plus Feedback, Reports, Settings via more).

### 4.2 Animals Screen

Group filter pills at top (All, Cow-Calf Herd, Ewe Flock, Stockers, Unassigned — each with color dot). Search bar. Config buttons row (Classes, Treatments, AI Sires). Groups section with "+ Add group" button. Each group card: name, active/paddock badge, sex breakdown, head count + avg weight + DMI target, action buttons (Edit, Split, Weights, ×). Below: sortable animal table (Tag/ID, Class, Group, Weight) with per-animal action button row (Edit, Weight, Note, Treatment, Breeding, BCS, Todo).

### 4.3 Events Screen

Active rotation banner (green): "Active rotation on N locations — move cows here, move sheep there" with location pill links. Tab strip: Event Log | Rotation Calendar. Event log: chronological list of events, each row showing group, location, date range, active/closed badge. Sub-move indicators inline. Rotation calendar (desktop only): paddock rows × month columns, colored cells for grazing/sub-move duration.

### 4.4 Fields Screen

Tab strip: Locations | Surveys. Filter pills: All, Pasture, Mixed-Use, Crop, Confinement. Amendments list. Location cards: name, type badge, acreage, action buttons (Edit, Survey, Soil). Survey tab for recording pasture walks.

### 4.5 Feed Screen

"Feed on hand" summary card: 3 stat cells (DM on Hand lbs, Daily Run Rate lbs/d, Days on Hand), Goal badge (90d). Progress bar: days vs goal. "Feed Animals" CTA (large green button). "Manage feed types" button. Feed inventory list: batch rows with name, archived badge, remaining quantity, progress bar, Edit/Reconcile/Unarchive buttons.

### 4.6 Reports Screen

7-tab strip: Rotation Calendar, NPK Fertility, Feed & DMI Trends, Animal Performance, Season Summary, Pasture Surveys, Weaning. Rotation calendar tab: legend (pasture grazing, sub-move, active now), paddock rows × month columns, season totals sidebar (AUDS, Pasture %, NPK, OM lbs, Feed cost, Events per paddock).

### 4.7 Settings Screen

Card sections stacked vertically: Account & Sync (connection status, display name, save), Sync Queue (diagnostic buttons: Refresh, Flush now, Export queue JSON, Clear queue (red), Push all to Supabase), Manual Backup (Export backup, Restore backup), Historical events. **v2 note:** Sync UI will change — v2 uses SyncAdapter (A10) with offline queue, exponential backoff, and dead letter handling. These v1 diagnostic controls will be replaced.

### 4.8 Sheet Overlay (Edit Event)

Slide-up panel with drag handle. Status badge (active/closed) top-right. Sections: PADDOCKS section with paddock cards (name, primary label, type badge, acreage, status dot, "Close paddock" button). Form fields in 2-column grid: Date in/out (date pickers), Head count (from groups, disabled), Avg weight (from groups, disabled), Pre-graze/Post-graze height (text inputs with "opt" label), Pre-graze/Post-graze cover % (slider + percentage display), Checkbox ("100% stored feed — no pasture available"), Feed Entries section ("+ Add feed" button), Notes.

---

## 5. Design Decisions for v2

### 5.1 What to Keep

- **Color palette:** The 6-family semantic system with light/dark/base variants works well. Colors are meaningful (green=grazing/active, amber=warning/pending, teal=health, red=error/delete, blue=info, purple=feature).
- **Dark mode:** Full token-based dark mode via `prefers-color-scheme` is a strong foundation. Light variants correctly invert to dark tinted backgrounds.
- **Typography:** System font stack is correct for a farm-tool PWA (fast load, native feel). Size scale is reasonable.
- **Sheet pattern:** Bottom-sheet with drag handle, backdrop, and scroll behavior is well-proven for mobile.
- **Badge system:** Semantic color pairing (light bg + dark text) has good readability.
- **Safe area handling:** CSS custom properties wrapping `env()` is the correct approach.
- **Single breakpoint:** 900px is a reasonable split for a mobile-first farm app that also needs desktop use.

### 5.2 What to Improve

- **Spacing scale:** Currently ad hoc (21 distinct values). Normalize to 8px-base: `2, 4, 8, 12, 16, 24, 32, 48`.
- **Font size scale:** 11 sizes is excessive. Consolidate to 7: `11, 12, 13, 15, 18, 20, 24` — dropping 9px, 10px (too small for accessibility), 16px (merge to 15), 36px (auth-only, can use inline).
- **Border widths:** `0.5px` renders inconsistently across devices. v2 should use `1px` everywhere.
- **Component naming:** v1 uses terse abbreviations (`.bg`, `.ba`, `.bt` for badges). v2 should use semantic BEM-style names (`.badge--green`, `.badge--amber`).
- **Shadow system:** Only 2 shadows exist. Define a 3-level elevation scale: `sm` (cards), `md` (FAB, dropdowns), `lg` (sheets, dialogs).
- **Touch targets:** Some elements (10px label text, 32×32 qty buttons) are below the 44×44 WCAG minimum. v2 must enforce 44px minimums on all interactive elements.
- **Z-index management:** 7 layers (1–500) with irregular gaps. Define named layers: `base(1)`, `sticky(10)`, `nav(100)`, `fab(150)`, `sheet(200)`, `sheet-stacked(250)`, `overlay(500)`.

### 5.3 i18n Integration

All component labels in this document (e.g., "Feed on hand", "Days on Hand", "Pasture DMI") represent default English values for reference. In v2, these strings are delivered via i18n keys using the `t()` function — no English is hardcoded in feature code. See V2_INFRASTRUCTURE.md §3 for the i18n pattern and key conventions.

### 5.4 v2 Token Format

v2 uses CSS custom properties organized by category in `src/ui/tokens.css`:

```css
/* Color tokens */
--color-green-base: #639922;
--color-green-dark: #3B6D11;
--color-green-light: #EAF3DE;
/* ... repeat for amber, teal, purple, red, blue */

/* Semantic aliases */
--color-primary: var(--color-green-base);
--color-danger: var(--color-red-base);
--color-warning: var(--color-amber-base);
--color-info: var(--color-blue-base);
--color-success: var(--color-teal-base);

/* Surface tokens */
--surface-primary: var(--bg);
--surface-secondary: var(--bg2);
--surface-tertiary: var(--bg3);

/* Spacing scale */
--space-1: 2px;
--space-2: 4px;
--space-3: 8px;
--space-4: 12px;
--space-5: 16px;
--space-6: 24px;
--space-7: 32px;
--space-8: 48px;

/* Radius scale */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;

/* Elevation */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
--shadow-md: 0 2px 10px rgba(0,0,0,0.12);
--shadow-lg: 0 8px 32px rgba(0,0,0,0.18);
```

---

## 6. Relationship to Other Docs

| Doc | Design System provides | Design System consumes |
|-----|----------------------|----------------------|
| V2_UX_FLOWS.md | Component names, tokens, responsive behavior for each flow | Flow steps that need styled components |
| V2_APP_ARCHITECTURE.md | Token variable names for `src/ui/tokens.css`, component class patterns for `src/ui/dom.js` | DOM builder API (`el()`, `text()`), Sheet class pattern |
| V2_CALCULATION_SPEC.md | Display formatting for metric values (font sizes, colors for thresholds) | Computed values that need visual representation |
| V2_SCHEMA_DESIGN.md | Badge and status indicator styles for each entity type | Entity types, status values, and type enums that require visual treatment |
| V2_INFRASTRUCTURE.md | Token variable names, component label patterns | i18n key conventions (`t()` function), unit display formatting (`display()` function) |

---

## 7. Additional Component Patterns (Session 11)

Patterns for components added in V2_UX_FLOWS.md §14–§16 that were not in v1's visual audit.

### 7.1 Per-Animal Quick-Action Bar

Horizontal row of icon buttons on each animal list item. Sits below the animal's primary info (tag, name, class, weight).

- **Layout:** Flexbox row, `gap: var(--space-3)`, horizontally scrollable on overflow (mobile)
- **Button style:** Ghost buttons (no background), icon + label text, `font-size: var(--font-xs)`, `color: var(--neutral-600)`
- **Active state:** `color: var(--primary-600)`, `background: var(--primary-50)`, `border-radius: var(--radius-md)`
- **Female-only buttons** (Breeding): hidden for male animals via conditional render, not CSS
- **Mobile collapse (< 640px):** Show first 4 icons inline, remaining in "⋯" overflow menu (Sheet pattern, bottom-anchored)
- **Tap target:** Minimum 44×44px per button (accessibility)

### 7.2 Field Mode Home Screen

Replaces standard dashboard when field mode is active.

- **Action tiles:** 2×2 CSS Grid, `gap: var(--space-5)`. Each tile: `min-height: 120px`, `border-radius: var(--radius-lg)`, `background: var(--neutral-0)`, `box-shadow: var(--shadow-sm)`. Icon (32px) centered above label text. `font-size: var(--font-lg)`, `font-weight: 600`. Touch target fills entire tile.
- **Active events section:** Below tiles. Each event row: card pattern (§3.1) with `padding: var(--space-4)`. Location name bold, group + head count secondary, day count badge (§3.3) right-aligned. "Move" button right side, `--primary-600` accent.
- **Feed status dot:** 8px circle, `background: var(--green-500)` (fed today) or `var(--amber-500)` (not fed). Positioned left of location name.
- **Tasks section:** Bottom. Standard list items (§3.9) with type icon left, description center, due indicator right. Color follows threshold mapping (§1.8) for urgency.

### 7.3 Field Mode Navigation Header

Simplified header replacing standard tab bar.

- **Background:** `var(--primary-700)` (darker than standard header to visually distinguish field mode)
- **Left button:** "← Detail" (on home) or "⌂ Home" (on sub-screens). `color: var(--neutral-0)`, `font-size: var(--font-md)`
- **Center:** "Field Mode" label, `font-size: var(--font-sm)`, `color: var(--primary-200)`
- **Right:** Sync indicator (§3.14)

### 7.4 Health Recording Sheet Layout

Standard layout for all health recording sheets (§14.2–§14.8). Extends Sheet pattern (§3.5).

- **Header:** Entity context bar — animal tag, name, class badge. `background: var(--neutral-50)`, `padding: var(--space-4)`, `border-bottom: 1px solid var(--neutral-200)`.
- **Previous value reference:** When recording weight or BCS, show last recorded value in a muted info row below header. `color: var(--neutral-500)`, `font-size: var(--font-sm)`. "Last: 1,245 lbs on Mar 12" or "Last BCS: 6.5 on Feb 28".
- **Form body:** Standard form inputs (§3.4), `padding: var(--space-5)`.
- **Field mode override:** Full-screen sheet. "Done" button replaces close icon. No backdrop dismiss.

### 7.5 Group Session Progress Bar

For group weight/BCS/treatment sessions (§14.9).

- **Position:** Fixed at top of sheet, below header
- **Style:** Progress bar (§3.10) with count label: "4 of 23 — [Animal Tag]"
- **Skip button:** Right-aligned in progress row, ghost style, "Skip →"
- **Summary card (completion):** Card pattern (§3.1) with green header. Count recorded, count skipped. For BCS: "3 flagged as likely cull". For weight: group average weight.

### 7.6 Chip Selector (BCS Score)

Used by BCS Recording Sheet (§14.3). Row of numbered chips.

- **Layout:** Flexbox row, `gap: var(--space-2)`, centered
- **Chip:** `min-width: 40px`, `height: 40px`, `border-radius: var(--radius-full)`, `border: 2px solid var(--neutral-300)`, `font-weight: 600`, centered text
- **Selected state:** `background: var(--primary-600)`, `color: var(--neutral-0)`, `border-color: var(--primary-600)`
- **Half-score:** Long-press on a chip shows a ".5" option between it and the next chip. Half-score chip is smaller (32px) with `font-size: var(--font-xs)`.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-12 | Session 11 — Component gap fill | Added §7: quick-action bar, field mode home screen, field mode nav header, health recording sheet layout, group session progress bar, BCS chip selector. Patterns support V2_UX_FLOWS.md §14–§16. |
| 2026-04-13 | Header + multi-farm context design | Extended §3.6 Navigation with header bar patterns: left cluster (operation name + farm picker), right cluster (sync dot, build stamp, Field Mode, user menu button), farm picker (sheet/dropdown specs), user menu popover (email + Log Out), and cross-farm event marker style for event cards. Supports V2_UX_FLOWS.md §17.2 and new §18. |

---

*End of document. For UX flows see V2_UX_FLOWS.md. For code patterns see V2_APP_ARCHITECTURE.md. For schemas see V2_SCHEMA_DESIGN.md.*
