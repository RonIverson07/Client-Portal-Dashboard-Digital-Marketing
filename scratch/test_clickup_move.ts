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
      process.env[key] = val.replace(/(^["']|["']$)/g, ''); // strip optional quotes
    }
  });
}

async function testMove() {
  const { supabaseAdmin } = await import('../lib/supabase');
  const { updateClickUpTaskStatus } = await import('../lib/clickup');

  console.log('Fetching settings...');
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (settingsError || !settings) {
    console.error('Failed to load settings:', settingsError);
    return;
  }

  console.log('Loaded Settings successfully.');
  console.log('List 1:', settings.clickup_list_id);
  console.log('List 2:', settings.clickup_list_id_2);
  console.log('List 3:', settings.clickup_list_id_3);

  console.log('\nFetching task "Task will move to revise"...');
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .ilike('title', '%Task will move to revise%')
    .single();

  if (taskError || !task) {
    console.error('Failed to find task in DB:', taskError);
    return;
  }

  console.log('Found Task in DB:', {
    id: task.id,
    title: task.title,
    status: task.status,
    clickup_task_id: task.clickup_task_id
  });

  if (!task.clickup_task_id) {
    console.error('Task does not have a ClickUp Task ID associated!');
    return;
  }

  console.log('\nAttempting to run updateClickUpTaskStatus with "for_revision"...');
  try {
    const res = await updateClickUpTaskStatus(
      settings.clickup_api_token,
      task.clickup_task_id,
      'for_revision',
      settings
    );
    console.log('Result of updateClickUpTaskStatus:', res);
  } catch (error: any) {
    console.error('Error during execution:', error);
  }
}

testMove();
