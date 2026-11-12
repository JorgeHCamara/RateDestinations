"use client";

import { useState } from "react";
import { LoginForm } from "@/components/login-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asks a signed-out visitor to sign in, on every city and place page they open: the same Google
 * and email sign-in as /login, and "Not now" to keep reading. The page behind stays complete (and
 * readable by search engines); this only asks.
 */
export function SignInPrompt({ next }: { next: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">
            Sign in to see what people say
          </DialogTitle>
          <DialogDescription>
            Ratings, warnings and reviews come from locals and travellers. Sign in to read them and
            add your own. No passwords: a Google account or a magic link in your inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="-mt-2">
          <LoginForm next={next} error={null} />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground mx-auto text-sm underline-offset-4 hover:underline"
        >
          Not now
        </button>
      </DialogContent>
    </Dialog>
  );
}
