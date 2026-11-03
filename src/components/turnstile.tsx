"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Cloudflare Turnstile: a free check that a sign-in comes from a person, not a bot. Usually
 * invisible (`appearance: "interaction-only"`): Cloudflare shows a checkbox only when it needs
 * one. Supabase verifies the token itself (Authentication → Attack Protection → CAPTCHA), so the
 * check holds even for requests sent straight to Supabase.
 *
 * Each token works once and expires after 5 minutes: after a sign-in attempt, call
 * `controls.current.reset()` for a fresh one.
 */
type TurnstileApi = {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      appearance?: "always" | "execute" | "interaction-only";
      size?: "normal" | "flexible" | "compact";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "before-interactive-callback"?: () => void;
      "after-interactive-callback"?: () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener(
      "load",
      () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile"))),
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error("turnstile blocked")), { once: true });
    setTimeout(() => reject(new Error("turnstile timed out")), 15_000);
  });
}

export type TurnstileControls = { reset(): void };

export function Turnstile({
  siteKey,
  onToken,
  onError,
  onInteractive,
  controls,
}: {
  siteKey: string;
  /** The current token, or null while there is none (loading, expired, failed, just used). */
  onToken: (token: string | null) => void;
  /** The check couldn't load or run (blocked by an extension, offline). */
  onError?: () => void;
  /** True while Cloudflare shows its "Verify you are human" box, false once it is done. */
  onInteractive?: (showing: boolean) => void;
  controls?: MutableRefObject<TurnstileControls | null>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const onInteractiveRef = useRef(onInteractive);
  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
    onInteractiveRef.current = onInteractive;
  });

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !el.current) return;
        widgetId = ts.render(el.current, {
          sitekey: siteKey,
          action: "sign-in",
          appearance: "interaction-only",
          size: "flexible",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "before-interactive-callback": () => onInteractiveRef.current?.(true),
          "after-interactive-callback": () => onInteractiveRef.current?.(false),
          "error-callback": () => {
            onTokenRef.current(null);
            onErrorRef.current?.();
          },
        });
        if (controls)
          controls.current = {
            reset: () => {
              onTokenRef.current(null);
              if (widgetId) ts.reset(widgetId);
            },
          };
      })
      .catch(() => {
        if (cancelled) return;
        onTokenRef.current(null);
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, controls]);

  return <div ref={el} className="empty:hidden" />;
}
