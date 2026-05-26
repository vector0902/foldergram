export function readableFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveDisplayCaption(item: { filename: string; caption?: string | null }): string {
  if (typeof item.caption === 'string' && item.caption.trim().length > 0) {
    return item.caption;
  }

  return readableFilename(item.filename);
}

export function normalizeCaptionInput(item: { filename: string }, caption: string | null): string | null {
  if (caption === null) {
    return null;
  }

  const trimmedCaption = caption.trim();
  if (!trimmedCaption || trimmedCaption === readableFilename(item.filename)) {
    return null;
  }

  return trimmedCaption;
}

export function updateCaptionInItems<T extends { id: number; caption?: string | null }>(
  items: T[],
  id: number,
  caption: string | null
): T[] {
  return items.map((item) => (item.id === id ? { ...item, caption } : item));
}
