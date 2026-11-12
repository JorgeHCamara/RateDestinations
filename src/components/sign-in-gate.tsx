import { SignInPrompt } from "@/components/sign-in-prompt";
import { getSessionUser, isAuthConfigured } from "@/lib/supabase/server";

/** The sign-in prompt, for signed-out visitors only. Render inside <Suspense> (reads the session). */
export async function SignInGate({ next }: { next: string }) {
  if (!isAuthConfigured()) return null;
  if (await getSessionUser()) return null;
  // Keyed by page, so opening another city or place asks again.
  return <SignInPrompt key={next} next={next} />;
}
