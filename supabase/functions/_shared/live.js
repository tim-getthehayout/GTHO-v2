// Deno-only driver injection for the GTHO assistant functions. Pinned versions
// are recorded in PROJECT_CHANGELOG.md. Secret values are read from the function
// environment and never logged. Missing/disabled configuration serves 503.
import { createClient } from 'npm:@supabase/supabase-js@2.103.0';
import postgres from 'npm:postgres@3.4.9';
import { readConfig } from '../../../src/features/assistant/server/config.js';
import { unconfigured } from '../../../src/features/assistant/server/http.js';

/** One connection per request (max 1, released in finally); each lock transaction
 * stays on that one reserved connection. prepare:false keeps transaction-mode
 * pooling safe; which pooler mode SUPABASE_DB_URL uses is unverified. */
export function requestDatabase(databaseUrl, driver = postgres) {
  let sql;
  return {
    async connect() {
      sql ??= driver(databaseUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 });
      const reserved = await sql.reserve();
      return { query: async (text, values = []) => ({ rows: await reserved.unsafe(text, values) }), release: async () => { reserved.release(); } };
    },
    async close() { if (sql) await sql.end({ timeout: 5 }); },
  };
}

export function serveConfigured(factory) {
  const loaded = readConfig(Deno.env.toObject());
  if (!loaded.ok) {
    // Only the secret NAME or 'disabled' is logged, never a value.
    console.log(JSON.stringify({ type: 'assistant-unconfigured', reason: loaded.reason }));
    return Deno.serve(() => unconfigured());
  }
  const { config } = loaded;
  const client = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return Deno.serve(factory({ config, client, fetch: globalThis.fetch, openDatabase: () => requestDatabase(config.databaseUrl), log: entry => console.log(JSON.stringify(entry)) }));
}
