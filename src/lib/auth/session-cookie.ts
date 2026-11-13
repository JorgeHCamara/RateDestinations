/**
 * Which cookies mean "this browser may be signed in". Shared by the proxy, the server session
 * reader and the browser marker, so a request without them never reaches Supabase.
 *
 * @supabase/ssr stores the session as `sb-<project>-auth-token`, split into `.0`, `.1`… when large.
 */
export const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

/**
 * Set in the browser while a Supabase session cookie exists (components/session-marker.tsx). The
 * proxy matcher can only test a cookie by its exact name, and Supabase's name includes the project,
 * so this fixed name is what lets the proxy run on public pages for signed-in visitors only, to
 * keep their session fresh, and never for crawlers and signed-out visitors.
 */
export const SESSION_MARKER = "rd-session";

export function hasAuthCookie(names: Iterable<string>): boolean {
  for (const n of names) if (AUTH_COOKIE.test(n)) return true;
  return false;
}
