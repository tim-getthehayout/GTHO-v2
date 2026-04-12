/** @file SyncAdapter interface contract tests */
import { describe, it, expect } from 'vitest';
import { SyncAdapter } from '../../src/data/sync-adapter.js';

describe('SyncAdapter', () => {
  const adapter = new SyncAdapter();

  it('has push method that throws', async () => {
    await expect(adapter.push('events', {})).rejects.toThrow('not implemented');
  });

  it('has pushBatch method that throws', async () => {
    await expect(adapter.pushBatch('events', [])).rejects.toThrow('not implemented');
  });

  it('has pull method that throws', async () => {
    await expect(adapter.pull('events', '')).rejects.toThrow('not implemented');
  });

  it('has pullAll method that throws', async () => {
    await expect(adapter.pullAll('events')).rejects.toThrow('not implemented');
  });

  it('has delete method that throws', async () => {
    await expect(adapter.delete('events', '123')).rejects.toThrow('not implemented');
  });

  it('has isOnline method that throws', async () => {
    await expect(adapter.isOnline()).rejects.toThrow('not implemented');
  });

  it('has getStatus method that throws', () => {
    expect(() => adapter.getStatus()).toThrow('not implemented');
  });

  it('has onStatusChange method that throws', () => {
    expect(() => adapter.onStatusChange(() => {})).toThrow('not implemented');
  });
});
