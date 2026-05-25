-- Time estimate for workload (hours). Safe to re-run.
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS time_estimate_hours REAL DEFAULT NULL;
