import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import { seedAdminIfNotExists } from '@/lib/seed';

interface AdminUser {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
}

export async function POST(req: NextRequest) {
  try {
    await seedAdminIfNotExists();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }

    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'An error occurred during login.' }, { status: 500 });
  }
}
