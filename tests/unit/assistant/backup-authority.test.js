import { describe,it,expect,vi } from 'vitest';
import { preflightAssistantRestore,BROWSER_FK_ORDER } from '../../../src/data/backup-import.js';
import { getBackupTableNames } from '../../../src/data/backup-export.js';
import { BACKUP_MIGRATIONS } from '../../../src/data/backup-migrations.js';
import { SERVER_ASSISTANT_TABLES } from '../../../src/features/assistant/schema.js';
const client = result => ({ from: vi.fn(() => ({ select: () => ({ eq: async () => result }) })) });
describe('testing-slice browser backup authority boundary', () => {
  it('excludes exactly the seven server tables from export and destructive/insert traversal', () => {
    expect(getBackupTableNames()).toHaveLength(64);expect(BROWSER_FK_ORDER).toHaveLength(64);
    for (const table of SERVER_ASSISTANT_TABLES) { expect(getBackupTableNames()).not.toContain(table);expect(BROWSER_FK_ORDER).not.toContain(table); }
  });
  it('does not synthesize missing authoritative tables or a billing policy on an old backup upgrade', () => {
    const backup = { tables: { operations: [{ id: 'op',timezone: 'America/New_York' }] } };BACKUP_MIGRATIONS[39](backup);
    for (const table of SERVER_ASSISTANT_TABLES) expect(backup.tables).not.toHaveProperty(table);
  });
  it('refuses retained authority and unknown visibility before any destructive action', async () => {
    for (const result of [{ count: 1 },{ error: { code: '42501' } },{ count: null }]) expect((await preflightAssistantRestore({ tables: {} },'op',client(result))).success).toBe(false);
  });
  it('refuses client-to-server FK dependencies even if a file contains a fabricated server outcome',async () => {
    const db = client({ count: 0 });
    const result = await preflightAssistantRestore({ tables: { offline_voice_notes: [{ confirmed_execution_result_id: 'forged' }],assistant_execution_results: [{ id: 'forged' }] } },'op',db);
    expect(result.success).toBe(false);expect(db.from).not.toHaveBeenCalled();
  });
  it('allows only positively verified absence and does not apply server arrays from the file',async () => {
    const db = client({ count: 0 });
    expect((await preflightAssistantRestore({ tables: { assistant_billing_policies: [{ monthly_requests: 999999 }] } },'op',db)).success).toBe(true);
    expect(db.from).toHaveBeenCalledTimes(7);
  });
});
