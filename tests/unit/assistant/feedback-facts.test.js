import { describe, it, expect } from 'vitest';
import { mapFeedbackFacts, CONTRACT_VERSION } from '../../../src/features/assistant/feedback-facts.js';
const known = value => ({ state: 'known', value, source: 'user' });
const unknown = { state: 'unknown', source: 'host' };
describe('pinned feedback physical mapping', () => {
  it('uses contract 0.1.2, independent of package/tag 0.1.3', () => {
    expect(CONTRACT_VERSION).toBe('0.1.2');
    expect(() => mapFeedbackFacts({ contractVersion: '0.1.3' })).toThrow('Must pin 0.1.2');
  });
  it('stores three independent fact values and preserves source/state without concatenation or JSON', () => {
    const result = mapFeedbackFacts({ contractVersion: CONTRACT_VERSION, impact: { affectedWork: known('work'), workaround: unknown, dataRisk: known('risk') } });
    expect(result.submission).toEqual({ impactAffectedWork: 'work', impactWorkaround: null, impactDataRisk: 'risk' });
    expect(result.fieldStates).toEqual([{ fieldName: 'affectedWork', state: 'known', source: 'user' }, { fieldName: 'workaround', state: 'unknown', source: 'host' }, { fieldName: 'dataRisk', state: 'known', source: 'user' }]);
    expect(mapFeedbackFacts({ impact: {} }).fieldStates).toEqual([]);
  });
  it.each(['unavailable','not_applicable'])('rejects %s for impact', state => {
    expect(() => mapFeedbackFacts({ impact: { affectedWork: { state, source: 'user' } } })).toThrow('impact');
  });
  it('rejects extra impact keys, blank known text and uncertainty with a value', () => {
    for (const impact of [{ extra: known('x') }, { affectedWork: known(' ') }, { affectedWork: { ...unknown, value: 'pretend' } }]) expect(() => mapFeedbackFacts({ impact })).toThrow('impact');
  });
  it('maps a known bug list to ordered nonempty steps only; no per-step states', () => {
    const result = mapFeedbackFacts({ type: 'bug', reproSteps: known(['first', 'second']) });
    expect(result.reproSteps).toEqual([{ position: 0, stepText: 'first' }, { position: 1, stepText: 'second' }]);
    expect(result.fieldStates).toEqual([{ fieldName: 'reproSteps', state: 'known', source: 'user' }]);
  });
  it.each(['unknown','not_reproducible'])('maps whole-list bug %s without fabricated steps', state => {
    expect(mapFeedbackFacts({ type: 'bug', reproSteps: { state, source: 'user' } }).reproSteps).toEqual([]);
  });
  it('requests use only whole-list not_applicable', () => {
    expect(mapFeedbackFacts({ type: 'request', reproSteps: { state: 'not_applicable', source: 'user' } }).reproSteps).toEqual([]);
    expect(() => mapFeedbackFacts({ type: 'request', reproSteps: unknown })).toThrow('reproSteps');
  });
  it('rejects withdrawn per-step partial lists, empty lists and uncertain values', () => {
    for (const fact of [known([{ state: 'unknown', source: 'user' }]), known([]), known(['']), { ...unknown, value: ['x'] }]) expect(() => mapFeedbackFacts({ type: 'bug', reproSteps: fact })).toThrow('reproSteps');
  });
});
