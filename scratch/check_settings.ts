import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabaseAdmin.from('settings').select('*').limit(1);
  console.log('Data:', data);
  console.log('Error:', error);
}

check();
