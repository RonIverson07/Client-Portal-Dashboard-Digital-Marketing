import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkNotNull() {
  const { data, error } = await supabaseAdmin.from('activity_log').insert([{
    task_id: 'a52623a9-8288-4f11-a32c-7f97fd5dc92a',
    action_type: 'test_insert'
  }]);

  if (error) {
    console.error('Insert failed with error:', error.message);
  } else {
    console.log('Insert succeeded! No extra required columns.');
  }
}

checkNotNull();
