/** @file Entity: release_notes — V2_SCHEMA_DESIGN.md §11.5 */

// No operation_id — global/public table. No RLS (public read).

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  version:     { type: 'text',        required: true,  sbColumn: 'version' },
  title:       { type: 'text',        required: true,  sbColumn: 'title' },
  body:        { type: 'text',        required: true,  sbColumn: 'body' },
  publishedAt: { type: 'timestamptz', required: false, sbColumn: 'published_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    version:     data.version     ?? '',
    title:       data.title       ?? '',
    body:        data.body        ?? '',
    publishedAt: data.publishedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.version || typeof record.version !== 'string' || record.version.trim() === '') {
    errors.push('version is required');
  }
  if (!record.title || typeof record.title !== 'string' || record.title.trim() === '') {
    errors.push('title is required');
  }
  if (!record.body || typeof record.body !== 'string' || record.body.trim() === '') {
    errors.push('body is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    version:      record.version,
    title:        record.title,
    body:         record.body,
    published_at: record.publishedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:          row.id,
    version:     row.version,
    title:       row.title,
    body:        row.body,
    publishedAt: row.published_at,
  };
}
