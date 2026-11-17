/** Synthetic hay-backfill fixture: invented notes, extracts and decisions. No production data. */
import { createHash } from 'node:crypto';
import { DECISIONS } from '../../../scripts/oi-0222-backfill.mjs';

export const NOTES = [
  '# Synthetic hay notes',
  '10/1- fed 4 bales  ',
  '12/16- Fed 4 bales',
  '1/9- Fed 2 peanut, 3 grass hay',
  '3/5- fed 2 grass hay to cows',
  '3/6- fed 1 peanut to sheep',
  '3/7- fed 1 bale',
  '',
].join('\n');

export const IDS = {
  op: '00000000-0000-4000-8000-0000000000a1',
  otherOp: '00000000-0000-4000-8000-0000000000a2',
  farm: '00000000-0000-4000-8000-0000000000b1',
  hay: '00000000-0000-4000-8000-0000000000c1',
  peanut: '00000000-0000-4000-8000-0000000000c2',
  herd: '00000000-0000-4000-8000-0000000000d1',
  north: '00000000-0000-4000-8000-0000000000e1',
  south: '00000000-0000-4000-8000-0000000000e2',
  east: '00000000-0000-4000-8000-0000000000e3',
  ev1: 'eeee0001-0000-4000-8000-000000000001',
  ev2: 'eeee0002-0000-4000-8000-000000000002',
  check: 'cccc0001-0000-4000-8000-000000000001',
  lot: '00000000-0000-4000-8000-0000000000f1',
  reconcile: '00000000-0000-4000-8000-0000000000f2',
  liveEntry: '00000000-0000-4000-8000-0000000000f3',
};

export function decisions(notes = NOTES) {
  return {
    ...DECISIONS,
    notesHashPrefix: createHash('sha256').update(notes).digest('hex').slice(0, 8),
    noteRows: [
      [2, '2025-10-01', 4],
      [4, '2026-01-09', 2, 'peanut'],
      [4, '2026-01-09', 3, 'grass'],
      [5, '2026-03-05', 2, 'grass', 'cattle', 'cows'],
      [6, '2026-03-06', 1, 'peanut', 'sheep'],
      [7, '2026-03-07', 1],
    ],
    proRates: [{ line: 3, start: '2025-12-16', days: 2, qty: 2 }],
    historyFeedTypes: { grass: 'Hay', peanut: 'Peanut', untyped: 'Hay' },
    checkItemFeedType: 'Hay',
    noteEvents: {
      '5:1': { action: 'insert', batch: 'Grass lot', event: 'eeee0001', location: 'North', why: 'fixture insert' },
      '6:1': { action: 'exclude', category: 'sheep-peanut', why: 'fixture exclude' },
      '7:1': { action: 'skip', why: 'fixture match' },
    },
    v1: {
      batches: { 'Grass lot': { v2: 'Grass lot', type: 'grass', form: 'round' } },
      copySuffixLengths: [3, 6],
      supersedeDates: { '2026-03-09': 'fixture C' },
      supersedeRows: [],
    },
    eventPins: {},
    basis: [
      { group: 'Herd', species: 'beef_cattle', start: '2025-10-01', end: '2026-03-03', head: 10, lb: 1000, dmiPct: 2.5, dmiSource: 'class_default', source: 'tim_answer' },
      { group: null, label: 'Flock', species: 'sheep', start: '2025-10-01', end: '2026-05-31', head: 20, lb: 110, dmiPct: 3, dmiSource: 'class_default', source: 'tim_entry' },
    ],
    // fed = v1 3 + notes 2 + live 1 = 6 -> true-up 0 - 10 + 6 = -4.
    batches: [
      { name: 'Grass lot', quantity: 10, remaining: 0, reconcile: { prev: 5, next: 0 }, v2Fed: 1, trueUp: -4, end: 0, adjustmentDate: '2026-05-03',
        relabel: { source: 'opening', purchaseDate: '2026-03-15', fromPurchaseDate: '2026-01-01', costPerUnit: 45 } },
    ],
  };
}

export function extracts() {
  return {
    v1_events: [
      { id: 101, pasture_name: 'North', status: 'closed', date_in: '2026-03-04', date_out: '2026-03-10' },
      { id: 102, pasture_name: 'South', status: 'open', date_in: '2026-03-10', date_out: null },
    ],
    v2_events: [
      { id: IDS.ev1, date_out: '2026-03-10', first_open: '2026-03-04', locs: 'North', wins: 'North@2026-03-04..2026-03-10' },
      { id: IDS.ev2, date_out: null, first_open: '2026-03-10', locs: 'East, South', wins: 'South@2026-03-10..; East@2026-03-10..' },
    ],
    v1_deliveries: [
      { delivery_id: 5001, event_id: 101, date: '2026-03-07', quantity: '3', kind: null, transfer_pair_id: null, notes: null, batch: 'Grass lot', event_pasture: 'North' },
      { delivery_id: 5001000, event_id: 101, date: '2026-03-07', quantity: '3', kind: null, transfer_pair_id: null, notes: null, batch: 'Grass lot', event_pasture: 'North' },
      { delivery_id: 5002, event_id: 101, date: '2026-03-09', quantity: '2', kind: null, transfer_pair_id: null, notes: null, batch: 'Grass lot', event_pasture: 'North' },
      { delivery_id: 6001, event_id: 101, date: '2026-03-10', quantity: '-0.5', kind: 'transfer', transfer_pair_id: 'pair-1', notes: 'Moved to South', batch: 'Grass lot', event_pasture: 'North' },
      { delivery_id: 6002, event_id: 102, date: '2026-03-10', quantity: '0.5', kind: 'transfer', transfer_pair_id: 'pair-1', notes: 'Moved from North', batch: 'Grass lot', event_pasture: 'South' },
    ],
    v1_checks: [
      { id: 7001, event_id: 101, pasture_name: 'North', check_date: '2026-03-08', is_close_reading: false, type_checks_json: '[{"feedTypeId":"x","remaining":1.5,"total":3}]' },
    ],
    v2_checks: [{ check_id: IDS.check, event_id: IDS.ev1, date: '2026-03-08', is_close_reading: false, items: 0 }],
  };
}

/** Minimal schema for the guarded SQL (enough columns and the 043 pool constraints). */
export const SCHEMA = `
CREATE TABLE farms(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), name text NOT NULL);
CREATE TABLE feed_types(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), name text NOT NULL, archived boolean DEFAULT false);
CREATE TABLE groups(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), name text NOT NULL, archived_at timestamptz);
CREATE TABLE animal_classes(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), name text NOT NULL);
CREATE TABLE locations(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), name text NOT NULL);
CREATE TABLE batches(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), feed_type_id uuid NOT NULL REFERENCES feed_types(id), name text NOT NULL,
  source text NOT NULL DEFAULT 'purchase', quantity numeric NOT NULL, remaining numeric NOT NULL, unit text NOT NULL, cost_per_unit numeric, purchase_date date, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE batch_adjustments(id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES batches(id), operation_id uuid NOT NULL REFERENCES operations(id), adjusted_by uuid,
  previous_qty numeric NOT NULL, new_qty numeric NOT NULL, delta numeric NOT NULL, reason text, adjustment_date date, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE batch_location_balances(id uuid PRIMARY KEY, operation_id uuid NOT NULL, batch_id uuid NOT NULL REFERENCES batches(id), location_id uuid NOT NULL REFERENCES locations(id), quantity numeric NOT NULL DEFAULT 0);
CREATE TABLE events(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), date_in date NOT NULL, date_out date);
CREATE TABLE event_paddock_windows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL, event_id uuid NOT NULL REFERENCES events(id), location_id uuid NOT NULL REFERENCES locations(id), date_opened date NOT NULL);
CREATE TABLE event_feed_entries(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), event_id uuid NOT NULL REFERENCES events(id), batch_id uuid REFERENCES batches(id),
  location_id uuid NOT NULL REFERENCES locations(id), date date NOT NULL, time text, quantity numeric NOT NULL CHECK (quantity > 0), entry_type text DEFAULT 'delivery', destination_type text,
  destination_event_id uuid REFERENCES events(id), source_event_id uuid REFERENCES events(id), feed_type_id uuid REFERENCES feed_types(id), unit_snapshot text, weight_per_unit_kg_snapshot numeric,
  dm_pct_snapshot numeric, kind text, transfer_id uuid, return_batch_id uuid, return_storage_location_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_entry_pool_kind CHECK (CASE WHEN kind IS NULL THEN batch_id IS NOT NULL
    ELSE (kind = 'inventory_feeding' AND batch_id IS NOT NULL AND feed_type_id IS NOT NULL AND entry_type = 'delivery')
    OR (kind IN ('pool_carry', 'pool_removal') AND batch_id IS NULL AND feed_type_id IS NOT NULL AND transfer_id IS NOT NULL
      AND entry_type = CASE WHEN kind = 'pool_removal' THEN 'removal' ELSE 'delivery' END) END));
CREATE TABLE event_feed_checks(id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations(id), event_id uuid NOT NULL REFERENCES events(id), date date NOT NULL, is_close_reading boolean DEFAULT false);
CREATE TABLE event_feed_check_items(id uuid PRIMARY KEY, operation_id uuid, feed_check_id uuid NOT NULL REFERENCES event_feed_checks(id), batch_id uuid REFERENCES batches(id),
  location_id uuid NOT NULL REFERENCES locations(id), remaining_quantity numeric NOT NULL, feed_type_id uuid REFERENCES feed_types(id), unit_snapshot text, weight_per_unit_kg_snapshot numeric,
  dm_pct_snapshot numeric, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_check_pool_identity CHECK ((batch_id IS NOT NULL AND feed_type_id IS NULL) OR (batch_id IS NULL AND feed_type_id IS NOT NULL)));
CREATE UNIQUE INDEX event_feed_check_pool_identity_unique ON event_feed_check_items (feed_check_id, location_id, feed_type_id) WHERE batch_id IS NULL AND feed_type_id IS NOT NULL;
`;

/** Pre-write state matching the fixture decisions. */
export function seedSql(i = IDS) {
  return `
INSERT INTO farms VALUES ('${i.farm}','${i.op}','Home');
INSERT INTO feed_types VALUES ('${i.hay}','${i.op}','Hay',false),('${i.peanut}','${i.op}','Peanut',false);
INSERT INTO groups VALUES ('${i.herd}','${i.op}','Herd',NULL);
INSERT INTO locations VALUES ('${i.north}','${i.op}','North'),('${i.south}','${i.op}','South'),('${i.east}','${i.op}','East');
INSERT INTO batches (id, operation_id, feed_type_id, name, source, quantity, remaining, unit, cost_per_unit, purchase_date) VALUES ('${i.lot}','${i.op}','${i.hay}','Grass lot','purchase',10,0,'bale',45,'2026-01-01');
INSERT INTO batch_adjustments (id, batch_id, operation_id, previous_qty, new_qty, delta, reason, adjustment_date) VALUES ('${i.reconcile}','${i.lot}','${i.op}',5,0,-5,'reconcile','2026-11-03');
INSERT INTO events VALUES ('${i.ev1}','${i.op}','2026-03-04','2026-03-10'),('${i.ev2}','${i.op}','2026-03-10',NULL);
INSERT INTO event_paddock_windows (operation_id, event_id, location_id, date_opened) VALUES ('${i.op}','${i.ev1}','${i.north}','2026-03-04'),('${i.op}','${i.ev2}','${i.south}','2026-03-10'),('${i.op}','${i.ev2}','${i.east}','2026-03-10');
INSERT INTO event_feed_entries (id, operation_id, event_id, batch_id, location_id, date, quantity) VALUES ('${i.liveEntry}','${i.op}','${i.ev2}','${i.lot}','${i.south}','2026-04-09',1);
INSERT INTO event_feed_checks VALUES ('${i.check}','${i.op}','${i.ev1}','2026-03-08',false);
`;
}
