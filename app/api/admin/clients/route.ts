import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { nanoid } from 'nanoid';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawClients, error } = await supabase
    .from('clients')
    .select('*, tasks(status)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch clients error:', error);
    return NextResponse.json({ error: 'Failed to fetch clients.' }, { status: 500 });
  }

  const clients = (rawClients || []).map((c: any) => {
    const tasks = c.tasks || [];
    return {
      ...c,
      task_count: tasks.length,
      approved_count: tasks.filter((t: any) => t.status === 'approved').length,
      for_review_count: tasks.filter((t: any) => t.status === 'for_review').length,
      for_revision_count: tasks.filter((t: any) => t.status === 'for_revision').length,
      published_count: tasks.filter((t: any) => t.status === 'published').length,
      tasks: undefined // Remove tasks array from response
    };
  });

  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { company_name, contact_name, contact_email, logo_url, notes } = await req.json();
    if (!company_name?.trim()) return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });

    const private_token = nanoid(32);
    
    const { data: client, error } = await supabase
      .from('clients')
      .insert([
        { 
          company_name: company_name.trim(), 
          contact_name: contact_name?.trim() || null, 
          contact_email: contact_email?.trim() || null, 
          private_token, 
          logo_url: logo_url?.trim() || null, 
          notes: notes?.trim() || null 
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error('Create client error:', error);
    return NextResponse.json({ error: 'Failed to create client.' }, { status: 500 });
  }
}
