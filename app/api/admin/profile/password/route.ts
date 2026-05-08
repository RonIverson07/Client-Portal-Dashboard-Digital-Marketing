import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { getAdminFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
    }

    // 1. Fetch current user from DB
    const { data: user, error: fetchError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', admin.id)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // 2. Verify current password
    const isMatch = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isMatch) {
      return NextResponse.json({ error: 'Incorrect current password.' }, { status: 400 });
    }

    // 3. Hash new password and update
    const hashed = bcrypt.hashSync(newPassword, 10);
    const { error: updateError } = await supabase
      .from('admin_users')
      .update({ 
        password_hash: hashed,
        updated_at: new Date().toISOString()
      })
      .eq('id', admin.id);

    if (updateError) {
      console.error('Password update error:', updateError);
      throw new Error('Failed to update password');
    }

    return NextResponse.json({ message: 'Password updated successfully!' });
  } catch (error) {
    console.error('Profile password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
