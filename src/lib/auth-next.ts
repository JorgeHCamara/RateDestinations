import { queryOne } from "@/lib/db";

/** Where to send someone after they sign in: only paths on this site, never another origin. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/**
 * The sign-in email links to /auth/confirm with `next` set to Supabase's `{{ .RedirectTo }}`,
 * which is the full URL the sign-in form asked for, e.g.
 * "https://www.ratedestinations.com/auth/callback?next=/city/pt/lisbon". Reduce it to the path
 * to land on ("/city/pt/lisbon"). Anything on another origin, or unreadable, becomes "/".
 */
export function nextFromRedirectTo(raw: string | null, origin: string): string {
  if (!raw) return "/";
  if (raw.startsWith("/")) return safeNext(raw);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "/";
  }
  if (url.origin !== new URL(origin).origin) return "/";
  if (url.pathname === "/auth/callback" || url.pathname === "/auth/confirm")
    return safeNext(url.searchParams.get("next"));
  return safeNext(url.pathname + url.search);
}

/** After signing in: someone without a public name chooses one first, then goes where they were. */
export async function landingAfterSignIn(userId: string, next: string): Promise<string> {
  const profile = await queryOne<{ display_name: string | null }>(
    "select display_name from profiles where id = $1",
    [userId],
  ).catch(() => null);
  return profile && !profile.display_name ? `/welcome?next=${encodeURIComponent(next)}` : next;
}
