import { supabaseAdmin as supabase } from '../lib/supabaseAdmin';

async function checkStorage() {
  const { data, error } = await supabase.storage.listBuckets();
  console.log('Buckets:', data);
  console.log('Error:', error);
}

checkStorage();
