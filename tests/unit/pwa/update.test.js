/** @file OI-0192 — update decision. No service worker. */
import { describe, it, expect } from 'vitest';
import { decideUpdateAction } from '../../../src/pwa/update.js';

const base = {
  localStamp: 'b2026-10-04.1957-8748872',
  remoteStamp: 'b2026-10-04.1957-8748872',
  hasWaitingWorker: false,
  updateDismissed: false,
  isDev: false,
};

describe('decideUpdateAction', () => {
  it('dev → none even when a worker is waiting and the stamp differs', () => {
    expect(decideUpdateAction({
      ...base,
      isDev: true,
      localStamp: 'dev',
      hasWaitingWorker: true,
      remoteStamp: 'b-other',
    })).toBe('none');
  });

  it('dismissed → none even when a worker is waiting', () => {
    expect(decideUpdateAction({
      ...base,
      updateDismissed: true,
      hasWaitingWorker: true,
    })).toBe('none');
  });

  it('waiting worker → apply-worker', () => {
    expect(decideUpdateAction({
      ...base,
      hasWaitingWorker: true,
      remoteStamp: 'b-other',
    })).toBe('apply-worker');
  });

  it('stamp mismatch and no worker → reload-document', () => {
    expect(decideUpdateAction({
      ...base,
      remoteStamp: 'b2026-10-05.0100-aaaaaaa',
    })).toBe('reload-document');
  });

  it('poll failed and no worker → none', () => {
    expect(decideUpdateAction({
      ...base,
      remoteStamp: null,
    })).toBe('none');
  });

  it('matching stamp and no worker → none', () => {
    expect(decideUpdateAction({ ...base })).toBe('none');
  });

  it('empty remote stamp and no worker → none', () => {
    expect(decideUpdateAction({
      ...base,
      remoteStamp: '',
    })).toBe('none');
  });
});
