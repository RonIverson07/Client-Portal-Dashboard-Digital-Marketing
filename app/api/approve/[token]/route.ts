export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

interface RouteParams { params: { token: string }; }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, company_name, contact_name, logo_url, created_at')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) {
    console.error('DEBUG: Client not found for token:', params.token);
    return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });
  }

  const { data: allTasks, error: tasksError } = await supabase
    .from('tasks')
    .select(`
      id, client_id, title, image_url, caption, status, created_at, updated_at,
      comments (count)
    `)
    .neq('status', 'published');

  const clientId = Number(client.id);
  const rawTasks = (allTasks || []).filter(t => Number(t.client_id) === clientId);

  console.log('--- SYNC DEBUG (BULLDOZER) ---');
  console.log('Client Name:', client.company_name, '(ID:', clientId, ')');
  console.log('Total tasks in DB (any client):', allTasks?.length || 0);
  console.log('Tasks matching this client:', rawTasks.length);
  if (rawTasks.length > 0) {
    console.log('Found Task ID:', rawTasks[0].id);
  }
  console.log('------------------------------');

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

  return NextResponse.json(
    { client, tasks },
    { 
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    }
  );
}
