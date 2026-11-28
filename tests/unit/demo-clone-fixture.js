/**
 * #450 synthetic source for demo-clone tests. Every id is generated here
 * (uuidv5 of a fixture label); nothing comes from prod.
 */
import { uuidv5 } from '../../scripts/demo-clone.mjs';
import { BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
import { UNIT_STANDARDS } from '../../src/utils/unit-standards.js';
import { migrationForeignKeys } from './demo-clone-checks.js';

const FIXTURE_NS = '00000000-0000-4000-8000-000000000450';
export const fid = label => uuidv5(FIXTURE_NS, label);
export const REAL_OP = fid('real-op');
export const OTHER_OP = fid('other-op');
export const REAL_USER = fid('real-user');
export const REAL_MEMBER = fid('real-member');
export const DEMO_OP = fid('demo-op');
export const DEMO_USER = fid('demo-user');
const TS = '2026-11-01T12:00:00Z';

/** Build a schema-50 source: one row per browser table (two for self-linked ones) plus realistic farm rows. */
export function syntheticSource({ format = 'backup', extraOperation = false } = {}) {
  const fks = migrationForeignKeys();
  const tables = {};
  const row = (table, label, extra = {}) => ({ id: fid(`${table}:${label}`), operation_id: REAL_OP, created_at: TS, updated_at: TS, ...extra });
  const order = BROWSER_FK_ORDER.filter(t => !['milk_pickups', 'calf_milk_feedings', 'stored_feed_plans', 'stored_feed_plan_rows'].includes(t)); // schema 50 source
  for (const table of order) {
    if (table === 'operations') { tables.operations = [{ id: REAL_OP, name: 'Real Farm Op', timezone: 'America/New_York', currency: 'USD', unit_system: 'imperial', archived: false, schema_version: 50, created_at: TS, updated_at: TS }]; continue; }
    const r = row(table, 'a');
    for (const [t, col, parent] of fks) if (t === table && col !== 'operation_id' && tables[parent]?.length) r[col] = tables[parent][0].id;
    tables[table] = [r];
  }
  const T = tables;
  // Units: one custom per table; references to a standard and a custom unit.
  const stdDose = UNIT_STANDARDS.find(u => u.table === 'dose_units').id;
  const stdProduct = UNIT_STANDARDS.find(u => u.table === 'input_product_units').id;
  T.dose_units = [{ id: fid('dose:custom'), operation_id: REAL_OP, name: 'scoop', archived: false, created_at: TS, updated_at: TS }];
  T.input_product_units = [{ id: fid('ipu:custom'), operation_id: REAL_OP, name: 'tote', archived: false, created_at: TS, updated_at: TS }];
  T.animal_treatments[0].dose_unit_id = stdDose;
  T.animal_treatments.push(row('animal_treatments', 'b', { animal_id: T.animals[0].id, dose_unit_id: fid('dose:custom'), notes: 'Given by Jane Doe' }));
  T.input_products[0].unit_id = fid('ipu:custom');
  T.amendments[0].qty_unit_id = stdProduct;
  // Farm, classes, animals, groups, memberships, grazing.
  T.farms = [row('farms', 'a', { name: 'Smith Family Farm', address: '1 Real Road', notes: 'Call Bob', archived: false })];
  const farm = T.farms[0].id;
  T.farm_settings[0].farm_id = farm;
  T.animal_classes = [
    row('animal_classes', 'cows', { name: 'Cows', species: 'beef_cattle', role: 'cow' }),
    row('animal_classes', 'calves', { name: 'Calves', species: 'beef_cattle', role: 'calf' }),
    row('animal_classes', 'ewes', { name: 'Ewes', species: 'sheep', role: 'ewe' }),
    row('animal_classes', 'does', { name: 'Does', species: 'goat', role: 'doe' }),
    row('animal_classes', 'dairy', { name: 'Dairy heifers', species: 'dairy_cattle', role: 'heifer' }),
  ];
  const [cows, calves, ewes] = T.animal_classes.map(c => c.id);
  const animal = (label, cls, extra = {}) => row('animals', label, { class_id: cls, sex: 'female', active: true, cull_date: null, name: label, notes: 'Bought from Tom', is_bulk: false, ...extra });
  T.animals = [
    animal('cow1', cows), animal('cow2', cows), animal('herd', cows, { is_bulk: true, bulk_head_count: 10 }),
    animal('calf1', calves), animal('ewe1', ewes), animal('culled', cows, { active: false, cull_date: '2026-10-01', cull_notes: 'Sold to Sam' }),
  ];
  T.animals[3].dam_id = T.animals[0].id; // self-FK
  T.animals[3].sire_animal_id = T.animals[1].id;
  T.groups = [
    row('groups', 'milkers', { name: 'Cow herd', color: '#000', archived_at: null }),
    row('groups', 'calves', { name: 'Calf pen', color: '#111', archived_at: null }),
    row('groups', 'sheep', { name: 'Flock', color: '#222', archived_at: null }),
    row('groups', 'old', { name: 'Old herd', color: '#333', archived_at: '2026-01-01T00:00:00Z' }),
  ];
  const [gCows, gCalves, gSheep, gOld] = T.groups.map(g => g.id);
  const member = (label, a, g, extra = {}) => row('animal_group_memberships', label, { animal_id: a, group_id: g, date_joined: '2026-01-01', date_left: null, ...extra });
  T.animal_group_memberships = [
    member('m1', T.animals[0].id, gCows), member('m2', T.animals[1].id, gCows), member('m3', T.animals[2].id, gCows),
    member('m4', T.animals[3].id, gCalves), member('m5', T.animals[4].id, gSheep),
    member('m6', T.animals[5].id, gOld), member('m7', T.animals[0].id, gOld, { date_left: '2025-12-31' }),
  ];
  T.events = [row('events', 'a', { farm_id: farm, notes: 'Moved with Pat' }), row('events', 'b', { farm_id: farm })];
  T.events[1].source_event_id = T.events[0].id; // self-FK
  T.event_group_windows = [row('event_group_windows', 'a', { event_id: T.events[1].id, group_id: gCows, date_joined: '2026-11-01', date_left: null, head_count: 12, avg_weight_kg: 600 })];
  T.event_paddock_windows[0].open_cohort_id = fid('cohort-1');
  T.event_paddock_windows.push(row('event_paddock_windows', 'b', { event_id: T.events[0].id, location_id: T.locations[0].id, open_cohort_id: fid('cohort-1') }));
  const efe = T.event_feed_entries[0];
  Object.assign(efe, { source_event_id: T.events[0].id, destination_event_id: T.events[1].id, return_batch_id: T.batches[0].id, return_storage_location_id: T.locations[0].id, source_location_id: T.locations[0].id, feed_type_id: T.feed_types[0].id });
  T.animal_notes[0].note = 'Jane says limping';
  T.animal_breeding_records[0].technician = 'Vet Joe';
  // Member/user-bound rows.
  T.user_preferences = [row('user_preferences', 'a', { user_id: REAL_USER, active_farm_id: farm, field_mode_quick_actions: ['feed'] })];
  T.batch_adjustments[0].adjusted_by = REAL_MEMBER;
  T.todos = [row('todos', 'a', { title: 'Call Mike about hay', description: 'Mike 555-0100', note: 'x', created_by: REAL_MEMBER, status: 'open' })];
  T.todo_assignments = [row('todo_assignments', 'a', { todo_id: T.todos[0].id, user_id: REAL_MEMBER })];
  T.assistant_conversations[0].actor_id = REAL_USER;
  T.offline_voice_notes[0].confirmed_execution_result_id = fid('server-result');
  T.submissions[0].note = 'Personal feedback';
  T.historical_animal_basis[0].species = 'beef_cattle';
  T.historical_animal_basis[0].class_label = 'Cows';
  T.historical_feedings[0].species = 'sheep';
  // Re-point generic FKs at the realistic parents built above.
  for (const [t, col, parent] of fks) for (const r of T[t] || []) {
    if (r[col] == null || col === 'operation_id' || !T[parent]?.length) continue;
    if (!T[parent].some(p => p.id === r[col]) && !UNIT_STANDARDS.some(u => u.id === r[col])) r[col] = T[parent][0].id;
  }
  // Rows of another operation must never be cloned.
  for (const table of ['farms', 'animals', 'events']) T[table].push({ ...T[table][0], id: fid(`${table}:other`), operation_id: OTHER_OP });
  const members = [{ id: REAL_MEMBER, operation_id: REAL_OP, user_id: REAL_USER }];
  if (format === 'dir') {
    return { schema_version: null, operation_id: null, tables: { ...T, operations: [...T.operations, ...(extraOperation ? [{ ...T.operations[0], id: OTHER_OP }] : [])], operation_members: members, app_logs: [{ id: fid('log'), operation_id: REAL_OP }], release_notes: [{ id: fid('rn') }], assistant_execution_results: [{ id: fid('server-result'), operation_id: REAL_OP, actor_id: REAL_USER }] } };
  }
  return { format: 'gtho-v2-backup', format_version: 1, schema_version: 50, exported_at: TS, exported_by: { user_id: REAL_USER, email: 'real@example.test' }, operation_id: REAL_OP, tables: T };
}
