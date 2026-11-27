/**
 * Static parser for supabase/migrations/*.sql (#488). Replays CREATE TABLE /
 * ALTER TABLE / DROP TABLE in file order and returns, per table, every column
 * that is NOT NULL after migration 001..latest, whether it has a DEFAULT and
 * the DEFAULT expression text.
 * Not a live migration — a schema-backed guard for entity push payloads.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const stripSql = sql => sql
  .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''") // dollar-quoted function bodies
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'(?:[^']|'')*'/g, m => (/^'[\w .-]{0,40}'$/.test(m) ? m : "''")); // keep short literal defaults (e.g. 'auto')

function splitTopLevel(text, sep) {
  const parts = []; let depth = 0; let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(s => s.trim()).filter(Boolean);
}

const ident = s => s.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
const CONSTRAINT_START = /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)\b/i;

const defaultOf = text => text.match(/\bDEFAULT\s+('[^']*'|[^\s,]+(?:\([^)]*\))?)/i)?.[1] ?? null;

function columnFromDef(def) {
  const m = def.match(/^("?[A-Za-z_][A-Za-z0-9_]*"?)\s+(.*)$/s);
  if (!m) return null;
  const rest = m[2];
  return {
    name: ident(m[1]),
    notNull: /\bNOT\s+NULL\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(rest),
    hasDefault: /\bDEFAULT\b/i.test(rest) || /\b(BIG)?SERIAL\b/i.test(rest) || /\bGENERATED\b/i.test(rest),
    defaultExpr: defaultOf(rest),
  };
}

function markPrimaryKey(cols, text) {
  const pk = text.match(/PRIMARY\s+KEY\s*\(([^)]*)\)/i);
  if (!pk) return;
  for (const c of pk[1].split(',').map(ident)) if (cols.has(c.trim())) cols.get(c.trim()).notNull = true;
}

export function loadMigrationNotNull(root) {
  const dir = resolve(root, 'supabase/migrations');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const tables = new Map();
  for (const file of files) {
    const sql = stripSql(readFileSync(resolve(dir, file), 'utf8'));
    for (const raw of splitTopLevel(sql, ';')) {
      const stmt = raw.replace(/\s+/g, ' ').trim();
      let m = stmt.match(/^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?([\w."]+) \((.*)\)[^)]*$/is);
      if (m) {
        const name = ident(m[1]);
        if (tables.has(name) && /IF NOT EXISTS/i.test(stmt)) continue;
        const cols = new Map();
        for (const part of splitTopLevel(m[2], ',')) {
          if (CONSTRAINT_START.test(part)) { markPrimaryKey(cols, part); continue; }
          const col = columnFromDef(part);
          if (col) cols.set(col.name, col);
        }
        tables.set(name, cols);
        continue;
      }
      m = stmt.match(/^DROP TABLE (?:IF EXISTS )?([\w.", ]+?)(?: CASCADE| RESTRICT)?$/i);
      if (m) { for (const t of m[1].split(',')) tables.delete(ident(t.trim())); continue; }
      m = stmt.match(/^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w."]+) (.*)$/is);
      if (!m) continue;
      const name = ident(m[1]);
      const cols = tables.get(name);
      if (!cols) continue;
      const rename = m[2].match(/^RENAME TO ([\w."]+)$/i);
      if (rename) { tables.delete(name); tables.set(ident(rename[1]), cols); continue; }
      for (const action of splitTopLevel(m[2], ',')) {
        let a;
        if ((a = action.match(/^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(.*)$/is)) && !CONSTRAINT_START.test(a[1])) {
          const col = columnFromDef(a[1]);
          if (col && !(cols.has(col.name) && /IF NOT EXISTS/i.test(action))) cols.set(col.name, col);
        } else if ((a = action.match(/^ADD (.*)$/is))) {
          markPrimaryKey(cols, a[1]);
        } else if ((a = action.match(/^ALTER (?:COLUMN )?("?\w+"?) (.*)$/is))) {
          const col = cols.get(ident(a[1]));
          if (!col) continue;
          if (/^SET NOT NULL/i.test(a[2])) col.notNull = true;
          else if (/^DROP NOT NULL/i.test(a[2])) col.notNull = false;
          else if (/^SET DEFAULT/i.test(a[2])) { col.hasDefault = true; col.defaultExpr = defaultOf(a[2]); }
          else if (/^DROP DEFAULT/i.test(a[2])) { col.hasDefault = false; col.defaultExpr = null; }
        } else if ((a = action.match(/^DROP (?:COLUMN )?(?:IF EXISTS )?("?\w+"?)/i)) && !/^DROP CONSTRAINT/i.test(action)) {
          cols.delete(ident(a[1]));
        } else if ((a = action.match(/^RENAME (?:COLUMN )?("?\w+"?) TO ("?\w+"?)$/i))) {
          const col = cols.get(ident(a[1]));
          if (col) { cols.delete(col.name); col.name = ident(a[2]); cols.set(col.name, col); }
        }
      }
    }
  }
  const out = {};
  for (const [table, cols] of tables) {
    out[table] = Object.fromEntries([...cols.values()].filter(c => c.notNull).map(c => [c.name, { hasDefault: c.hasDefault, defaultExpr: c.defaultExpr }]));
  }
  return { files, tables: out };
}
