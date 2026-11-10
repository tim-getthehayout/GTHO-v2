-- WRITTEN ONLY / NOT APPLIED. Tim's separate apply approval + backup required.
-- Reconcile live prerequisites, 042, history and policies before approved apply.
-- New-shape consumers and restore ceiling remain held pending verification.
-- No domain backfill, no legacy grouping, no RLS/grant/policy changes.
-- Existing permissive INSERT policy is not endorsed by this migration.
BEGIN;
ALTER TABLE public.event_feed_check_items
  ALTER COLUMN batch_id DROP NOT NULL,
  ADD COLUMN feed_type_id uuid DEFAULT NULL REFERENCES public.feed_types(id),
  ADD COLUMN unit_snapshot text DEFAULT NULL,
  ADD COLUMN weight_per_unit_kg_snapshot numeric DEFAULT NULL,
  ADD COLUMN dm_pct_snapshot numeric DEFAULT NULL,
  ADD CONSTRAINT feed_check_pool_identity CHECK (
    (batch_id IS NOT NULL AND feed_type_id IS NULL)
    OR (batch_id IS NULL AND feed_type_id IS NOT NULL)
  ),
  ADD CONSTRAINT feed_check_pool_conversion CHECK (
    (weight_per_unit_kg_snapshot IS NULL OR (weight_per_unit_kg_snapshot > 0 AND weight_per_unit_kg_snapshot < 'Infinity'::numeric))
    AND (dm_pct_snapshot IS NULL OR dm_pct_snapshot BETWEEN 0 AND 100)
    AND (unit_snapshot IS NULL OR length(btrim(unit_snapshot)) > 0)
    AND (feed_type_id IS NULL OR (
      remaining_quantity >= 0 AND remaining_quantity < 'Infinity'::numeric
      AND (remaining_quantity = 0 OR (
        unit_snapshot IS NOT NULL AND weight_per_unit_kg_snapshot IS NOT NULL AND dm_pct_snapshot IS NOT NULL
      ))
    ))
  );
CREATE UNIQUE INDEX event_feed_check_pool_identity_unique
  ON public.event_feed_check_items (feed_check_id, location_id, feed_type_id)
  WHERE batch_id IS NULL AND feed_type_id IS NOT NULL;

ALTER TABLE public.event_feed_entries
  ALTER COLUMN batch_id DROP NOT NULL,
  ADD COLUMN feed_type_id uuid DEFAULT NULL REFERENCES public.feed_types(id),
  ADD COLUMN unit_snapshot text DEFAULT NULL,
  ADD COLUMN weight_per_unit_kg_snapshot numeric DEFAULT NULL,
  ADD COLUMN dm_pct_snapshot numeric DEFAULT NULL,
  ADD COLUMN kind text DEFAULT NULL,
  ADD COLUMN transfer_id uuid DEFAULT NULL,
  ADD COLUMN return_batch_id uuid DEFAULT NULL REFERENCES public.batches(id),
  ADD COLUMN return_storage_location_id uuid DEFAULT NULL REFERENCES public.locations(id),
  ADD CONSTRAINT feed_entry_pool_kind CHECK (
    CASE WHEN kind IS NULL THEN batch_id IS NOT NULL
    ELSE (kind = 'inventory_feeding' AND batch_id IS NOT NULL AND feed_type_id IS NOT NULL AND entry_type = 'delivery')
    OR (kind IN ('pool_carry', 'pool_removal') AND batch_id IS NULL AND feed_type_id IS NOT NULL AND transfer_id IS NOT NULL
      AND entry_type = CASE WHEN kind = 'pool_removal' THEN 'removal' ELSE 'delivery' END)
    END
  ),
  ADD CONSTRAINT feed_entry_pool_conversion CHECK (
    (weight_per_unit_kg_snapshot IS NULL OR (weight_per_unit_kg_snapshot > 0 AND weight_per_unit_kg_snapshot < 'Infinity'::numeric))
    AND (dm_pct_snapshot IS NULL OR dm_pct_snapshot BETWEEN 0 AND 100)
    AND (unit_snapshot IS NULL OR length(btrim(unit_snapshot)) > 0)
    AND (kind IS NULL OR kind = 'inventory_feeding' OR (
      quantity > 0 AND quantity < 'Infinity'::numeric
      AND unit_snapshot IS NOT NULL AND weight_per_unit_kg_snapshot IS NOT NULL AND dm_pct_snapshot IS NOT NULL
    ))
  ),
  ADD CONSTRAINT feed_entry_return_destination CHECK (
    (return_batch_id IS NULL AND return_storage_location_id IS NULL)
    OR (return_batch_id IS NOT NULL AND return_storage_location_id IS NOT NULL AND kind IS NOT NULL AND kind = 'pool_removal' AND destination_type IS NOT NULL AND destination_type = 'batch')
  );
-- transfer_id is a shared durable operation token, not a cyclic entry FK.
-- Batches and storage locations already precede entries in backup FK order.
UPDATE public.operations SET schema_version = 43 WHERE schema_version < 43;
COMMIT;
