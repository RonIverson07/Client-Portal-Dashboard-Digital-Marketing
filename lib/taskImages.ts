/** Resolve task images: gallery (image_urls) or single image/cover URL. */
export function getTaskImages(task: {
  image_url?: string | null;
  cover_image_url?: string | null;
  coverImageUrl?: string | null;
  image_urls?: string[] | null;
  imageUrls?: string[] | null;
}): string[] {
  const multiSource = task.image_urls ?? task.imageUrls;
  const multi = Array.isArray(multiSource)
    ? multiSource.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];
  if (multi.length > 0) return multi;
  const single =
    task.image_url?.trim() ||
    task.cover_image_url?.trim() ||
    task.coverImageUrl?.trim() ||
    '';
  return single ? [single] : [];
}
