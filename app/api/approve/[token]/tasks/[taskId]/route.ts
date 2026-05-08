import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

interface RouteParams {
  params: { token: string; taskId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', params.taskId)
    .eq('client_id', client.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const { status } = await req.json();
  const validStatuses = ['for_review', 'approved', 'for_revision'];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const { data: updatedTask, error: updateError } = await supabase
    .from('tasks')
    .update({ 
      status, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', params.taskId)
    .select()
    .single();

  if (updateError) {
    console.error('Update task status error:', updateError);
    return NextResponse.json({ error: 'Failed to update status.' }, { status: 500 });
  }

  await supabase.from('activity_log').insert([
    { 
      task_id: params.taskId, 
      client_id: client.id, 
      user_type: 'client', 
      action_type: 'status_change', 
      previous_value: task.status, 
      new_value: status 
    }
  ]);

  return NextResponse.json({ task: updatedTask });
}
