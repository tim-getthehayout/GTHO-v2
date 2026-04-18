-- OI-0111: Settings UI unit-conversion sweep — rename the bale-ring residue
-- diameter column from imperial (ft) to metric (cm) to match v2's metric-internal
-- storage rule. The UI displays in the user's preferred unit system; this column
-- was the single farm_settings holdout storing imperial natively.
--
-- Convert any existing values by multiplying by 30.48 (1 ft = 30.48 cm). Default
-- set to 365.76 cm (= 12 ft), matching the BRC-1 calc's imperial default.
--
-- CP-55/CP-56 impact: BACKUP_MIGRATIONS[26] renames the column + multiplies by
-- 30.48 for imported backups from schema_version ≤ 26.

ALTER TABLE farm_settings ADD COLUMN IF NOT EXISTS bale_ring_residue_diameter_cm numeric(6,2);

UPDATE farm_settings
  SET bale_ring_residue_diameter_cm = ROUND((bale_ring_residue_diameter_ft * 30.48)::numeric, 2)
  WHERE bale_ring_residue_diameter_ft IS NOT NULL
    AND bale_ring_residue_diameter_cm IS NULL;

ALTER TABLE farm_settings ALTER COLUMN bale_ring_residue_diameter_cm SET DEFAULT 365.76;
ALTER TABLE farm_settings DROP COLUMN IF EXISTS bale_ring_residue_diameter_ft;

UPDATE operations SET schema_version = 27 WHERE schema_version < 27;
