import { supabaseAdmin } from './supabase';

export async function sendNotificationEmail(to: string, subject: string, html: string) {
  try {
    // 1. Fetch the API Token from the settings (we use the password field for this)
    const { data: settings, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !settings) return;

    // 2. Use the MailerSend API instead of SMTP
    // We expect the SMTP Password field to contain the 'mlsn...' token
    const API_TOKEN = settings.smtp_password;

    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({
        from: {
          email: settings.from_email,
          name: settings.from_name,
        },
        to: [
          {
            email: to,
          },
        ],
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ MailerSend API Error:', JSON.stringify(errorData, null, 2));
    }
  } catch (error) {
    console.error('❌ Email Sending Error:', error);
  }
}
