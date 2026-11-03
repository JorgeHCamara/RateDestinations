import { createServerClient } from "@supabase/ssr";
import { isDatabaseConfigured, queryOne } from "@/lib/db";
import { cookies } from "next/headers";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Supabase client bound to the request cookies. Only for auth; data access goes through lib/db. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: the proxy refreshes sessions instead.
          }
        },
      },
    },
  );
}

export type SessionUser = {
  id: string;
  email: string | null;
  /** The public name shown on reviews (profiles.display_name); null until the person picks one. */
  name: string | null;
  avatarUrl: string | null;
};

/**
 * The signed-in user, verified against Supabase Auth (not just decoded from the cookie).
 * Returns null when signed out or when auth isn't configured. Reads cookies: call it behind Suspense.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const profile = isDatabaseConfigured()
    ? await queryOne<{ display_name: string | null }>(
        "select display_name from profiles where id = $1",
        [user.id],
      ).catch(() => null)
    : null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile?.display_name ?? null,
    avatarUrl: (meta.avatar_url as string) ?? null,
  };
}
