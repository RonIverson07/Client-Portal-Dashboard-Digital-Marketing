import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val.replace(/(^["']|["']$)/g, '');
    }
  });
}

async function checkTasks() {
  const { supabaseAdmin } = await import('../lib/supabase');
  const { data: tasks, error } = await supabaseAdmin
    .from('tasks')
    .select('id, title, status, clickup_task_id');

  if (error) {
    console.error('Error fetching tasks:', error);
    return;
  }

  console.log('--- Database Tasks ---');
  tasks.forEach(t => {
    console.log(`- ID: ${t.id} | Title: "${t.title}" | Status: ${t.status} | ClickUp ID: ${t.clickup_task_id}`);
  });
}

checkTasks();
