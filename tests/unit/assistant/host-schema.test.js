import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASSISTANT_TABLES, HISTORICAL_FEEDBACK_FACTS, SUBMISSION_EXTENSION_COLUMNS } from '../../../src/features/assistant/schema.js';
import { BACKUP_MIGRATIONS } from '../../../src/data/backup-migrations.js';
import { FK_ORDER, TWO_PASS_TABLES } from '../../../src/data/backup-import.js';
import * as Submission from '../../../src/entities/submission.js';

const root = resolve(import.meta.dirname, '../../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/040_assistant_host_artifacts.sql'), 'utf8');
const design = readFileSync(resolve(root, 'V2_SCHEMA_DESIGN.md'), 'utf8').split('#### 11.2a Shared feedback host normalization')[1].split('### 11.3 todos')[0];
const normalize = value => value.replace(/\s+/g, ' ').trim();
describe('prepared host schema (static checks, not a live migration)', () => {
  for (const table of ASSISTANT_TABLES) {
    it(`${table} preserves every locked column and CHECK, with member RLS`, () => {
      // Match CREATE blocks explicitly so ALTER/FK reordering cannot hide a lost column.
      const block = sql.split(`CREATE TABLE ${table} (`)[1].split('\n);')[0];
      const original = design.split(`CREATE TABLE ${table} (`)[1].split('\n);')[0];
      for (const line of original.split('\n').map(s => s.trim().replace(/,$/, '')).filter(Boolean)) {
        if (line.startsWith('FOREIGN KEY')) expect(normalize(sql)).toContain(normalize(`ALTER TABLE ${table} ADD ${line};`));
        else expect(block.split('\n').map(s => s.trim().replace(/,$/, ''))).toContain(line);
      }
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM anon, authenticated;`);
      for (const action of ['select', 'insert', 'update', 'delete']) {
        expect(sql).toContain(`CREATE POLICY ${table}_${action} ON ${table} FOR ${action.toUpperCase()} TO authenticated`);
      }
    });
  }
  it('has no cascade, artifact JSONB, duplicate index names or unscoped artifact FKs', () => {
    expect(sql).not.toMatch(/ON DELETE CASCADE|jsonb/i);
    const indexes = [...sql.matchAll(/CREATE INDEX (\w+)/g)].map(match => match[1]);
    expect(new Set(indexes).size).toBe(indexes.length);
    for (const index of indexes) expect(index.length).toBeLessThanOrEqual(63);
    for (const match of sql.matchAll(/FOREIGN KEY \(([^)]+)\)\s+REFERENCES (assistant_\w+|voice_entry_attempts|submissions)/g)) {
      expect(match[1].split(',')[0]).toBe('operation_id');
    }
    expect(sql).toContain('accepted_at IS NOT NULL');
    expect(sql).toMatch(/BEGIN;[\s\S]*UPDATE operations SET schema_version = 40[\s\S]*COMMIT;/);
  });
  it('orders every internal FK for restore and handles nullable self-links in two passes', () => {
    for (const match of sql.matchAll(/ALTER TABLE (\w+) ADD FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)/g)) {
      const [, child, columns, parent] = match;
      if (child === parent) expect(TWO_PASS_TABLES[child]).toContain(columns.split(', ')[1]);
      else expect(FK_ORDER.indexOf(parent)).toBeLessThan(FK_ORDER.indexOf(child));
    }
    expect(FK_ORDER.indexOf('assistant_review_confirmations')).toBeLessThan(FK_ORDER.indexOf('submissions'));
  });
});
describe('historical submissions remain unknown, not new confirmed filings', () => {
  it('keeps identity, purpose, urgency, build, note and history; adds nullable facts and explicit unknown states', () => {
    const original = { id: 'submission', operation_id: 'op', type: 'support', priority: 'high', version: 'build', note: '[Regression] edited', thread: [{ note: 'history' }], created_at: 'old-created', updated_at: 'old-updated' };
    const backup = { schema_version: 39, tables: { operations: [{ id: 'op' }], submissions: [structuredClone(original)] } };
    BACKUP_MIGRATIONS[39](backup);
    const row = backup.tables.submissions[0];
    for (const [key, value] of Object.entries(original)) expect(row[key]).toEqual(value);
    for (const column of SUBMISSION_EXTENSION_COLUMNS) expect(row[column]).toBeNull();
    expect(backup.tables.submission_repro_steps).toEqual([]);
    const states = backup.tables.submission_field_states;
    expect(states.map(s => s.field_name).sort()).toEqual([...HISTORICAL_FEEDBACK_FACTS].sort());
    expect(states.every(s => s.state === 'unknown' && s.submission_id === row.id && s.operation_id === 'op')).toBe(true);
    const again = JSON.stringify(backup);
    BACKUP_MIGRATIONS[39](backup);
    expect(JSON.stringify(backup)).toBe(again);
  });
  it('round-trips nullable shared facts independently from host-only fields', () => {
    const record = Submission.create({ operationId: 'op', type: 'feedback', priority: 'urgent', version: 'build', feedbackKind: 'bug', contractVersion: '0.1.3', title: 'title', firstNote: 'original', expected: 'expected', actual: 'actual', severity: 'low', impact: 'impact', capturedAt: 'capture', filedAt: 'filing', conversationId: 'conversation', reviewConfirmationId: 'confirmation' });
    expect(Submission.fromSupabaseShape(Submission.toSupabaseShape(record))).toEqual(record);
    expect(Submission.validate(Submission.create({ operationId: 'op', type: 'support' })).valid).toBe(true);
    expect(Submission.validate({ ...record, feedbackKind: 'support' }).valid).toBe(false);
    expect(Submission.validate({ ...record, severity: 'urgent' }).valid).toBe(false);
    expect(record.type).toBe('feedback');
    expect(record.version).toBe('build');
    expect(record.priority).toBe('urgent');
  });
});
