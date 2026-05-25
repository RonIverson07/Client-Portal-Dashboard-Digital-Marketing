-- Marks mind-map-only steps (children from + on a node). Safe to re-run.
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS is_mind_map_step BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS project_tasks_is_mind_map_step_idx ON project_tasks (is_mind_map_step)
  WHERE is_mind_map_step = TRUE;

-- Backfill existing branches that already have a parent link (does not delete rows)
UPDATE project_tasks
SET is_mind_map_step = TRUE
WHERE parent_task_id IS NOT NULL AND (is_mind_map_step IS NULL OR is_mind_map_step = FALSE);
