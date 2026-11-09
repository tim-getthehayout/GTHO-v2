import { describe,it,expect,vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(),remove: vi.fn(),update: vi.fn(),insert: vi.fn() }));
vi.mock('../../../src/data/supabase-client.js',() => ({ supabase: { from: mocks.from } }));
vi.mock('../../../src/data/backup-export.js',() => ({ canExport: () => ({ ok: true }),exportOperationBackup: vi.fn(),downloadBackup: vi.fn() }));
import { importOperationBackup } from '../../../src/data/backup-import.js';
import fixture from '../../fixtures/backup-v14.json';
describe('restore authority check precedes ALL mutations',() => {
  it.each([{ count: 1 },{ error: { code: '42501' } }])('refuses retained or unverifiable authority without detach/delete/insert or backup migration',async result => {
    localStorage.clear();mocks.from.mockReset();
    mocks.from.mockReturnValue({ select: () => ({ eq: async () => result }),delete: mocks.remove,update: mocks.update,insert: mocks.insert });
    const backup = structuredClone(fixture),before = structuredClone(backup);
    const restored = await importOperationBackup(backup,fixture.operation_id,null,{ skipAutoBackup: true });
    expect(restored.success).toBe(false);expect(restored.error).toContain('Restore refused');
    expect(mocks.from).toHaveBeenCalledOnce();expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();expect(backup).toEqual(before);
  });
});
