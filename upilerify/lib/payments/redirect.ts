/** Browser destinations must be absolute HTTP(S) URLs, never executable schemes. */
export function isValidRedirectUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function buildSuccessRedirectUrl(value: string, orderId: string): string | null {
  if (!isValidRedirectUrl(value)) return null;
  const url = new URL(value);
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('status', 'VERIFIED');
  return url.toString();
}
