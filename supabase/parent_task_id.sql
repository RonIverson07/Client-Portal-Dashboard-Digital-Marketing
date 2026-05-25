-- Mind map parent → child links (run this script in Supabase SQL editor)
-- Adds parent_task_id column + RLS policy for branching support.

-- 1. Add the parent_task_id column
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id TEXT REFERENCES project_tasks(id) ON DELETE SET NULL;

-- 2. Index for fast child lookups
CREATE INDEX IF NOT EXISTS project_tasks_parent_task_id_idx ON project_tasks (parent_task_id);

-- 3. Ensure RLS allows inserting/updating rows with parent_task_id.
--    If your table already has INSERT / UPDATE policies, the column is automatically
--    covered. The statements below add explicit policies only if you haven't created
--    any yet. Adjust the policy names to avoid conflicts with your existing policies.

-- Allow service-role (admin API routes) full access (bypasses RLS by default,
-- but this is here as a safety net if you ever enable RLS on project_tasks).
DO $$
BEGIN
  -- Create a permissive policy for authenticated users if one doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_tasks'
      AND policyname = 'Allow full access for service role'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "Allow full access for service role" ON project_tasks FOR ALL USING (true) WITH CHECK (true)'
    );
  END IF;
END
$$;
