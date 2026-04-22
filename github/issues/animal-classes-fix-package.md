# Animal Classes — Data Integrity & UI/Calc Fix Package

**Bundles:** OI-0057 + OI-0127 + OI-0128 + OI-0130 — resolve in one Claude Code session.
**Excludes:** OI-0129 (wire weaning pipeline) — DESIGN REQUIRED, do **not** build in this session.
**Source-of-truth specs:** `OPEN_ITEMS.md` entries OI-0057, OI-0127, OI-0128, OI-0130 (read first).
**CP-55/CP-56 impact:** **none** for the entire package — no schema or column-shape changes; only value corrections, a missing UI surface, and a calc-side fallback that consumes existing columns.

---

## Why one package

These four items are tightly coupled. Doing any one without the others either re-introduces the bug it was meant to fix or leaves the user with no path to consume the fix:

- **OI-0127** flips `weaning_age_days` in `seed-data.js` from dam roles (cow / ewe / doe) to offspring roles (calf / lamb / kid) and rewrites `v1-migration.js` §2.14 to read from corrected seed-data by role. Any pipeline that creates a class — onboarding seeding or v1 import — must use the corrected source.
- **OI-0057** is a one-shot SQL data patch against Tim's existing operation that reads from the corrected seed-data. If OI-0127 hasn't landed first, the patch reads the inverted values and bakes the bug back in.
- **OI-0128** replaces the `window.prompt('Class name:', cls.name)` regression with a full Edit-form repopulate. Without this, Tim has no path to override any of OI-0057's patched values for his own herd.
- **OI-0130** wires a class-default weight fallback into `getLiveWindowAvgWeight` — the calc consumer of the `default_weight_kg` values OI-0057 just populated. Without this, the patched defaults exist but the calc engine still returns 0 when no per-animal weights are recorded.

Order matters: implement them in the sequence below.

---

## Order of operations

1. **OI-0127 — Fix `seed-data.js` and `v1-migration.js`** (so the rest reads from correct seed)
2. **OI-0057 — Run SQL data patch** against Tim's operation in Supabase
3. **OI-0128 — Rewrite Edit Class form** (so Tim can adjust patched values)
4. **OI-0130 — Add class-default fallback to `getLiveWindowAvgWeight`** (so calcs consume the patched defaults)
5. **Tests + grep contracts + commit + push**

---

## 1) OI-0127 — Seed-data weaning role flip + v1-migration §2.14 rewrite

### 1a) `src/features/onboarding/seed-data.js`

Flip `weaningAgeDays` from dam role → offspring role across all four species. Other fields unchanged.

| Species | Move FROM (`weaningAgeDays:` → `null`) | Move TO (`weaningAgeDays:` → value) |
|---|---|---|
| `beef_cattle` | `cow: 205` → `null` | `calf: null` → `205` |
| `dairy_cattle` | `cow: 60` → `null` | `calf: null` → `60` |
| `sheep` | `ewe: 90` → `null` | `lamb: null` → `90` |
| `goat` | `doe: 90` → `null` | `kid: null` → `90` |

`dmiPctLactating` stays on the dam roles (cow / ewe / doe) — that's correct as-is.

### 1b) `src/data/v1-migration.js` §2.14 (lines 262–280)

Replace the current transform:

```js
// CURRENT (wrong)
const weanTargets = settings.weanTargets || { cattle: 205, sheep: 60, goat: 60 };
const v2AnimalClasses = ensure('animalClasses').map(ac => ({
  // ...
  default_weight_kg: ac.weight != null ? ac.weight * LBS_TO_KG : null,
  dmi_pct: ac.dmiPct ?? ac.dmi_pct ?? null,
  dmi_pct_lactating: null,
  excretion_n_rate: null,
  excretion_p_rate: null,
  excretion_k_rate: null,
  weaning_age_days: weanTargets.cattle || 205,
  // ...
}));
```

with seed-data-keyed lookup:

```js
// NEW
import { ANIMAL_CLASSES_BY_SPECIES } from '../features/onboarding/seed-data.js';
// ...
const v2AnimalClasses = ensure('animalClasses').map(ac => {
  const role = inferRole(ac.name);
  // Tim's operation is all beef per existing comment at line 268; if multi-species
  // import support lands later, generalize the species lookup.
  const seedRow = ANIMAL_CLASSES_BY_SPECIES.beef_cattle.find(c => c.role === role)
    ?? ANIMAL_CLASSES_BY_SPECIES.beef_cattle.find(c => c.role === 'cow'); // conservative fallback for unrecognized roles
  return {
    id: ids.animalClasses.remap(ac.id),
    operation_id: opId,
    name: ac.name || 'Unknown',
    species: 'beef_cattle',
    role,
    default_weight_kg: ac.weight != null ? ac.weight * LBS_TO_KG : seedRow.defaultWeightKg,
    dmi_pct: ac.dmiPct ?? ac.dmi_pct ?? seedRow.dmiPct,
    dmi_pct_lactating: seedRow.dmiPctLactating,
    excretion_n_rate: seedRow.excretionNRate,
    excretion_p_rate: seedRow.excretionPRate,
    excretion_k_rate: seedRow.excretionKRate,
    weaning_age_days: seedRow.weaningAgeDays, // null for non-calf roles, 205 for calf
    archived: false,
    created_at: now,
    updated_at: now,
  };
});
```

Drop the `weanTargets` shim entirely — replaced by the role-keyed lookup.

### 1c) Tests

- `tests/unit/seed-data.test.js` (new or extended) — assert `weaningAgeDays` is non-null on offspring roles only, null on dam + neutered + male roles. Assert `dmiPctLactating` is non-null on dam roles only.
- `tests/unit/v1-migration.test.js` (new or extended) — sample import with cow + heifer + calf + bull → assert each class lands with the correct seed-data values for its role; assert no class carries `weaning_age_days = 205` except calf.

---

## 2) OI-0057 — SQL data patch (run AFTER 1a + 1b land)

### 2a) Locate Tim's operation_id

Run via Supabase MCP (read-only):

```sql
SELECT id, name FROM operations WHERE name ILIKE '%hay%' OR name ILIKE '%tim%' ORDER BY created_at DESC;
```

Confirm with Tim if more than one row returns. Substitute the resulting UUID for `<TIM_OP_ID>` below.

### 2b) Pre-patch verification snapshot

```sql
SELECT name, role, default_weight_kg, dmi_pct, dmi_pct_lactating,
       excretion_n_rate, excretion_p_rate, excretion_k_rate, weaning_age_days
FROM animal_classes
WHERE operation_id = '<TIM_OP_ID>'
ORDER BY role, name;
```

Save the output to the commit message for audit.

### 2c) Migration file

Write `supabase/migrations/NNN_animal_class_data_patch_op_<short>.sql` (NNN = next migration number; use `<short>` = first 8 chars of Tim's op id):

```sql
-- OI-0057: Reset animal_classes rate-bearing fields from current NRCS seed-data.
-- Operation-scoped, idempotent (re-runnable safely).
-- Keeps name, species, id, operation_id, archived, created_at intact.

DO $$
DECLARE
  tim_op_id uuid := '<TIM_OP_ID>';
BEGIN
  -- cow
  UPDATE animal_classes SET
    default_weight_kg = 545, dmi_pct = 2.5, dmi_pct_lactating = 3.0,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,  -- per OI-0127, weaning lives on calf
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'cow';

  -- heifer
  UPDATE animal_classes SET
    default_weight_kg = 363, dmi_pct = 2.5, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'heifer';

  -- bull
  UPDATE animal_classes SET
    default_weight_kg = 727, dmi_pct = 2.0, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'bull';

  -- steer
  UPDATE animal_classes SET
    default_weight_kg = 454, dmi_pct = 2.5, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'steer';

  -- calf — weaning_age_days lives here per OI-0127
  UPDATE animal_classes SET
    default_weight_kg = 113, dmi_pct = 3.0, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = 205,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'calf';
END $$;

-- Bump schema_version per CLAUDE.md "Code Quality Checks #6"
UPDATE operations SET schema_version = NNN;
```

Add the matching `BACKUP_MIGRATIONS` entry in `src/data/backup-migrations.js` — no-op fine (data patch, no shape change):

```js
NNN-1: (b) => { b.schema_version = NNN; return b; },
```

### 2d) Execute + verify (per CLAUDE.md "Migration Execution Rule — Write + Run + Verify")

Apply via Supabase MCP, then re-run the verify query from §2b. Confirm every class row matches the table in OI-0057's "Fix" section. Paste the verification output into the commit message: "Migration NNN applied and verified."

---

## 3) OI-0128 — Edit Class form full repopulate

### 3a) `src/features/animals/index.js` — rewrite `renderManageAnimalClassesSheet` Add form to be Add/Edit dual-purpose

Two scoped changes:

**Change A — turn the Add form into a dual-purpose Add/Edit form.** Hold an `editingClassId` ref in the sheet's closure (default `null`). The Save button branches:

```js
let editingClassId = null;
const saveBtn = el('button', { className: 'btn btn-green', onClick: () => {
  // ... read inputs (with imperial→metric conversion for weight per OI-0111 pattern) ...
  const data = { /* all 11 fields */ };
  try {
    if (editingClassId == null) {
      const record = AnimalClassEntity.create({ operationId, ...data });
      add('animalClasses', record, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
    } else {
      update('animalClasses', editingClassId, data, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
    }
    resetForm();
    renderClassList();
  } catch (err) { /* ... */ }
} }, [editingClassId == null ? 'Add class' : 'Save changes']);
```

A "Cancel edit" link appears next to Save only when `editingClassId !== null`. Cancel calls `resetForm()` which: clears every input, re-enables species + role selects, sets `editingClassId = null`, restores the "Add class" button label.

**Change B — replace `openClassEditForm`** with:

```js
function openClassEditForm(cls, operationId, unitSys) {
  // Populate the shared Add/Edit form at the bottom of the manage sheet with
  // every field of `cls`, set editingClassId = cls.id, lock species + role,
  // change Save label to "Save changes", scroll into view.
  populateForm(cls);  // see §3b for field list + unit conversion
  editingClassId = cls.id;
  inputs.species.disabled = true;
  inputs.role.disabled = true;
  saveBtn.textContent = 'Save changes';
  cancelEditLink.style.display = '';
  formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

`populateForm` and `editingClassId` need to live in the same closure as the form inputs. Refactor `renderManageAnimalClassesSheet` so the form, its state, and `openClassEditForm` all share one closure (push them inside the function rather than leaving `openClassEditForm` as a top-level function).

### 3b) Form fields — extend from current 4 to 11

| Field | Input type | Unit conversion | Validation |
|---|---|---|---|
| Name | `text` | — | required, non-empty |
| Species | `select` (`beef_cattle`/`dairy_cattle`/`sheep`/`goat`/`other`) | — | required; **disabled when editing** |
| Role | `select` (options vary by species; populate via `onchange` on species) | — | required; **disabled when editing** |
| Default weight | `number` step 1 | metric ↔ user unit (use `FARM_FIELD_DESCRIPTORS` pattern from OI-0111 — `convert(v, 'weight', 'toMetric')` on save when `unitSys === 'imperial'`, `convert(v, 'weight', 'toImperial').toFixed(0)` on populate) | numeric, ≥ 0 |
| DMI % of body weight | `number` step 0.1 min 0.5 max 6 | none | numeric, in range |
| DMI % when lactating | `number` step 0.1 min 0.5 max 6 | none | numeric, in range; null allowed |
| Excretion N rate | `number` step 0.001 | none | numeric ≥ 0; label: "Excretion N (kg / 1000 kg BW / day)" |
| Excretion P rate | `number` step 0.001 | none | same |
| Excretion K rate | `number` step 0.001 | none | same |
| Weaning age | `number` step 1 | none | positive integer; null allowed |
| Archived | `checkbox` | — | — |

### 3c) Side-fix — species select option values

Current code: `el('option', {}, ['Beef cattle'])` writes "Beef cattle" as the option value (no `value` attr). The entity's `VALID_SPECIES` is `['beef_cattle','dairy_cattle','sheep','goat','other']`, so any class created through this form fails validation. Add explicit `value` attrs:

```js
inputs.species = el('select', {}, [
  el('option', { value: 'beef_cattle' }, ['Beef cattle']),
  el('option', { value: 'dairy_cattle' }, ['Dairy cattle']),
  el('option', { value: 'sheep' }, ['Sheep']),
  el('option', { value: 'goat' }, ['Goats']),
  el('option', { value: 'other' }, ['Other']),
]);
```

Same pattern for the new role select (option values pulled from `ANIMAL_CLASSES_BY_SPECIES[species].map(c => c.role)`).

### 3d) Tests

`tests/unit/animal-class-edit-form.test.js` (new):

- Load a class with all 11 fields populated → click Edit → assert every input is pre-filled (weight in user units), species + role disabled
- Edit weight (in imperial), DMI lactating, weaning age → click Save → assert store update fires with correct metric weight + new DMI/weaning values
- Click Cancel edit → assert form clears, `editingClassId` resets, Save button label restores
- Add a new class with species + role + all rate fields → assert species value is canonical (`beef_cattle`, not `Beef cattle`)

---

## 4) OI-0130 — Class-default weight fallback in `getLiveWindowAvgWeight`

### 4a) `src/calcs/window-helpers.js`

Extend the helper's threaded context with `animalClasses`. Add a class-default fallback tier inside the live-average loop:

```js
export function getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now }) {
  if (gw.dateLeft != null) return gw.avgWeightKg ?? 0;
  if (!memberships || !animals || !now) return gw.avgWeightKg ?? 0;

  const liveAnimalIds = memberships
    .filter(m => isMembershipLive(m, gw.groupId, now))
    .map(m => m.animalId);
  if (liveAnimalIds.length === 0) return gw.avgWeightKg ?? 0;

  // Latest weight record per animal (existing behavior)
  const weightsByAnimal = new Map();
  if (animalWeightRecords) {
    for (const w of animalWeightRecords) {
      if (!w.animalId || !w.weightKg) continue;
      if (w.date && w.date > now) continue;
      const prev = weightsByAnimal.get(w.animalId);
      if (!prev || (w.date || '') > (prev.date || '')) {
        weightsByAnimal.set(w.animalId, w);
      }
    }
  }

  // Class-default fallback map (NEW per OI-0130)
  const classDefaultByAnimalId = new Map();
  if (animalClasses && animals) {
    const classById = new Map(animalClasses.map(c => [c.id, c]));
    for (const id of liveAnimalIds) {
      const a = animals.find(an => an.id === id);
      const cls = a?.classId ? classById.get(a.classId) : null;
      if (cls && typeof cls.defaultWeightKg === 'number' && cls.defaultWeightKg > 0) {
        classDefaultByAnimalId.set(id, cls.defaultWeightKg);
      }
    }
  }

  let sum = 0;
  let count = 0;
  for (const id of liveAnimalIds) {
    const rec = weightsByAnimal.get(id);
    if (rec && typeof rec.weightKg === 'number') {
      sum += rec.weightKg;
      count += 1;
    } else if (classDefaultByAnimalId.has(id)) {
      sum += classDefaultByAnimalId.get(id);
      count += 1;
    }
    // else: animal has neither a weight record nor a class default with a weight — drop from count
  }
  if (count === 0) return gw.avgWeightKg ?? 0;
  return sum / count;
}
```

### 4b) Thread `animalClasses` into all 21 call-sites

```
src/features/events/detail.js                    (lines 255, 730, 1019)
src/features/events/move-wizard.js               (line 629)
src/features/events/edit-group-window.js         (line 86)
src/features/events/group-windows.js             (line 88)
src/features/events/retro-place.js               (line 314)
src/features/dashboard/index.js                  (lines 286, 348, 396, 497, 676, 1017)
src/features/reports/index.js                    (lines 192, 272)
src/features/animals/cull-sheet.js               (line 118)
src/data/store.js                                (lines 553, 606, 657 — share one ctx)
src/calcs/feed-forage.js                         (line 582)
```

Pattern: at the top of each calling function (or where memberships/animals are already pulled), add `const animalClasses = getAll('animalClasses');` and add `animalClasses` to the context object passed to `getLiveWindowAvgWeight`.

For `data/store.js`, the `ctx` object is constructed once and shared across three call-sites — only one new key needed.

### 4c) Tests

Extend or create `tests/unit/window-helpers.test.js`:

- Open window, 3 live animals, 3 weight records → average is mean of records (existing behavior, no regression)
- Open window, 3 live animals, 0 weight records, all 3 classes have `defaultWeightKg` → average is mean of class defaults
- Open window, 3 live animals, 1 weight record + 2 with only class defaults → average is mean of (1 record + 2 defaults)
- Open window, 1 live animal with no weight record + no class default → animal dropped from count, returns `gw.avgWeightKg ?? 0` (no NaN, no false zero)
- Open window, 0 live animals → returns `gw.avgWeightKg ?? 0` (existing behavior preserved)

---

## 5) Acceptance criteria for the package

1. `seed-data.js` weaning role flip applied across all 4 species; tests pass
2. `v1-migration.js` §2.14 reads from seed-data by role; `weanTargets` shim removed; tests pass
3. SQL migration file written + executed against Tim's operation in Supabase + verification query result pasted into commit message
4. Edit Class form repopulates with all 11 fields; species + role lock on edit; weight round-trips through imperial display; species select uses canonical values; tests pass
5. `getLiveWindowAvgWeight` accepts `animalClasses` in context; class-default fallback tier present; all 21 call-sites updated; tests pass
6. Full suite green: `npx vitest run`
7. **Grep contracts** — these must each return zero hits (or only the documented allowed file):
   - `grep -rn "weanTargets" src/` — should return zero (shim removed)
   - `grep -rn "openClassEditForm" src/` — should appear only inside `renderManageAnimalClassesSheet` (no top-level definition); the standalone function is gone
   - `grep -rn "weaningAgeDays: 205" src/features/onboarding/seed-data.js` — should appear only on the `calf` row in `beef_cattle`
8. Commit message format: `Animal classes data integrity package — OI-0057 + OI-0127 + OI-0128 + OI-0130\n\nMigration NNN applied and verified [paste verify query result].`
9. Push to `main`. Cowork verifies push landed on origin.
10. Close OI-0057, OI-0127, OI-0128, OI-0130 in OPEN_ITEMS.md (flip `**Status:** open` → `**Status:** closed — YYYY-MM-DD, commit <sha>`) in the **same commit** per the Orphan-flip belt-and-braces rule. OI-0129 stays open as DESIGN REQUIRED — do **not** flip it.

---

## What NOT to do this session

- **Do not build OI-0129** (wire weaning pipeline). The dashboard nudge, ANI-3 wiring, and Reports Weaning tab are explicitly excluded — Tim wants to design that flow first. Leave `renderWeaningNudge` in `src/features/dashboard/index.js:1484–1533` alone for now.
- **Do not alter the species value** on Tim's existing classes (the species column is `beef_cattle` for every row — leave it).
- **Do not touch any other operation's data** — the SQL patch is scoped to Tim's `operation_id`.
- **Do not back-patch other operations' classes** through the v1-migration fix — that change only affects future imports.

---

## CP-55/CP-56 impact summary

**None for the entire package.**

- OI-0127: value corrections in seed-data + migration transform; no schema or column-shape change
- OI-0057: value updates to existing `animal_classes` rows; no schema or column-shape change
- OI-0128: new UI for existing entity columns; no schema or column-shape change
- OI-0130: calc-side fallback consuming existing `animals.class_id` + `animal_classes.default_weight_kg` columns; no schema change

Backup round-trip already covers every column touched. No `BACKUP_MIGRATIONS` rule needed beyond the schema-version bump no-op for the data patch migration.
