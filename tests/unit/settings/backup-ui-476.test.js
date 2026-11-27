/**
 * #476 backup/restore hardening — Settings UI (items 4, 5, 6).
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exportOperationBackup: vi.fn() }));
vi.mock('../../../src/data/backup-export.js', async original => ({ ...await original(), exportOperationBackup: mocks.exportOperationBackup, downloadBackup: vi.fn() }));
import { setLocale, t } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { CURRENT_SCHEMA_VERSION } from '../../../src/data/backup-import.js';
import { logger } from '../../../src/utils/logger.js';
import { __backupUiInternals } from '../../../src/features/settings/index.js';

const OP = { id: '00000000-0000-4000-8000-000000000476', name: 'Home Farm' };
const backupFor = operationId => ({ format: 'gtho-v2-backup', format_version: 1, schema_version: CURRENT_SCHEMA_VERSION, operation_id: operationId, tables: { operations: [{ id: operationId }] } });
const fileEvent = content => ({ target: { files: content == null ? [] : [{ text: async () => content }], value: 'C:\\fakepath\\backup.json' } });
const toast = () => document.querySelector('[data-testid="export-toast"]')?.textContent;
let mount;

beforeAll(() => setLocale('en', enLocale));
beforeEach(() => {
  document.body.innerHTML = '';
  mount = document.createElement('div'); mount.id = 'export-sheet-mount'; document.body.appendChild(mount);
});
afterEach(() => vi.restoreAllMocks());

describe('4 · file input resets on select', () => {
  it('clears the input value so the same file can be chosen again (success, error and empty)', async () => {
    const ok = fileEvent(JSON.stringify(backupFor(OP.id)));
    await __backupUiInternals.handleImportFileSelect(ok, OP);
    expect(ok.target.value).toBe('');
    const bad = fileEvent('not json');
    await __backupUiInternals.handleImportFileSelect(bad, OP);
    expect(bad.target.value).toBe('');
    expect(toast()).toBe(t('settings.importInvalidJson'));
    const none = fileEvent(null);
    await __backupUiInternals.handleImportFileSelect(none, OP);
    expect(none.target.value).toBe('');
  });
});

describe('5 · wrong operation is refused before preview', () => {
  it('another operation\'s backup shows an error toast and no preview or confirm', async () => {
    await __backupUiInternals.handleImportFileSelect(fileEvent(JSON.stringify(backupFor('00000000-0000-4000-8000-0000000000ff'))), OP);
    expect(toast()).toBe(t('settings.importWrongOperation'));
    expect(t('settings.importWrongOperation')).toMatch(/different operation/);
    expect(document.querySelector('[data-testid="import-preview-sheet"]')).toBeNull();
    expect(document.querySelector('[data-testid="import-replace-btn"]')).toBeNull();
  });
  it('the matching operation still opens the preview', async () => {
    await __backupUiInternals.handleImportFileSelect(fileEvent(JSON.stringify(backupFor(OP.id))), OP);
    expect(document.querySelector('[data-testid="import-preview-sheet"]')).toBeTruthy();
    expect(toast()).toBeUndefined();
  });
});

describe('6 · export errors are logged and shown', () => {
  it('logs and surfaces err.message', async () => {
    const spy = vi.spyOn(logger, 'error');
    mocks.exportOperationBackup.mockRejectedValueOnce(new Error('Failed to fetch events (offset 0): boom'));
    await __backupUiInternals.runExport(mount, OP);
    expect(mount.querySelector('[data-testid="export-error"]').textContent).toBe('Failed to fetch events (offset 0): boom');
    expect(spy).toHaveBeenCalledWith('backup', 'export failed', { error: 'Failed to fetch events (offset 0): boom' });
  });
  it('falls back to the generic message when the error has none', async () => {
    vi.spyOn(logger, 'error');
    mocks.exportOperationBackup.mockRejectedValueOnce(new Error(''));
    await __backupUiInternals.runExport(mount, OP);
    expect(mount.querySelector('[data-testid="export-error"]').textContent).toBe(t('settings.exportError'));
  });
});
