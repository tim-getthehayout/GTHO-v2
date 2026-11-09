/** Schema-only entity helpers. No runtime/interview behavior or persistence is implemented here. */
export function defineAssistantEntity(FIELDS, check = () => []) {
  const clone = value => value != null && typeof value === 'object' ? globalThis.structuredClone(value) : value;
  function create(data = {}) {
    for (const key of Object.keys(data)) if (!FIELDS[key]) throw new Error(`Unknown artifact field: ${key}`);
    return Object.fromEntries(Object.keys(FIELDS).map(key => [key, clone(data[key] ?? (key === 'id' ? crypto.randomUUID() : ['createdAt', 'updatedAt'].includes(key) ? new Date().toISOString() : null))]));
  }
  function validate(record) {
    const errors = [];
    for (const key of Object.keys(record)) if (!FIELDS[key]) errors.push(`Unknown artifact field: ${key}`);
    for (const [key, field] of Object.entries(FIELDS)) {
      const value = record[key];
      if (value == null) { if (field.required) errors.push(`${key} is required`); continue; }
      if (field.type === 'uuid' && (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) errors.push(`${key} must be a UUID`);
      if (['text', 'date', 'timestamptz'].includes(field.type) && (typeof value !== 'string' || !value.trim())) errors.push(`${key} must be nonempty text`);
      if (['numeric','integer'].includes(field.type) && (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value)))) errors.push(`${key} must be numeric`);
      if (field.type === 'boolean' && typeof value !== 'boolean') errors.push(`${key} must be boolean`);
      if (field.type === 'text[]' && (!Array.isArray(value) || !value.every(v => typeof v === 'string'))) errors.push(`${key} must be a text array`);
      if (field.enum && !field.enum.includes(value)) errors.push(`${key} is invalid`);
      if (field.minimum != null && value < field.minimum) errors.push(`${key} is below its minimum`);
    }
    errors.push(...check(record));
    return { valid: errors.length === 0, errors };
  }
  const toSupabaseShape = record => Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [field.sbColumn, clone(record[key] ?? null)]));
  const fromSupabaseShape = row => Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, ['integer','numeric'].includes(field.type) && row[field.sbColumn] != null ? Number(row[field.sbColumn]) : clone(row[field.sbColumn] ?? null)]));
  return { create, validate, toSupabaseShape, fromSupabaseShape };
}
