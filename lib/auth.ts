import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production-please-use-env';

export interface AdminPayload {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function signToken(payload: AdminPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AdminPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminPayload;
  } catch {
    return null;
  }
}

export function getAdminFromRequest(req: NextRequest): AdminPayload | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }

  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, ...v] = c.trim().split('=');
        return [key, v.join('=')];
      })
    );
    if (cookies['admin_token']) {
      return verifyToken(decodeURIComponent(cookies['admin_token']));
    }
  }

  return null;
}
