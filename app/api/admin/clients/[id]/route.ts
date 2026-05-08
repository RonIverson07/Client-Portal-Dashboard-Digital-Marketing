import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { nanoid } from 'nanoid';

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

  return NextResponse.json({ client });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { company_name, contact_name, contact_email, logo_url, notes } = await req.json();
    if (!company_name?.trim()) {
      return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });
    }

    const { data: client, error } = await supabase
      .from('clients')
      .update({
        company_name: company_name.trim(),
        contact_name: contact_name?.trim() || null,
        contact_email: contact_email?.trim() || null,
        logo_url: logo_url?.trim() || null,
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ client });
  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json({ error: 'Failed to update client.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', params.id);

  if (error) {
    console.error('Delete client error:', error);
    return NextResponse.json({ error: 'Failed to delete client.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json();
  if (action !== 'regenerate_token') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const new_token = nanoid(32);
  
  const { data: client, error } = await supabase
    .from('clients')
    .update({ 
      private_token: new_token, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    console.error('Regenerate token error:', error);
    return NextResponse.json({ error: 'Failed to regenerate token.' }, { status: 500 });
  }

  return NextResponse.json({ client });
}
