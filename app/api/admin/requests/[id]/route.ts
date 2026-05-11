import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { status, title, description, image_url, client_id } = await req.json();

    // Update the request status only
    // We removed the automatic task creation to keep Requests and Tasks strictly separate.
    const { data: request, error: updateError } = await supabase
      .from('content_requests')
      .update({ 
        status, 
        title, 
        description, 
        image_url, 
        client_id: client_id ? Number(client_id) : undefined,
        updated_at: new Date().toISOString() 
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ request });
  } catch (err: any) {
    console.error('Update request error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { error } = await supabase
      .from('content_requests')
      .delete()
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete request error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
