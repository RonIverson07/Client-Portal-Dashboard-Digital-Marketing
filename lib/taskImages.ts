/** Resolve task images: gallery (image_urls) or single image_url. */
export function getTaskImages(task: {
  image_url?: string | null;
  image_urls?: string[] | null;
}): string[] {
  const multi = Array.isArray(task.image_urls)
    ? task.image_urls.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];
  if (multi.length > 0) return multi;
  return task.image_url?.trim() ? [task.image_url.trim()] : [];
}
