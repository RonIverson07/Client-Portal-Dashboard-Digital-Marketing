export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface RouteParams { params: { token: string }; }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, company_name, contact_name, logo_url, created_at')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  // Fetch tasks and comment counts
  const { data: rawTasks, error: tasksError } = await supabase
    .from('tasks')
    .select(`
      id, title, image_url, caption, status, created_at, updated_at,
      comments (count)
    `)
    .eq('client_id', client.id)
    .neq('status', 'published');

  if (tasksError) {
    console.error('Fetch approval tasks error:', tasksError);
    return NextResponse.json({ error: 'Failed to fetch tasks.' }, { status: 500 });
  }

  // Sort tasks in JS to match previous SQLite CASE logic
  const statusPriority: Record<string, number> = {
    'for_review': 0,
    'for_revision': 1,
    'approved': 2
  };

  const tasks = (rawTasks || []).map((t: any) => ({
    ...t,
    comment_count: t.comments?.[0]?.count || 0,
    comments: undefined
  })).sort((a: any, b: any) => {
    const priorityA = statusPriority[a.status] ?? 99;
    const priorityB = statusPriority[b.status] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json({ client, tasks });
}
