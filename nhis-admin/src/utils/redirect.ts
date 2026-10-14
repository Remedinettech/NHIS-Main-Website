/** Only same-app absolute paths are allowed as a post sign-in destination (no external or login redirects). */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string') return '/dashboard';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/dashboard';
  if (value === '/' || value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return '/dashboard';
  return value;
}
