export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendNotificationEmail } from '@/lib/email';

interface RouteParams {
  params: { token: string; taskId: string };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', params.taskId)
    .eq('client_id', client.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const { data: comments, error: commentsError } = await supabase
    .from('comments')
    .select('*')
    .eq('task_id', params.taskId)
    .order('created_at', { ascending: true });

  if (commentsError) {
    console.error('Fetch comments error:', commentsError);
    return NextResponse.json({ error: 'Failed to fetch comments.' }, { status: 500 });
  }

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('private_token', params.token)
    .single();

  if (clientError || !client) return NextResponse.json({ error: 'Invalid approval link.' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, image_url')
    .eq('id', params.taskId)
    .eq('client_id', client.id)
    .single();

  if (taskError || !task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

  const { author_name, comment_text } = await req.json();

  if (!comment_text?.trim()) {
    return NextResponse.json({ error: 'Comment text is required.' }, { status: 400 });
  }

  const sanitizedText = comment_text.trim().substring(0, 2000);
  const sanitizedAuthor = (author_name?.trim() || 'Client').substring(0, 100);

  const { data: comment, error: insertError } = await supabase
    .from('comments')
    .insert([
      { 
        task_id: params.taskId, 
        client_id: client.id, 
        author_name: sanitizedAuthor, 
        comment_text: sanitizedText 
      }
    ])
    .select()
    .single();

  if (insertError) {
    console.error('Insert comment error:', insertError);
    return NextResponse.json({ error: 'Failed to add comment.' }, { status: 500 });
  }

  await supabase.from('activity_log').insert([
    { 
      task_id: params.taskId, 
      client_id: client.id, 
      user_type: 'client', 
      action_type: 'comment_added', 
      new_value: sanitizedText.substring(0, 200) 
    }
  ]);

  // 4. Send Email Notification
  try {
    const { data: settings } = await supabase.from('settings').select('notification_email').eq('id', 1).single();
    if (settings?.notification_email) {
      const subject = `[${client.company_name}] New Comment on: ${task.title}`;
      const getDisplayImageUrl = (url: string) => {
        if (!url) return null;
        const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{25,})/);
        if (driveMatch) return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
        return url;
      };
      const imageUrl = getDisplayImageUrl(task.image_url);

      const html = `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">New Client Comment</h2>
          <p><strong>Client:</strong> ${client.company_name}</p>
          <p><strong>Task:</strong> ${task.title}</p>
          
          ${imageUrl ? `
            <div style="margin: 20px 0;">
              <img src="${imageUrl}" alt="${task.title}" style="max-width: 100%; border-radius: 8px; border: 1px solid #eee;" />
            </div>
          ` : ''}

          <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border-left: 4px solid #2563eb; font-style: italic;">
            "${sanitizedText}"
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 14px; color: #666;">Reply to this comment in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">Admin Dashboard</a>.</p>
        </div>
      `;
      await sendNotificationEmail(settings.notification_email, subject, html);
    }
  } catch (err) {
    console.error('Failed to send comment notification email:', err);
  }

  return NextResponse.json({ comment }, { status: 201 });
}
