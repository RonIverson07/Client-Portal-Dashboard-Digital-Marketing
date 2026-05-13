import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkActivityLog() {
  const { data: logs, error: logError } = await supabaseAdmin
    .from('activity_log')
    .select('task_id')
    .limit(5);

  const { data: tasks, error: taskError } = await supabaseAdmin
    .from('project_tasks')
    .select('id')
    .limit(5);

  console.log('Sample Task IDs from activity_log:', logs?.map(l => l.task_id));
  console.log('Sample IDs from project_tasks:', tasks?.map(t => t.id));
}

checkActivityLog();
