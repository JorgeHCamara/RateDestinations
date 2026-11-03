import { CategoryIcon } from "@/components/category-icon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlacePagePhoto } from "@/components/place-hover-preview";
import { toPlaceImage } from "@/lib/images/place-image";
import { Suspense } from "react";
import { CityMapLazy } from "@/components/city-map-lazy";
import { PlaceRatingForm } from "@/components/rating/place-rating-form";
import { ScorePill, ScoreRing } from "@/components/score";
import { Stars } from "@/components/stars";
import { CATEGORY_META } from "@/lib/import/categories";
import {
  getNearbyPlaces,
  getPlace,
  getPlaceReviews,
  getRatingTags,
  type Place,
} from "@/lib/queries/places";
import { getMyPlaceRating } from "@/lib/queries/ratings";
import { getSessionUser } from "@/lib/supabase/server";

type Props = PageProps<"/place/[id]">;

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const placeId = parseId(id);
  const place = placeId ? await getPlace(placeId) : null;
  if (!place) return { title: "Place not found" };
  return {
    title: `${place.name} · ${place.city_name}`,
    description: `${place.name}, ${CATEGORY_META[place.category].label.toLowerCase()} in ${place.city_name}, ${place.country_name}: ratings from locals and travellers, warnings and what's nearby.`,
  };
}

export default function PlacePage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <div className="bg-muted h-10 w-72 animate-pulse rounded" />
        </div>
      }
    >
      <PlaceDetail params={props.params} />
    </Suspense>
  );
}

async function PlaceDetail({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const placeId = parseId(id);
  if (!placeId) notFound();
  const place = await getPlace(placeId);
  if (!place) notFound();
  const [reviews, nearby, tags] = await Promise.all([
    getPlaceReviews(place.id),
    getNearbyPlaces(place.id),
    getRatingTags(),
  ]);
  const tagLabel = new Map(tags.map((t) => [t.tag, t]));
  const cityHref = `/city/${place.country_code.toLowerCase()}/${place.city_slug}`;
  const meta = CATEGORY_META[place.category];
  const warningTags = Object.entries(place.tag_counts)
    .filter(([t]) => tagLabel.get(t)?.is_warning)
    .sort((a, b) => b[1] - a[1]);
  const goodTags = Object.entries(place.tag_counts)
    .filter(([t]) => tagLabel.get(t) && !tagLabel.get(t)!.is_warning)
    .sort((a, b) => b[1] - a[1]);

  return (
    <article className="container-page py-8">
      <nav className="text-muted-foreground mb-4 text-sm">
        <Link href={cityHref} prefetch={true} className="hover:underline">
          {place.city_name}
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`${cityHref}/${place.category}`} prefetch={true} className="hover:underline">
          {meta.plural}
        </Link>
      </nav>

      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-brand flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] uppercase">
            <CategoryIcon category={place.category} className="size-3.5" strokeWidth={2} />
            {place.subcategory ?? meta.label}
          </p>
          <h1 className="font-display mt-1 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {place.name}
          </h1>
          {place.tags.local_name && (
            <p className="text-muted-foreground">{place.tags.local_name}</p>
          )}
          <Facts place={place} />
        </div>
        <ScoreRing score={place.user_avg} count={place.user_count} label="Score" />
      </header>

      <PlacePagePhoto
        placeId={place.id}
        category={place.category}
        initial={toPlaceImage(place)}
        checked={place.image_checked}
        className="mt-6 max-w-2xl rounded-xl border"
      />

      {(warningTags.length > 0 || goodTags.length > 0) && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {warningTags.map(([t, n]) => (
            <span
              key={t}
              className="bg-bad-soft text-bad rounded-full px-2.5 py-1 text-xs font-medium"
            >
              {tagLabel.get(t)!.label} ×{n}
            </span>
          ))}
          {goodTags.map(([t, n]) => (
            <span
              key={t}
              className="bg-good-soft text-good rounded-full px-2.5 py-1 text-xs font-medium"
            >
              {tagLabel.get(t)!.label} ×{n}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-10">
          <section>
            <h2 className="font-display mb-3 text-2xl font-semibold">What people say</h2>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
                No ratings yet. Be the first to say what it&apos;s really like.
              </p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="bg-card rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Stars value={r.stars} readOnly size="sm" label={`${r.stars} stars`} />
                        <span className="text-sm font-medium">{r.display_name ?? "Member"}</span>
                        {r.rater_role === "local" && (
                          <span
                            className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[11px] font-medium"
                            title={`Lives in ${place.city_name}`}
                          >
                            Local
                          </span>
                        )}
                      </div>
                      <time className="text-muted-foreground text-xs" dateTime={r.created_at}>
                        {new Date(r.created_at).toLocaleDateString("en", {
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    {r.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className={`rounded-full px-2 py-0.5 text-[11px] ${tagLabel.get(t)?.is_warning ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}
                          >
                            {tagLabel.get(t)?.label ?? t}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.comment && <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display mb-3 text-2xl font-semibold">Where it is</h2>
            <CityMapLazy
              center={{ lat: place.lat, lng: place.lng }}
              zoom={15}
              height={320}
              pins={[
                {
                  id: place.id,
                  name: place.name,
                  category: place.category,
                  lat: place.lat,
                  lng: place.lng,
                  score: place.user_avg,
                  count: place.user_count,
                  warning: place.warning_count > 0,
                },
              ]}
            />
            <a
              className="text-muted-foreground mt-2 inline-block text-xs underline-offset-2 hover:underline"
              href={`https://www.openstreetmap.org/${place.source_id}`}
              rel="noreferrer"
              target="_blank"
            >
              View on OpenStreetMap ↗
            </a>
          </section>

          {nearby.length > 0 && (
            <section>
              <h2 className="font-display mb-3 text-2xl font-semibold">Nearby, also worth it</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {nearby.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/place/${n.id}`}
                      className="bg-card hover:bg-accent flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <CategoryIcon
                          category={n.category}
                          className="text-muted-foreground mr-1.5 inline size-3.5 align-[-2px]"
                        />
                        {n.name}{" "}
                        <span className="text-muted-foreground text-xs">· {n.distance_m} m</span>
                      </span>
                      <ScorePill score={n.user_avg} count={n.user_count} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl border" />}>
            <RatingPanel placeId={place.id} />
          </Suspense>
        </aside>
      </div>
    </article>
  );
}

async function RatingPanel({ placeId }: { placeId: number }) {
  const [user, tags] = await Promise.all([getSessionUser(), getRatingTags()]);
  const existing = user ? await getMyPlaceRating(user.id, placeId) : null;
  return (
    <PlaceRatingForm placeId={placeId} tags={tags} existing={existing} signedIn={Boolean(user)} />
  );
}

function Facts({ place }: { place: Place }) {
  const items: { label: string; value: React.ReactNode }[] = [];
  if (place.address) items.push({ label: "Address", value: place.address });
  if (place.opening_hours)
    items.push({
      label: "Hours",
      value: <span className="font-mono text-xs">{place.opening_hours}</span>,
    });
  if (place.website)
    items.push({
      label: "Website",
      value: (
        <a
          className="text-brand underline-offset-2 hover:underline"
          href={place.website}
          rel="noreferrer nofollow"
          target="_blank"
        >
          {new URL(place.website).hostname}
        </a>
      ),
    });
  if (place.phone) items.push({ label: "Phone", value: place.phone });
  if (place.wikipedia) {
    const [lang, title] = place.wikipedia.includes(":")
      ? place.wikipedia.split(/:(.+)/)
      : ["en", place.wikipedia];
    items.push({
      label: "Wikipedia",
      value: (
        <a
          className="text-brand underline-offset-2 hover:underline"
          href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`}
          rel="noreferrer"
          target="_blank"
        >
          {title}
        </a>
      ),
    });
  }
  if (items.length === 0) return null;
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
