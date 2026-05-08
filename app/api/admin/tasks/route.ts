import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('tasks')
    .select(`
      *,
      clients (company_name),
      comments (count)
    `)
    .order('created_at', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data: rawTasks, error } = await query;

  if (error) {
    console.error('Fetch tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks.' }, { status: 500 });
  }

  const tasks = (rawTasks || []).map((t: any) => ({
    ...t,
    company_name: t.clients?.company_name,
    comment_count: t.comments?.[0]?.count || 0,
    clients: undefined,
    comments: undefined
  }));

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { client_id, title, image_url, caption } = await req.json();

    if (!client_id) return NextResponse.json({ error: 'Client is required.' }, { status: 400 });
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!image_url?.trim()) return NextResponse.json({ error: 'Image URL is required.' }, { status: 400 });
    if (!caption?.trim()) return NextResponse.json({ error: 'Caption is required.' }, { status: 400 });

    // Check if client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert([
        { 
          client_id, 
          title: title.trim(), 
          image_url: image_url.trim(), 
          caption: caption.trim(), 
          status: 'for_review', 
          created_by: admin.id 
        }
      ])
      .select(`
        *,
        clients (company_name)
      `)
      .single();

    if (taskError) throw taskError;

    const formattedTask = {
      ...task,
      company_name: task.clients?.company_name,
      clients: undefined
    };

    // Log activity
    await supabase.from('activity_log').insert([
      { 
        task_id: task.id, 
        client_id, 
        user_type: 'admin', 
        action_type: 'task_created', 
        new_value: 'for_review' 
      }
    ]);

    return NextResponse.json({ task: formattedTask }, { status: 201 });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task.' }, { status: 500 });
  }
}
