/**
 * #489 iOS Safari restore abort — Settings runs the safety backup as its own
 * step; the fenced restore (importOperationBackup → assistant_restore_prepare)
 * starts only on the second click, after the safety backup was saved.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ order: [], saveSafetyBackup: vi.fn(), importOperationBackup: vi.fn(), canExport: vi.fn() }));
vi.mock('../../../src/data/backup-import.js', async original => ({ ...await original(), saveSafetyBackup: mocks.saveSafetyBackup, importOperationBackup: mocks.importOperationBackup }));
vi.mock('../../../src/data/backup-export.js', async original => ({ ...await original(), canExport: mocks.canExport }));
import { setLocale, t } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { CURRENT_SCHEMA_VERSION } from '../../../src/data/backup-import.js';
import { logger } from '../../../src/utils/logger.js';
import { __backupUiInternals } from '../../../src/features/settings/index.js';

const OP = { id: '00000000-0000-4000-8000-000000000489', name: 'Down East' };
const FILE = 'gtho-v2-auto-backup-before-restore__down-east.json';
const backup = { format: 'gtho-v2-backup', format_version: 1, schema_version: CURRENT_SCHEMA_VERSION, operation_id: OP.id, tables: { operations: [{ id: OP.id }] } };
const $ = id => document.querySelector(`[data-testid="${id}"]`);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
let mount;

beforeAll(() => setLocale('en', enLocale));
beforeEach(() => {
  document.body.innerHTML = '';
  mount = document.createElement('div'); mount.id = 'export-sheet-mount'; document.body.appendChild(mount);
  mocks.order.length = 0;
  mocks.canExport.mockReset().mockReturnValue({ ok: true });
  mocks.saveSafetyBackup.mockReset().mockImplementation(async () => { mocks.order.push('safety-backup'); return FILE; });
  mocks.importOperationBackup.mockReset().mockImplementation(async () => { mocks.order.push('fenced-restore'); return { success: true }; });
});
afterEach(() => vi.restoreAllMocks());

describe('#489 two-step safety backup then fenced restore', () => {
  it('Yes, Replace is disabled and does nothing until the safety backup is saved', async () => {
    __backupUiInternals.showSecondConfirm(mount, backup, OP);
    expect($('import-second-confirm')).toBeTruthy();
    expect($('import-safety-backup-btn').textContent).toBe(t('settings.importSafetyBackupBtn'));
    expect($('import-safety-backup-status').textContent).toBe(t('settings.importSafetyBackupStep'));
    expect($('import-final-confirm-btn').disabled).toBe(true);
    $('import-final-confirm-btn').click();
    await flush();
    expect(mocks.importOperationBackup).not.toHaveBeenCalled();
  });

  it('step 1 downloads only; the second click starts the fenced restore with the saved file name', async () => {
    __backupUiInternals.showSecondConfirm(mount, backup, OP);
    $('import-safety-backup-btn').click();
    await flush();
    expect(mocks.saveSafetyBackup).toHaveBeenCalledWith(OP.id);
    expect(mocks.importOperationBackup).not.toHaveBeenCalled(); // no prepare yet
    expect($('import-safety-backup-status').textContent).toBe(t('settings.importSafetyBackupSaved').replace('{filename}', FILE));
    expect($('import-safety-backup-btn').textContent).toBe(t('settings.importSafetyBackupAgain'));
    expect($('import-final-confirm-btn').disabled).toBe(false);

    $('import-final-confirm-btn').click();
    await flush();
    expect(mocks.order).toEqual(['safety-backup', 'fenced-restore']);
    expect(mocks.importOperationBackup).toHaveBeenCalledTimes(1);
    const [passed, operationId, , options] = mocks.importOperationBackup.mock.calls[0];
    expect(passed).toBe(backup);
    expect(operationId).toBe(OP.id);
    expect(options).toEqual({ safetyBackupFileName: FILE });
    expect($('import-success')).toBeTruthy();
  });

  it('a failed safety backup keeps Yes, Replace disabled, logs, and allows a retry', async () => {
    const spy = vi.spyOn(logger, 'error');
    mocks.saveSafetyBackup.mockRejectedValueOnce(new Error('Failed to fetch events (offset 0): boom'));
    __backupUiInternals.showSecondConfirm(mount, backup, OP);
    $('import-safety-backup-btn').click();
    await flush();
    expect($('import-safety-backup-status').textContent).toBe(`${t('settings.importSafetyBackupFailed')} Failed to fetch events (offset 0): boom`);
    expect(spy).toHaveBeenCalledWith('backup', 'safety backup failed', { error: 'Failed to fetch events (offset 0): boom' });
    expect($('import-final-confirm-btn').disabled).toBe(true);
    expect($('import-safety-backup-btn').disabled).toBe(false);
    $('import-safety-backup-btn').click();
    await flush();
    expect($('import-final-confirm-btn').disabled).toBe(false);
    expect(mocks.importOperationBackup).not.toHaveBeenCalled();
  });

  it('sync pending: no safety backup and no restore', async () => {
    mocks.canExport.mockReturnValue({ ok: false, reason: 'pending' });
    __backupUiInternals.showSecondConfirm(mount, backup, OP);
    $('import-safety-backup-btn').click();
    await flush();
    expect(mocks.saveSafetyBackup).not.toHaveBeenCalled();
    expect($('import-safety-backup-status').textContent).toBe(t('settings.importSafetyBackupSyncPending'));
    expect($('import-final-confirm-btn').disabled).toBe(true);
  });

  it('the preview Replace button leads to the two-step confirm', async () => {
    await __backupUiInternals.handleImportFileSelect({ target: { files: [{ text: async () => JSON.stringify(backup) }], value: 'x' } }, OP);
    $('import-replace-btn').click();
    expect($('import-safety-backup-btn')).toBeTruthy();
    expect($('import-final-confirm-btn').disabled).toBe(true);
    expect(mocks.saveSafetyBackup).not.toHaveBeenCalled();
  });
});
