import { CONFIDENCE_LABEL, confidence, toTenScale, toneFor, type Tone } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const toneText: Record<Tone, string> = {
  good: "text-good",
  ok: "text-ok",
  bad: "text-bad",
  neutral: "text-muted-foreground",
};
const toneStroke: Record<Tone, string> = {
  good: "stroke-good",
  ok: "stroke-ok",
  bad: "stroke-bad",
  neutral: "stroke-muted-foreground/40",
};
const toneBg: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-muted text-muted-foreground",
};

/** Big ring for a city or place: 0–10 scale plus confidence label. */
export function ScoreRing({
  score,
  count,
  size = 112,
  label,
}: {
  score: number | null;
  count: number;
  size?: number;
  label?: string;
}) {
  const tone = toneFor(score, count);
  const value = score === null ? null : toTenScale(score);
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : value / 10;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className="stroke-muted fill-none"
            strokeWidth={8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className={cn(
              "fill-none transition-[stroke-dashoffset] duration-700",
              toneStroke[tone],
            )}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className={cn("font-display text-3xl font-semibold tabular-nums", toneText[tone])}>
            {value === null ? "—" : value.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        {label && <p className="text-sm font-medium">{label}</p>}
        <p className="text-muted-foreground text-sm">{CONFIDENCE_LABEL[confidence(count)]}</p>
        <p className="text-muted-foreground text-xs">
          {count === 0 ? "Be the first to rate" : `${count} ${count === 1 ? "rating" : "ratings"}`}
        </p>
      </div>
    </div>
  );
}

/** Compact pill, used in cards and lists. */
export function ScorePill({
  score,
  count,
  className,
}: {
  score: number;
  count: number;
  className?: string;
}) {
  const tone = toneFor(score, count);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        toneBg[tone],
        className,
      )}
      title={count ? `${count} community ratings` : "Estimated — not rated yet"}
    >
      {toTenScale(score).toFixed(1)}
      {count === 0 && <span className="font-sans font-normal opacity-70">est.</span>}
    </span>
  );
}
