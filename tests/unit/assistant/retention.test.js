import { describe, it, expect } from 'vitest';
import { planFinishedAttemptExpiry } from '../../../src/features/assistant/retention.js';
const operationId = 'op';
const now = '2026-11-08T12:00:00-05:00';
const cutoff = new Date(Date.parse(now) - 90 * 24 * 60 * 60 * 1000).toISOString();
const base = { operationId, capturedAt: '2020-01-01T00:00:00Z' };
describe('finished-at retention planning, never audio-byte deletion', () => {
  it('expires exactly at 90 days from finish; ignores capture age, unfinished, discarded, bad dates and foreign rows', () => {
    const data = { voiceEntryAttempts: [
      { ...base, id: 'expired', status: 'finished', finishedAt: cutoff },
      { ...base, id: 'recent', status: 'finished', finishedAt: now },
      { ...base, id: 'discarded', status: 'discarded', finishedAt: cutoff },
      { ...base, id: 'unfinished', status: 'unfinished' },
      { ...base, id: 'invalid', status: 'finished', finishedAt: 'not-a-date' },
      { ...base, id: 'foreign', operationId: 'other', status: 'finished', finishedAt: cutoff },
    ] };
    expect(planFinishedAttemptExpiry(data, { operationId, now }).remove.voiceEntryAttempts).toEqual(['expired']);
  });
  it('only removes attempts and their mappings; detaches retained links and correction dependencies without mutating data', () => {
    const data = {
      voiceEntryAttempts: [{ ...base, id: 'expired', status: 'finished', finishedAt: cutoff }, { ...base, id: 'keep', status: 'unfinished', previousAttemptId: 'expired' }],
      assistantFieldMappings: [{ ...base, id: 'old-map', attemptId: 'expired' }, { ...base, id: 'keep-map', attemptId: 'keep', correctionPredecessorId: 'old-map' }],
      assistantProposals: [{ ...base, id: 'proposal', attemptId: 'expired' }],
      assistantExecutionResults: [{ ...base, id: 'execution', attemptId: 'expired' }],
      assistantTestingAudio: [{ ...base, id: 'audio', attemptId: 'expired' }],
      offlineVoiceNotes: [{ ...base, id: 'note', attemptId: 'expired' }],
      assistantTranscriptTurns: [{ ...base, id: 'transcript' }],
      assistantReviewCards: [{ ...base, id: 'card' }],
      animals: [{ ...base, id: 'farm-record' }],
    };
    const before = JSON.stringify(data);
    const plan = planFinishedAttemptExpiry(data, { operationId, now });
    expect(plan.remove).toEqual({ assistantFieldMappings: ['old-map'], voiceEntryAttempts: ['expired'] });
    expect(plan.detach).toEqual(expect.arrayContaining([
      { entityType: 'assistantTestingAudio', id: 'audio', changes: { attemptId: null } },
      { entityType: 'offlineVoiceNotes', id: 'note', changes: { attemptId: null } },
      { entityType: 'voiceEntryAttempts', id: 'keep', changes: { previousAttemptId: null } },
      { entityType: 'assistantFieldMappings', id: 'keep-map', changes: { correctionPredecessorId: null } },
    ]));
    expect(JSON.stringify(data)).toBe(before);
    expect(Object.keys(plan.remove)).toEqual(['assistantFieldMappings', 'voiceEntryAttempts']);
  });
  it('has no default clock or implicit operation scope', () => {
    expect(() => planFinishedAttemptExpiry({}, { operationId, now: 'bad' })).toThrow();
    expect(() => planFinishedAttemptExpiry({}, { now })).toThrow();
  });
});
