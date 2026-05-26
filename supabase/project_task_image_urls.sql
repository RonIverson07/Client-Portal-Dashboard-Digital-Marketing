-- Multi-image gallery for Spaces board task covers (Google Drive folders)
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT NULL;
