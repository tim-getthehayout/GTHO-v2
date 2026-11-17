// Disposable PostgreSQL/WASM only. Never accepts a database URL.
// PGLITE_MODULE points at a scratch-installed @electric-sql/pglite@0.5.15.
// Covers migration 045 (RLS, unique source key, FK set null, checks) and the
// backfill script's emitted transaction (guard, write, idempotent re-run).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildPlan, emitSql, backfillId } from '../../scripts/oi-0222-backfill.mjs';
import { NOTES, IDS, SCHEMA, seedSql, decisions, extracts } from '../fixtures/hay-backfill/fixture.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = readFileSync(new URL('../../supabase/migrations/045_historical_feed_basis.sql', import.meta.url), 'utf8');
const U1 = '10000000-0000-4000-8000-000000000001', U2 = '10000000-0000-4000-8000-000000000002', PENDING = '10000000-0000-4000-8000-000000000004';
const TABLES = ['historical_feedings', 'historical_animal_basis'];
let passed = 0;
async function check(name, work) { await work(); passed++; console.log(`PASS ${name}`); }
async function as(db, role, user = U1) { await db.exec(`RESET ROLE; SET ROLE ${role}; SET request.jwt.claim.sub='${user}';`); }
const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const count = async (db, table, where = 'true') => (await one(db, `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).n;

async function fixture({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE operations(id uuid PRIMARY KEY, schema_version integer);
    INSERT INTO operations VALUES ('${IDS.op}',44),('${IDS.otherOp}',44);
    CREATE TABLE operation_members(operation_id uuid, user_id uuid, accepted_at timestamptz);
    ALTER TABLE operation_members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_membership ON operation_members FOR SELECT TO authenticated USING(user_id=auth.uid());
    INSERT INTO operation_members VALUES ('${IDS.op}','${U1}',now()),('${IDS.otherOp}','${U2}',now()),('${IDS.op}','${PENDING}',NULL);
    ${SCHEMA}
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;`); // Supabase default privileges
  if (seed) await db.exec(seedSql());
  return db;
}
const feeding = (id, op, key, extra = {}) => ({ id, operation_id: op, date: '2025-10-01', quantity: 4, unit_snapshot: 'bale', weight_per_unit_kg_snapshot: 293.4743, dm_pct_snapshot: 85, species: 'beef_cattle', source: 'notes', source_key: key, ...extra });
async function insert(db, table, row) {
  const cols = Object.keys(row);
  return db.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
}
const basis = (id, op, key, extra = {}) => ({ id, operation_id: op, period_start: '2025-10-01', period_end: '2026-03-18', species: 'beef_cattle', head_count: 10, avg_weight_kg: 342.4622, dmi_pct_snapshot: 2.5, dmi_source: 'class_default', source: 'tim_answer', source_key: key, ...extra });
const uid = n => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

{ // Migration shape
  const db = await fixture();
  try {
    await check('045 applies in one transaction and stamps 45', async () => {
      await db.exec(migration);
      assert.deepEqual((await db.query('SELECT DISTINCT schema_version FROM operations')).rows, [{ schema_version: 45 }]);
      for (const table of TABLES) {
        assert.equal((await one(db, 'SELECT relrowsecurity FROM pg_class WHERE relname=$1', [table])).relrowsecurity, true);
        const policies = (await db.query('SELECT cmd, roles::text AS roles FROM pg_policies WHERE tablename=$1 ORDER BY cmd', [table])).rows;
        assert.deepEqual(policies.map(p => p.cmd), ['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
        assert.ok(policies.every(p => p.roles === '{authenticated}'));
      }
    });
    await check('every FK column is indexed', async () => {
      for (const [table, cols] of [['historical_feedings', ['operation_id', 'farm_id', 'feed_type_id', 'group_id']], ['historical_animal_basis', ['operation_id', 'farm_id', 'group_id', 'class_id']]]) {
        for (const col of cols) assert.ok(await count(db, 'pg_indexes', `tablename='${table}' AND indexdef LIKE '%(${col})%'`) >= 1, `${table}.${col}`);
      }
    });
    await as(db, 'authenticated', U1);
    await check('member writes and reads own operation rows only', async () => {
      await insert(db, 'historical_feedings', feeding(uid(1), IDS.op, 'k1'));
      await insert(db, 'historical_animal_basis', basis(uid(2), IDS.op, 'b1'));
      await db.query("UPDATE historical_feedings SET notes='edited' WHERE id=$1", [uid(1)]);
      assert.equal((await one(db, 'SELECT notes FROM historical_feedings WHERE id=$1', [uid(1)])).notes, 'edited');
    });
    await check('member cannot insert into another operation', async () => {
      await assert.rejects(insert(db, 'historical_feedings', feeding(uid(3), IDS.otherOp, 'k1')), /row-level security/);
      await assert.rejects(insert(db, 'historical_animal_basis', basis(uid(4), IDS.otherOp, 'b1')), /row-level security/);
    });
    await as(db, 'authenticated', U2);
    await check('other member sees, updates and deletes none of them', async () => {
      await insert(db, 'historical_feedings', feeding(uid(5), IDS.otherOp, 'k1'));
      assert.deepEqual((await db.query('SELECT id FROM historical_feedings')).rows.map(r => r.id), [uid(5)]);
      assert.equal((await db.query('SELECT id FROM historical_animal_basis')).rows.length, 0);
      assert.equal((await db.query("UPDATE historical_feedings SET notes='x' WHERE id=$1", [uid(1)])).affectedRows, 0);
      assert.equal((await db.query('DELETE FROM historical_animal_basis WHERE id=$1', [uid(2)])).affectedRows, 0);
      await assert.rejects(db.query('UPDATE historical_feedings SET operation_id=$1 WHERE id=$2', [IDS.op, uid(5)]), /row-level security/);
    });
    await as(db, 'authenticated', PENDING);
    await check('pending (unaccepted) member is denied', async () => {
      assert.equal((await db.query('SELECT id FROM historical_feedings')).rows.length, 0);
      await assert.rejects(insert(db, 'historical_feedings', feeding(uid(6), IDS.op, 'k6')), /row-level security/);
    });
    await as(db, 'anon', '');
    await check('anon has no policy', async () => {
      assert.equal((await db.query('SELECT id FROM historical_feedings')).rows.length, 0);
      await assert.rejects(insert(db, 'historical_feedings', feeding(uid(7), IDS.op, 'k7')), /row-level security/);
    });
    await db.exec('RESET ROLE');
    await check('source_key is unique per operation', async () => {
      await assert.rejects(insert(db, 'historical_feedings', feeding(uid(8), IDS.op, 'k1')), /historical_feedings_source_key_unique/);
      await assert.rejects(insert(db, 'historical_animal_basis', basis(uid(9), IDS.op, 'b1')), /historical_animal_basis_source_key_unique/);
      await insert(db, 'historical_animal_basis', basis(uid(10), IDS.otherOp, 'b1'));
    });
    await check('CHECK constraints refuse bad values', async () => {
      const bad = [
        ['historical_feedings', feeding(uid(20), IDS.op, 'c1', { quantity: 0 })],
        ['historical_feedings', feeding(uid(21), IDS.op, 'c2', { quantity: 'Infinity' })],
        ['historical_feedings', feeding(uid(22), IDS.op, 'c3', { dm_pct_snapshot: 101 })],
        ['historical_feedings', feeding(uid(23), IDS.op, 'c4', { unit_snapshot: '  ' })],
        ['historical_feedings', feeding(uid(24), IDS.op, 'c5', { species: 'cattle' })],
        ['historical_feedings', feeding(uid(25), IDS.op, 'c6', { source: 'v1' })],
        ['historical_feedings', feeding(uid(26), IDS.op, 'c7', { weight_per_unit_kg_snapshot: 0 })],
        ['historical_animal_basis', basis(uid(27), IDS.op, 'c8', { period_end: '2025-09-30' })],
        ['historical_animal_basis', basis(uid(28), IDS.op, 'c9', { head_count: 0 })],
        ['historical_animal_basis', basis(uid(29), IDS.op, 'c10', { dmi_source: 'guess' })],
        ['historical_animal_basis', basis(uid(30), IDS.op, 'c11', { source: 'notes' })],
        ['historical_animal_basis', basis(uid(31), IDS.op, 'c12', { avg_weight_kg: 'Infinity' })],
      ];
      for (const [table, row] of bad) await assert.rejects(insert(db, table, row), /violates check constraint/, JSON.stringify(row));
    });
    await check('deleting a referenced farm, feed type, group or class sets the link null and keeps labels', async () => {
      await db.exec(`INSERT INTO feed_types VALUES ('${uid(40)}','${IDS.op}','Gone',false); INSERT INTO groups VALUES ('${uid(41)}','${IDS.op}','Gone group',NULL);
        INSERT INTO animal_classes VALUES ('${uid(42)}','${IDS.op}','Gone class'); INSERT INTO farms VALUES ('${uid(43)}','${IDS.op}','Gone farm');`);
      await insert(db, 'historical_feedings', feeding(uid(44), IDS.op, 'fk1', { farm_id: uid(43), feed_type_id: uid(40), feed_type_label: 'Gone', group_id: uid(41), group_label: 'Gone group' }));
      await insert(db, 'historical_animal_basis', basis(uid(45), IDS.op, 'fk2', { farm_id: uid(43), group_id: uid(41), group_label: 'Gone group', class_id: uid(42), class_label: 'Gone class' }));
      await db.exec(`DELETE FROM feed_types WHERE id='${uid(40)}'; DELETE FROM groups WHERE id='${uid(41)}'; DELETE FROM animal_classes WHERE id='${uid(42)}'; DELETE FROM farms WHERE id='${uid(43)}';`);
      assert.deepEqual(await one(db, 'SELECT farm_id, feed_type_id, feed_type_label, group_id, group_label FROM historical_feedings WHERE id=$1', [uid(44)]),
        { farm_id: null, feed_type_id: null, feed_type_label: 'Gone', group_id: null, group_label: 'Gone group' });
      assert.deepEqual(await one(db, 'SELECT farm_id, group_id, group_label, class_id, class_label FROM historical_animal_basis WHERE id=$1', [uid(45)]),
        { farm_id: null, group_id: null, group_label: 'Gone group', class_id: null, class_label: 'Gone class' });
    });
  } finally { await db.close(); }
}

const plan = buildPlan({ notesText: NOTES, extracts: extracts(), decisions: decisions() });
const sql = emitSql(plan, { operationId: IDS.op });
const backfillCount = async db => {
  let n = 0;
  for (const table of [...TABLES, 'event_feed_entries', 'event_feed_check_items', 'batch_adjustments']) n += await count(db, table, `id IN (${plan.ids.filter(r => r.table === table).map(r => `'${r.id}'`).join(',') || 'NULL'})`);
  return n;
};
const snapshot = async db => {
  const out = {};
  for (const table of [...TABLES, 'event_feed_entries', 'event_feed_check_items', 'batch_adjustments', 'batches']) out[table] = (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  return JSON.stringify(out);
};

{ // Backfill transaction
  const db = await fixture();
  try {
    await check('backfill refuses to run before 045', async () => {
      await assert.rejects(db.exec(sql), /backfill-guard: migration 045 is not applied/);
      await db.exec('ROLLBACK');
    });
    await db.exec(migration);
    await check('backfill writes every planned row in one transaction', async () => {
      await db.exec(sql);
      assert.equal(await backfillCount(db), plan.ids.length);
      assert.equal(await count(db, 'historical_feedings'), 5);
      assert.equal(await count(db, 'historical_animal_basis'), 2);
      const hay = await one(db, "SELECT feed_type_id, feed_type_label, farm_id, notes, weight_per_unit_kg_snapshot::text AS kg, dm_pct_snapshot::text AS dm FROM historical_feedings WHERE source_key LIKE '%:2:1'");
      assert.deepEqual(hay, { feed_type_id: IDS.hay, feed_type_label: 'Hay', farm_id: IDS.farm, notes: '10/1- fed 4 bales', kg: '293.4743', dm: '85' });
      assert.equal((await one(db, "SELECT group_id FROM historical_animal_basis WHERE group_label='Herd'")).group_id, IDS.herd);
      assert.equal((await one(db, "SELECT group_id FROM historical_animal_basis WHERE group_label='Flock'")).group_id, null);
      const pool = (await db.query("SELECT kind, entry_type, event_id, location_id, quantity::text AS q, transfer_id, destination_type, destination_event_id, source_event_id, feed_type_id, batch_id FROM event_feed_entries WHERE kind LIKE 'pool_%' ORDER BY kind")).rows;
      assert.equal(pool.length, 2);
      assert.equal(pool[0].transfer_id, pool[1].transfer_id);
      assert.deepEqual(pool.map(r => [r.kind, r.entry_type, r.event_id, r.location_id, r.q, r.batch_id, r.feed_type_id]), [
        ['pool_carry', 'delivery', IDS.ev2, IDS.south, '0.5', null, IDS.hay], ['pool_removal', 'removal', IDS.ev1, IDS.north, '0.5', null, IDS.hay]]);
      assert.equal(pool[0].source_event_id, IDS.ev1); assert.equal(pool[1].destination_type, 'event'); assert.equal(pool[1].destination_event_id, IDS.ev2);
      assert.equal(await count(db, 'event_feed_entries', "kind='inventory_feeding' AND batch_id IS NOT NULL AND feed_type_id IS NOT NULL"), 2);
      assert.deepEqual(await one(db, 'SELECT feed_check_id, location_id, batch_id, feed_type_id, remaining_quantity::text AS q FROM event_feed_check_items'),
        { feed_check_id: IDS.check, location_id: IDS.north, batch_id: null, feed_type_id: IDS.hay, q: '1.5' });
      const adj = (await db.query("SELECT previous_qty::text AS p, new_qty::text AS n, delta::text AS d, reason, adjustment_date::text AS date, adjusted_by FROM batch_adjustments WHERE id <> $1 ORDER BY created_at", [IDS.reconcile])).rows;
      assert.deepEqual(adj, [{ p: '0', n: '5', d: '5', reason: 'reconcile', date: '2026-05-03', adjusted_by: null }, { p: '4', n: '0', d: '-4', reason: 'reconcile', date: '2026-05-03', adjusted_by: null }]);
      assert.deepEqual(await one(db, 'SELECT source, purchase_date::text AS d, quantity::text AS q, remaining::text AS r, cost_per_unit::text AS c FROM batches'), { source: 'opening', d: '2026-03-15', q: '10', r: '0', c: '45' });
      assert.equal(await one(db, 'SELECT id FROM historical_feedings WHERE source_key=$1', [plan.history[0].sourceKey]).then(r => r.id), backfillId('historical_feedings', plan.history[0].sourceKey));
    });
    await check('re-running the same transaction inserts and changes nothing', async () => {
      const before = await snapshot(db);
      await db.exec(sql);
      assert.equal(await snapshot(db), before);
    });
    await check('a partial earlier write aborts', async () => {
      await db.exec(`DELETE FROM historical_feedings WHERE id='${backfillId('historical_feedings', plan.history[0].sourceKey)}'`);
      await assert.rejects(db.exec(sql), /backfill-guard: \d+ of 14 backfill rows already exist/);
      await db.exec('ROLLBACK');
    });
  } finally { await db.close(); }
}

const tampers = [
  ['batch remaining', "UPDATE batches SET remaining = 1", /batch % quantity, remaining or cost differs|quantity, remaining or cost differs/],
  ['batch cost', "UPDATE batches SET cost_per_unit = 50", /quantity, remaining or cost differs/],
  ['purchase date', "UPDATE batches SET purchase_date = '2026-02-01'", /source or purchase date differs/],
  ['extra adjustment', `INSERT INTO batch_adjustments (id,batch_id,operation_id,previous_qty,new_qty,delta,reason) VALUES ('${uid(60)}','${IDS.lot}','${IDS.op}',0,1,1,'reconcile')`, /exactly its one earlier reconcile/],
  ['reconcile values', 'UPDATE batch_adjustments SET previous_qty = 6', /exactly its one earlier reconcile/],
  ['fed quantity', 'UPDATE event_feed_entries SET quantity = 2', /existing fed quantity differs/],
  ['located balances', `INSERT INTO batch_location_balances VALUES ('${uid(61)}','${IDS.op}','${IDS.lot}','${IDS.north}',3)`, /located balances would not sum/],
  ['duplicate active feed type', `INSERT INTO feed_types VALUES ('${uid(62)}','${IDS.op}','Hay',false)`, /feed_type "Hay" matches 2 rows/],
  ['missing group', "DELETE FROM groups", /group "Herd" matches 0 rows/],
  ['missing paddock window', `DELETE FROM event_paddock_windows WHERE location_id='${IDS.south}'`, /location ".*South" matches 0 rows/],
  ['moved check', "UPDATE event_feed_checks SET date = '2026-03-09'", /target feed check is missing or moved/],
  ['second farm', `INSERT INTO farms VALUES ('${uid(63)}','${IDS.op}','Second')`, /farm "operation" matches 2 rows/],
];
for (const [name, mutation, pattern] of tampers) {
  const db = await fixture();
  try {
    await db.exec(migration);
    await check(`backfill guard aborts and writes nothing: ${name}`, async () => {
      await db.exec(mutation);
      const before = await snapshot(db);
      await assert.rejects(db.exec(sql), pattern);
      await db.exec('ROLLBACK');
      assert.equal(await snapshot(db), before);
      assert.equal(await backfillCount(db), 0);
    });
  } finally { await db.close(); }
}
{
  const db = await fixture();
  try {
    await db.exec(migration);
    await check('an archived same-name feed type does not count', async () => {
      await db.exec(`INSERT INTO feed_types VALUES ('${uid(64)}','${IDS.op}','Hay',true)`);
      await db.exec(sql);
      assert.equal(await backfillCount(db), plan.ids.length);
    });
  } finally { await db.close(); }
}
console.log(`Migration 045 + backfill transaction: ${passed} PostgreSQL/WASM checks passed. No live database accessed.`);
