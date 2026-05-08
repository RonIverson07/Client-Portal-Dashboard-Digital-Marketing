import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendNotificationEmail } from '@/lib/email';

interface RouteParams {
  params: { token: string; taskId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', params.taskId)
    .eq('client_id', client.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const { status } = await req.json();
  const validStatuses = ['for_review', 'approved', 'for_revision'];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const { data: updatedTask, error: updateError } = await supabase
    .from('tasks')
    .update({ 
      status, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', params.taskId)
    .select()
    .single();

  if (updateError) {
    console.error('Update task status error:', updateError);
    return NextResponse.json({ error: 'Failed to update status.' }, { status: 500 });
  }

  await supabase.from('activity_log').insert([
    { 
      task_id: params.taskId, 
      client_id: client.id, 
      user_type: 'client', 
      action_type: 'status_change', 
      previous_value: task.status, 
      new_value: status 
    }
  ]);

  // 4. Send Email Notification
  try {
    const { data: settings } = await supabase.from('settings').select('notification_email').eq('id', 1).single();
    if (settings?.notification_email) {
      const statusLabel = status === 'approved' ? 'Approved' : status === 'for_revision' ? 'Revision Requested' : status;
      const subject = `[${client.company_name}] Task ${statusLabel}: ${task.title}`;
      const html = `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <h2 style="color: #2563eb;">Task Status Updated</h2>
          <p><strong>Client:</strong> ${client.company_name}</p>
          <p><strong>Task:</strong> ${task.title}</p>
          <p><strong>New Status:</strong> <span style="padding: 4px 8px; border-radius: 4px; background: ${status === 'approved' ? '#dcfce7' : '#fef9c3'}; color: ${status === 'approved' ? '#166534' : '#854d0e'};">${statusLabel}</span></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 14px; color: #666;">View this task in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">Admin Dashboard</a>.</p>
        </div>
      `;
      await sendNotificationEmail(settings.notification_email, subject, html);
    }
  } catch (err) {
    console.error('Failed to send status update email:', err);
  }

  return NextResponse.json({ task: updatedTask });
}
