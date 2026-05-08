import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_token', '', { maxAge: 0, path: '/' });
  return response;
}
