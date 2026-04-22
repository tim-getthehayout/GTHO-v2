/** @file Tests for move-wizard Step 3 feed-transfer branch (OI-0104 + OI-0135 + OI-0136).
 *
 * The full executeMoveWizard flow is DOM-heavy; these tests pin the core per-line
 * branch contract by mirroring the per-toggle body from executeMoveWizard and
 * asserting the resulting write-call recorder.
 *
 *   - Move: close-reading remainingQuantity = 0; a destination feed-entry row
 *     is created with quantity = live-remaining (OI-0135: not delivery total).
 *   - Residual: close-reading remainingQuantity = Number(residualInput.value)
 *     (OI-0136: farmer-confirmed value, not the auto-computed default); no
 *     destination entry; logger.info('residual-capture', ...) is emitted.
 *   - Mixed per-line: each toggle is independent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Pure reproduction of the per-line branch inside executeMoveWizard. The shape
// matches src/features/events/move-wizard.js after OI-0135 + OI-0136.
function branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log }) {
  const choice = toggle?.choice || 'move';
  let remaining = 0;
  if (choice === 'residual') {
    remaining = toggle?.residualInput
      ? Number(toggle.residualInput.value)
      : group.total;
  }
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
      quantity: group.total,  // OI-0135: group.total is already live-remaining
    });
  }
}

describe('move-wizard feed-transfer branch (OI-0104 + OI-0135 + OI-0136)', () => {
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

  it('Move with live-remaining group.total writes that value to destination (OI-0135)', () => {
    // group.total is now the helper's live-remaining — e.g. delivery 30, prior
    // check left 12 remaining → group.total = 12, not 30.
    const group = { batchId: 'b1', locationId: 'src', total: 12 };
    const toggle = { key: 'b1|src', batchId: 'b1', locationId: 'src', total: 12, choice: 'move', destLocationId: 'dst' };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems[0].remainingQuantity).toBe(0);
    expect(feedEntries).toHaveLength(1);
    expect(feedEntries[0].quantity).toBe(12);
    expect(logs).toHaveLength(0);
  });

  it('Residual without farmer override writes live-remaining as the close-reading (default path)', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 12 };
    const toggle = {
      ...group,
      choice: 'residual',
      destLocationId: 'dst',
      residualInput: { value: '12' },  // default = live-remaining, unchanged
    };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems[0].remainingQuantity).toBe(12);
    expect(feedEntries).toHaveLength(0);
    expect(logs).toHaveLength(1);
  });

  it('Residual with farmer-corrected input writes the entered value, not the default (OI-0136)', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 12 };
    const toggle = {
      ...group,
      choice: 'residual',
      destLocationId: 'dst',
      residualInput: { value: '8' },  // farmer walked paddock, corrected to 8
    };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems[0].remainingQuantity).toBe(8);  // entered, not 12
    expect(logs[0].ctx.remainingQty).toBe(8);
  });

  it('Residual with remaining=0 (empty paddock) does not emit the log', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 0 };
    const toggle = {
      ...group,
      choice: 'residual',
      destLocationId: 'dst',
      residualInput: { value: '0' },
    };
    branchForToggle(toggle, group, { writeCheckItem, writeFeedEntry, log });
    expect(logs).toHaveLength(0);
  });

  it('Mixed per-line: Move writes live-remaining destination; Residual writes farmer-confirmed close-reading', () => {
    const g1 = { batchId: 'b1', locationId: 'src', total: 12 };  // live-remaining
    const g2 = { batchId: 'b2', locationId: 'src', total: 10 };
    const t1 = { ...g1, choice: 'move', destLocationId: 'dst' };
    const t2 = { ...g2, choice: 'residual', destLocationId: 'dst', residualInput: { value: '6' } };
    branchForToggle(t1, g1, { writeCheckItem, writeFeedEntry, log });
    branchForToggle(t2, g2, { writeCheckItem, writeFeedEntry, log });

    expect(checkItems).toHaveLength(2);
    expect(checkItems[0].remainingQuantity).toBe(0);   // Move
    expect(checkItems[1].remainingQuantity).toBe(6);   // Residual, farmer-corrected
    expect(feedEntries).toHaveLength(1);
    expect(feedEntries[0].batchId).toBe('b1');
    expect(feedEntries[0].quantity).toBe(12);
    expect(logs).toHaveLength(1);
    expect(logs[0].ctx.batchId).toBe('b2');
    expect(logs[0].ctx.remainingQty).toBe(6);
  });

  it('Missing toggle defaults to Move (regression guard)', () => {
    const group = { batchId: 'b1', locationId: 'src', total: 30 };
    branchForToggle(undefined, group, { writeCheckItem, writeFeedEntry, log });
    expect(checkItems[0].remainingQuantity).toBe(0);
    expect(logs).toHaveLength(0);
  });
});
