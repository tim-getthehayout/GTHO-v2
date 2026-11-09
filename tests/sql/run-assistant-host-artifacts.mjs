// Isolated PostgreSQL/WASM only. No network DB URL or production connection.
// Install @electric-sql/pglite@0.5.15 in a separate scratch directory and pass its
// absolute dist/index.js path as PGLITE_MODULE; do not add a product dependency.
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE operations (id uuid PRIMARY KEY, timezone text, schema_version integer);
    CREATE TABLE operation_members (operation_id uuid, user_id uuid, accepted_at timestamptz);
    CREATE TABLE submissions (id uuid PRIMARY KEY, operation_id uuid REFERENCES operations, type text, priority text, version text, note text);
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON operation_members TO authenticated;
    INSERT INTO operations VALUES ('00000000-0000-4000-8000-000000000001','America/New_York',39);
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/040_assistant_host_artifacts.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('./assistant-host-artifacts.sql',import.meta.url),'utf8'));
  console.log('Migration 040 and all six disposable SQL regression blocks passed (isolated PostgreSQL only)');
} finally { await db.close(); }
