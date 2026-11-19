/**
 * Disposable PostgreSQL/WASM harness for migration 046 (animals.confirmed_bred_date).
 * Never accepts a database URL. PGLITE_MODULE points at a scratch install when needed.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(join(root, 'supabase/migrations/046_animals_confirmed_bred_date.sql'), 'utf8');

let passed = 0;
function ok(label) { passed += 1; }

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.operations (
      id uuid PRIMARY KEY,
      name text,
      schema_version integer NOT NULL DEFAULT 45
    );
    CREATE TABLE public.animals (
      id uuid PRIMARY KEY,
      operation_id uuid REFERENCES public.operations(id),
      confirmed_bred boolean NOT NULL DEFAULT false,
      tag_num text
    );
    INSERT INTO public.operations VALUES
      ('00000000-0000-4000-8000-000000000001', 'Op', 45);
    INSERT INTO public.animals VALUES
      ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', false, 'A1'),
      ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', true, 'A2');
  `);
  await db.exec(migration);
  return db;
}

const db = await fixture();

{
  const cols = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'animals' AND column_name = 'confirmed_bred_date'
  `);
  assert.equal(cols.rows.length, 1);
  assert.equal(cols.rows[0].data_type, 'date');
  assert.equal(cols.rows[0].is_nullable, 'YES');
  ok('column exists nullable date');
}

{
  const stamp = await db.query('SELECT schema_version FROM public.operations');
  assert.equal(stamp.rows[0].schema_version, 46);
  ok('stamp 46');
}

{
  const nulls = await db.query('SELECT count(*)::int AS n FROM public.animals WHERE confirmed_bred_date IS NOT NULL');
  assert.equal(nulls.rows[0].n, 0);
  ok('existing rows NULL');
}

{
  await db.query(`UPDATE public.animals SET confirmed_bred_date = '2026-05-01' WHERE tag_num = 'A2'`);
  const okRow = await db.query(`SELECT confirmed_bred_date FROM public.animals WHERE tag_num = 'A2'`);
  assert.ok(okRow.rows[0].confirmed_bred_date);
  ok('true + date allowed');
}

{
  await assert.rejects(
    () => db.query(`UPDATE public.animals SET confirmed_bred_date = '2026-05-01' WHERE tag_num = 'A1'`),
    /confirmed_bred_date_check|check constraint/i,
  );
  ok('false + date refused');
}

{
  await db.query(`UPDATE public.animals SET confirmed_bred = false, confirmed_bred_date = NULL WHERE tag_num = 'A2'`);
  const again = await db.query(`SELECT confirmed_bred_date FROM public.animals WHERE tag_num = 'A2'`);
  assert.equal(again.rows[0].confirmed_bred_date, null);
  ok('clearing date with false ok');
}

console.log(`Migration 046 confirmed_bred_date: ${passed} PostgreSQL/WASM checks passed. No live database accessed.`);
