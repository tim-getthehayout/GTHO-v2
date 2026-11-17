/** In-memory Supabase transport double for backup export/restore tests. No SQL, no live DB. */
import { vi } from 'vitest';
export function makeBackupClient(db) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user', email: 'test@example.test' } } }) },
    from(table) {
      let operation = 'select', payload, options, page, selection, zeroProof = false;
      const filters = [];
      const query = {
        select(columns, opts) { operation = 'select'; selection = columns; options = opts; return query; },
        insert(rows) { operation = 'insert'; payload = rows; return query; },
        update(rows) { operation = 'update'; payload = rows; return query; },
        upsert(rows, opts) { operation = 'upsert'; payload = rows; options = opts; return query; },
        delete() { operation = 'delete'; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        range(start, end) { page = [start, end]; return query; },
        limit(n) { zeroProof = n === 0; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            db.calls.push({ table, operation, filters: [...filters], payload: structuredClone(payload) });
            if (db.missingTables.includes(table)) return { data: null, count: null, error: { code: '42P01', message: `relation "${table}" does not exist` } };
            if (zeroProof) { db.proofs.push({ table, columns: selection }); return { data: [], error: null }; }
            const rows = db.rows[table] || [];
            if (operation !== 'select') db.rows[table] = rows;
            const matches = row => filters.every(([key, value]) => row[key] === value);
            if (operation === 'delete') db.rows[table] = rows.filter(row => !matches(row));
            if (operation === 'update') rows.filter(matches).forEach(row => Object.assign(row, structuredClone(payload)));
            if (operation === 'insert' || operation === 'upsert') {
              for (const row of Array.isArray(payload) ? payload : [payload]) {
                const existing = rows.find(old => old.id === row.id);
                if (existing && operation === 'insert') throw new Error('Duplicate insert');
                if (existing) Object.assign(existing, structuredClone(row)); else rows.push(structuredClone(row));
              }
            }
            const selected = (db.rows[table] || []).filter(matches);
            return { data: structuredClone(page ? selected.slice(page[0], page[1] + 1) : selected), count: options?.count ? selected.length : null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: vi.fn(async name => name === 'assistant_discard_empty_start' ? { data: 'discarded', error: null }
      : name === 'unit_restore_id_conflicts' ? { data: false, error: null }
        : { data: [{ outcome: name.endsWith('prepare') ? 'prepared' : name.endsWith('finish') ? 'finished' : 'aborted', fence_token: 'test-fence' }], error: null }),
  };
}

export const HISTORICAL_TABLES = ['historical_feedings', 'historical_animal_basis'];

export function historicalRows(operationId) {
  return {
    historical_feedings: [{
      id: 'aa000000-0000-5000-8000-000000000001', operation_id: operationId, farm_id: null, date: '2025-10-01', quantity: 4,
      unit_snapshot: 'bale', weight_per_unit_kg_snapshot: 293.4743, dm_pct_snapshot: 85, feed_type_id: null, feed_type_label: 'Round bale- Grass',
      species: 'beef_cattle', group_id: null, group_label: null, place_text: null, notes: 'fixture line', source: 'notes', source_key: 'notes:fixture:2:1',
      created_at: '2026-11-17T12:00:00Z', updated_at: '2026-11-17T12:00:00Z',
    }],
    historical_animal_basis: [{
      id: 'aa000000-0000-5000-8000-000000000002', operation_id: operationId, farm_id: null, period_start: '2025-10-01', period_end: '2026-05-31',
      species: 'sheep', group_id: null, group_label: 'Sheep flock', class_id: null, class_label: null, head_count: 80, avg_weight_kg: 49.8952,
      dmi_pct_snapshot: 3, dmi_source: 'class_default', source: 'tim_entry', notes: null, source_key: 'basis:sheep:Sheep flock:2025-10-01',
      created_at: '2026-11-17T12:00:00Z', updated_at: '2026-11-17T12:00:00Z',
    }],
  };
}
