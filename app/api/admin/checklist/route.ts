import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

// GET /api/admin/checklist?task_id=xxx
export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('task_id');
  if (!taskId) return NextResponse.json({ error: 'Missing task_id' }, { status: 400 });

  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('task_id', taskId)
    .order('position', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// POST /api/admin/checklist  — create a single item
export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { task_id, text, position } = await req.json();
    if (!task_id || text === undefined) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const { data, error } = await supabase
      .from('checklist_items')
      .insert([{ task_id, text, done: false, position: position ?? 0 }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/admin/checklist  — toggle done or update text
export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { data, error } = await supabase
      .from('checklist_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/checklist?id=xxx
export async function DELETE(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const { error } = await supabase.from('checklist_items').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
