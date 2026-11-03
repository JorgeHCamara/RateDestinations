import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { isAuthConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Sign in", robots: { index: false, follow: true } };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Rate cities and places. No passwords: a Google account or a magic link in your inbox.
        </p>
        <Suspense fallback={null}>
          <LoginBody searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!isAuthConfigured()) {
    return (
      <div className="text-muted-foreground mt-6 rounded-xl border border-dashed p-5 text-sm">
        Sign-in isn&apos;t configured on this deployment yet. Set{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see README).
      </div>
    );
  }
  return <LoginForm next={next} error={error} />;
}
