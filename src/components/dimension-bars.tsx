import { DimensionInfo } from "@/components/dimension-info";
import { CITY_DIMENSIONS, DIMENSION_META } from "@/lib/dimensions";
import type { CityStats } from "@/lib/queries/cities";
import { toTenScale, toneFor } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const fill = {
  good: "bg-good",
  ok: "bg-ok",
  bad: "bg-bad",
  neutral: "bg-muted-foreground/30",
} as const;

export function DimensionBars({ stats, compact = false }: { stats: CityStats; compact?: boolean }) {
  return (
    <ul className={cn("grid gap-x-8 gap-y-2.5", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
      {CITY_DIMENSIONS.map((d) => {
        const s = stats.dimensions[d];
        // The average people gave for this dimension, not pulled toward a default.
        const tone = toneFor(s?.avg ?? null, s?.count ?? 0);
        const pct = s ? (toTenScale(s.avg) / 10) * 100 : 0;
        return (
          <li key={d} className="grid grid-cols-[8.75rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5">
              <span className="truncate">{DIMENSION_META[d].label}</span>
              <DimensionInfo dimension={d} />
            </span>
            <span className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-700",
                  fill[tone],
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-muted-foreground text-right font-mono text-xs tabular-nums">
              {s ? toTenScale(s.avg).toFixed(1) : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
