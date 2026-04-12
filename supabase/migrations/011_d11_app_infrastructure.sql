-- Domain 11: App Infrastructure
-- Source: V2_SCHEMA_DESIGN.md §11.1–§11.5

-- §11.1 app_logs (direct-write, no sync queue — A24)
CREATE TABLE app_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  operation_id    uuid,
  session_id      text,
  level           text NOT NULL DEFAULT 'error',
  source          text NOT NULL,
  message         text NOT NULL,
  stack           text,
  context         jsonb,
  app_version     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_logs_select ON app_logs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY app_logs_insert ON app_logs FOR INSERT
  WITH CHECK (true);

-- §11.2 submissions
CREATE TABLE submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id          uuid NOT NULL REFERENCES operations(id),
  submitter_id          uuid,
  app                   text NOT NULL DEFAULT 'gthy',
  type                  text NOT NULL,
  category              text,
  area                  text,
  screen                text,
  priority              text NOT NULL DEFAULT 'normal',
  status                text NOT NULL DEFAULT 'open',
  note                  text,
  version               text,
  thread                jsonb DEFAULT '[]',
  dev_response          text,
  dev_response_ts       timestamptz,
  first_response_at     timestamptz,
  resolved_in_version   text,
  resolution_note       text,
  oi_number             text,
  linked_to             uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY submissions_all ON submissions FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §11.3 todos
CREATE TABLE todos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    uuid NOT NULL REFERENCES operations(id),
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'open',
  note            text,
  location_id     uuid REFERENCES locations(id),
  animal_id       uuid REFERENCES animals(id),
  due_date        date,
  created_by      uuid REFERENCES operation_members(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY todos_all ON todos FOR ALL
  USING (operation_id IN (
    SELECT operation_id FROM operation_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- §11.4 todo_assignments
CREATE TABLE todo_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id         uuid NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES operation_members(id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (todo_id, user_id)
);

ALTER TABLE todo_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_assignments_all ON todo_assignments FOR ALL
  USING (todo_id IN (
    SELECT id FROM todos WHERE operation_id IN (
      SELECT operation_id FROM operation_members
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  ));

-- §11.5 release_notes
CREATE TABLE release_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now()
);

-- No RLS — public read
