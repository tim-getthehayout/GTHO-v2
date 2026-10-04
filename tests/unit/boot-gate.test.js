/** @file OI-0191 — empty local cache must not start the new-operation wizard. */
import { describe, it, expect } from 'vitest';
import { decideBootGate } from '../../src/features/auth/boot-gate.js';

describe('decideBootGate', () => {
  it('paints when this browser already has an operation', () => {
    expect(decideBootGate({ localOperationCount: 1, membershipStatus: 'none' })).toBe('app');
  });

  it('starts the wizard only when membership lookup succeeded and found none', () => {
    expect(decideBootGate({ localOperationCount: 0, membershipStatus: 'none' })).toBe('wizard');
  });

  it('does not start the wizard for an existing member whose operation has not hydrated', () => {
    expect(decideBootGate({ localOperationCount: 0, membershipStatus: 'member' })).toBe('blocked');
  });

  it('does not start the wizard when the membership lookup failed', () => {
    expect(decideBootGate({ localOperationCount: 0, membershipStatus: 'error' })).toBe('blocked');
    expect(decideBootGate({ localOperationCount: 0, membershipStatus: null })).toBe('blocked');
  });
});
