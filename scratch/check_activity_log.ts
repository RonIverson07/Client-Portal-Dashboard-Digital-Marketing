import fs from 'fs';
import path from 'path';

// Load env vars
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      process.env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/(^["']|["']$)/g, '');
    }
  });
}

async function checkActivityLog() {
  const { supabaseAdmin } = await import('../lib/supabase');
  const { data: logs } = await supabaseAdmin
    .from('activity_log')
    .select('*')
    .eq('task_id', 151)
    .order('created_at', { ascending: false });

  console.log('Activity logs for task 151:', JSON.stringify(logs, null, 2));
}

checkActivityLog();
