import { House, Luggage } from "lucide-react";
import { localsVsVisitors, MIN_GROUP_TO_COMPARE } from "@/lib/locals";
import type { CityStats } from "@/lib/queries/cities";
import { toTenScale } from "@/lib/scoring";

/**
 * Who rated the city: the share of locals and visitors, each group's own score, and which group
 * likes the city more once both have enough ratings.
 */
export function LocalsVisitors({ stats, cityName }: { stats: CityStats; cityName: string }) {
  const split = localsVsVisitors(stats);
  if (!split) return null;
  const score = (v: number | null) => (v === null ? "—" : toTenScale(v).toFixed(1));
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  const verdict = {
    locals: `Locals rate ${cityName} higher than visitors do.`,
    visitors: `Visitors rate ${cityName} higher than locals do.`,
    same: `Locals and visitors rate ${cityName} about the same.`,
    "too-early": `Once at least ${MIN_GROUP_TO_COMPARE} locals and ${MIN_GROUP_TO_COMPARE} visitors have rated, you'll see who likes ${cityName} more.`,
  }[split.verdict];

  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Locals and visitors</p>
        <p className="text-muted-foreground text-xs">{people(split.total)} rated</p>
      </div>
      <div
        className="bg-muted flex h-2.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${split.localPct}% locals, ${split.visitorPct}% visitors`}
      >
        <span className="bg-brand h-full" style={{ width: `${split.localPct}%` }} />
        <span className="bg-chart-5 h-full" style={{ width: `${split.visitorPct}%` }} />
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="flex items-center gap-1.5">
            <span className="bg-brand size-2 rounded-full" aria-hidden />
            <House className="text-muted-foreground size-3.5" aria-hidden />
            Locals <span className="font-mono tabular-nums">{split.localPct}%</span>
          </dt>
          <dd className="text-muted-foreground mt-0.5 text-xs">
            {people(stats.local_count)} · score{" "}
            <span className="text-foreground font-mono tabular-nums">
              {score(stats.local_overall)}
            </span>
          </dd>
        </div>
        <div className="text-right">
          <dt className="flex items-center justify-end gap-1.5">
            <span className="bg-chart-5 size-2 rounded-full" aria-hidden />
            <Luggage className="text-muted-foreground size-3.5" aria-hidden />
            Visitors <span className="font-mono tabular-nums">{split.visitorPct}%</span>
          </dt>
          <dd className="text-muted-foreground mt-0.5 text-xs">
            {people(stats.visitor_count)} · score{" "}
            <span className="text-foreground font-mono tabular-nums">
              {score(stats.visitor_overall)}
            </span>
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">{verdict}</p>
    </div>
  );
}
