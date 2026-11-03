import { NextResponse } from "next/server";
import { landingAfterSignIn, safeNext } from "@/lib/auth-next";
import { createSupabaseServerClient, isAuthConfigured } from "@/lib/supabase/server";

/** OAuth / magic-link landing: exchanges the code for a session cookie, then redirects. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code && isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const landing = await landingAfterSignIn(data.user.id, next);
      return NextResponse.redirect(new URL(landing, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
