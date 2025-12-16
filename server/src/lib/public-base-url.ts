let lastPublicBaseUrl: string | null = null;

function isLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    const s = origin.toLowerCase();
    return s.includes('localhost') || s.includes('127.0.0.1') || s.includes('[::1]');
  }
}

export function setLastPublicBaseUrl(url: string | null | undefined) {
  const value = String(url || '').trim();
  if (!value) return;
  // Don’t let local requests overwrite a previously discovered public tunnel URL.
  if (lastPublicBaseUrl && !isLocalOrigin(lastPublicBaseUrl) && isLocalOrigin(value)) {
    return;
  }
  lastPublicBaseUrl = value;
}

export function getLastPublicBaseUrl(): string | null {
  return lastPublicBaseUrl;
}
