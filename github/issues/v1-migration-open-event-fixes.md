# v1 Migration: Observation Type Inference + Feed Transfer Linking

## Summary

Two bugs in `src/data/v1-migration.js` that affect data correctness for migrated events, particularly open events with feed transfers. Both were identified during pre-migration risk assessment (Tier 3 prep). Neither is blocking, but both should be fixed before testing migration with real v1 data.

## Related OIs

- OI-0048 — Observation type inference defaults all to 'open'
- OI-0049 — Feed transfer source linking dropped

---

## Fix 1: Observation Type Inference (OI-0048)

### Problem

Line 945 of `v1-migration.js`:
```js
type: obs.type || 'open',
```

V1 observations don't have a `type` field. They encode open/close semantics in the `source` string: `event_open`, `event_close`, `survey`. The migration already maps `source` correctly (lines 921–928), but `type` always defaults to `'open'` — even for close observations.

### Fix

Replace line 945:
```js
// Before:
type: obs.type || 'open',

// After:
type: source === 'event_close' ? 'close' : 'open',
```

Note: `source` is already computed on lines 921–928 and available in scope. The variable holds the cleaned v2 source value (`'event'` or `'survey'`), but we need the RAW v1 source to infer type. So use the raw value instead:

```js
const rawSource = obs.source || '';
// ...
type: rawSource.includes('close') ? 'close' : 'open',
```

### Acceptance Criteria

- [ ] Migrated observations with v1 source `event_close` get `type: 'close'`
- [ ] Migrated observations with v1 source `event_open` get `type: 'open'`
- [ ] Migrated observations with v1 source `survey` get `type: 'open'` (surveys are point-in-time, defaulting to open is correct)
- [ ] Existing observation unit tests updated to verify type inference
- [ ] Round-trip test: observations with type='close' survive export/import

### Test Plan

- [ ] Add unit test: migrate a v1 observation with `source: 'event_close'` → verify `type === 'close'`
- [ ] Add unit test: migrate a v1 observation with `source: 'event_open'` → verify `type === 'open'`
- [ ] Add unit test: migrate a v1 observation with `source: 'survey'` → verify `type === 'open'`
- [ ] Run existing migration test suite — no regressions

---

## Fix 2: Feed Transfer Source Linking (OI-0049)

### Problem

Lines 621–636 of `v1-migration.js` process feed entries but drop transfer linking:
```js
quantity: Math.abs(qty),
source_event_id: null, // transfer linking not fully reconstructible from v1
```

V1 feed transfers work like this (per v1 audit §FEE-01):
- Transfer creates TWO feed entries with matching `transferPairId`
- Source event gets a NEGATIVE qty entry (`kind: 'transfer'`)
- Destination event gets a POSITIVE qty entry (`kind: 'transfer'`)
- `transferPairId` links the pair

V2_MIGRATION_PLAN.md §2.5 specifies:
> "If negative, create entry on destination event with source_event_id. Find paired entry, link to its event_id."

The migration currently takes `Math.abs()` on both entries and sets `source_event_id: null`, losing the bidirectional link.

### Fix

**Phase 1 — Build transfer pair index (before the per-event loop):**

Scan all events' feed entries and index transfer pairs:
```js
// Build transferPairId → { sourceEventId, destEventId } map
const transferPairIndex = new Map();
for (const ev of v1Events) {
  const feedEntries = ev.feedEntries || ev.feed_entries || [];
  for (const fe of feedEntries) {
    if (fe.kind === 'transfer' && fe.transferPairId) {
      const qty = fe.qty ?? fe.quantity ?? 0;
      const entry = transferPairIndex.get(fe.transferPairId) || {};
      if (qty < 0) {
        entry.sourceEventV1Id = ev.id;
      } else {
        entry.destEventV1Id = ev.id;
      }
      transferPairIndex.set(fe.transferPairId, entry);
    }
  }
}
```

**Phase 2 — During feed entry migration, resolve the link:**

```js
// Inside the per-feed-entry loop (around line 621):
let sourceEventId = null;
if (fe.kind === 'transfer' && fe.transferPairId) {
  const pair = transferPairIndex.get(fe.transferPairId);
  if (pair && qty < 0 && pair.destEventV1Id) {
    // This is the source-side entry — link to destination event
    sourceEventId = ids.events.remap(pair.destEventV1Id);
  } else if (pair && qty >= 0 && pair.sourceEventV1Id) {
    // This is the destination-side entry — link back to source event
    sourceEventId = ids.events.remap(pair.sourceEventV1Id);
  }
}

v2FeedEntries.push({
  // ... existing fields ...
  quantity: Math.abs(qty),
  source_event_id: sourceEventId,
  // ...
});
```

**Phase 3 — Audit logging:**

Add transfer pair stats to the migration audit:
```js
audit.transferPairsFound = transferPairIndex.size;
audit.transferPairsLinked = /* count of pairs where both source and dest resolved */;
audit.transferPairsOrphaned = /* count where one side is missing */;
```

### Acceptance Criteria

- [ ] Feed entries with `kind: 'transfer'` and matching `transferPairId` get `source_event_id` set to the paired entry's event UUID
- [ ] Negative qty entries link to destination event; positive qty entries link to source event
- [ ] Orphaned transfers (one side missing) get `source_event_id: null` and an audit warning
- [ ] `quantity` remains `Math.abs()` for all entries (positive in v2)
- [ ] Migration audit includes `transferPairsFound`, `transferPairsLinked`, `transferPairsOrphaned` counts
- [ ] Non-transfer feed entries are unaffected (`source_event_id` stays null)

### Test Plan

- [ ] Unit test: two v1 events with matching `transferPairId` entries (one negative, one positive) → verify both get correct `source_event_id`
- [ ] Unit test: orphaned transfer (one side missing) → verify `source_event_id: null` and audit warning logged
- [ ] Unit test: non-transfer feed entry → verify `source_event_id: null` (unchanged behavior)
- [ ] Unit test: transfer pair where one event doesn't migrate (filtered out) → verify graceful fallback
- [ ] Run existing migration test suite — no regressions
- [ ] Run with v1 fixture data that includes transfers (if fixture has them; if not, add a transfer pair to the fixture)

---

## Notes

- Both fixes are in `src/data/v1-migration.js` only — no entity or schema changes needed
- No CP-55/CP-56 impact — these fixes don't change the v2 data shape, only populate existing fields more accurately
- The transfer pair index must be built BEFORE the main event loop since pairs can span different events
- If v1 data has `transferPairId` values that don't match (data corruption), the orphan handling ensures graceful degradation
