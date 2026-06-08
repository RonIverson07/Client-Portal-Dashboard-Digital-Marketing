import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest as verifyAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { 
  getClickUpTasksFromList, 
  mapClickUpStatusToSystem,
  extractGoogleDriveLink,
  extractClientName,
  extractCaption
} from '@/lib/clickup';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get ClickUp settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    console.log('Settings from DB:', settings);

    if (settingsError) throw settingsError;
    if (!settings?.clickup_api_token || !settings?.clickup_list_id) {
      return NextResponse.json({ error: 'ClickUp API token or List ID not set' }, { status: 400 });
    }

    // 2. Get tasks from ClickUp - from both List IDs if available
    const listIds = [settings.clickup_list_id];
    if (settings.clickup_list_id_2) {
      listIds.push(settings.clickup_list_id_2);
    }
    if (settings.clickup_list_id_3) {
      listIds.push(settings.clickup_list_id_3);
    }
    console.log('Fetching tasks from ClickUp lists:', listIds);
    
    const allClickupTasks = [];
    for (const listId of listIds) {
      console.log('Fetching tasks from list:', listId);
      const clickupData = await getClickUpTasksFromList(settings.clickup_api_token, listId);
      if (clickupData.tasks) {
        allClickupTasks.push(...clickupData.tasks);
      }
    }
    console.log('Total tasks received from ClickUp:', allClickupTasks.length);
    console.log('First task example:', allClickupTasks[0] ? JSON.stringify(allClickupTasks[0], null, 2) : 'None');

    // 3. Get existing tasks from our system
    const { data: existingTasks, error: tasksError } = await supabaseAdmin
      .from('tasks')
      .select('id, clickup_task_id');
    
    if (tasksError) throw tasksError;

    const existingTaskMap = new Map(existingTasks?.map(t => [t.clickup_task_id, t.id]) || []);

    // 4. Get all clients from our system for matching
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, company_name');
    
    if (clientsError) throw clientsError;

    console.log('Clients in system:', clients);

    const clientMap = new Map(clients?.map(c => [c.company_name, c.id]) || []);
    const defaultClientId = clients?.length > 0 ? clients[0].id : null;
    
    if (!defaultClientId) {
      return NextResponse.json({ error: 'No clients found in system' }, { status: 400 });
    }

    let newCount = 0;
    let updatedCount = 0;

    // 5. Process each ClickUp task
    for (const task of allClickupTasks) {
      const taskId = task.id;
      const existingTaskDbId = existingTaskMap.get(taskId);
      const clickupStatus = task.status?.status || '';
      let systemStatus = mapClickUpStatusToSystem(clickupStatus, settings);
      
      // Override status based on which list the task belongs to
      if (settings.clickup_list_id_2 && task.list?.id === settings.clickup_list_id_2) {
        systemStatus = 'published';
      } else if (settings.clickup_list_id_3 && task.list?.id === settings.clickup_list_id_3) {
        systemStatus = 'for_revision';
      }

      const driveUrl = extractGoogleDriveLink(task);
      const clientName = extractClientName(task);
      const caption = extractCaption(task);

      console.log(`Processing task ${taskId}:`, {
        name: task.name,
        clickupStatus,
        systemStatus,
        driveUrl,
        clientName,
        customFields: task.custom_fields
      });

      // Find client ID - if client name matches, use it, otherwise default
      let clientId = defaultClientId;
      if (clientName) {
        const matchedClientId = clientMap.get(clientName);
        if (matchedClientId) {
          clientId = matchedClientId;
        }
      }

      const taskData = {
        client_id: clientId,
        title: task.name,
        image_url: driveUrl || 'https://example.com/placeholder.jpg',
        caption: caption,
        status: systemStatus,
        clickup_task_id: taskId,
        created_by: user.id,
      };

      if (existingTaskDbId) {
        // Update existing task
        const { error } = await supabaseAdmin
          .from('tasks')
          .update({
            ...taskData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingTaskDbId);
        if (!error) {
          updatedCount++;
          console.log(`Updated task ${taskId}`);
        } else {
          console.error('Failed to update task:', error);
        }
      } else {
        // Create new task
        const { error } = await supabaseAdmin
          .from('tasks')
          .insert([taskData]);
        if (!error) {
          newCount++;
          console.log(`Created new task ${taskId}`);
        } else {
          console.error('Failed to create task:', error);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sync complete! ${newCount} new task(s), ${updatedCount} updated task(s)`,
      newTasksCount: newCount,
      updatedTasksCount: updatedCount,
      tasksProcessed: allClickupTasks.length
    });
  } catch (error: any) {
    console.error('ClickUp Sync Error:', error);
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
