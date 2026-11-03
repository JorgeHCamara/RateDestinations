"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { safeNext } from "@/lib/auth-next";
import { cleanPublicName, publicNameProblem } from "@/lib/public-name";
import { getSessionUser } from "@/lib/supabase/server";

export type PublicNameState = { ok?: boolean; error?: string };

/**
 * Set the name shown on the person's reviews (profiles.display_name). Used by /welcome right
 * after a first email sign-in, and by "My ratings". The database checks the same rules.
 */
export async function setPublicName(
  _prev: PublicNameState,
  formData: FormData,
): Promise<PublicNameState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in again." };
  const name = cleanPublicName(String(formData.get("name") ?? ""));
  const problem = publicNameProblem(name);
  if (problem) return { error: problem };
  try {
    await query("update profiles set display_name = $2 where id = $1", [user.id, name]);
  } catch (err) {
    return {
      error: (err as Error).message.includes("invalid public name")
        ? "That name can't be used. Pick another."
        : "Couldn't save your name. Please try again.",
    };
  }
  // Reviews already written show the new name: refresh the pages that list them.
  const places = await query<{ place_id: number }>(
    "select distinct place_id from place_ratings where user_id = $1 limit 200",
    [user.id],
  );
  for (const { place_id } of places) updateTag(`place:${place_id}`);
  const next = formData.get("next");
  if (typeof next === "string" && next) redirect(safeNext(next));
  return { ok: true };
}
