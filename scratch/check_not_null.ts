import { supabaseAdmin } from '../lib/supabaseAdmin';

async function checkNotNull() {
  const { data, error } = await supabaseAdmin.from('activity_log').insert([{
    action_type: 'test_insert'
  }]);

  if (error) {
    console.error('Insert failed with error:', error.message);
    if (error.message.includes('null value in column')) {
      console.log('Found required column:', error.message);
    }
  } else {
    console.log('Insert succeeded! No extra required columns.');
  }
}

checkNotNull();
