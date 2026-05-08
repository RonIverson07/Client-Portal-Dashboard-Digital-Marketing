import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendNotificationEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // 1. Verify the admin user exists
    const { data: user, error: fetchError } = await supabase
      .from('admin_users')
      .select('id, name')
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: 'No account found with that email.' }, { status: 404 });
    }

    // 2. Generate a random temporary password
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 character random string
    const hashed = bcrypt.hashSync(tempPassword, 10);

    // 3. Update the database
    const { error: updateError } = await supabase
      .from('admin_users')
      .update({ 
        password_hash: hashed,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    const adminEmail = 'roniversonroguel.startuplab@gmail.com';
    const subject = `Your New Temporary Password`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">Password Reset Successful</h2>
        <p>Hello ${user.name},</p>
        <p>As requested, we have reset your password. You can now use the temporary password below to log in:</p>
        
        <div style="margin: 20px 0; padding: 15px; background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center;">
          <code style="font-size: 24px; font-weight: 700; color: #1e40af; letter-spacing: 2px;">${tempPassword}</code>
        </div>

        <p style="color: #ef4444; font-size: 14px;"><strong>Important:</strong> For security, please log in and change this password immediately in your Settings page.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 14px; color: #666;">If you did not request this, please contact support immediately.</p>
      </div>
    `;

    await sendNotificationEmail(adminEmail, subject, html);

    return NextResponse.json({ message: 'Reset request sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
