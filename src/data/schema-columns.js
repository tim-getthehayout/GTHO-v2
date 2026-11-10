import { t } from '../i18n/i18n.js';
import { RELEASED_SCHEMA_VERSION } from './schema-release.js';

export function nullableText(value) {
  return typeof value === 'string' ? value.trim() || null : value ?? null;
}

/** Legacy nulls omit unknown columns; non-null writes fail visibly, never discard. */
export function releasedColumns(version, columns) {
  if (version <= RELEASED_SCHEMA_VERSION) return columns;
  if (Object.values(columns).some(value => value != null)) {
    throw new Error(t('manualEntry.unreleasedSchema', { version }));
  }
  return {};
}
