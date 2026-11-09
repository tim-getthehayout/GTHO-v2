import { describe,it,expect,vi } from 'vitest';
import { preflightAssistantRestore,BROWSER_FK_ORDER } from '../../../src/data/backup-import.js';
import { getBackupTableNames } from '../../../src/data/backup-export.js';
import { BACKUP_MIGRATIONS } from '../../../src/data/backup-migrations.js';
import { SERVER_ASSISTANT_TABLES } from '../../../src/features/assistant/schema.js';
const client = result => ({ rpc: vi.fn(async () => result),from: vi.fn() });
describe('testing-slice browser backup authority boundary', () => {
  it('excludes exactly the eight server-only tables, including the restore fence from export and destructive/insert traversal', () => {
    expect(getBackupTableNames()).toHaveLength(64);expect(BROWSER_FK_ORDER).toHaveLength(64);expect(SERVER_ASSISTANT_TABLES.size).toBe(8);expect(SERVER_ASSISTANT_TABLES.has('assistant_restore_fences')).toBe(true);
    for (const table of SERVER_ASSISTANT_TABLES) { expect(getBackupTableNames()).not.toContain(table);expect(BROWSER_FK_ORDER).not.toContain(table); }
  });
  it('does not synthesize missing authoritative tables or a billing policy on an old backup upgrade', () => {
    const backup = { tables: { operations: [{ id: 'op',timezone: 'America/New_York' }] } };BACKUP_MIGRATIONS[39](backup);
    for (const table of SERVER_ASSISTANT_TABLES) expect(backup.tables).not.toHaveProperty(table);
  });
  it('refuses retained authority and unknown visibility before any destructive action', async () => {
    for (const result of [{ data: [{ outcome: 'retained-authority' }] },{ data: [{ outcome: 'restore-in-progress' }] },{ error: { code: '42501' } },{ data: null },{ data: [{ outcome: 'prepared',fence_token: '' }] }]) expect((await preflightAssistantRestore({ tables: {} },'op',client(result))).success).toBe(false);
  });
  it('refuses client-to-server FK dependencies even if a file contains a fabricated server outcome',async () => {
    const db = client({ data: [{ outcome: 'prepared',fence_token: 'fixture-fence' }] });
    const result = await preflightAssistantRestore({ tables: { offline_voice_notes: [{ confirmed_execution_result_id: 'forged' }],assistant_execution_results: [{ id: 'forged' }] } },'op',db);
    expect(result.success).toBe(false);expect(db.from).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();
  });
  it('allows only positively verified absence and does not apply server arrays from the file',async () => {
    const db = client({ data: [{ outcome: 'prepared',fence_token: 'fixture-fence' }] });
    expect((await preflightAssistantRestore({ tables: { assistant_billing_policies: [{ monthly_requests: 999999 }] } },'op',db)).success).toBe(true);
    expect(db.from).not.toHaveBeenCalled();expect(db.rpc).toHaveBeenCalledExactlyOnceWith('assistant_restore_prepare',{ p_operation: 'op' });
  });
});
