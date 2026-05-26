import fs from 'fs';
import path from 'path';

// Manually load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
}

async function run() {
  const { supabaseAdmin } = await import('../lib/supabaseAdmin');

  console.log('Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { data, error } = await supabaseAdmin.from('project_tasks').select('*').limit(1);
  if (error) {
    console.error('Error fetching columns:', error);
  } else if (data && data.length > 0) {
    console.log('Columns in project_tasks:', Object.keys(data[0]));
  } else {
    console.log('No tasks found, table might be empty.');
  }
}

run();
