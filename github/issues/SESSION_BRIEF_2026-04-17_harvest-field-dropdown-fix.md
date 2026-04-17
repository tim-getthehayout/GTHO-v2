# SESSION BRIEF — Harvest field dropdown: filter + styling fix

**Date:** 2026-04-17
**Context:** Harvest flow consolidation just landed. The tile grid's field row dropdown has two issues.

---

## Changes Required

### File: `src/features/harvest/index.js`

**1. Filter locations to crop + mixed-use (line 229)**

Current:
```js
const allLocations = getAll('locations').filter(l => !l.archived && l.type === 'land');
```

Change to:
```js
const allLocations = getAll('locations').filter(l => !l.archived && l.type === 'land' && (l.landUse === 'crop' || l.landUse === 'mixed-use'));
```

**2. Add styling class to the `<select>` element (line 335)**

Current:
```js
const fieldSelect = el('select', {}, [
```

Change to:
```js
const fieldSelect = el('select', { className: 'auth-select' }, [
```

That's it — two one-line changes.

---

## Why

Harvest records come from crop and mixed-use fields. Showing pure pasture locations in the dropdown is confusing and doesn't match the field picker step (which already filters to crop + mixed-use). The missing className makes the dropdown render as a browser-default unstyled `<select>`.
