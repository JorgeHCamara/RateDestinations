"use client";

import { useActionState } from "react";
import { signInWithEmail, signInWithGoogle, type EmailSignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next, error }: { next: string; error: string | null }) {
  const [state, action, pending] = useActionState<EmailSignInState, FormData>(signInWithEmail, {});
  return (
    <div className="mt-6 space-y-4">
      {error && (
        <p className="bg-bad-soft text-bad rounded-lg p-3 text-sm">
          {error === "oauth"
            ? "Google sign-in failed. Try again or use email."
            : "Sign-in failed. Please try again."}
        </p>
      )}
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
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Email me a magic link"}
          </Button>
        </form>
      )}
    </div>
  );
}
