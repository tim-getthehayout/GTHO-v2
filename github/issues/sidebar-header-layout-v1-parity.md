# SP-5: Sidebar, Header, and Layout — V1 Parity

**Priority:** P1
**Area:** v2-build / UI sprint
**Labels:** ui, layout, v1-parity

---

## Goal

Rebuild the v2 sidebar navigation and header to match v1's visual structure, interaction patterns, and information density. Fix the CSS layout bug where the nav overlaps into the header. Add sync status back to the sidebar. Remove the redundant app name + operation name from the header (since the sidebar already shows them).

---

## Current Issues (V2)

### 1. Nav overlaps into header (CSS bug)

The desktop sidebar nav uses `position: fixed; top: 60px` but the header (`app-header`) has no fixed height — it's `padding: var(--space-4) var(--space-5)` with auto-height content. When the operation name is long ("Down East Beef and Lamb"), the header exceeds 60px and the nav renders on top of it.

**Root cause:** `main.css` line 247 hardcodes `top: 60px`. This needs to be dynamic or the header height needs to be fixed.

### 2. No logo/icon in sidebar

V1 has a branded logo block: green app icon (32x32 rounded square with leaf SVG) + "Get The Hay Out" in bold green + farm name in gray below. This creates visual identity and hierarchy.

V2 puts the app name and farm name in the header bar instead, leaving the sidebar as just a list of plain text links starting immediately.

### 3. No icons on nav items

V1 nav items have SVG stroke icons (home, animals, tasks, events, fields, feed, feedback, reports, settings gear). V2 nav items are plain text with no icons.

### 4. No active state highlighting

V1 highlights the active nav item with `background: var(--green-l); color: var(--green-d); font-weight: 600`. V2 nav links have hover state only (`background: var(--bg2)`) but no active/selected state.

### 5. No sync status in sidebar

V1 shows sync status at the bottom of the sidebar: green/amber/red dot + "Synced HH:MM AM" timestamp. V2 has a tiny sync dot in the header right cluster but no timestamp text and it's hard to notice.

### 6. Redundant header content

V2 header shows "GET THE HAY OUT" (small caps) + "Down East Beef and Lamb" (large bold) + build stamp + Field button + avatar. Since the sidebar will now have the logo block, the app name and operation name in the header become redundant.

---

## Fix: Restructured Layout

### Header bar (simplified)

Remove "GET THE HAY OUT" and operation name from the header. Keep only:
- **Left:** Farm picker (when multi-farm) or farm name
- **Right:** Build stamp + Field mode button + User avatar

The header becomes a thin utility bar, not a branding element. This matches v1 where the header shows "Get The Hay Out" + "Down East Beef and Lamb" but these are redundant with the sidebar — Tim confirmed to remove the header ones.

**New header structure:**
```
[Farm picker or farm name]                    [build stamp] [Field] [TI]
```

### Sidebar (v1 parity)

**Top: Logo block** (with border-bottom separator)
```
[green icon] Get The Hay Out
             Down East Beef and Lamb
```

**Middle: Nav items** (with icons and active state)
```
🏠 Dashboard          ← active: green-l background, green-d text
👥 Animals
📋 Rotation Calendar
📍 Locations
🐄 Animals
🌾 Feed
☑️ Todos              [1]  ← badge
📊 Reports
⚙️ Settings
```

**Bottom: Sync status strip** (with border-top separator)
```
● Synced 05:52 AM
```

### CSS layout fix

Replace the hardcoded `top: 60px` with a proper grid-based layout where the sidebar is a grid area, not a position-fixed overlay.

---

## V1 HTML Reference

### Sidebar structure (lines 663-717)

```html
<aside class="dsk-sidebar" id="dsk-sidebar">
  <!-- Logo block -->
  <div class="dsk-logo">
    <div class="dsk-logo-icon">
      <!-- leaf SVG icon -->
    </div>
    <div>
      <div class="dsk-logo-text">Get The Hay Out</div>
      <div class="dsk-logo-sub">{farmName}</div>
    </div>
  </div>
  
  <!-- Navigation -->
  <nav class="dsk-nav">
    <button class="dsk-nav-item active" id="dbn-home" onclick="nav('home',this)">
      <svg><!-- icon --></svg> Home
    </button>
    <button class="dsk-nav-item" id="dbn-animals" onclick="nav('animals',this)">
      <svg><!-- icon --></svg> Animals
    </button>
    <!-- ... more items ... -->
    <button class="dsk-nav-item" id="dbn-todos" onclick="nav('todos',this)">
      <svg><!-- icon --></svg> Tasks
      <span class="dsk-nav-badge" id="dtodo-badge" style="display:none;"></span>
    </button>
    <!-- ... -->
  </nav>
  
  <!-- Sync status -->
  <div class="dsk-sync-strip" onclick="goSettings()">
    <span class="sync-dot sync-ok" id="dsk-sync-dot"></span>
    <span id="dsk-sync-label">Synced 05:52 AM</span>
  </div>
</aside>
```

### Header bar (lines 720-737)

```html
<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-title">Get The Hay Out</div>
    <div class="hdr-sub" id="hdr-sub">{farmName}</div>
  </div>
  <div class="hdr-right">
    <div id="sync-indicator">
      <span class="sync-dot" id="sync-dot"></span>
      <span id="sync-label">Sync</span>
    </div>
    <span class="hdr-ver" id="hdr-ver">{buildStamp}</span>
    <button class="btn btn-green btn-xs" id="field-mode-btn">Field</button>
    <button class="hdr-avatar" id="avatar-btn">{initials}</button>
  </div>
</div>
```

---

## V1 CSS Reference

### Sidebar

```css
.dsk-sidebar {
  grid-area: sidebar;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-right: 0.5px solid var(--border);
  overflow-y: auto;
  padding: 0;
}

.dsk-logo {
  padding: 18px 18px 14px;
  border-bottom: 0.5px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.dsk-logo-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--green);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.dsk-logo-text { font-size: 14px; font-weight: 700; color: var(--green-d); line-height: 1.2; }
.dsk-logo-sub { font-size: 11px; color: var(--text2); margin-top: 1px; }

.dsk-nav {
  padding: 10px 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsk-nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  border: none; background: transparent;
  cursor: pointer; font-family: inherit;
  color: var(--text2); font-size: 13px; font-weight: 500;
  width: 100%; text-align: left;
  position: relative;
  transition: background 0.1s, color 0.1s;
}
.dsk-nav-item:hover { background: var(--bg2); color: var(--text); }
.dsk-nav-item.active { background: var(--green-l); color: var(--green-d); font-weight: 600; }
.dsk-nav-item svg { flex-shrink: 0; opacity: 0.7; }
.dsk-nav-item.active svg { opacity: 1; }
.dsk-nav-badge {
  margin-left: auto;
  background: var(--amber); color: white;
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  min-width: 18px; text-align: center;
}

.dsk-sync-strip {
  padding: 12px 14px;
  border-top: 0.5px solid var(--border);
  font-size: 11px; color: var(--text2);
  display: flex; align-items: center; gap: 7px;
  cursor: pointer;
}
.dsk-sync-strip:hover { color: var(--text); }
```

### Sync dot states

```css
.sync-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.sync-ok { background: var(--green); }
.sync-pending { background: var(--amber); }
.sync-err { background: var(--red); }
.sync-off { background: var(--text3); }
```

---

## Implementation Notes

### Desktop layout fix

The current v2 grid at 900px+:
```css
grid-template-columns: 220px 1fr;
grid-template-rows: auto 1fr;
```

With `header-nav` as `position: fixed; top: 60px` — this is the bug source.

**Fix:** Make the sidebar a proper grid area instead of fixed-position. Either:
- (A) Use CSS grid areas: header spans top, sidebar fills left column, content fills right. No position: fixed needed.
- (B) Keep fixed sidebar but derive `top` from actual header height via a CSS custom property or use `position: sticky`.

Option A (grid areas) is cleaner and matches v1's approach. V1 uses:
```css
body.desktop #app {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas: "sidebar header" "sidebar content";
  min-height: 100vh;
}
```

### Sync status implementation

V2 already has `renderSyncIndicator()` in header.js that reads `getSyncAdapter().getStatus()`. Extend this to:
1. Show the dot + timestamp text in the sidebar bottom strip
2. Update on sync events (subscribe to sync status changes)
3. Format as "Synced HH:MM AM/PM" when idle, "Syncing..." when active, "Sync error" when failed

### Active nav state

V2 nav links are `<a href>` elements. Add active state by checking `window.location.hash` against the link's href on render and on `hashchange`. Apply `.nav-link-active` class.

### Nav icons

Use the same SVG stroke icon style as v1. Each icon is 20x20, stroke-width 2, stroke-linecap round. The icons can be inline SVG elements created via `el()`.

---

## Acceptance Criteria

- [ ] Sidebar has logo block at top: green icon + app name (bold green) + farm name (gray)
- [ ] Nav items have SVG icons matching v1 style
- [ ] Active nav item has green highlight background (matching v1)
- [ ] Sync status at sidebar bottom: dot + "Synced HH:MM AM" timestamp
- [ ] Header no longer shows app name or operation name (removed — sidebar has them)
- [ ] Header shows: farm picker (if multi-farm), build stamp, Field button, user avatar
- [ ] Nav does not overlap into the header on desktop (CSS layout bug fixed)
- [ ] Sidebar is a proper grid area, not position: fixed with hardcoded top
- [ ] Mobile bottom nav unaffected
- [ ] Badge counts work on both desktop sidebar and mobile bottom nav

---

## No Schema Impact

Visual/layout only. No CP-55/CP-56 impact.
