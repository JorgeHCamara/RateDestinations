import Link from "next/link";
import { CitySearch } from "@/components/city-search";
import { UserMenu } from "@/components/user-menu";
import { getSessionUser, isAuthConfigured, type SessionUser } from "@/lib/supabase/server";

export async function SiteHeader({ user }: { user?: SessionUser | null }) {
  const sessionUser = user === undefined ? await getSessionUser() : user;
  return (
    <header className="border-border/70 bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="container-page flex h-14 items-center gap-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          aria-label="RateDestinations home"
        >
          <span className="bg-brand text-brand-foreground grid size-7 place-items-center rounded-md">
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
              <circle cx="12" cy="11" r="2" />
            </svg>
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            RateDestinations
          </span>
        </Link>
        <div className="mx-auto hidden w-full max-w-md sm:block">
          <CitySearch variant="compact" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <UserMenu user={sessionUser} authEnabled={isAuthConfigured()} />
        </div>
      </div>
    </header>
  );
}
