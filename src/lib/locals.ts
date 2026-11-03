import { toTenScale } from "@/lib/scoring";

type GroupStats = {
  local_count: number;
  visitor_count: number;
  local_overall: number | null;
  visitor_overall: number | null;
};

/** Each group needs this many raters before their scores are compared. */
export const MIN_GROUP_TO_COMPARE = 3;
/** Scores closer than this (0–10 scale) count as the same. */
const SAME_SCORE = 0.3;

export type LocalsVisitors = {
  total: number;
  localPct: number;
  visitorPct: number;
  /** Who likes the city more, once both groups have enough raters. */
  verdict: "locals" | "visitors" | "same" | "too-early";
};

/** How a city's raters split between locals and visitors, and which group rates it higher. */
export function localsVsVisitors(s: GroupStats): LocalsVisitors | null {
  const total = s.local_count + s.visitor_count;
  if (total === 0) return null;
  const localPct = Math.round((s.local_count / total) * 100);
  let verdict: LocalsVisitors["verdict"] = "too-early";
  if (
    s.local_count >= MIN_GROUP_TO_COMPARE &&
    s.visitor_count >= MIN_GROUP_TO_COMPARE &&
    s.local_overall !== null &&
    s.visitor_overall !== null
  ) {
    const diff = toTenScale(s.local_overall) - toTenScale(s.visitor_overall);
    verdict = Math.abs(diff) < SAME_SCORE ? "same" : diff > 0 ? "locals" : "visitors";
  }
  return { total, localPct, visitorPct: 100 - localPct, verdict };
}
