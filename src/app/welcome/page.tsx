import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicNameForm } from "@/components/public-name-form";
import { safeNext } from "@/lib/auth-next";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = { title: "Choose your public name", robots: { index: false } };

/**
 * Right after a first sign-in by email (and whenever someone without a public name tries to
 * rate): choose the name shown on reviews. Google accounts get theirs from Google and skip this.
 */
export default function WelcomePage(props: PageProps<"/welcome">) {
  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold">Welcome to RateDestinations</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          One last step: choose the name people see next to your reviews.
        </p>
        <Suspense fallback={<div className="bg-muted h-40 animate-pulse rounded-xl" />}>
          <WelcomeForm searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function WelcomeForm({
  searchParams,
}: {
  searchParams: PageProps<"/welcome">["searchParams"];
}) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/");
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/welcome?next=${next}`)}`);
  if (user.name) redirect(next);
  return <PublicNameForm initial={null} next={next} submitLabel="Continue" />;
}
