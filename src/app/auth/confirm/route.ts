import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { nextFromRedirectTo } from "@/lib/auth-next";
import { createSupabaseServerClient, isAuthConfigured } from "@/lib/supabase/server";

const EMAIL_TYPES = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "signup",
  "invite",
  "email_change",
]);

/**
 * Landing page of the sign-in email (supabase/templates): the link points here, on our own
 * domain, rather than at the Supabase project's URL, so the email's link matches its sender
 * (mail filters and careful readers treat a mismatch as phishing). Verifies the one-time token
 * and sets the session cookie, then goes where the person was.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = nextFromRedirectTo(url.searchParams.get("next"), url.origin);
  if (tokenHash && type && EMAIL_TYPES.has(type) && isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  // Expired, already used, or opened in a different browser than it was asked from: say so.
  const login = new URL("/login", url.origin);
  login.searchParams.set("error", "link");
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
