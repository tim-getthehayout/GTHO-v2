import { preflightUnits } from '../../src/data/unit-backup.js';
// Disposable PostgreSQL/WASM only. Never accepts a database URL.
// PGLITE_MODULE points at a scratch-installed @electric-sql/pglite@0.5.15.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { UNIT_STANDARDS } from '../../src/utils/unit-standards.js';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = readFileSync(new URL('../../supabase/migrations/044_unit_reference_rls.sql', import.meta.url), 'utf8');
const OP1 = '00000000-0000-4000-8000-000000000001', OP2 = '00000000-0000-4000-8000-000000000002';
const U1 = '10000000-0000-4000-8000-000000000001', U2 = '10000000-0000-4000-8000-000000000002', OUT = '10000000-0000-4000-8000-000000000003', PENDING = '10000000-0000-4000-8000-000000000004';
let passed = 0;
async function fixture(legacy = false) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE operations(id uuid PRIMARY KEY, schema_version integer);
    INSERT INTO operations VALUES ('${OP1}',43),('${OP2}',43);
    CREATE TABLE operation_members(operation_id uuid, user_id uuid, accepted_at timestamptz);
    ALTER TABLE operation_members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_membership ON operation_members FOR SELECT TO authenticated USING(user_id=auth.uid());
    GRANT SELECT ON operation_members TO authenticated;
    INSERT INTO operation_members VALUES ('${OP1}','${U1}',now()),('${OP2}','${U2}',now()),('${OP1}','${PENDING}',NULL);
    CREATE TABLE dose_units(id uuid PRIMARY KEY, name text NOT NULL UNIQUE, archived boolean DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE input_product_units(LIKE dose_units INCLUDING ALL);
    CREATE TABLE animal_treatments(id uuid PRIMARY KEY, operation_id uuid REFERENCES operations, dose_unit_id uuid REFERENCES dose_units);
    CREATE TABLE amendments(id uuid PRIMARY KEY, operation_id uuid REFERENCES operations, qty_unit_id uuid REFERENCES input_product_units);
    CREATE TABLE input_products(id uuid PRIMARY KEY, operation_id uuid REFERENCES operations, unit_id uuid REFERENCES input_product_units);
    CREATE TABLE release_notes(id uuid PRIMARY KEY, version text); ALTER TABLE release_notes ENABLE ROW LEVEL SECURITY;
    INSERT INTO release_notes VALUES ('20000000-0000-4000-8000-000000000001','fixture');
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;`);
  if (legacy) for (const row of UNIT_STANDARDS) await db.query(`INSERT INTO ${row.table}(id,name) VALUES($1,$2)`, [row.legacyId,row.name]);
  return db;
}
async function check(name, work) { await work(); passed++; console.log(`PASS ${name}`); }
async function as(db, role, user = U1) { await db.exec(`RESET ROLE; SET ROLE ${role}; SET request.jwt.claim.sub='${user}';`); }
const denied = async (db, sql, pattern = /permission denied|row-level security|unit-/i) => assert.rejects(db.exec(sql), pattern);

for (const mode of ['fresh','legacy']) {
  const db = await fixture(mode === 'legacy');
  try { await check(`${mode} catalog path preserves exact fixed standards`, async () => {
    await db.exec(migration);
    for (const table of ['dose_units','input_product_units']) {
      const actual = (await db.query(`SELECT id,name,operation_id FROM ${table} ORDER BY name`)).rows;
      assert.deepEqual(actual, UNIT_STANDARDS.filter(row=>row.table===table).map(row=>({id:row.id,name:row.name,operation_id:null})).sort((a,b)=>a.name.localeCompare(b.name)));
    }
    assert.equal((await db.query('SELECT schema_version FROM operations LIMIT 1')).rows[0].schema_version,44);
  }); } finally { await db.close(); }
}
for (const mutation of ['name','id','missing','ref-dose','ref-amendment','ref-product']) {
  const db = await fixture(true);
  try { await check(`apply aborts safely for ${mutation}`,async()=>{
    const first = UNIT_STANDARDS[0], product = UNIT_STANDARDS.find(row=>row.table==='input_product_units');
    if (mutation==='name') await db.query('UPDATE dose_units SET name=$1 WHERE id=$2',['unexpected',first.legacyId]);
    if (mutation==='id') await db.query('UPDATE dose_units SET id=$1 WHERE id=$2',['30000000-0000-4000-8000-000000000001',first.legacyId]);
    if (mutation==='missing') await db.query('DELETE FROM dose_units WHERE id=$1',[first.legacyId]);
    const cases={'ref-dose':['animal_treatments','dose_unit_id',first.legacyId],'ref-amendment':['amendments','qty_unit_id',product.legacyId],'ref-product':['input_products','unit_id',product.legacyId]};
    if(cases[mutation]) { const [table,column,id]=cases[mutation];await db.query(`INSERT INTO ${table}(id,operation_id,${column}) VALUES($1,$2,$3)`,['40000000-0000-4000-8000-000000000001',OP1,id]); }
    await assert.rejects(db.exec(migration), mutation.startsWith('ref-')?/unit-migration-references-exist/:/unit-migration-unexpected-standard-set/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT schema_version FROM operations LIMIT 1')).rows[0].schema_version,43);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='dose_units' AND column_name='operation_id'")).rows[0].n,0);
  }); } finally { await db.close(); }
}
const db = await fixture();
try {
  await db.exec(migration);
  for (const [index,table] of ['dose_units','input_product_units'].entries()) {
    const a=`50000000-0000-4000-8000-00000000000${index+1}`, b=`60000000-0000-4000-8000-00000000000${index+1}`;
    const standard=UNIT_STANDARDS.find(row=>row.table===table);
    await as(db,'authenticated',U1);
    await check(`${table} member inserts/renames/archives own custom`,async()=>{
      await db.exec(`INSERT INTO ${table}(id,name,operation_id) VALUES('${a}','Custom','${OP1}'); UPDATE ${table} SET name='Own unit',archived=true WHERE id='${a}';`);
      assert.equal((await db.query(`SELECT archived FROM ${table} WHERE id='${a}'`)).rows[0].archived,true);
    });
    await as(db,'authenticated',U2);await db.exec(`INSERT INTO ${table}(id,name,operation_id) VALUES('${b}','Own unit','${OP2}')`);
    await check(`${table} member sees standards plus own, never foreign custom`,async()=>{
      const rows=(await db.query(`SELECT id FROM ${table}`)).rows.map(row=>row.id);
      assert(rows.includes(standard.id));assert(rows.includes(b));assert(!rows.includes(a));
    });
    await check(`${table} no standard insert/update or unsafe client privileges`,async()=>{
      for(const role of ['anon','authenticated'])for(const privilege of ['DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS ok',[role,table,privilege])).rows[0].ok,false);
      await denied(db,`INSERT INTO ${table}(id,name) VALUES('70000000-0000-4000-8000-000000000001','forged standard')`);
      assert.equal((await db.query(`UPDATE ${table} SET name='corrupted' WHERE id='${standard.id}' RETURNING id`)).rows.length,0);
      await denied(db,`DELETE FROM ${table} WHERE id='${b}'`);
      for(const privilege of ['DELETE','TRUNCATE','REFERENCES','TRIGGER']) assert.equal((await db.query(`SELECT has_table_privilege('authenticated','${table}',$1) AS ok`,[privilege])).rows[0].ok,false);
    });
    await check(`${table} custom cannot collide with standard/archived same-farm names`,async()=>{
      await denied(db,`UPDATE ${table} SET name=' ${standard.name.toUpperCase()} ' WHERE id='${b}'`,/unit-name-already-reserved/);
      await denied(db,`INSERT INTO ${table}(id,name,operation_id) VALUES('70000000-0000-4000-8000-000000000002',' OWN UNIT ','${OP2}')`,/unit-name-already-reserved/);
      await as(db,'service_role');await denied(db,`INSERT INTO ${table}(id,name,operation_id) VALUES('70000000-0000-4000-8000-000000000005','Own unit',NULL)`,/unit-name-already-reserved/);
    });
    for(const user of [OUT,PENDING]) {await as(db,'authenticated',user);await check(`${table} outsider/pending ${user===OUT?'outsider':'invite'} only sees standards`,async()=>{
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,UNIT_STANDARDS.filter(row=>row.table===table).length);
      await denied(db,`INSERT INTO ${table}(id,name,operation_id) VALUES('70000000-0000-4000-8000-000000000003','forbidden','${OP1}')`);
    });}
    await as(db,'service_role');await check(`${table} ownership immutable even for service role`,async()=>{await denied(db,`UPDATE ${table} SET operation_id='${OP1}' WHERE id='${b}'`,/unit-ownership-is-immutable/);});
    await as(db,'anon');await check(`${table} anon no privileges`,async()=>{for(const operation of [`SELECT * FROM ${table}`,`INSERT INTO ${table}(id,name) VALUES('70000000-0000-4000-8000-000000000004','x')`,`UPDATE ${table} SET archived=true`,`DELETE FROM ${table}`]) await denied(db,operation);});
  }
  await as(db,'service_role');
  for(const [table,column,unitTable] of [['animal_treatments','dose_unit_id','dose_units'],['amendments','qty_unit_id','input_product_units'],['input_products','unit_id','input_product_units']]) {
    await check(`${table} service-role cross-farm INSERT/UPDATE guard`,async()=>{
      const own=(await db.query(`SELECT id FROM ${unitTable} WHERE operation_id='${OP1}'`)).rows[0].id;
      const foreign=(await db.query(`SELECT id FROM ${unitTable} WHERE operation_id='${OP2}'`)).rows[0].id;
      const id='80000000-0000-4000-8000-000000000001';
      await denied(db,`INSERT INTO ${table}(id,operation_id,${column}) VALUES('${id}','${OP1}','${foreign}')`,/unit-reference-outside-operation/);
      await db.exec(`INSERT INTO ${table}(id,operation_id,${column}) VALUES('${id}','${OP1}','${own}')`);
      await denied(db,`UPDATE ${table} SET operation_id='${OP2}' WHERE id='${id}'`,/unit-reference-outside-operation/);
      await denied(db,`UPDATE ${table} SET ${column}='${foreign}' WHERE id='${id}'`,/unit-reference-outside-operation/);
      const standard=UNIT_STANDARDS.find(row=>row.table===unitTable);await db.exec(`UPDATE ${table} SET ${column}='${standard.id}' WHERE id='${id}'`);
    });
  }
  await as(db,'authenticated',U1);
  await check('restore collision preflight sees RLS-hidden IDs only for an accepted member',async()=>{
    const foreign=(await db.query(`SELECT id FROM dose_units WHERE operation_id='${OP1}'`)).rows[0].id;
    assert.equal((await db.query('SELECT public.unit_restore_id_conflicts($1,$2,$3) AS conflict',[OP1,[foreign],[]])).rows[0].conflict,false);
    await as(db,'authenticated',U2);
    assert.equal((await db.query('SELECT public.unit_restore_id_conflicts($1,$2,$3) AS conflict',[OP2,[foreign],[]])).rows[0].conflict,true);
    const conflict=await db.query('SELECT public.unit_restore_id_conflicts($1,$2,$3,$4::jsonb,$5::jsonb) AS conflict',[OP2,[],[],JSON.stringify([{id:'80000000-0000-4000-8000-000000000001',name:' capsule '}]),'[]']);assert.equal(conflict.rows[0].conflict,true);
    const productConflict=await db.query('SELECT public.unit_restore_id_conflicts($1,$2,$3,$4::jsonb,$5::jsonb) AS conflict',[OP2,[],[],'[]',JSON.stringify([{id:'80000000-0000-4000-8000-000000000002',name:' BAG '}])]);assert.equal(productConflict.rows[0].conflict,true);
    const folded=(await db.query("SELECT lower(btrim('İ')) AS name")).rows[0].name;
    const duplicateConflict=await db.query('SELECT public.unit_restore_id_conflicts($1,$2,$3,$4::jsonb,$5::jsonb) AS conflict',[OP2,[],[],JSON.stringify([{id:'80000000-0000-4000-8000-000000000003',name:'İ'},{id:'80000000-0000-4000-8000-000000000004',name:folded}]),'[]']);assert.equal(duplicateConflict.rows[0].conflict,true);
    await as(db,'authenticated',PENDING);await denied(db,`SELECT public.unit_restore_id_conflicts('${OP1}',ARRAY[]::uuid[],ARRAY[]::uuid[])`);
  });
  for(const table of ['dose_units','input_product_units']) {
    await as(db,'authenticated',U1);await check(`${table} CP-56 UPSERT has SELECT, INSERT and UPDATE permissions`,async()=>{
      const own=(await db.query(`SELECT id FROM ${table} WHERE operation_id='${OP1}'`)).rows[0].id;
      await db.exec(`INSERT INTO ${table}(id,name,operation_id) VALUES('${own}','Own unit','${OP1}') ON CONFLICT(id) DO UPDATE SET name=excluded.name`);
    });
  }
  await as(db,'authenticated',U1);await check('stale-snapshot unit writes fail closed outside READ COMMITTED',async()=>{
    await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await denied(db,`UPDATE dose_units SET name='rename' WHERE operation_id='${OP1}'`,/unit-name-write-needs-read-committed/);
    await db.exec('ROLLBACK');
  });
  await as(db,'authenticated');await check('release_notes authenticated reads, no client writes or unsafe privileges',async()=>{
    assert.equal((await db.query('SELECT * FROM release_notes')).rows.length,1);
    for(const role of ['anon','authenticated'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query(`SELECT has_table_privilege($1,'release_notes',$2) AS ok`,[role,privilege])).rows[0].ok,false);
    await denied(db,"INSERT INTO release_notes(id,version) VALUES('90000000-0000-4000-8000-000000000001','forged')");
    await denied(db,"UPDATE release_notes SET version='forged'");await denied(db,'DELETE FROM release_notes');
  });
  await as(db,'anon');await check('release_notes anon cannot read',async()=>{await denied(db,'SELECT * FROM release_notes');});
  await as(db,'authenticated',U1);
  for(const [index,table] of ['dose_units','input_product_units'].entries())await check(`${table} strict preflight rejects malformed metadata and forwards only DB-valid typed payloads`,async()=>{
    let rpcCalls=0;
    const client={from(name){return{select(){return this;},order(column){assert.equal(column,'id');return this;},async range(a,b){return{data:(await db.query(`SELECT * FROM ${name} ORDER BY id OFFSET ${a} LIMIT ${b-a+1}`)).rows,error:null};}};},async rpc(name,args){rpcCalls++;assert.equal(name,'unit_restore_id_conflicts');return{data:(await db.query('SELECT public.unit_restore_id_conflicts($1,$2,$3,$4::jsonb,$5::jsonb) AS value',[args.p_operation,args.p_dose_ids,args.p_product_ids,JSON.stringify(args.p_dose_rows),JSON.stringify(args.p_product_rows)])).rows[0].value,error:null};}};
    const id=`ab000000-0000-4000-8000-00000000000${index+1}`;
    for(const [field,value]of [['archived','invalid-boolean'],['created_at','invalid-timestamp'],['created_at',null],['updated_at',null],['created_at','2026-02-30T12:00:00Z'],['unknown','unsupported']]){
      rpcCalls=0;const backup={tables:{[table]:[{id,operation_id:OP1,name:'Invalid restored unit',[field]:value}]}};
      const result=await preflightUnits(backup,OP1,client,44);assert.equal(result.success,false);assert.equal(rpcCalls,0);assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE id=$1`,[id])).rows[0].n,0);
    }
    const stamp='2026-11-10T18:30:00.123456+00:00';
    const backup={tables:{[table]:[{id:id.toUpperCase(),operation_id:OP1,name:' Restored e\u0301 ',archived:null,created_at:stamp,updated_at:stamp}]}};
    const result=await preflightUnits(backup,OP1,client,44);assert.equal(result.success,true);const payload=backup.tables[table][0];assert.equal(payload.id,id);assert.equal(payload.name,'Restored é');
    const fields=Object.keys(payload);await db.query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(payload));
    assert.equal((await db.query(`SELECT archived IS NULL AND created_at=$2::timestamptz AND updated_at=$2::timestamptz AS ok FROM ${table} WHERE id=$1`,[id,stamp])).rows[0].ok,true);
  });

  console.log(`Unit migration 044: ${passed} PostgreSQL/WASM checks passed. No live database accessed.`);
} finally { await db.close(); }
