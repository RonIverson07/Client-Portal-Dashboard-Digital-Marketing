import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';
import { extractGoogleDriveFolderId } from '@/lib/imageUtils';

export const dynamic = 'force-dynamic';

const GOOGLE_DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderUrl = searchParams.get('url') || '';
  const folderId = extractGoogleDriveFolderId(folderUrl);

  if (!folderId) {
    return NextResponse.json({ error: 'Invalid Google Drive folder URL.' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing GOOGLE_DRIVE_API_KEY in environment.' },
      { status: 500 }
    );
  }

  const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`;
  const url = `${GOOGLE_DRIVE_FILES_API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(
    'files(id,name,mimeType,thumbnailLink)'
  )}&orderBy=name&key=${encodeURIComponent(apiKey)}&pageSize=50`;

  try {
    const resp = await fetch(url, { cache: 'no-store' });
    const data = await resp.json();

    if (!resp.ok) {
      const message = data?.error?.message || 'Failed to fetch folder images.';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const files = Array.isArray(data?.files) ? data.files : [];
    const imageUrls: string[] = files
      .filter((f: any) => typeof f?.id === 'string' && f.id)
      .map((f: any) => `https://lh3.googleusercontent.com/d/${f.id}=w1600`);

    return NextResponse.json({
      folderId,
      count: imageUrls.length,
      imageUrls,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected folder read error.' },
      { status: 500 }
    );
  }
}
