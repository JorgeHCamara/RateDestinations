"use client";

import { useEffect } from "react";
import { AUTH_COOKIE, SESSION_MARKER } from "@/lib/auth/session-cookie";

/**
 * Keeps the `rd-session` marker cookie in step with the Supabase session cookie, so the proxy runs
 * on public pages for signed-in visitors only (see lib/auth/session-cookie.ts). Renders nothing.
 */
export function SessionMarker() {
  useEffect(() => {
    const names = document.cookie
      .split(";")
      .map((c) => c.split("=")[0]?.trim())
      .filter(Boolean);
    const signedIn = names.some((n) => AUTH_COOKIE.test(n));
    const marked = names.includes(SESSION_MARKER);
    if (signedIn && !marked)
      document.cookie = `${SESSION_MARKER}=1; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax; secure`;
    else if (!signedIn && marked)
      document.cookie = `${SESSION_MARKER}=; path=/; max-age=0; samesite=lax; secure`;
  });
  return null;
}
