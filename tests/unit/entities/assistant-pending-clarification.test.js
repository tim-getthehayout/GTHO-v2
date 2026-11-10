/** @file pendingClarification accepts only known keys/types and stays within 16 KB. */
import { describe, it, expect } from 'vitest';
import { acceptPendingClarification, PENDING_CLARIFICATION_MAX_BYTES } from '../../../src/entities/assistant-pending-clarification.js';
import { create, validate } from '../../../src/entities/assistant-session-checkpoints.js';

const OP = '00000000-0000-4000-8000-0000000000aa';
const CONV = '00000000-0000-4000-8000-0000000000c1';

function snapshot(pendingClarification) {
  return {
    version: 1,
    scope: { operationId: OP },
    conversationRef: CONV,
    transcript: [],
    intent: 'data-entry',
    phase: 'converse',
    ...(pendingClarification !== undefined ? { pendingClarification } : {}),
  };
}

function record(pendingClarification) {
  return create({
    operationId: OP,
    conversationId: CONV,
    transcriptPosition: 0,
    lifecyclePhase: 'converse',
    trustedSnapshot: snapshot(pendingClarification),
  });
}

describe('pendingClarification schema', () => {
  it('accepts a known clarification and rejects unknown keys or types', () => {
    const ok = { field: 'quantityBasis', ui: 'feeding', names: { paddock: 'e1, e2' }, fields: { date: '2026-11-09', lines: [{ batchId: 'b1', qty: 4 }] }, fill: { locationIds: ['l1'] } };
    expect(acceptPendingClarification(ok)).toEqual(ok);
    expect(acceptPendingClarification({ field: 'paddock', extra: true })).toBeNull();
    expect(acceptPendingClarification({ field: 1 })).toBeNull();
    expect(acceptPendingClarification({ field: 'unknown' })).toBeNull();
    expect(acceptPendingClarification({ field: 'paddock', fields: 'nope' })).toBeNull();
  });

  it('rejects a malformed 200 KB pendingClarification and the checkpoint refuses to keep it', () => {
    const huge = { field: 'paddock', fields: { note: 'x'.repeat(200 * 1024) } };
    expect(JSON.stringify(huge).length).toBeGreaterThan(200 * 1024);
    expect(JSON.stringify(huge).length).toBeGreaterThan(PENDING_CLARIFICATION_MAX_BYTES);
    expect(acceptPendingClarification(huge)).toBeNull();
    const result = validate(record(huge));
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => /pendingClarification/.test(error))).toBe(true);
  });

  it('accepts a valid pendingClarification on the trusted snapshot', () => {
    const result = validate(record({ field: 'paddock', names: { paddock: 'e1' }, fields: { date: '2026-11-09' } }));
    expect(result.valid).toBe(true);
  });
});
