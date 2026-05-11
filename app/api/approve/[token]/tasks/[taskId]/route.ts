export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendNotificationEmail } from '@/lib/email';
import { revalidatePath } from 'next/cache';

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

  const { status, comment } = await req.json();
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

  // Clear cache for the approval page
  revalidatePath(`/approve/${params.token}`);
  revalidatePath(`/api/approve/${params.token}`);

  // 3. Handle Comment (if revision)
  if (comment && comment.trim()) {
    await supabase.from('comments').insert([
      { 
        task_id: params.taskId, 
        client_id: client.id, 
        author_name: 'Client', 
        comment_text: comment.trim() 
      }
    ]);
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

  // 4. Send Email Notification (Non-blocking as much as possible)
  const emailPromise = (async () => {
    try {
      const { data: settings } = await supabase.from('settings').select('notification_email').eq('id', 1).single();
      if (settings?.notification_email) {
        const statusLabel = status === 'approved' ? 'Approved' : status === 'for_revision' ? 'Revision Requested' : status;
        const subject = `[${client.company_name}] Task ${statusLabel}: ${task.title}`;
        const getDisplayImageUrl = (url: string) => {
          if (!url) return null;
          const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{25,})/);
          if (driveMatch) return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
          return url;
        };
        const imageUrl = getDisplayImageUrl(task.image_url);

        const html = `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">Task Status Updated</h2>
            <p><strong>Client:</strong> ${client.company_name}</p>
            <p><strong>Task:</strong> ${task.title}</p>
            <p><strong>New Status:</strong> <span style="padding: 4px 8px; border-radius: 4px; background: ${status === 'approved' ? '#dcfce7' : '#fef9c3'}; color: ${status === 'approved' ? '#166534' : '#854d0e'};">${statusLabel}</span></p>
            ${imageUrl ? `<div style="margin: 20px 0;"><img src="${imageUrl}" alt="${task.title}" style="max-width: 100%; border-radius: 8px; border: 1px solid #eee;" /></div>` : ''}
            ${comment ? `<div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-left: 4px solid #eab308; font-style: italic;"><strong>Revision Note:</strong><br/>"${comment}"</div>` : ''}
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 14px; color: #666;">View this task in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">Admin Dashboard</a>.</p>
          </div>
        `;
        await sendNotificationEmail(settings.notification_email, subject, html);
      }
    } catch (err) {
      console.error('Email background error:', err);
    }
  })();

  // We await it here to ensure Vercel doesn't kill the process, 
  // but we've already done the DB work above.
  await emailPromise;

  return NextResponse.json({ task: updatedTask });
}
