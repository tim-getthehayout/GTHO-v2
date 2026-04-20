# Edit Paddock Window dialog — add pre-graze and post-graze observation cards (OI-0118)

**Added:** 2026-04-20
**Area:** v2-build / events / observations / ui
**Priority:** P1 (surface parity gap — farmer discovered during live sub-move editing from Event Detail; once a window is closed, the pre-graze observation is **unreachable from the UI** because event detail §5 only renders pre-graze cards on open windows)
**Thin pointer note:** not a thin pointer — no base-doc enumeration of the edit-paddock-window dialog's component set exists. At sprint reconciliation this rolls into V2_UX_FLOWS.md §17.15 / §12 alongside the date/area fields.

## What Tim is hitting

On the Event Detail sheet, two places open the paddock-window edit dialog (`openEditPaddockWindowDialog` from `src/features/events/edit-paddock-window.js`):

1. **§4 Paddocks list** — the "Edit" button on each row (`src/features/events/detail.js:593`).
2. **§12 Sub-move History** — the pencil button on each sub-move row (`src/features/events/detail.js:1299`).

The dialog today renders only `dateOpened` + `timeOpened`, `dateClosed` + `timeClosed` (on closed windows), `areaPct`, and the strip-graze toggle — plus reopen (closed-only) and delete. Pre-graze and post-graze observation cards are **not** rendered here, even though every other surface that touches a paddock window renders them:

- Move wizard destination / source (OI-0100, OI-0112 surface #1 / #2)
- Close Event sheet (OI-0112 surface #3)
- Sub-move Open / Close sheets (OI-0112 surfaces #4 / #5)
- Event Detail §5 / §6 (OI-0107 + OI-0112 surface #7)

The edit dialog is the outlier.

## Why this is a root-cause problem, not polish

Event Detail §5 filters to **open** paddock windows only:

```js
// detail.js:624-625
const openPaddockWindows = getAll('eventPaddockWindows')
  .filter(pw => pw.eventId === ctx.eventId && !pw.dateClosed);
```

Once a window is **closed**, its pre-graze card disappears from §5 forever. Post-graze appears in §6 on closed windows, but **there is currently no surface in the app** where a farmer can correct a historical pre-graze observation on a closed sub-move. The edit-paddock-window dialog is the only place a closed window is editable at all, so it's the natural home for the historical pre-graze edit.

## Scope

1. **Pre-graze card — always render** (open AND closed windows).
2. **Post-graze card — render only when `pw.dateClosed != null`** (mirrors §6).
3. **Each card gets its own inline Save button** (not folded into the dialog's main Save). This keeps the observation write separable from the window-metadata write and matches the §5 / §6 pattern exactly.
4. **Ordering in the dialog:**
   - Existing: date opened / time opened
   - Existing: date closed / time closed (if closed)
   - Existing: area % / strip graze toggle (+ the split-warning hint on open windows)
   - **NEW: Pre-graze card + Save button + "Saved" indicator**
   - **NEW (closed only): Post-graze card + Save button + "Saved" indicator**
   - Existing: Save / Cancel button row (window-metadata save)
   - Existing: Reopen button (closed only)
   - Existing: Delete button
5. **BRC late-bind not required.** Unlike sub-move Open's NC-1 fix, `pw.locationId` is known at dialog open time, so `paddockAcres` is populated on first render. No `setPaddockAcres` wiring needed.

## Implementation

### New imports in `src/features/events/edit-paddock-window.js`

```js
import { getAll, getById, add, update, remove, splitPaddockWindow } from '../../data/store.js';
import { convert } from '../../utils/units.js';
import { renderPreGrazeCard } from '../observations/pre-graze-card.js';
import { renderPostGrazeCard } from '../observations/post-graze-card.js';
import * as PaddockObsEntity from '../../entities/paddock-observation.js';
```

(The existing import of `getAll, getById, update, remove, splitPaddockWindow` already exists — just add `add` to that line. `convert`, the two card renderers, and `PaddockObsEntity` are new.)

### Farm settings + paddock acres lookup

Insert after the existing `loc` / `locName` / `isClosed` setup:

```js
const farmSettings = getAll('farmSettings')[0] || null;
const paddockAcres = loc?.areaHa != null
  ? convert(loc.areaHa, 'area', 'toImperial')
  : null;
```

### Pre-graze section

Insert **after** the existing area % + strip-graze row (and the split-warning hint on open windows), **before** `statusEl`:

```js
// Pre-graze observation card (OI-0118) — renders for open + closed windows
// so historical pre-graze is editable after the window closes.
const preGrazeObs = (() => {
  const allObs = getAll('paddockObservations')
    .filter(o => o.locationId === pw.locationId && o.type === 'open' && o.source === 'event');
  return allObs.find(o => o.sourceId === pw.id)
    || allObs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
    || null;
})();

const preGrazeCard = renderPreGrazeCard({
  farmSettings,
  paddockAcres,
  initialValues: preGrazeObs ? {
    forageHeightCm: preGrazeObs.forageHeightCm,
    forageCoverPct: preGrazeObs.forageCoverPct,
    forageQuality: preGrazeObs.forageQuality,
    forageCondition: preGrazeObs.forageCondition,
    baleRingResidueCount: preGrazeObs.baleRingResidueCount,
    notes: preGrazeObs.notes,
  } : {},
});

const preGrazeSavedEl = el('span', {
  style: { fontSize: '11px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: '8px' },
}, [t('settings.saved')]);
const preGrazeSaveBtn = el('button', {
  className: 'btn btn-outline btn-xs',
  'data-testid': `edit-pw-pregraze-save-${pw.id}`,
  onClick: () => {
    const values = preGrazeCard.getValues();
    if (preGrazeObs) {
      update('paddockObservations', preGrazeObs.id, values,
        PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
    } else {
      const newObs = PaddockObsEntity.create({
        operationId,
        locationId: pw.locationId,
        observedAt: new Date().toISOString(),
        type: 'open',
        source: 'event',
        sourceId: pw.id,
        ...values,
      });
      add('paddockObservations', newObs,
        PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
    }
    preGrazeSavedEl.style.opacity = '1';
    setTimeout(() => { preGrazeSavedEl.style.opacity = '0'; }, 2000);
  },
}, [t('action.save')]);

panel.appendChild(el('div', {
  className: 'card',
  style: { marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' },
  'data-testid': `edit-pw-pregraze-${pw.id}`,
}, [
  preGrazeCard.container,
  el('div', { style: { display: 'flex', alignItems: 'center', marginTop: '8px' } }, [
    preGrazeSaveBtn, preGrazeSavedEl,
  ]),
]));
```

### Post-graze section (closed windows only)

Insert **right after** the pre-graze section, inside `if (isClosed) { ... }`:

```js
// Post-graze observation card (OI-0118) — only on closed windows.
if (isClosed) {
  const postGrazeObs = (() => {
    const allObs = getAll('paddockObservations')
      .filter(o => o.locationId === pw.locationId && o.type === 'close' && o.source === 'event');
    return allObs.find(o => o.sourceId === pw.id)
      || allObs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      || null;
  })();

  const postGrazeCard = renderPostGrazeCard({
    farmSettings,
    initialValues: postGrazeObs ? {
      residualHeightCm: postGrazeObs.residualHeightCm,
      recoveryMinDays: postGrazeObs.recoveryMinDays,
      recoveryMaxDays: postGrazeObs.recoveryMaxDays,
      notes: postGrazeObs.notes,
    } : {},
  });

  const postGrazeSavedEl = el('span', {
    style: { fontSize: '11px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: '8px' },
  }, [t('settings.saved')]);
  const postGrazeSaveBtn = el('button', {
    className: 'btn btn-outline btn-xs',
    'data-testid': `edit-pw-postgraze-save-${pw.id}`,
    onClick: () => {
      const values = postGrazeCard.getValues();
      if (postGrazeObs) {
        update('paddockObservations', postGrazeObs.id, values,
          PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
      } else {
        const newObs = PaddockObsEntity.create({
          operationId,
          locationId: pw.locationId,
          observedAt: new Date().toISOString(),
          type: 'close',
          source: 'event',
          sourceId: pw.id,
          ...values,
        });
        add('paddockObservations', newObs,
          PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
      }
      postGrazeSavedEl.style.opacity = '1';
      setTimeout(() => { postGrazeSavedEl.style.opacity = '0'; }, 2000);
    },
  }, [t('action.save')]);

  panel.appendChild(el('div', {
    className: 'card',
    style: { marginBottom: 'var(--space-3)' },
    'data-testid': `edit-pw-postgraze-${pw.id}`,
  }, [
    postGrazeCard.container,
    el('div', { style: { display: 'flex', alignItems: 'center', marginTop: '8px' } }, [
      postGrazeSaveBtn, postGrazeSavedEl,
    ]),
  ]));
}
```

Both blocks must land **above** `statusEl` / the Save button row so observation cards appear before the window-metadata save and destructive buttons.

## Acceptance criteria

- [ ] Pre-graze card renders in `openEditPaddockWindowDialog` for every paddock window (open or closed).
- [ ] Post-graze card renders only when `pw.dateClosed != null`.
- [ ] Each card has its own Save button with the same transient "Saved" indicator pattern used in `detail.js` §5 / §6.
- [ ] Save writes to `paddock_observations` with `source: 'event'`, `sourceId: pw.id`, `type: 'open'` for pre-graze and `type: 'close'` for post-graze.
- [ ] All store calls use the full param count per CLAUDE.md §"Store call param-count check": `add(entityType, record, validateFn, toSupabaseFn, table)` = 5 params; `update(entityType, id, changes, validateFn, toSupabaseFn, table)` = 6 params.
- [ ] `initialValues` populates from the existing observation row if one exists (prefer `sourceId === pw.id`, fall back to most recent by `createdAt` desc, matching the §5 / §6 pattern).
- [ ] `paddockAcres` is computed via `convert(loc.areaHa, 'area', 'toImperial')` so the BRC helper surfaces when farm settings + location area are populated.
- [ ] Closed-window historical pre-graze edit round-trips to Supabase: open dialog on a closed sub-move → edit forage height → Save → reopen dialog → card shows the new value → query Supabase `paddock_observations` directly, row exists with the new value.
- [ ] No regression in the existing dialog behavior — date / time / area / strip edits, reopen button, delete button all behave identically.
- [ ] Unit test suite stays green; new tests cover:
  1. Pre-graze card renders on open window.
  2. Pre-graze card renders on closed window.
  3. Post-graze card renders only on closed window (absent on open).
  4. Save with no prior observation → `add('paddockObservations', ...)` called with correct `sourceId`, `type`, `source`.
  5. Save with prior observation → `update('paddockObservations', obs.id, values, ...)` called; no duplicate row created.
  6. Round-trip: values round-trip through `getValues()` → save → reopen → `initialValues` pre-populates.
- [ ] E2E test per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": after the UI edit, query Supabase `paddock_observations` directly and assert the row exists with the new value and correct `source_id`.
- [ ] `PROJECT_CHANGELOG.md` row on commit.

## Files touched

- `src/features/events/edit-paddock-window.js` — imports (add `add` to existing store import, add `convert`, `renderPreGrazeCard`, `renderPostGrazeCard`, `PaddockObsEntity`) + two new panel sections (pre-graze always, post-graze on `isClosed`).
- `tests/unit/features/events/edit-paddock-window.test.js` — new or extended file with the six cases above.
- `tests/e2e/` — extend an existing sub-move or paddock-window edit e2e (or add one) with the Supabase round-trip assertion.
- `PROJECT_CHANGELOG.md` — one row on commit (Claude Code owns).

## Non-goals

- **No schema change.** `paddock_observations` table + columns already exist (OI-0112 shipped).
- **No CP-55 / CP-56 impact.** Existing columns already in the backup payload.
- **No change to `detail.js` §5 / §6.** Those stay as-is; this spec only touches `edit-paddock-window.js`.
- **No BRC late-bind wiring** (`setPaddockAcres`). `pw.locationId` is known at dialog open time, so acres is populated on first render.
- **No change to the reopen / delete buttons.** They stay below the observation cards in the existing order.
- **No change to `openEditGroupWindowDialog`** (`edit-group-window.js`). That dialog is for group windows (`event_group_windows`), not paddock windows — out of scope. If Tim wants the equivalent for groups, that's a separate OI.

## Related

- **OI-0112** (shipped, GH-19) — unified card variants + migrated six surfaces. This OI closes the omission of the seventh surface (edit-paddock-window dialog).
- **OI-0110** (shipped) — migrated sub-move Open pre-graze to the shared card. Same class of caller-migration.
- **OI-0107** (shipped) — migrated Event Detail §5 pre-graze to the shared card. Direct architectural sibling — this OI extends the pattern to the edit dialog so the closed-window case is covered.
- **OI-0114** (shipped, GH-24) — observation-boxes polish. Styling the new callers inherit is already canonical.
- **Base doc at sprint reconciliation:** V2_UX_FLOWS.md §12 Sub-moves and §17.15 Event Detail — paddock-window edit dialog section should name pre-graze and post-graze as rendered components. Not blocking for this handoff.

## Commit message skeleton

```
feat(edit-paddock-window): render pre-graze + post-graze cards in the dialog (OI-0118)

Adds the shared renderPreGrazeCard and renderPostGrazeCard components
to openEditPaddockWindowDialog. Pre-graze renders on open + closed
windows; post-graze renders only on closed windows. Each card has its
own inline Save button matching the Event Detail §5/§6 pattern and
writes to paddock_observations with source_id = pw.id.

Closes the surface-parity gap with move wizard and Event Detail §5/§6.
Makes historical pre-graze editable on closed sub-moves for the first
time (§5 only renders open windows, so the closed-window case had no
edit surface).

No schema change. No CP-55/CP-56 impact.
Closes OI-0118 and [GH issue number after filing].
```
