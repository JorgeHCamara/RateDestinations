"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth-next";
import { isThrowawayEmail } from "@/lib/blocked-email";
import { createSupabaseServerClient, isAuthConfigured } from "@/lib/supabase/server";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signInWithGoogle(formData: FormData) {
  if (!isAuthConfigured()) redirect("/login?error=unconfigured");
  const next = safeNext(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export type EmailSignInState = { sent?: boolean; error?: string };

export async function signInWithEmail(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  if (!isAuthConfigured()) return { error: "Sign-in isn't configured on this deployment yet." };
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (isThrowawayEmail(email))
    return {
      error: "Temporary email addresses can't be used here. Please use your usual email or Google.",
    };
  const next = safeNext(formData.get("next"));
  // Cloudflare Turnstile's token (see components/turnstile.tsx); Supabase checks it.
  const captchaToken = String(formData.get("captchaToken") ?? "").trim() || undefined;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      captchaToken,
    },
  });
  if (error?.code === "captcha_failed")
    return { error: "We couldn't confirm you're not a bot. Please try again." };
  if (error) return { error: "Couldn't send the link. Please try again in a minute." };
  return { sent: true };
}

export async function signOut() {
  if (isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
