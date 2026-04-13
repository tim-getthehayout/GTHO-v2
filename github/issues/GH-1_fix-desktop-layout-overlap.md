# Fix Desktop Layout: Nav Sidebar Overlaps Main Content

## Summary

At desktop breakpoints (≥900px), the sidebar nav overlaps the main content area. The app is unusable on desktop — content renders behind the nav, text overlaps, and screens can't be read or interacted with.

**Root cause:** CSS conflict between `position: fixed` on `.header-nav` and the grid layout on `#app`.

The `<nav>` lives inside `<header>`, which spans both grid columns via `grid-column: 1 / -1`. The nav is then pulled out of flow with `position: fixed` to act as a sidebar. But `.app-content` (the `<main>` element) auto-places into grid row 2, column 1 — the 220px sidebar column — because no explicit column is set. It renders under the fixed nav.

## The Fix

In `src/styles/main.css`, inside the `@media (min-width: 900px)` block (~line 212), add `grid-column: 2` to `.app-content`:

```css
.app-content {
  grid-column: 2;        /* ← ADD THIS LINE */
  max-width: 1100px;
  padding: var(--space-6);
}
```

This places the main content in the `1fr` column (right side), while the fixed nav covers the 220px left column. No DOM restructuring needed.

## Acceptance Criteria

- [ ] At viewport width ≥900px, the sidebar nav (Dashboard, Events, Locations, Animals, Feed, Reports, Settings) renders in a 220px left column with no content underneath it
- [ ] The main content area renders entirely to the right of the sidebar with no overlap
- [ ] At viewport width <900px, layout is unchanged (horizontal nav in header, full-width content)
- [ ] All existing screens (Dashboard, Events, Locations, Animals, Feed, Reports, Settings) render correctly in the right column at desktop width
- [ ] No regression in mobile layout

## Test Plan

- [ ] Manual: Open app at ≥900px width, verify nav and content don't overlap on Dashboard, Events, and Settings screens
- [ ] Manual: Resize to <900px, verify mobile layout still works (horizontal nav, centered content)
- [ ] Existing Vitest suite passes (`npx vitest run`)

## Related OIs

- OI-0009

## Notes

This is a one-line CSS fix. The grid layout on `#app` already reserves the right columns — the content just wasn't placed there explicitly. The nav's `position: fixed` is intentional (sticky sidebar while scrolling), so don't remove it.
