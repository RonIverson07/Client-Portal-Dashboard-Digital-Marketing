import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest as verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: settings, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return NextResponse.json({ settings: settings || {} });
  } catch (error: any) {
    console.error('Settings GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { host, port, user: smtpUser, password, from_email, from_name, notification_email } = body;

    const upsertData = {
      id: 1,
      smtp_host: host,
      smtp_port: parseInt(port),
      smtp_user: smtpUser,
      smtp_password: password,
      from_email: from_email,
      from_name: from_name,
      notification_email: notification_email,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert(upsertData, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Settings POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
