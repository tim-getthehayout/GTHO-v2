// Historical ceiling-41 compatibility; actual released-44 flows run unmocked.
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 41 }));
import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as Entry from '../../src/entities/event-feed-entry.js';
import * as Item from '../../src/entities/event-feed-check-item.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { validateBackup, CURRENT_SCHEMA_VERSION } from '../../src/data/backup-import.js';
it('pool shapes are held, old payloads omit unknown columns and mislabeled batchless/new-field restores fail closed',()=>{
 setLocale('en',en);expect(CURRENT_SCHEMA_VERSION).toBe(41);expect(Entry.toSupabaseShape(Entry.create({batchId:'legacy'}))).not.toHaveProperty('kind');expect(Item.toSupabaseShape(Item.create({batchId:'legacy'}))).not.toHaveProperty('feed_type_id');expect(()=>Item.toSupabaseShape(Item.create({feedTypeId:'type'}))).toThrow('migration 43');expect(()=>Entry.toSupabaseShape(Entry.create({kind:'pool_carry'}))).toThrow('migration 43');
 for(const tables of [{event_feed_entries:[{batch_id:null}]},{event_feed_check_items:[{batch_id:null}]},{event_feed_entries:[{batch_id:'old',transfer_id:null}]}])expect(validateBackup({format:'gtho-v2-backup',format_version:1,schema_version:41,operation_id:'op',tables}).valid).toBe(false);
});
it('written migration files reserve 042/043, default new columns to NULL and make no policy/backfill change',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/043_event_feed_pool_snapshots.sql'),'utf8');expect(sql).toContain('WRITTEN ONLY / NOT APPLIED');expect(sql).toContain('SET schema_version = 43');expect(sql).toContain('CREATE UNIQUE INDEX');expect(sql).toContain('WHERE batch_id IS NULL AND feed_type_id IS NOT NULL');expect((sql.match(/ADD COLUMN/g)||[])).toHaveLength(12);expect((sql.match(/DEFAULT NULL/g)||[])).toHaveLength(12);expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|UPDATE public\.event_feed/);const files=fs.readdirSync(path.resolve(__dirname,'../../supabase/migrations/'));expect(files.filter(file=>/^04[23]_/.test(file)).sort()).toEqual(['042_retained_breeding_text.sql','043_event_feed_pool_snapshots.sql']);
});
