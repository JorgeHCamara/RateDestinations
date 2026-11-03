"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { rateCity, type RatingActionState } from "@/app/actions/ratings";
import { Stars } from "@/components/stars";
import { Button } from "@/components/ui/button";
import { CITY_DIMENSIONS, DIMENSION_META, type CityDimension } from "@/lib/dimensions";
import type { RaterRole } from "@/lib/queries/ratings";
import { cn } from "@/lib/utils";

const ROLES: { value: RaterRole; label: string }[] = [
  { value: "local", label: "I live here" },
  { value: "visitor", label: "Visiting / visited" },
];

export function CityRatingForm({
  cityId,
  cityName,
  existing,
  existingRole,
  signedIn,
  returnTo,
}: {
  cityId: number;
  cityName: string;
  existing: Partial<Record<CityDimension, number>>;
  existingRole: RaterRole | null;
  signedIn: boolean;
  returnTo: string;
}) {
  const [values, setValues] = useState<Partial<Record<CityDimension, number>>>(existing);
  const [role, setRole] = useState<RaterRole | null>(existingRole);
  const [state, action, pending] = useActionState<RatingActionState, FormData>(rateCity, {
    ok: false,
  });
  const filled = Object.values(values).filter(Boolean).length;

  if (!signedIn) {
    return (
      <div className="bg-card rounded-xl border p-5 text-sm">
        <p className="font-medium">Know {cityName}?</p>
        <p className="text-muted-foreground mb-3">
          Live here or visited? Rate safety, cleanliness, food and more: nine quick taps that tell
          everyone what {cityName} is really like.
        </p>
        <Button asChild size="sm">
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>Sign in to rate</Link>
        </Button>
      </div>
    );
  }

  return (
    // Header and Save always in view; only the list scrolls when the card is height-limited
    // (the city page caps it to the screen on wide layouts).
    <form action={action} className="bg-card flex min-h-0 flex-col rounded-xl border">
      <input type="hidden" name="cityId" value={cityId} />
      <div className="space-y-3 px-5 pt-5 pb-2">
        <p className="text-sm font-medium">
          {filled ? "Your ratings for" : "Rate"} {cityName}
        </p>
        <fieldset>
          <legend className="text-muted-foreground mb-1.5 text-xs">
            Do you live in {cityName}?
          </legend>
          <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1" role="radiogroup">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "has-focus-visible:ring-ring/60 cursor-pointer rounded-md px-2 py-1.5 text-center text-sm transition has-focus-visible:ring-2",
                  role === r.value
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="sr-only"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <ul className="min-h-0 divide-y overflow-y-auto overscroll-contain px-5">
        {CITY_DIMENSIONS.map((d) => (
          <li key={d} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{DIMENSION_META[d].label}</p>
              <p className="text-muted-foreground truncate text-xs">{DIMENSION_META[d].question}</p>
            </div>
            <Stars
              name={`dim:${d}`}
              value={values[d] ?? 0}
              onChange={(v) => setValues((s) => ({ ...s, [d]: v }))}
              size="sm"
              label={DIMENSION_META[d].label}
            />
          </li>
        ))}
      </ul>
      {/* On narrow screens the form is long: keep Save pinned to the bottom of the screen while the
          form is in view (wide screens pin the whole card instead). */}
      <div className="bg-card space-y-2.5 rounded-b-xl border-t px-5 pt-3 pb-5 max-lg:sticky max-lg:bottom-0 max-lg:shadow-[0_-8px_16px_-12px_rgb(0_0_0/0.25)]">
        <p className="text-muted-foreground text-xs">
          Skip anything you can&apos;t judge. You can change these any time.
        </p>
        {state.error && <p className="text-bad text-sm">{state.error}</p>}
        {state.ok && <p className="text-good text-sm">Saved — the city score is updated.</p>}
        {filled > 0 && !role && (
          <p className="text-muted-foreground text-xs">
            Pick whether you live here or are visiting to save.
          </p>
        )}
        <Button type="submit" disabled={pending || filled === 0 || !role}>
          {pending ? "Saving…" : "Save ratings"}
        </Button>
      </div>
    </form>
  );
}
