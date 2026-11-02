import Link from "next/link";
import { PlaceCard } from "@/components/place-card";
import { CATEGORY_META, type PlaceCategory } from "@/lib/import/categories";
import type { TopPlace } from "@/lib/queries/cities";

export function CategorySection({
  category,
  places,
  total,
  href,
}: {
  category: PlaceCategory;
  places: TopPlace[];
  total: number;
  href: string;
}) {
  const meta = CATEGORY_META[category];
  return (
    <section id={category} className="scroll-mt-28">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">
            <span aria-hidden className="mr-1.5">
              {meta.emoji}
            </span>
            {meta.plural}
          </h3>
          <p className="text-muted-foreground text-sm">{meta.blurb}</p>
        </div>
        {total > places.length && (
          <Link
            href={href}
            prefetch={true}
            className="text-brand shrink-0 text-sm font-medium underline-offset-4 hover:underline"
          >
            All {total} →
          </Link>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} />
        ))}
      </div>
    </section>
  );
}
