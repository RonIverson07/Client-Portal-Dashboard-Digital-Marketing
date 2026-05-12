import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const clientId = searchParams.get('clientId');

  let query = supabase.from('activity_log').select('*').order('created_at', { ascending: false });

  if (taskId) query = query.eq('task_id', taskId);
  if (clientId) query = query.eq('client_id', clientId);

  const { data: logs, error } = await query.limit(50);
  
  if (error) return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });

  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const logData = await req.json();
    const { data: log, error } = await supabase.from('activity_log').insert([logData]).select().single();
    if (error) throw error;
    return NextResponse.json(log);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
