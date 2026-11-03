import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/supabase/server";

export function UserMenu({
  user,
  authEnabled,
}: {
  user: SessionUser | null;
  authEnabled: boolean;
}) {
  if (!authEnabled) return null;
  if (!user) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  const initial = (user.name ?? user.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="bg-brand-soft text-foreground ring-border grid size-8 place-items-center rounded-full text-sm font-semibold ring-1"
          aria-label="Account menu"
        >
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="size-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initial
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* The public name; the email only for the person themselves, small, under it */}
        <DropdownMenuLabel className="max-w-56">
          <span className="block truncate">{user.name ?? "Your account"}</span>
          {user.email && (
            <span className="text-muted-foreground block truncate text-xs font-normal">
              {user.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me">My ratings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
