import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasAuthCookie } from "@/lib/auth/session-cookie";

/**
 * Keeps the Supabase session cookie fresh (the standard @supabase/ssr pattern). Authorization
 * itself happens in Server Actions and Route Handlers, never here.
 *
 * It runs only where a session can matter (see `config.matcher`), and returns straight away when
 * the request carries no Supabase cookie: crawlers and signed-out visitors never cost an auth call,
 * and their responses never get a Set-Cookie.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name)))
    return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Refreshes the session if expired; the result is intentionally unused.
  await supabase.auth.getUser();
  return response;
}

/**
 * Session pages always; public pages (home, cities, places, countries…) only for browsers with the
 * session marker cookie, i.e. signed-in visitors, whose expiring tokens need refreshing (Server
 * Components can't write cookies). Static files, images, the sitemap, robots.txt and API routes
 * never run it: none of the API routes reads the session.
 */
export const config = {
  matcher: [
    "/me",
    "/login",
    "/welcome",
    "/auth/:path*",
    "/search",
    {
      source:
        "/((?!_next/|api/|me$|login$|welcome$|auth/|search$|sitemap|robots\\.txt|favicon\\.ico|.*\\.[a-z0-9]+$).*)",
      has: [{ type: "cookie", key: "rd-session" }],
    },
  ],
};
