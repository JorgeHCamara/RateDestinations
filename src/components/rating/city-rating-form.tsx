"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { rateCity, type RatingActionState } from "@/app/actions/ratings";
import { Stars } from "@/components/stars";
import { Button } from "@/components/ui/button";
import { CITY_DIMENSIONS, DIMENSION_META, type CityDimension } from "@/lib/dimensions";

export function CityRatingForm({
  cityId,
  cityName,
  existing,
  signedIn,
  returnTo,
}: {
  cityId: number;
  cityName: string;
  existing: Partial<Record<CityDimension, number>>;
  signedIn: boolean;
  returnTo: string;
}) {
  const [values, setValues] = useState<Partial<Record<CityDimension, number>>>(existing);
  const [state, action, pending] = useActionState<RatingActionState, FormData>(rateCity, {
    ok: false,
  });
  const filled = Object.values(values).filter(Boolean).length;

  if (!signedIn) {
    return (
      <div className="bg-card rounded-xl border p-5 text-sm">
        <p className="font-medium">Know {cityName}?</p>
        <p className="text-muted-foreground mb-3">
          Rate safety, cleanliness, food and more. Nine quick taps that help every traveller after
          you.
        </p>
        <Button asChild size="sm">
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>Sign in to rate</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="bg-card space-y-3 rounded-xl border p-5">
      <input type="hidden" name="cityId" value={cityId} />
      <p className="text-sm font-medium">
        {filled ? "Your ratings for" : "Rate"} {cityName}
      </p>
      <ul className="divide-y">
        {CITY_DIMENSIONS.map((d) => (
          <li key={d} className="flex items-center justify-between gap-3 py-2">
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
      <p className="text-muted-foreground text-xs">
        Skip anything you can&apos;t judge. You can change these any time.
      </p>
      {state.error && <p className="text-bad text-sm">{state.error}</p>}
      {state.ok && <p className="text-good text-sm">Saved — the city score is updated.</p>}
      <Button type="submit" disabled={pending || filled === 0}>
        {pending ? "Saving…" : "Save ratings"}
      </Button>
    </form>
  );
}
