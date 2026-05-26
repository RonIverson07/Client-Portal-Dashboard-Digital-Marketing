-- Supports single image or Drive folder image sets for task carousel.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT NULL;
