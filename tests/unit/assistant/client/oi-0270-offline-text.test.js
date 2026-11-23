/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { OFFLINE_TEXT } from '../../../../src/features/assistant/client/panel.js';

describe('OI-0270 assistant offline copy', () => {
  it('uses the new plain offline copy', () => {
    expect(OFFLINE_TEXT).toBe('You are offline. The assistant needs a connection — the normal screens still work offline.');
  });

  it('does not mention push-to-talk or voice notes (hidden since OI-0268)', () => {
    expect(OFFLINE_TEXT).not.toMatch(/push[- ]to[- ]talk/i);
    expect(OFFLINE_TEXT).not.toMatch(/voice/i);
    expect(OFFLINE_TEXT).not.toMatch(/\btap\b/i);
  });
});
