"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * "Continue with Google" with Google's own button (Google Identity Services), on our domain.
 *
 * The redirect flow (signInWithOAuth) sends people through the Supabase project's URL, so
 * Google's consent screen says "continue to <project>.supabase.co". Here Google's popup opens
 * over our page and names our site; it returns an ID token, which Supabase turns into a session
 * (signInWithIdToken), with a nonce so a token can't be replayed.
 *
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (the web OAuth client already configured in Supabase) and
 * the site's origin in that client's "Authorized JavaScript origins". Until Google's script has
 * loaded, or if it can't (blocked, offline), `fallback` (the redirect button) is shown instead.
 */

type CredentialResponse = { credential: string };
type GoogleIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce?: string;
    ux_mode?: "popup" | "redirect";
    context?: "signin" | "signup" | "use";
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ): void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<GoogleIdApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const done = () =>
      window.google?.accounts?.id
        ? resolve(window.google.accounts.id)
        : reject(new Error("Google sign-in unavailable"));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Google sign-in blocked")), {
      once: true,
    });
    setTimeout(() => reject(new Error("Google sign-in timed out")), 8_000);
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function GoogleSignIn({
  clientId,
  next,
  fallback,
}: {
  clientId: string;
  next: string;
  fallback: ReactNode;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gsi = await loadGsi();
      // Supabase checks the token's nonce against the SHA-256 of the one we hand it.
      const nonce = crypto.randomUUID();
      const hashedNonce = await sha256Hex(nonce);
      if (cancelled || !slot.current) return;
      gsi.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        ux_mode: "popup",
        context: "signin",
        callback: async ({ credential }) => {
          setError(null);
          const supabase = createSupabaseBrowserClient();
          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce,
          });
          if (signInError) {
            setError("Google sign-in failed. Try again or use email.");
            return;
          }
          // A full load, so the server renders the page signed in.
          window.location.assign(next);
        },
      });
      slot.current.replaceChildren();
      gsi.renderButton(slot.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "center",
        width: Math.min(400, Math.max(200, Math.round(slot.current.offsetWidth))),
      });
      setState("ready");
    })().catch(() => {
      if (!cancelled) setState("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, next]);

  return (
    <div>
      {state === "failed" && fallback}
      {/* Google draws its button in here; keep the space while it loads so nothing jumps. */}
      <div
        ref={slot}
        className={state === "failed" ? "hidden" : "flex min-h-10 w-full justify-center"}
        aria-busy={state === "loading"}
      />
      {error && <p className="text-bad mt-2 text-sm">{error}</p>}
    </div>
  );
}
