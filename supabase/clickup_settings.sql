ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_space_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_folder_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_list_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_status_for_review TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_status_approved TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_status_for_revision TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS clickup_status_published TEXT;
