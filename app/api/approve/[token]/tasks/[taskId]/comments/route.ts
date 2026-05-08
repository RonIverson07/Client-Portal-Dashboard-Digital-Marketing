import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

interface RouteParams {
  params: { token: string; taskId: string };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', params.taskId)
    .eq('client_id', client.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const { data: comments, error: commentsError } = await supabase
    .from('comments')
    .select('*')
    .eq('task_id', params.taskId)
    .order('created_at', { ascending: true });

  if (commentsError) {
    console.error('Fetch comments error:', commentsError);
    return NextResponse.json({ error: 'Failed to fetch comments.' }, { status: 500 });
  }

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', params.taskId)
    .eq('client_id', client.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const { author_name, comment_text } = await req.json();

  if (!comment_text?.trim()) {
    return NextResponse.json({ error: 'Comment text is required.' }, { status: 400 });
  }

  const sanitizedText = comment_text.trim().substring(0, 2000);
  const sanitizedAuthor = (author_name?.trim() || 'Client').substring(0, 100);

  const { data: comment, error: insertError } = await supabase
    .from('comments')
    .insert([
      { 
        task_id: params.taskId, 
        client_id: client.id, 
        author_name: sanitizedAuthor, 
        comment_text: sanitizedText 
      }
    ])
    .select()
    .single();

  if (insertError) {
    console.error('Insert comment error:', insertError);
    return NextResponse.json({ error: 'Failed to add comment.' }, { status: 500 });
  }

  await supabase.from('activity_log').insert([
    { 
      task_id: params.taskId, 
      client_id: client.id, 
      user_type: 'client', 
      action_type: 'comment_added', 
      new_value: sanitizedText.substring(0, 200) 
    }
  ]);

  return NextResponse.json({ comment }, { status: 201 });
}
