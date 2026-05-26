-- Task cover for board cards (upload URL or Google Drive link). Edit-only in app. Safe to re-run.
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT NULL;
