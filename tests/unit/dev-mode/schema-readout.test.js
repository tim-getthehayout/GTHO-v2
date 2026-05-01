/** @file OI-0138 phase 7 — diagnoseSchemaState pure-function drift detection.
 *
 * Convention used by the readout:
 *   live === backupMax + 1 === fileMax  →  green ("All in sync")
 * Anything else surfaces a red banner with a specific diagnostic.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseSchemaState } from '../../../src/features/dev-mode/schema.js';

describe('diagnoseSchemaState (OI-0138)', () => {
  it('returns in-sync when live = backupMax + 1 = fileMax', () => {
    const r = diagnoseSchemaState({ live: 33, backupMax: 32, fileMax: 33 });
    expect(r.status).toBe('in-sync');
    expect(r.message).toContain('v33');
  });

  it('flags drift when live < fileMax (migration on disk but not run)', () => {
    const r = diagnoseSchemaState({ live: 32, backupMax: 32, fileMax: 33 });
    expect(r.status).toBe('drift');
    expect(r.message).toContain('migration file 33 exists');
  });

  it('flags drift when live > backupMax + 1 (missing BACKUP_MIGRATIONS rule)', () => {
    const r = diagnoseSchemaState({ live: 34, backupMax: 32, fileMax: 34 });
    expect(r.status).toBe('drift');
    expect(r.message).toContain('Code Quality Check #6');
  });

  it('flags drift when backupMax >= fileMax (orphaned rule)', () => {
    const r = diagnoseSchemaState({ live: 33, backupMax: 33, fileMax: 32 });
    expect(r.status).toBe('drift');
    expect(r.message).toContain('orphaned rule');
  });

  it('flags drift when any value is null', () => {
    expect(diagnoseSchemaState({ live: null, backupMax: 32, fileMax: 33 }).status).toBe('drift');
    expect(diagnoseSchemaState({ live: 33, backupMax: null, fileMax: 33 }).status).toBe('drift');
    expect(diagnoseSchemaState({ live: 33, backupMax: 32, fileMax: null }).status).toBe('drift');
  });
});
