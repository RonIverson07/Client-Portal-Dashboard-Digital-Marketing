import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkSchema() {
  const { data, error } = await supabaseAdmin.rpc('get_table_columns', { table_name: 'activity_log' });
  // If rpc doesn't exist, we can try to insert a string and see the error
  
  console.log('Testing insert of UUID into activity_log...');
  const { error: insertError } = await supabaseAdmin.from('activity_log').insert([{
    task_id: 'a52623a9-8288-4f11-a32c-7f97fd5dc92a',
    action_type: 'test'
  }]);

  if (insertError) {
    console.error('Insert failed:', insertError.message);
  } else {
    console.log('Insert succeeded! task_id supports UUID.');
  }
}

checkSchema();
