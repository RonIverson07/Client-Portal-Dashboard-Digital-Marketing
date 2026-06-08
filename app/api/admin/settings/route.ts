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

    console.log('Settings GET returning:', JSON.stringify(settings, null, 2));

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
    console.log('Settings POST received:', JSON.stringify(body, null, 2));

    const { host, port, user: smtpUser, password, from_email, from_name, notification_email, clickup_api_token, clickup_space_id, clickup_list_id, clickup_list_id_2, clickup_list_id_3, clickup_status_for_review, clickup_status_approved, clickup_status_for_revision, clickup_status_published } = body;

    const upsertData = {
      id: 1,
      smtp_host: host || null,
      smtp_port: port ? parseInt(port) : null,
      smtp_user: smtpUser || null,
      smtp_password: password || null,
      from_email: from_email || null,
      from_name: from_name || null,
      notification_email: notification_email || null,
      clickup_api_token: clickup_api_token || null,
      clickup_space_id: clickup_space_id || null,
      clickup_list_id: clickup_list_id || null,
      clickup_list_id_2: clickup_list_id_2 || null,
      clickup_list_id_3: clickup_list_id_3 || null,
      clickup_status_for_review: clickup_status_for_review || null,
      clickup_status_approved: clickup_status_approved || null,
      clickup_status_for_revision: clickup_status_for_revision || null,
      clickup_status_published: clickup_status_published || null,
      updated_at: new Date().toISOString(),
    };

    console.log('Upserting settings:', JSON.stringify(upsertData, null, 2));

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert(upsertData, { onConflict: 'id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      throw error;
    }

    console.log('Settings saved successfully');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Settings POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
