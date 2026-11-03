import Link from "next/link";
import { PlaceHoverPreview } from "@/components/place-hover-preview";
import { PlaceThumb } from "@/components/place-thumb";
import { ScorePill } from "@/components/score";
import { CATEGORY_META } from "@/lib/import/categories";
import type { TopPlace } from "@/lib/queries/cities";

export function PlaceCard({
  place,
  rank,
}: {
  place: TopPlace & { address?: string | null };
  rank?: number;
}) {
  return (
    <PlaceHoverPreview place={place}>
      <Link
        href={`/place/${place.id}`}
        className="group bg-card focus-visible:ring-ring/60 flex min-w-0 items-center gap-3 rounded-xl border p-2.5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2"
      >
        <PlaceThumb
          placeId={place.id}
          category={place.category}
          photo={
            place.image_url && place.image_source
              ? {
                  url: place.image_url,
                  source: place.image_source,
                  credit: place.image_credit ?? "",
                  page: place.image_page ?? "",
                }
              : null
          }
          checked={place.image_checked ?? false}
          rank={rank}
        />
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
        <ScorePill score={place.user_avg} count={place.user_count} />
      </Link>
    </PlaceHoverPreview>
  );
}
