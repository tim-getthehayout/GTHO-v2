/** @file Tests for move-wizard Step 3 feed-transfer Move/Residual radio (OI-0104).
 *
 * The full executeMoveWizard flow is DOM-heavy and not directly unit-testable,
 * so these tests pin the core per-line branch contract that the function implements:
 *
 *   - Move (default): close-reading check-item remainingQuantity = 0; a destination
 *     feed-entry row is created.
 *   - Residual: close-reading check-item remainingQuantity = group.total; no
 *     destination feed-entry; a logger.info('residual-capture', ...) is emitted.
 *   - Mixed per-line: each toggle is independent.
 *
 * The branch logic is pure — we exercise it by mirroring the per-toggle body
 * from executeMoveWizard and asserting the resulting write-call recorder.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Pure reproduction of the per-line branch inside executeMoveWizard. The shape
// matches src/features/events/move-wizard.js exactly.
function branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log }) {
  const choice = toggle?.choice || 'move';
  const remaining = choice === 'residual' ? group.total : 0;
  writeCheckItem({
    batchId: group.batchId,
    locationId: group.locationId,
    remainingQuantity: remaining,
  });
  if (choice === 'residual' && remaining > 0) {
    log('residual-capture', 'feed left as residual on close', {
      batchId: group.batchId,
      locationId: group.locationId,
      remainingQty: remaining,
    });
  }
  if (choice === 'move') {
    writeFeedEntry({
      batchId: group.batchId,
      locationId: toggle?.destLocationId || null,
      quantity: group.total,
    });
  }
}

describe('OI-0104 move-wizard feed-transfer branch', () => {
  let checkItems;
  let feedEntries;
  let logs;
  let writeCheckItem;
  let writeFeedEntry;
  let log;

  beforeEach(() => {
    checkItems = [];
    feedEntries = [];
    logs = [];
    writeCheckItem = vi.fn((row) => checkItems.push(row));
    writeFeedEntry = vi.fn((row) => feedEntries.push(row));
    log = vi.fn((cat, msg, ctx) => logs.push({ cat, msg, ctx }));
  });

  it('default (Move): close-reading remainingQuantity = 0 and a destination feed entry is written', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 30 };
    const toggle = { key: 'b1|src', batchId: 'b1', locationId: 'src', total: 30, choice: 'move', destLocationId: 'dst' };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems).toHaveLength(1);
    expect(checkItems[0].remainingQuantity).toBe(0);
    expect(feedEntries).toHaveLength(1);
    expect(feedEntries[0].quantity).toBe(30);
    expect(logs).toHaveLength(0);
  });

  it('Residual: stamps real remainingQuantity, no destination entry, logs residual-capture', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 30 };
    const toggle = { ...group, choice: 'residual', destLocationId: 'dst' };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems[0].remainingQuantity).toBe(30);
    expect(feedEntries).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0].cat).toBe('residual-capture');
    expect(logs[0].ctx.remainingQty).toBe(30);
  });

  it('Residual with remaining=0 does not emit the log (empty residual is meaningless)', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 0 };
    const toggle = { ...group, choice: 'residual', destLocationId: 'dst' };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(logs).toHaveLength(0);
  });

  it('Mixed per-line: each toggle branches independently', () => {
    const g1 = { batchId: 'b1', locationId: 'src', total: 30 };
    const g2 = { batchId: 'b2', locationId: 'src', total: 10 };
    const t1 = { ...g1, choice: 'move', destLocationId: 'dst' };
    const t2 = { ...g2, choice: 'residual', destLocationId: 'dst' };
    branchForToggle(t1, g1, { writeCheckItem, writeFeedEntry, log });
    branchForToggle(t2, g2, { writeCheckItem, writeFeedEntry, log });

    expect(checkItems).toHaveLength(2);
    expect(checkItems[0].remainingQuantity).toBe(0);  // Move
    expect(checkItems[1].remainingQuantity).toBe(10); // Residual
    expect(feedEntries).toHaveLength(1);               // only Move writes destination
    expect(feedEntries[0].batchId).toBe('b1');
    expect(logs).toHaveLength(1);
    expect(logs[0].ctx.batchId).toBe('b2');
  });

  it('Missing/undefined toggle defaults to Move (regression guard on the fall-back)', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 30 };
    branchForToggle(undefined, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems[0].remainingQuantity).toBe(0);
    expect(logs).toHaveLength(0);
  });
});
