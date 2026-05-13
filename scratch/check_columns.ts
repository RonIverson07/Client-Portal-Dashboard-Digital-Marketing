import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkColumns() {
  const { data, error } = await supabaseAdmin
    .from('project_tasks')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching task:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Available columns in project_tasks:', Object.keys(data[0]));
  } else {
    console.log('No tasks found to inspect columns.');
  }
}

checkColumns();
