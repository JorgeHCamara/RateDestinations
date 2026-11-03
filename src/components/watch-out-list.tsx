import { CategoryIcon } from "@/components/category-icon";
import Link from "next/link";
import { ScorePill } from "@/components/score";
import type { WatchOutPlace } from "@/lib/queries/cities";
import type { RatingTag } from "@/lib/queries/places";

export function WatchOutList({ places, tags }: { places: WatchOutPlace[]; tags: RatingTag[] }) {
  const labels = new Map(tags.map((t) => [t.tag, t]));
  if (places.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
        Nothing flagged yet. When people rate a place 1–2 stars or tag it as dirty, unsafe, a scam
        or overpriced, it shows up here so everyone knows.
      </div>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {places.map((p) => {
        const warn = Object.entries(p.tag_counts)
          .filter(([t]) => labels.get(t)?.is_warning)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        return (
          <li key={p.id}>
            <Link
              href={`/place/${p.id}`}
              className="border-bad/20 bg-bad-soft/40 hover:bg-bad-soft/70 flex items-start gap-3 rounded-xl border p-3 transition"
            >
              <span
                className="bg-card grid size-9 shrink-0 place-items-center rounded-lg"
                aria-hidden
              >
                <CategoryIcon category={p.category} className="text-bad" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {warn.length
                    ? warn.map(([t, n]) => `${labels.get(t)?.label} ×${n}`).join(" · ")
                    : `${p.warning_count} low rating${p.warning_count > 1 ? "s" : ""}`}
                </span>
              </span>
              <ScorePill score={p.blended_score} count={p.user_count} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
