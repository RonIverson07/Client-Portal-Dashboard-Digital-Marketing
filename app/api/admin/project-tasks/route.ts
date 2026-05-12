import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tasks, error } = await supabase.from('project_tasks').select('*').order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const { data: task, error } = await supabase.from('project_tasks').insert([data]).select().single();
    if (error) throw error;

    // Log creation
    await supabase.from('activity_log').insert([{
      task_id: task.id,
      action_type: 'creation',
      new_value: task.status,
      user_type: 'admin'
    }]);

    return NextResponse.json(task);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, ...updates } = await req.json();

    // 1. Fetch current state for logging
    const { data: currentTask } = await supabase.from('project_tasks').select('id, status, is_archived').eq('id', id).single();

    // 2. Perform update
    const { data, error } = await supabase.from('project_tasks').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // 3. Log changes if applicable
    if (currentTask) {
      const logs = [];
      if (updates.status && currentTask.status !== updates.status) {
        logs.push({
          task_id: id,
          action_type: 'status_change',
          previous_value: currentTask.status,
          new_value: updates.status,
          user_type: 'admin'
        });
      }
      if (updates.is_archived !== undefined && currentTask.is_archived !== updates.is_archived) {
        logs.push({
          task_id: id,
          action_type: updates.is_archived ? 'archive' : 'unarchive',
          previous_value: currentTask.is_archived ? 'archived' : 'active',
          new_value: updates.is_archived ? 'archived' : 'active',
          user_type: 'admin'
        });
      }

      if (logs.length > 0) {
        await supabase.from('activity_log').insert(logs);
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  const ids = id.split(',');

  try {
    const { error } = await supabase.from('project_tasks').delete().in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
