# OI-0158 — Audit page renderer: registry-driven dispatch across all three scopes

**Origin:** OPEN_ITEMS.md OI-0158 — read the full body there for context.

**One-line summary:** OI-0157-B2 shipped 9 new resolvers (NPK-1, NPK-3, REC-1, ANI-AU, ANI-AUD, ANI-ADA at non-event scope; NPK-2, NPK-4, CST-3 at event scope). The 3 event-scoped cards surface in Section 5 correctly. The 6 non-event-scoped cards are computed but their output is discarded by the renderer because `audit.js` still hardcodes DMI-2 / FOR-1 by name. This OI completes the registry-driven dispatch.

## Files

`src/features/dev-mode/audit.js` — three blocks change:
- Lines 510–520 — group-window sub-block (DMI-2 hardcoded)
- Lines 547–642 — `renderPaddockWindowBlocks` body + signature (FOR-1 hardcoded)
- Lines 1014–1028 — `renderEventAudit` dispatch loop (named-result capture)

Plus one new test file (or extension of existing): `tests/unit/dev-mode/audit-render.test.js`.

## Locked design

### 1. Replace named-result capture in `renderEventAudit`

Lines 1014–1023 today:
```js
const eventResolverResults = [];
let dmi2Result = null;
let for1Result = null;
for (const calc of allCalcs) {
  const result = resolveCalcForCalcCard(calc.name, ctx);
  if (!result) continue;
  if (result.scope === 'event') eventResolverResults.push(result);
  if (calc.name === 'DMI-2') dmi2Result = result;
  if (calc.name === 'FOR-1') for1Result = result;
}
```

Replace with two scope-keyed Maps:
```js
const groupWindowResultsByGwId = new Map();   // gwId -> Array<{ name, calcMeta, instance }>
const paddockWindowResultsByPwId = new Map(); // pwId -> Array<{ name, calcMeta, instance }>
const eventResolverResults = [];
for (const calc of allCalcs) {
  const result = resolveCalcForCalcCard(calc.name, ctx);
  if (!result) continue;
  if (result.scope === 'event') {
    eventResolverResults.push(result);
  } else if (result.scope === 'group-window' && result.applicable) {
    for (const inst of result.instances) {
      if (!inst.groupWindowId) continue;
      const list = groupWindowResultsByGwId.get(inst.groupWindowId) || [];
      list.push({ name: result.name, calcMeta: calc, instance: inst });
      groupWindowResultsByGwId.set(inst.groupWindowId, list);
    }
  } else if (result.scope === 'paddock-window' && result.applicable) {
    for (const inst of result.instances) {
      if (!inst.paddockWindowId) continue;
      const list = paddockWindowResultsByPwId.get(inst.paddockWindowId) || [];
      list.push({ name: result.name, calcMeta: calc, instance: inst });
      paddockWindowResultsByPwId.set(inst.paddockWindowId, list);
    }
  }
}
```

Update the call to `renderPaddockWindowBlocks` accordingly (line 1028):
```js
renderPaddockWindowBlocks(wrapper, event, groupWindowResultsByGwId, paddockWindowResultsByPwId);
```

### 2. Update `renderPaddockWindowBlocks` signature (line 523)

Was:
```js
function renderPaddockWindowBlocks(container, event, dmi2Result, for1Result) {
```

Now:
```js
function renderPaddockWindowBlocks(container, event, groupWindowResultsByGwId, paddockWindowResultsByPwId) {
```

Drop the existing `dmi2InstancesByGwId` / `for1InstancesByPwId` Map construction (lines 547–559) — no longer needed; use the Maps the dispatcher already built.

Drop the `for1Calc = getAllCalcs().find(c => c.name === 'FOR-1');` line (560) — `calcMeta` is carried in each Map entry.

### 3. Generic FOR-1 / paddock-window loop (replaces lines 637–642)

Was:
```js
const for1Inst = for1InstancesByPwId.get(pw.id);
if (for1Inst) {
  const card2 = calcCardWrapper('FOR-1', for1Calc?.description || '', `dev-audit-calc-card-FOR-1-${pw.id}`);
  card2.appendChild(renderCalcInstance(for1Inst));
  block.appendChild(card2);
}
```

Now (generic loop, FOR-1 surfaces inside it like every other paddock-window calc):
```js
const pwResults = paddockWindowResultsByPwId.get(pw.id) || [];
pwResults.sort((a, b) => a.name.localeCompare(b.name));
for (const { name, calcMeta, instance } of pwResults) {
  const card = calcCardWrapper(name, calcMeta?.description || '', `dev-audit-calc-card-${name}-${pw.id}`);
  card.appendChild(renderCalcInstance(instance));
  block.appendChild(card);
}
```

### 4. Generic DMI-2 / group-window loop (replaces lines 510–517)

Was:
```js
const dmi2Inst = dmi2InstancesByGwId.get(gw.id);
if (dmi2Inst) {
  const calc = getAllCalcs().find(c => c.name === 'DMI-2');
  const card = calcCardWrapper('DMI-2', calc?.description || '', `dev-audit-calc-card-DMI-2-${gw.id}`);
  card.appendChild(renderCalcInstance(dmi2Inst));
  sub.appendChild(card);
}
```

The group-window sub-block is called from inside the per-paddock-window loop, so it needs access to the `groupWindowResultsByGwId` Map. Easiest path: pass it in as an argument to `renderGroupWindowSubBlock` (whatever the function is named — grep `renderGroupWindow` to confirm). Then:
```js
const gwResults = groupWindowResultsByGwId.get(gw.id) || [];
gwResults.sort((a, b) => a.name.localeCompare(b.name));
for (const { name, calcMeta, instance } of gwResults) {
  const card = calcCardWrapper(name, calcMeta?.description || '', `dev-audit-calc-card-${name}-${gw.id}`);
  card.appendChild(renderCalcInstance(instance));
  sub.appendChild(card);
}
```

If the group-window sub-block helper takes `dmi2InstancesByGwId` today (worth checking — grep `dmi2Instances` in audit.js), refactor that argument too.

## Acceptance

- [ ] Audit page on a healthy event with a populated cow-calf herd renders all 9 OI-0157-B2 cards:
  - NPK-2 / NPK-4 / CST-3 in Section 5 (event-level rollup).
  - NPK-1 / ANI-AU / ANI-AUD inside each open group-window sub-block (one card per window per calc).
  - NPK-3 / ANI-ADA inside each open paddock-window block.
  - REC-1 inside each closed paddock-window block.
- [ ] Card order within each window block is alphabetical by calc name (deterministic across renders).
- [ ] DMI-2 still renders correctly inside group-window sub-blocks (now via the generic loop, not the hardcoded path).
- [ ] FOR-1 still renders correctly inside paddock-window blocks (now via the generic loop).
- [ ] Hybrid unit-mode renders metric + parenthetical imperial for every new card.
- [ ] Existing `tests/unit/dev-mode/audit-*.test.js` suite still passes (rename / update any tests that referenced the dropped `dmi2InstancesByGwId` / `for1InstancesByPwId` internals).
- [ ] New integration test in `tests/unit/dev-mode/audit-render.test.js` (or wherever rendering is tested):
  - Seed an event with one open paddock window + one open group window in the test store.
  - Register a stub calc + resolver returning `{ scope: 'group-window', applicable: true, instances: [{ groupWindowId, label, inputs: [], output: 42 }] }`.
  - Call `renderEventAudit(container)`.
  - Assert a calc card with the stub's name renders inside the matching group-window sub-block (`querySelector` on `[data-testid="dev-audit-calc-card-<NAME>-<gwId>"]`).
  - Repeat for paddock-window scope with a stub resolver and assertion against the matching paddock-window block.
  - This integration test is the gap that allowed OI-0157-B2 to ship as half a feature — closing it is part of the OI-0158 acceptance.

## Grep contracts (post-fix)

```bash
grep -nE "if \(calc\.name === 'DMI-2'\)|if \(calc\.name === 'FOR-1'\)" src/features/dev-mode/audit.js
```
Must return 0 matches.

```bash
grep -nE "renderPaddockWindowBlocks\(.+dmi2Result|renderPaddockWindowBlocks\(.+for1Result" src/features/dev-mode/audit.js
```
Must return 0 matches.

```bash
grep -nE "dmi2InstancesByGwId|for1InstancesByPwId" src/features/dev-mode/audit.js
```
Must return 0 matches.

## Implementation order

One commit. ~50 LOC change in audit.js + 1 new integration test file. Commit message: `fix(dev-mode/audit): OI-0158 — registry-driven dispatch across all three scopes; surfaces NPK-1/3, REC-1, ANI-AU/AUD/ADA in window blocks`.

After the commit lands, flip OI-0158 to closed in `OPEN_ITEMS.md` per the orphan-flip rule (commit-msg hook will enforce). Note in the close-out summary which 6 new cards now surface where, so Tim can field-verify quickly.

## CP-55/CP-56 spec impact

NONE.

## Schema impact

NONE.
