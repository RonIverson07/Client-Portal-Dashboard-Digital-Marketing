export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { updateClickUpTaskStatus, updateClickUpTaskTitle, updateClickUpDesignOutputLink, updateClickUpCaption, updateClickUpTaskDescription, updateClickUpClient } from '@/lib/clickup';

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select(`
      *,
      clients (company_name)
    `)
    .eq('id', params.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const formattedTask = {
    ...task,
    company_name: task.clients?.company_name,
    clients: undefined
  };

  const { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('task_id', params.id)
    .order('created_at', { ascending: true });

  const { data: activity } = await supabase
    .from('activity_log')
    .select('*')
    .eq('task_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ task: formattedTask, comments, activity });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { client_id, title, image_url, image_urls, caption, status } = await req.json();
    console.log('--- TASK UPDATE DEBUG ---');
    console.log('Updating Task ID:', params.id);
    console.log('New Client ID received:', client_id);
    console.log('Received fields:', { client_id, title, image_url, image_urls, caption, status });
    console.log('-------------------------');

    // Only validate required fields if we're actually updating them
    if (title !== undefined && !title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (image_url !== undefined && !image_url?.trim()) return NextResponse.json({ error: 'Image URL is required.' }, { status: 400 });
    if (caption !== undefined && !caption?.trim()) return NextResponse.json({ error: 'Caption is required.' }, { status: 400 });

    const validStatuses = ['for_review', 'approved', 'for_revision', 'published'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const { data: current, error: fetchError } = await supabase
      .from('tasks')
      .select(`
        *,
        clients (company_name)
      `)
      .eq('id', params.id)
      .single();

    if (fetchError || !current) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        client_id: client_id !== undefined ? Number(client_id) : current.client_id,
        title: title !== undefined ? title.trim() : current.title,
        image_url: image_url !== undefined ? image_url.trim() : current.image_url,
        image_urls: image_urls !== undefined ? (Array.isArray(image_urls) ? image_urls : null) : current.image_urls,
        caption: caption !== undefined ? caption.trim() : current.caption,
        status: status || current.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select(`
        *,
        clients (company_name)
      `)
      .single();

    if (updateError) throw updateError;

    console.log('--- TASK UPDATE RESULT ---');
    console.log('Task ID:', params.id, '| Old client_id:', current.client_id, '| New client_id:', updatedTask?.client_id);
    console.log('--------------------------');

    if (status && status !== current.status) {
      await supabase.from('activity_log').insert([
        { 
          task_id: params.id, 
          client_id: current.client_id, 
          user_type: 'admin', 
          action_type: 'status_change', 
          previous_value: current.status, 
          new_value: status 
        }
      ]);

      // Sync status change to ClickUp if task has a ClickUp ID
      if (current.clickup_task_id) {
        // Get ClickUp settings
        const { data: settings, error: settingsError } = await supabase
          .from('settings')
          .select('*')
          .eq('id', 1)
          .single();

        if (!settingsError && settings?.clickup_api_token) {
          try {
            await updateClickUpTaskStatus(settings.clickup_api_token, current.clickup_task_id, status, settings);
          } catch (clickupErr) {
            console.error('Failed to update ClickUp task status:', clickupErr);
            // Don't fail the whole request if ClickUp sync fails
          }
        }
      }
    }

    // Sync title change to ClickUp if task has a ClickUp ID
  if (title && title.trim() !== current.title && current.clickup_task_id) {
    // Get ClickUp settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (!settingsError && settings?.clickup_api_token) {
      try {
        await updateClickUpTaskTitle(settings.clickup_api_token, current.clickup_task_id, title.trim());
      } catch (clickupErr) {
        console.error('Failed to update ClickUp task title:', clickupErr);
        // Don't fail the whole request if ClickUp sync fails
      }
    }
  }

  // Sync image_url to ClickUp as "Design Output Link" custom field
  console.log('Checking if need to update Design Output Link:', {
    image_url,
    currentImageUrl: current.image_url,
    clickupTaskId: current.clickup_task_id,
  });
  
  // If there's a ClickUp task ID and we have an image_url, try to sync (even if it hasn't changed locally)
  if (image_url && current.clickup_task_id) {
    console.log('Proceeding to update Design Output Link in ClickUp');
    // Get ClickUp settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (!settingsError && settings?.clickup_api_token) {
      try {
        console.log('Calling updateClickUpDesignOutputLink with:', {
          taskId: current.clickup_task_id,
          link: image_url.trim(),
        });
        await updateClickUpDesignOutputLink(settings.clickup_api_token, current.clickup_task_id, image_url.trim());
      } catch (clickupErr) {
        console.error('Failed to update ClickUp task Design Output Link:', clickupErr);
        // Don't fail the whole request if ClickUp sync fails
      }
    } else {
      console.warn('Skipping ClickUp sync because settings error or no API token:', {
        settingsError,
        hasApiToken: !!settings?.clickup_api_token,
      });
    }
  } else {
    console.log('Not updating Design Output Link: no image_url or no ClickUp task ID');
  }

  // Sync caption to ClickUp as "Caption" custom field AND task description
  if (caption && current.clickup_task_id) {
    // Get ClickUp settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (!settingsError && settings?.clickup_api_token) {
      try {
        // Update both the "Caption" custom field and the ClickUp task description
        await updateClickUpCaption(settings.clickup_api_token, current.clickup_task_id, caption.trim());
        await updateClickUpTaskDescription(settings.clickup_api_token, current.clickup_task_id, caption.trim());
      } catch (clickupErr) {
        console.error('Failed to update ClickUp task Caption/Description:', clickupErr);
        // Don't fail the whole request if ClickUp sync fails
      }
    }
  }

  // Sync Client to ClickUp custom field
  console.log('=== DEBUG CLIENT SYNC START ===');
  console.log('current.clickup_task_id:', current.clickup_task_id);
  console.log('current:', JSON.stringify(current, null, 2));
  console.log('client_id:', client_id);
  console.log('updatedTask:', JSON.stringify(updatedTask, null, 2));
  if (current.clickup_task_id) {
    console.log('✅ Entered Client sync block');
    let clientName = null;
    
    // Check if updatedTask has clients
    if (updatedTask?.clients?.company_name) {
      clientName = updatedTask.clients.company_name;
    } 
    // Otherwise, if client_id was provided, fetch the client
    else if (client_id !== undefined) {
      const { data: client } = await supabase
        .from('clients')
        .select('company_name')
        .eq('id', Number(client_id))
        .single();
      clientName = client?.company_name;
    }
    // Fallback to current client if available
    else if (current?.clients?.company_name) {
      clientName = current.clients.company_name;
    }

    if (clientName) {
      console.log('Proceeding to update Client custom field in ClickUp:', {
        clientName,
      });
      // Get ClickUp settings
      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (!settingsError && settings?.clickup_api_token) {
        try {
          await updateClickUpClient(settings.clickup_api_token, current.clickup_task_id, clientName);
        } catch (clickupErr) {
          console.error('Failed to update ClickUp task Client custom field:', clickupErr);
          // Don't fail the whole request if ClickUp sync fails
        }
      }
    } else {
      console.log('No client name found to sync to ClickUp');
    }
  }

    const formattedTask = {
      ...updatedTask,
      company_name: updatedTask.clients?.company_name,
      clients: undefined
    };

    return NextResponse.json({ task: formattedTask });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Failed to update task.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', params.id);

  if (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Failed to delete task.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
