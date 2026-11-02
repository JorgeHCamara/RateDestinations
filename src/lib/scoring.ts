/**
 * Rating blend — the single source of truth for how RateDestinations turns ratings into a score.
 * The SQL functions blend_score() / place_prior() in supabase/migrations mirror this; keep in sync.
 *
 * Bayesian shrinkage: a place with few platform ratings leans on a prior (an external rating
 * when we have one, otherwise a prominence-based default). As the community rates it, the
 * community takes over automatically:  w = n / (n + K).
 */
export const K = 10;

export type Confidence = "none" | "low" | "medium" | "high";

export function userWeight(userCount: number): number {
  if (userCount <= 0) return 0;
  return userCount / (userCount + K);
}

/** Prior rating (1..5) for a place nobody on the platform has rated yet. */
export function placePrior(externalRating: number | null | undefined, prominence: number): number {
  if (externalRating !== null && externalRating !== undefined && Number.isFinite(externalRating))
    return externalRating;
  const p = Math.min(100, Math.max(0, prominence));
  return round2(3.5 + p / 200);
}

export function blendScore(
  userAvg: number | null | undefined,
  userCount: number,
  prior: number,
): number {
  if (!userCount || userAvg === null || userAvg === undefined) return round2(prior);
  const w = userWeight(userCount);
  return round2(w * userAvg + (1 - w) * prior);
}

export function confidence(userCount: number): Confidence {
  if (userCount <= 0) return "none";
  if (userCount < 3) return "low";
  if (userCount < 15) return "medium";
  return "high";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: "Not rated yet",
  low: "Early signal",
  medium: "Community rated",
  high: "Community verified",
};

/** 1..5 star scale → 0..10 display scale. */
export function toTenScale(stars: number): number {
  return Math.round(stars * 20) / 10;
}

export type Tone = "good" | "ok" | "bad" | "neutral";

/** Colour tone for a 1..5 score. */
export function toneFor(stars: number | null | undefined, userCount = 1): Tone {
  if (stars === null || stars === undefined || userCount <= 0) return "neutral";
  if (stars >= 4) return "good";
  if (stars >= 3) return "ok";
  return "bad";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
