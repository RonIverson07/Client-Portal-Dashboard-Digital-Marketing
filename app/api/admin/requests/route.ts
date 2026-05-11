export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('content_requests')
    .select(`
      *,
      clients (company_name)
    `)
    .order('created_at', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data: rawRequests, error } = await query;

  if (error) {
    console.error('Fetch requests error:', error);
    // If table doesn't exist yet, we might want to return an empty array or specific error
    if (error.code === '42P01') {
       return NextResponse.json({ requests: [], note: 'Table content_requests does not exist. Please run the SQL schema.' });
    }
    return NextResponse.json({ error: 'Failed to fetch requests.' }, { status: 500 });
  }

  const requests = (rawRequests || []).map((r: any) => ({
    ...r,
    company_name: r.clients?.company_name,
    clients: undefined
  }));

  return NextResponse.json({ requests }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Expires': '0',
      'Pragma': 'no-cache',
      'Surrogate-Control': 'no-store'
    }
  });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { client_id, title, description, image_url } = await req.json();

    if (!client_id) return NextResponse.json({ error: 'Client is required.' }, { status: 400 });
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });

    const { data: request, error: requestError } = await supabase
      .from('content_requests')
      .insert([
        { 
          client_id, 
          title: title.trim(), 
          description: description?.trim() || '',
          image_url: image_url?.trim() || null,
          status: 'pending'
        }
      ])
      .select(`
        *,
        clients (company_name)
      `)
      .single();

    if (requestError) throw requestError;

    const formattedRequest = {
      ...request,
      company_name: request.clients?.company_name,
      clients: undefined
    };

    return NextResponse.json({ request: formattedRequest }, { status: 201 });
  } catch (error) {
    console.error('Create request error:', error);
    return NextResponse.json({ error: 'Failed to create request.' }, { status: 500 });
  }
}
