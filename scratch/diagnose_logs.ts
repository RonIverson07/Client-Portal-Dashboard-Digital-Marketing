import { supabaseAdmin } from '../lib/supabaseAdmin';

async function diagnose() {
  // Test 1: Try inserting with a real task_id but no client_id
  const { error: err1 } = await supabaseAdmin.from('activity_log').insert([{
    task_id: 'a52623a9-8288-4f11-a32c-7f97fd5dc92a',
    action_type: 'test_status_change',
    previous_value: 'TO DO',
    new_value: 'PLANNING',
    user_type: 'admin'
  }]);
  console.log('Test 1 (no client_id):', err1 ? `FAILED: ${err1.message}` : 'SUCCESS');

  // Test 2: Try inserting WITH a client_id
  const { error: err2 } = await supabaseAdmin.from('activity_log').insert([{
    task_id: 'a52623a9-8288-4f11-a32c-7f97fd5dc92a',
    client_id: 0,
    action_type: 'test_with_client',
    previous_value: 'TO DO',
    new_value: 'PLANNING',
    user_type: 'admin'
  }]);
  console.log('Test 2 (with client_id=0):', err2 ? `FAILED: ${err2.message}` : 'SUCCESS');

  // Show all unique task_ids to see the problem
  const { data: allLogs } = await supabaseAdmin.from('activity_log').select('task_id').limit(100);
  const uniqueIds = [...new Set(allLogs?.map(l => l.task_id))];
  console.log('Unique task_ids in activity_log:', uniqueIds);
}

diagnose();
