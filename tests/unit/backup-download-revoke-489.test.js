/** #489: downloadBackup keeps the Blob URL alive past the click tick (iOS Safari download sheet). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBackup, BLOB_URL_REVOKE_DELAY_MS } from '../../src/data/backup-export.js';

describe('#489 downloadBackup deferred revokeObjectURL', () => {
  let create, revoke, click;
  beforeEach(() => {
    vi.useFakeTimers();
    create = vi.fn(() => 'blob:gtho/489');
    revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true });
    click = vi.spyOn(globalThis.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('clicks the link but does not revoke synchronously', () => {
    downloadBackup('{"a":1}', 'gtho-v2-backup__x.json');
    expect(click).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('revokes exactly once when the deferred timer fires', () => {
    expect(BLOB_URL_REVOKE_DELAY_MS).toBe(60_000);
    downloadBackup('{"a":1}', 'gtho-v2-backup__x.json');
    vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:gtho/489');
  });
});
