-- OI-0057: Reset animal_classes rate-bearing fields from NRCS seed-data per
-- OI-0127's role alignment. Operation-scoped, idempotent (re-runnable safely).
-- Keeps name, species, id, operation_id, archived, created_at intact.
--
-- Scope: Tim's operation 'Down East Beef and Lamb' (ef11ee62-...).
-- Pre-patch state: every rate-bearing column is NULL, weaning_age_days=300
-- on every row (v1-migration's old weanTargets.cattle || 205 value has since
-- drifted). Role tags vary — Heifer/Ewe/Ram/Lamb/Buck/Doe were all inferred
-- 'cow' by v1-migration's inferRole fallback. Patch is role-keyed per
-- spec §2c: rows with role='cow' all receive cow defaults (Tim can re-file
-- the mis-tagged ones via the OI-0128 Edit form by delete-and-re-add).

DO $$
DECLARE
  tim_op_id uuid := 'ef11ee62-b720-4f0c-848a-18e1dd93de30';
BEGIN
  -- cow (dam) — lactating DMI stays, weaning moves to calf per OI-0127.
  UPDATE animal_classes SET
    default_weight_kg = 545, dmi_pct = 2.5, dmi_pct_lactating = 3.0,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'cow';

  -- heifer (non-dam, non-offspring) — no lactating DMI, no weaning.
  UPDATE animal_classes SET
    default_weight_kg = 363, dmi_pct = 2.5, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'heifer';

  -- bull (male adult) — no lactating, no weaning.
  UPDATE animal_classes SET
    default_weight_kg = 727, dmi_pct = 2.0, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'bull';

  -- steer (castrated male) — no lactating, no weaning.
  UPDATE animal_classes SET
    default_weight_kg = 454, dmi_pct = 2.5, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = NULL,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'steer';

  -- calf (offspring) — weaning_age_days lives here per OI-0127.
  UPDATE animal_classes SET
    default_weight_kg = 113, dmi_pct = 3.0, dmi_pct_lactating = NULL,
    excretion_n_rate = 0.145, excretion_p_rate = 0.041, excretion_k_rate = 0.136,
    weaning_age_days = 205,
    updated_at = now()
  WHERE operation_id = tim_op_id AND role = 'calf';
END $$;

-- Bump schema_version per CLAUDE.md §"Code Quality Checks #6".
UPDATE operations SET schema_version = 31;
