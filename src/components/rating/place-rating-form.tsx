"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ratePlace, type RatingActionState } from "@/app/actions/ratings";
import { Stars } from "@/components/stars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RatingTag } from "@/lib/queries/places";
import type { MyPlaceRating } from "@/lib/queries/ratings";
import { cn } from "@/lib/utils";

export function PlaceRatingForm({
  placeId,
  tags,
  existing,
  signedIn,
}: {
  placeId: number;
  tags: RatingTag[];
  existing: MyPlaceRating | null;
  signedIn: boolean;
}) {
  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [picked, setPicked] = useState<string[]>(existing?.tags ?? []);
  const [state, action, pending] = useActionState<RatingActionState, FormData>(ratePlace, {
    ok: false,
  });

  if (!signedIn) {
    return (
      <div className="bg-card rounded-xl border p-5 text-sm">
        <p className="font-medium">Been here?</p>
        <p className="text-muted-foreground mb-3">
          Sign in to rate this place and warn (or encourage) everyone who goes next.
        </p>
        <Button asChild size="sm">
          <Link href={`/login?next=/place/${placeId}`}>Sign in to rate</Link>
        </Button>
      </div>
    );
  }

  function toggle(tag: string) {
    setPicked((p) =>
      p.includes(tag) ? p.filter((t) => t !== tag) : p.length >= 5 ? p : [...p, tag],
    );
  }

  return (
    <form action={action} className="bg-card space-y-4 rounded-xl border p-5">
      <input type="hidden" name="placeId" value={placeId} />
      {picked.map((t) => (
        <input key={t} type="hidden" name="tags" value={t} />
      ))}
      <div>
        <p className="mb-1 text-sm font-medium">
          {existing ? "Update your rating" : "Rate this place"}
        </p>
        <Stars name="stars" value={stars} onChange={setStars} size="lg" label="Your rating" />
      </div>
      <div>
        <p className="text-muted-foreground mb-1.5 text-xs font-medium">
          What stood out? (up to 5)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              aria-pressed={picked.includes(t.tag)}
              onClick={() => toggle(t.tag)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition",
                picked.includes(t.tag)
                  ? t.is_warning
                    ? "border-bad bg-bad-soft text-bad"
                    : "border-good bg-good-soft text-good"
                  : "hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Textarea
        name="comment"
        defaultValue={existing?.comment ?? ""}
        maxLength={500}
        rows={3}
        placeholder="One or two sentences that would help someone deciding whether to go (optional)"
      />
      {state.error && <p className="text-bad text-sm">{state.error}</p>}
      {state.ok && (
        <p className="text-good text-sm">
          Saved. Thank you — your rating is already in the city score.
        </p>
      )}
      <Button type="submit" disabled={pending || stars === 0}>
        {pending ? "Saving…" : existing ? "Update rating" : "Submit rating"}
      </Button>
    </form>
  );
}
