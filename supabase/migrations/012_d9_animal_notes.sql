-- Domain 9 amendment: animal_notes
-- Source: OI-0003 resolution — per-animal quick notes

CREATE TABLE animal_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES operations(id),
  animal_id     uuid NOT NULL REFERENCES animals(id),
  noted_at      timestamptz NOT NULL,
  note          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE animal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY animal_notes_all ON animal_notes FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));
