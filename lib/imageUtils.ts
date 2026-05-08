/**
 * Extracts the Google Drive file ID from any supported Drive URL format.
 * Returns null if the URL is not a Google Drive URL.
 */
function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) return null;

  // /file/d/FILE_ID/  — most common share link format
  const filePathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (filePathMatch?.[1]) return filePathMatch[1];

  // ?id=FILE_ID or &id=FILE_ID  — covers open?, uc?, thumbnail?, download?
  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch?.[1]) return idParamMatch[1];

  return null;
}

/**
 * Converts any Google Drive share/view/open/uc link into a direct image URL
 * that loads reliably in browsers without extra redirects.
 *
 * Uses: https://lh3.googleusercontent.com/d/FILE_ID=w1600
 * (confirmed 200 OK, image/png — no auth redirect required for public files)
 *
 * For non-Drive URLs the original URL is returned unchanged.
 */
export function getDisplayImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const fileId = extractGoogleDriveFileId(trimmed);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
  }

  return trimmed;
}

export function isGoogleDriveUrl(url: string): boolean {
  return !!(url && (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')));
}
