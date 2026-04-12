/** @file Smoke test — verifies vitest harness runs */
import { describe, it, expect } from 'vitest';

describe('vitest harness', () => {
  it('runs', () => {
    expect(true).toBe(true);
  });
});
