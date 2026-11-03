"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { CITY_DIMENSIONS } from "@/lib/dimensions";
import { getSessionUser } from "@/lib/supabase/server";

export type RatingActionState = {
  ok: boolean;
  error?: string;
  /** No public name yet: the form links to the page that sets one. */
  needsName?: boolean;
};

const NEEDS_NAME: RatingActionState = {
  ok: false,
  needsName: true,
  error: "Choose the name shown on your reviews first.",
};

const placeSchema = z.object({
  placeId: z.coerce.number().int().positive(),
  stars: z.coerce.number().int().min(1).max(5),
  tags: z.array(z.string().regex(/^[a-z_]{2,30}$/)).max(5),
  comment: z
    .string()
    .trim()
    .max(500)
    .transform((s) => (s.length ? s : null)),
});

export async function ratePlace(
  _prev: RatingActionState,
  formData: FormData,
): Promise<RatingActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in to rate." };
  if (!user.name) return NEEDS_NAME;
  const parsed = placeSchema.safeParse({
    placeId: formData.get("placeId"),
    stars: formData.get("stars"),
    tags: formData.getAll("tags"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Pick a star rating first." };
  const { placeId, stars, tags, comment } = parsed.data;
  const place = await queryOne<{ city_id: number }>(
    "select city_id from places where id = $1 and not adult and not hidden",
    [placeId],
  );
  if (!place) return { ok: false, error: "This place no longer exists." };
  try {
    await query(
      `insert into place_ratings (place_id, user_id, stars, tags, comment) values ($1, $2, $3, $4, $5)
       on conflict (place_id, user_id) do update set stars = excluded.stars, tags = excluded.tags, comment = excluded.comment`,
      [placeId, user.id, stars, tags, comment],
    );
  } catch (err) {
    const error = friendlyDbError(err);
    return { ok: false, error, needsName: error === NEEDS_NAME.error };
  }
  updateTag(`place:${placeId}`);
  updateTag(`city:${place.city_id}`);
  updateTag("trending");
  return { ok: true };
}

export async function rateCity(
  _prev: RatingActionState,
  formData: FormData,
): Promise<RatingActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in to rate." };
  if (!user.name) return NEEDS_NAME;
  const cityId = z.coerce.number().int().positive().safeParse(formData.get("cityId"));
  if (!cityId.success) return { ok: false, error: "Invalid city." };
  const entries = CITY_DIMENSIONS.map(
    (d) => [d, Number(formData.get(`dim:${d}`) || 0)] as const,
  ).filter(([, v]) => v >= 1 && v <= 5);
  if (entries.length === 0) return { ok: false, error: "Rate at least one aspect of the city." };
  const role = z.enum(["local", "visitor"]).safeParse(formData.get("role"));
  if (!role.success) return { ok: false, error: "Tell us whether you live here or are visiting." };
  try {
    // The answer first, so the stats refreshed by the ratings below already count it.
    await query(
      `insert into city_raters (city_id, user_id, role) values ($1, $2, $3)
       on conflict (city_id, user_id) do update set role = excluded.role`,
      [cityId.data, user.id, role.data],
    );
    for (const [dimension, stars] of entries) {
      await query(
        `insert into city_ratings (city_id, user_id, dimension, stars) values ($1, $2, $3, $4)
         on conflict (city_id, user_id, dimension) do update set stars = excluded.stars`,
        [cityId.data, user.id, dimension, stars],
      );
    }
  } catch (err) {
    const error = friendlyDbError(err);
    return { ok: false, error, needsName: error === NEEDS_NAME.error };
  }
  updateTag(`city:${cityId.data}`);
  updateTag("trending");
  return { ok: true };
}

function friendlyDbError(err: unknown): string {
  const msg = (err as Error).message ?? "";
  if (msg.includes("public name required")) return NEEDS_NAME.error!;
  if (msg.includes("email domain not allowed"))
    return "Ratings from temporary email addresses aren't accepted. Sign in with your usual email or Google.";
  if (msg.includes("rating limit"))
    return "You've hit the limit of 30 ratings per day. Come back tomorrow!";
  if (msg.includes("unknown rating tag") || msg.includes("tags per rating"))
    return "One of the tags isn't valid.";
  return "Something went wrong saving your rating. Please try again.";
}
