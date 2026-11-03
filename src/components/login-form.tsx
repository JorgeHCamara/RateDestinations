"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { signInWithEmail, signInWithGoogle, type EmailSignInState } from "@/app/actions/auth";
import { GoogleSignIn } from "@/components/google-sign-in";
import { Turnstile, type TurnstileControls } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
// Cloudflare Turnstile: the bot check Supabase verifies on every sign-in once CAPTCHA protection
// is on (Authentication → Attack Protection). Without a site key, sign-in works without it.
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
/** How long Google sign-in waits for the bot check to finish before giving up. */
const CAPTCHA_WAIT_MS = 10_000;

export function LoginForm({ next, error }: { next: string; error: string | null }) {
  const [state, action, pending] = useActionState<EmailSignInState, FormData>(signInWithEmail, {});
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captchaRef = useRef<string | null>(null);
  const waiters = useRef(new Set<(token: string) => void>());
  const controls = useRef<TurnstileControls | null>(null);

  const onToken = useCallback((token: string | null) => {
    captchaRef.current = token;
    setCaptcha(token);
    if (token) {
      setCaptchaFailed(false);
      for (const w of waiters.current) w(token);
      waiters.current.clear();
    }
  }, []);
  const onCaptchaError = useCallback(() => setCaptchaFailed(true), []);

  // Each token works once: after an email attempt that came back with an error, get a fresh one.
  useEffect(() => {
    if (state.error) controls.current?.reset();
  }, [state]);

  // For Google sign-in: the current token (waiting for one if the check is still running), then a
  // fresh check for any later attempt.
  const getCaptchaToken = useCallback(async (): Promise<string | undefined> => {
    if (!turnstileSiteKey) return undefined;
    const token =
      captchaRef.current ??
      (await new Promise<string | undefined>((resolve) => {
        const w = (t: string) => {
          clearTimeout(timer);
          resolve(t);
        };
        const timer = setTimeout(() => {
          waiters.current.delete(w);
          resolve(undefined);
        }, CAPTCHA_WAIT_MS);
        waiters.current.add(w);
      }));
    controls.current?.reset();
    return token;
  }, []);

  const waitingForCaptcha = Boolean(turnstileSiteKey) && !captcha;
  // The redirect flow: Google's screen names the Supabase project's URL. Used only when Google's
  // own button (GoogleSignIn, which names our site) isn't configured or can't load.
  const googleRedirect = (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="outline" className="w-full">
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"
          />
          <path
            fill="currentColor"
            opacity=".7"
            d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"
          />
          <path
            fill="currentColor"
            opacity=".5"
            d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"
          />
          <path
            fill="currentColor"
            opacity=".85"
            d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"
          />
        </svg>
        Continue with Google
      </Button>
    </form>
  );
  return (
    <div className="mt-6 space-y-4">
      {error && (
        <p className="bg-bad-soft text-bad rounded-lg p-3 text-sm">
          {error === "oauth"
            ? "Google sign-in failed. Try again or use email."
            : error === "link"
              ? "That sign-in link has expired or was already used. Enter your email below for a new one."
              : "Sign-in failed. Please try again."}
        </p>
      )}
      {turnstileSiteKey && (
        <Turnstile
          siteKey={turnstileSiteKey}
          onToken={onToken}
          onError={onCaptchaError}
          controls={controls}
        />
      )}
      {captchaFailed && (
        <p className="bg-ok-soft text-ok rounded-lg p-3 text-sm">
          Our bot check didn&apos;t finish. Refresh the page to try again. If an ad or tracker
          blocker is on, allow challenges.cloudflare.com.
        </p>
      )}
      {googleClientId ? (
        <GoogleSignIn
          clientId={googleClientId}
          next={next}
          fallback={googleRedirect}
          getCaptchaToken={getCaptchaToken}
        />
      ) : (
        googleRedirect
      )}
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />
        or
        <span className="bg-border h-px flex-1" />
      </div>
      {state.sent ? (
        <p className="bg-good-soft text-good rounded-lg p-3 text-sm">
          Check your inbox: we sent you a sign-in link.
        </p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="captchaToken" value={captcha ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </div>
          {state.error && <p className="text-bad text-sm">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending || waitingForCaptcha}>
            {pending
              ? "Sending…"
              : waitingForCaptcha
                ? "Checking you're not a bot…"
                : "Email me a magic link"}
          </Button>
        </form>
      )}
    </div>
  );
}
