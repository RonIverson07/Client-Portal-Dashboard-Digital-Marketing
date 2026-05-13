import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkTaskColumns() {
  const { data, error } = await supabaseAdmin.from('project_tasks').select('*').limit(1);
  if (data && data.length > 0) {
    console.log('Columns in project_tasks:', Object.keys(data[0]));
  }
}

checkTaskColumns();
