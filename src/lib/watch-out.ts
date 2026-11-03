/**
 * When a place goes into a city's Watch out list. The database applies these
 * (city_watch_out, migration 0008); they are here to explain the rule on the page. Keep in step.
 *
 * A warning is a rating of 1-2 stars or one with a warning tag; each person rates a place once.
 */
export const WATCH_OUT_MIN_WARNINGS = 2;
/** Warnings must be at least this share of the place's ratings. */
export const WATCH_OUT_MIN_SHARE = 1 / 3;

export function isWatchOut(warningCount: number, ratingCount: number): boolean {
  return (
    warningCount >= WATCH_OUT_MIN_WARNINGS && warningCount >= ratingCount * WATCH_OUT_MIN_SHARE
  );
}
