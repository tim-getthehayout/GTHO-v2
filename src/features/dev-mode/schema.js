/** @file OI-0138 Phase 7 — Schema/migration readout.
 *
 * Route: `#/dev/schema`. Three side-by-side numbers — live store
 * `schema_version`, max `BACKUP_MIGRATIONS` rule key, and max migration file
 * number on disk — with a green "all in sync" banner or a red drift banner
 * naming exactly what's out of step. Catches the OI-0053 class of bug
 * (migration on disk but never applied) at a glance.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getOperation } from '../../data/store.js';
import { BACKUP_MIGRATIONS } from '../../data/backup-migrations.js';
import { renderDevModeBadge } from './index.js';

const migrationFiles = import.meta.glob('/supabase/migrations/*.sql', { eager: false });

/**
 * Pure comparison logic — exported for unit testing. Returns:
 *   { status: 'in-sync' | 'drift', live, backupMax, fileMax, message }
 *
 * @param {{ live: number|null, backupMax: number|null, fileMax: number|null }} inputs
 */
export function diagnoseSchemaState({ live, backupMax, fileMax }) {
  if (live == null || backupMax == null || fileMax == null) {
    return {
      status: 'drift',
      live, backupMax, fileMax,
      message: 'One or more values could not be resolved.',
    };
  }
  // Convention: max BACKUP_MIGRATIONS key + 1 should equal the version it bumps
  // up to (e.g. rule [32] bumps schema_version 32 → 33). The "live" version is
  // expected to equal `backupMax + 1` (the version the latest rule bumps to)
  // and also equal `fileMax` (since each migration file ends with `UPDATE
  // operations SET schema_version = N`).
  const expectedFromBackup = backupMax + 1;
  if (live === expectedFromBackup && live === fileMax) {
    return { status: 'in-sync', live, backupMax, fileMax, message: `All in sync at v${live}.` };
  }
  if (live < fileMax) {
    return {
      status: 'drift', live, backupMax, fileMax,
      message: `Schema version is ${live}, but migration file ${fileMax} exists — was the migration run?`,
    };
  }
  if (live > expectedFromBackup) {
    return {
      status: 'drift', live, backupMax, fileMax,
      message: `Migration file ${fileMax} exists, but no BACKUP_MIGRATIONS rule for ${live - 1} — Code Quality Check #6 violated.`,
    };
  }
  if (backupMax >= fileMax) {
    return {
      status: 'drift', live, backupMax, fileMax,
      message: `BACKUP_MIGRATIONS rule for ${backupMax} exists with no matching migration file — orphaned rule.`,
    };
  }
  return {
    status: 'drift', live, backupMax, fileMax,
    message: `Drift detected. live=${live}, backup_max=${backupMax}, file_max=${fileMax}.`,
  };
}

function readMigrationFileMax() {
  let max = null;
  for (const path of Object.keys(migrationFiles)) {
    const m = path.match(/(\d+)_/);
    if (m) {
      const n = Number(m[1]);
      if (max == null || n > max) max = n;
    }
  }
  return max;
}

function readBackupMax() {
  const keys = Object.keys(BACKUP_MIGRATIONS).map(Number).filter(n => !Number.isNaN(n));
  return keys.length ? Math.max(...keys) : null;
}

/**
 * Render the Schema readout.
 * @param {HTMLElement} container
 */
export function renderSchemaReadout(container) {
  clear(container);
  const wrapper = el('div', {
    className: 'dev-schema-readout',
    'data-testid': 'dev-schema-readout',
    style: { padding: 'var(--space-3)' },
  });
  container.appendChild(wrapper);

  wrapper.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-3)' } }, [
    el('h1', { className: 'screen-heading', style: { margin: 0, fontSize: '18px' } }, [t('dev.schemaTitle')]),
    renderDevModeBadge(),
  ]));

  const live = getOperation()?.schemaVersion ?? null;
  const backupMax = readBackupMax();
  const fileMax = readMigrationFileMax();
  const diag = diagnoseSchemaState({ live, backupMax, fileMax });

  // Banner
  wrapper.appendChild(el('div', {
    'data-testid': 'dev-schema-banner',
    className: `card`,
    style: {
      padding: 'var(--space-3)',
      marginBottom: 'var(--space-3)',
      background: diag.status === 'in-sync' ? 'var(--green-l, #d4edda)' : 'var(--red-l, #f8d7da)',
      color: diag.status === 'in-sync' ? 'var(--green-d, #155724)' : 'var(--red-d, #721c24)',
      fontWeight: '600',
    },
  }, [
    el('span', {}, [diag.status === 'in-sync' ? t('dev.schemaInSync') : t('dev.schemaDrift')]),
    el('span', { style: { marginLeft: '8px', fontWeight: '400', fontSize: '12px' } }, [diag.message]),
  ]));

  // Three numbers
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' } });
  const numbers = [
    ['dev-schema-live', t('dev.schemaLive'), live, t('dev.schemaLiveSource')],
    ['dev-schema-backup', t('dev.schemaBackupMax'), backupMax, t('dev.schemaBackupSource')],
    ['dev-schema-file', t('dev.schemaFileMax'), fileMax, t('dev.schemaFileSource')],
  ];
  for (const [testid, label, value, source] of numbers) {
    grid.appendChild(el('div', {
      'data-testid': testid,
      className: 'card',
      style: { padding: 'var(--space-3)', textAlign: 'center' },
    }, [
      el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' } }, [label]),
      el('div', { style: { fontSize: '32px', fontWeight: '700', fontFamily: 'monospace' } }, [String(value ?? '—')]),
      el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginTop: '4px' } }, [source]),
    ]));
  }
  wrapper.appendChild(grid);
}
