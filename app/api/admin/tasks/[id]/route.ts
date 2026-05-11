export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

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
    const { client_id, title, image_url, caption, status } = await req.json();
    console.log('--- TASK UPDATE DEBUG ---');
    console.log('Updating Task ID:', params.id);
    console.log('New Client ID received:', client_id);
    console.log('-------------------------');

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!image_url?.trim()) return NextResponse.json({ error: 'Image URL is required.' }, { status: 400 });
    if (!caption?.trim()) return NextResponse.json({ error: 'Caption is required.' }, { status: 400 });

    const validStatuses = ['for_review', 'approved', 'for_revision', 'published'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const { data: current, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !current) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        client_id: client_id !== undefined ? Number(client_id) : current.client_id,
        title: title.trim(),
        image_url: image_url.trim(),
        caption: caption.trim(),
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
