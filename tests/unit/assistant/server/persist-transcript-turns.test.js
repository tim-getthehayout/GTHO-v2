import { describe, it, expect } from 'vitest';
import { persistTranscriptTurns, recordUnresolvedClarification } from '../../../../src/features/assistant/server/persist-transcript-turns.js';
import { fakeSupabase, OP, USER } from './fake-supabase.js';

const REF = '00000000-0000-4000-8000-0000000000c1';
const scope = { operationId: OP, actorId: USER };

describe('persistTranscriptTurns', () => {
  it('writes user and assistant turns with existing entity columns and skips already-stored indexes', async () => {
    const client = fakeSupabase({ tables: { assistant_transcript_turns: [] } });
    const turns = [
      { id: '00000000-0000-4000-8000-0000000000t1', role: 'user', modality: 'text', text: 'e1' },
      { id: '00000000-0000-4000-8000-0000000000t2', role: 'assistant', modality: 'text', text: 'Which paddock did you feed?' },
    ];
    await persistTranscriptTurns({ client, scope, conversationRef: REF, turns });
    expect(client.tables.assistant_transcript_turns).toHaveLength(2);
    expect(client.tables.assistant_transcript_turns[0]).toMatchObject({
      operation_id: OP, conversation_id: REF, turn_index: 0, speaker: 'user', text: 'e1', input_mode: 'text',
    });
    await persistTranscriptTurns({ client, scope, conversationRef: REF, turns });
    expect(client.tables.assistant_transcript_turns).toHaveLength(2);
  });
});

describe('recordUnresolvedClarification', () => {
  it('appends the host question to the existing snapshot without adding new keys', async () => {
    const snapshot = {
      version: 1, scope, conversationRef: REF, intent: 'data-entry',
      transcript: [{ id: '00000000-0000-4000-8000-0000000000t1', role: 'user', modality: 'text', text: 'e1' }],
      phase: 'converse', preserved: [], saveState: 'draft', logs: [], answered: [], reviewReady: false,
    };
    const writes = [];
    const persistence = {
      async withSession(_scope, ref, work) { return work(structuredClone(snapshot)); },
      async checkpoint(_scope, next) { writes.push(next); },
    };
    const next = await recordUnresolvedClarification({
      persistence, scope, conversationRef: REF, question: 'Which paddock did you feed?',
    });
    expect(next.transcript).toHaveLength(2);
    expect(next.transcript[1]).toMatchObject({ role: 'assistant', text: 'Which paddock did you feed?', modality: 'text' });
    expect(Object.keys(next).sort()).toEqual(Object.keys(snapshot).sort());
    expect(writes).toHaveLength(1);
  });
});
