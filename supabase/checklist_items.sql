-- Checklist items for project tasks. Safe to re-run.
-- Run this in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS checklist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  text        TEXT NOT NULL DEFAULT '',
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by task
CREATE INDEX IF NOT EXISTS checklist_items_task_id_idx ON checklist_items(task_id);

-- Disable RLS (admin-only service role access via supabaseAdmin client)
ALTER TABLE checklist_items DISABLE ROW LEVEL SECURITY;
