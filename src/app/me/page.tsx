import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PublicNameForm } from "@/components/public-name-form";
import { Stars } from "@/components/stars";
import { DIMENSION_META, type CityDimension } from "@/lib/dimensions";
import { getMyRatings } from "@/lib/queries/ratings";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = { title: "My ratings", robots: { index: false } };

export default function MePage() {
  return (
    <div className="container-page py-10">
      <h1 className="font-display text-3xl font-semibold">My ratings</h1>
      <Suspense fallback={<div className="bg-muted mt-6 h-40 animate-pulse rounded-xl" />}>
        <PublicName />
        <MyRatings />
      </Suspense>
    </div>
  );
}

/** The name shown on this person's reviews, editable here (a Google name can be swapped too). */
async function PublicName() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/me");
  return (
    <section className="bg-card mt-6 max-w-md rounded-xl border p-5">
      <PublicNameForm initial={user.name} />
    </section>
  );
}

async function MyRatings() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/me");
  const rows = await getMyRatings(user.id);
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground mt-6 rounded-xl border border-dashed p-6 text-sm">
        You haven&apos;t rated anything yet. Open a city you know and tell everyone what it&apos;s
        really like.
      </p>
    );
  }
  return (
    <ul className="bg-card mt-6 divide-y rounded-xl border">
      {rows.map((r) => {
        const cityHref = `/city/${r.country_code.toLowerCase()}/${r.city_slug}`;
        const href = r.kind === "place" ? `/place/${r.place_id}` : cityHref;
        const label =
          r.kind === "place"
            ? r.label
            : `${r.city_name}: ${DIMENSION_META[r.label as CityDimension]?.label ?? r.label}`;
        return (
          <li
            key={`${r.kind}-${r.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <Link href={href} className="font-medium hover:underline">
                {label}
              </Link>
              <p className="text-muted-foreground text-xs">
                {r.kind === "place" ? r.city_name : "City rating"} ·{" "}
                {new Date(r.updated_at).toLocaleDateString("en", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <Stars value={r.stars} readOnly size="sm" label={`${r.stars} stars`} />
          </li>
        );
      })}
    </ul>
  );
}
