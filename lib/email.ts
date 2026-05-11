import nodemailer from 'nodemailer';
import { supabaseAdmin } from './supabase';

export async function sendNotificationEmail(to: string, subject: string, html: string) {
  try {
    // 1. Fetch settings from database for from_email and from_name
    const { data: settings, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !settings) {
      console.error('❌ Could not fetch email settings from database');
      return;
    }

    // 2. Use Environment Variables for SMTP (More secure and works locally/production)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || settings.smtp_host,
      port: Number(process.env.SMTP_PORT || settings.smtp_port) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || settings.smtp_user,
        pass: process.env.SMTP_PASS || settings.smtp_password,
      },
    });

    // 3. Send the email
    const info = await transporter.sendMail({
      from: `"${settings.from_name || 'Admin Portal'}" <${settings.from_email}>`,
      to,
      subject,
      html,
    });

    console.log('✅ Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('❌ Email Sending Error:', error);
  }
}
