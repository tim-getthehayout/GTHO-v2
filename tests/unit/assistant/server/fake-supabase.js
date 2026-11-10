/** Minimal in-memory stand-in for the service-role supabase-js client. */
export function fakeSupabase({ tables = {}, users = {}, rpc = async () => ({ data: null, error: null }), storage } = {}) {
  const calls = { rpc: [], updates: [], selects: [], deletes: [] };
  function query(table) {
    const filters = [];
    let op = 'select', patch, order, limit, range;
    const rows = () => {
      let result = (tables[table] ||= []).filter(row => filters.every(f => f(row)));
      if (order) result = [...result].sort((a, b) => (a[order.column] < b[order.column] ? -1 : 1) * (order.ascending ? 1 : -1));
      if (range) result = result.slice(range[0], range[1] + 1);
      if (limit != null) result = result.slice(0, limit);
      return result;
    };
    const run = () => {
      if (op === 'update') {
        const hit = rows();
        for (const row of hit) Object.assign(row, patch);
        calls.updates.push({ table, patch });
        return { data: hit, error: null };
      }
      if (op === 'delete') {
        const list = (tables[table] ||= []);
        const hit = rows();
        const keep = new Set(hit);
        tables[table] = list.filter(row => !keep.has(row));
        calls.deletes = calls.deletes || [];
        calls.deletes.push({ table, count: hit.length });
        return { data: hit, error: null };
      }
      if (op === 'insert') { (tables[table] ||= []).push({ ...patch }); return { data: null, error: null }; }
      calls.selects.push(table);
      return { data: rows().map(row => ({ ...row })), error: null };
    };
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push(row => row[column] === value); return builder; },
      not(column, operator, value) { filters.push(row => operator === 'is' && value === null ? row[column] != null : true); return builder; },
      order(column, { ascending = true } = {}) { order = { column, ascending }; return builder; },
      limit(value) { limit = value; return builder; },
      range(from, to) { range = [from, to]; return builder; },
      update(value) { op = 'update'; patch = value; return builder; },
      delete() { op = 'delete'; return builder; },
      insert(value) { op = 'insert'; patch = value; return Promise.resolve(run()); },
      upsert(value, { onConflict = 'id' } = {}) {
        const keys = onConflict.split(',');
        const list = (tables[table] ||= []);
        const index = list.findIndex(row => keys.every(key => row[key] === value[key]));
        if (index >= 0) list[index] = { ...list[index], ...value }; else list.push({ ...value });
        return Promise.resolve({ data: null, error: null });
      },
      async maybeSingle() { const { data } = run(); return { data: data[0] ?? null, error: null }; },
      async single() { const { data } = run(); return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116' } }; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  }
  return {
    calls, tables,
    from: query,
    async rpc(name, args) { calls.rpc.push({ name, args }); return rpc(name, args); },
    auth: { async getUser(token) { const id = users[token]; return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }; } },
    storage: storage ?? { from: () => ({ createSignedUploadUrl: async path => ({ data: { token: 'signed-token', path }, error: null }) }) },
  };
}
export const OP = '00000000-0000-4000-8000-000000000001';
export const OTHER_OP = '00000000-0000-4000-8000-000000000002';
export const USER = '00000000-0000-4000-8000-000000000010';
export const BILLING_USER = '00000000-0000-4000-8000-000000000011';
export const env = (overrides = {}) => ({
  XAI_API_KEY: 'test-key-not-real', GTHO_XAI_TEXT_MODEL: 'grok-4.20-0309-non-reasoning', GTHO_XAI_VOICE_MODEL: 'grok-voice-3.0',
  GTHO_ASSISTANT_ENABLED: 'true', GTHO_ASSISTANT_OPERATIONS: OP, GTHO_ASSISTANT_EARLY_TESTING: 'true',
  GTHO_ASSISTANT_ORIGINS: 'https://getthehayout.com', GTHO_BILLING_CONTROL_USERS: BILLING_USER,
  SUPABASE_URL: 'https://project.invalid', SUPABASE_DB_URL: 'postgres://db.invalid/postgres', SUPABASE_SERVICE_ROLE_KEY: 'service-not-real',
  ...overrides,
});
