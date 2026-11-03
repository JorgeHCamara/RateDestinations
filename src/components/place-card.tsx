import Link from "next/link";
import { ScorePill } from "@/components/score";
import { CATEGORY_META } from "@/lib/import/categories";
import type { TopPlace } from "@/lib/queries/cities";

export function PlaceCard({ place, rank }: { place: TopPlace; rank?: number }) {
  return (
    <Link
      href={`/place/${place.id}`}
      className="group bg-card focus-visible:ring-ring/60 flex items-start gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2"
    >
      <span
        className="bg-surface font-display grid size-9 shrink-0 place-items-center rounded-lg text-lg"
        aria-hidden
      >
        {rank ? (
          <span className="text-muted-foreground font-mono text-xs">#{rank}</span>
        ) : (
          CATEGORY_META[place.category].emoji
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium group-hover:underline group-hover:underline-offset-2">
          {place.name}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {place.subcategory ?? CATEGORY_META[place.category].label}
          {place.warning_count > 0 && (
            <span className="text-bad">
              {" "}
              · {place.warning_count} warning{place.warning_count > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </span>
      <ScorePill score={place.blended_score} count={place.user_count} />
    </Link>
  );
}
