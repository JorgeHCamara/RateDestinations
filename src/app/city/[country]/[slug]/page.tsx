import { Star } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategorySection } from "@/components/category-section";
import { CityMapLazy, type MapPinInput } from "@/components/city-map-lazy";
import { DimensionBars } from "@/components/dimension-bars";
import { ImportStatus } from "@/components/import-status";
import { LocalsVisitors } from "@/components/locals-visitors";
import { CityRatingForm } from "@/components/rating/city-rating-form";
import { ScoreRing } from "@/components/score";
import { StickyAside } from "@/components/sticky-aside";
import { WatchOutList } from "@/components/watch-out-list";
import { CATEGORY_META, PLACE_CATEGORIES } from "@/lib/import/categories";
import {
  getCityBasic,
  getCityBySlug,
  getCityGuide,
  getFeaturedCityParams,
  type City,
} from "@/lib/queries/cities";
import { getRatingTags } from "@/lib/queries/places";
import { getMyCityRatings, getMyCityRole } from "@/lib/queries/ratings";
import { getSessionUser } from "@/lib/supabase/server";

type Props = PageProps<"/city/[country]/[slug]">;

// Only the featured cities are prerendered at build time; every other city gets the App
// Shell on first visit and is cached from then on (ISR with Cache Components).
export async function generateStaticParams() {
  return getFeaturedCityParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, slug } = await params;
  const city = await getCityBasic(country, slug);
  if (!city) return { title: "City not found" };
  const title = `${city.name}, ${city.country_name}`;
  return {
    title,
    description: `${city.name} travel guide: the best restaurants, parks, sights and nightlife, and what to avoid — safety, cleanliness and scams rated by locals and travellers.`,
    alternates: { canonical: `/city/${country.toLowerCase()}/${slug}` },
    openGraph: { title: `${title} — the whole city, rated`, type: "article" },
  };
}

export default function CityPage(props: Props) {
  return (
    <Suspense fallback={<CitySkeleton />}>
      <CityGuide params={props.params} />
    </Suspense>
  );
}

async function CityGuide({ params }: { params: Props["params"] }) {
  const { country, slug } = await params;
  const city = await getCityBySlug(country, slug);
  if (!city) notFound();

  const building = city.import_status !== "done";
  const guide = building ? null : await getCityGuide(city.id, city.imported_at ?? "0");
  const returnTo = `/city/${country.toLowerCase()}/${slug}`;

  return (
    <article>
      <Hero
        city={city}
        overall={guide?.stats.overall ?? null}
        ratingCount={guide?.stats.rating_count ?? 0}
        placeCount={guide?.placeCount ?? 0}
      />

      <div className="container-page grid gap-10 py-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-12">
          {building && (
            <ImportStatus
              cityId={city.id}
              initialStatus={city.import_status}
              startedAt={city.import_status === "pending" ? city.imported_at : null}
            />
          )}

          {guide && (
            <>
              <section>
                <SectionTitle kicker="At a glance" title={`How people rate ${city.name}`} />
                <div className="bg-card rounded-xl border p-5">
                  <DimensionBars stats={guide.stats} />
                  {guide.stats.rating_count === 0 && (
                    <p className="text-muted-foreground mt-4 text-sm">
                      No one has rated {city.name} yet. The bars fill in as locals and visitors rate
                      safety, food, value and more.
                    </p>
                  )}
                  <LocalsVisitors stats={guide.stats} cityName={city.name} />
                </div>
              </section>

              <section>
                <SectionTitle kicker="Watch out" title="What people warn about" tone="bad" />
                <WatchOutSection cityId={city.id} version={city.imported_at ?? "0"} />
              </section>

              <section>
                <SectionTitle kicker="The good" title="Worth your time" tone="good" />
                <nav aria-label="Categories" className="mb-5 flex flex-wrap gap-1.5">
                  {PLACE_CATEGORIES.filter((c) => guide.byCategory.has(c)).map((c) => (
                    <a
                      key={c}
                      href={`#${c}`}
                      className="bg-card hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                    >
                      <CategoryIcon category={c} className="text-muted-foreground size-3.5" />
                      {CATEGORY_META[c].plural}{" "}
                      <span className="text-muted-foreground">{guide.counts[c]}</span>
                    </a>
                  ))}
                </nav>
                <div className="space-y-10">
                  {PLACE_CATEGORIES.filter((c) => guide.byCategory.has(c)).map((c) => (
                    <CategorySection
                      key={c}
                      category={c}
                      places={guide.byCategory.get(c)!}
                      total={guide.counts[c] ?? 0}
                      href={`${returnTo}/${c}`}
                    />
                  ))}
                  {guide.placeCount === 0 && (
                    <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
                      Open map data has very little here yet. Ratings from locals and visitors will
                      still build this guide over time.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <SectionTitle kicker="Map" title="Where everything is" />
                <CityMapLazy
                  center={{ lat: city.lat, lng: city.lng }}
                  pins={pinsFromGuide(guide)}
                  zoom={city.population > 2_000_000 ? 11.5 : 12.5}
                />
              </section>

              <aside className="bg-surface text-muted-foreground rounded-xl border p-4 text-sm leading-relaxed">
                <p className="text-foreground font-medium">About this guide</p>
                <p className="mt-1">
                  Before anyone rates a place, its score is an estimate based on how well documented
                  and established it is. Community ratings take over as they come in.
                </p>
              </aside>
            </>
          )}
        </div>

        {/* Stays in view beside the guide on wide screens, at full height: on a short screen it
            pins by its bottom edge, so Save is always a short scroll away. */}
        <StickyAside id="rate" className="scroll-mt-20">
          <Suspense fallback={<div className="bg-muted h-72 animate-pulse rounded-xl border" />}>
            <CityRatingPanel city={city} returnTo={returnTo} />
          </Suspense>
        </StickyAside>
      </div>
    </article>
  );
}

async function WatchOutSection({ cityId, version }: { cityId: number; version: string }) {
  const [guide, tags] = await Promise.all([getCityGuide(cityId, version), getRatingTags()]);
  return <WatchOutList places={guide.watchOut} tags={tags} />;
}

async function CityRatingPanel({ city, returnTo }: { city: City; returnTo: string }) {
  const user = await getSessionUser();
  const [existing, existingRole] = user
    ? await Promise.all([getMyCityRatings(user.id, city.id), getMyCityRole(user.id, city.id)])
    : [{}, null];
  return (
    <CityRatingForm
      cityId={city.id}
      cityName={city.name}
      existing={existing}
      existingRole={existingRole}
      signedIn={Boolean(user)}
      returnTo={returnTo}
    />
  );
}

function Hero({
  city,
  overall,
  ratingCount,
  placeCount,
}: {
  city: City;
  overall: number | null;
  ratingCount: number;
  placeCount: number;
}) {
  return (
    <header className="bg-surface border-b">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-brand text-xs font-semibold tracking-[0.2em] uppercase">
            {city.country_name}
            {city.admin1 && city.admin1 !== city.name ? ` · ${city.admin1}` : ""}
          </p>
          <h1 className="font-display mt-1 text-5xl leading-none font-semibold tracking-tight sm:text-6xl">
            {city.name}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            {city.population.toLocaleString()} people
            {placeCount > 0 && ` · ${placeCount.toLocaleString()} places in this guide`}
          </p>
          {/* On narrow screens the rating form sits below the whole guide. */}
          <a
            href="#rate"
            className="bg-foreground text-background mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium lg:hidden"
          >
            <Star className="size-4" aria-hidden />
            Rate {city.name}
          </a>
        </div>
        <ScoreRing score={overall} count={ratingCount} label="City score" />
      </div>
    </header>
  );
}

function SectionTitle({
  kicker,
  title,
  tone,
}: {
  kicker: string;
  title: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="mb-4">
      <p
        className={`text-xs font-semibold tracking-[0.2em] uppercase ${tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "text-brand"}`}
      >
        {kicker}
      </p>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
    </div>
  );
}

function pinsFromGuide(guide: Awaited<ReturnType<typeof getCityGuide>>): MapPinInput[] {
  const pins: MapPinInput[] = [];
  const seen = new Set<number>();
  for (const p of guide.watchOut) {
    seen.add(p.id);
    pins.push({
      id: p.id,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      score: p.blended_score,
      count: p.user_count,
      warning: true,
    });
  }
  for (const list of guide.byCategory.values()) {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      pins.push({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        score: p.blended_score,
        count: p.user_count,
        warning: false,
      });
    }
  }
  return pins;
}

function CitySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-surface border-b">
        <div className="container-page flex items-end justify-between gap-6 py-10">
          <div className="space-y-3">
            <div className="bg-muted h-3 w-24 rounded" />
            <div className="bg-muted h-12 w-72 rounded" />
            <div className="bg-muted h-3 w-40 rounded" />
          </div>
          <div className="bg-muted size-28 rounded-full" />
        </div>
      </div>
      <div className="container-page grid gap-10 py-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="bg-muted h-40 rounded-xl" />
          <div className="bg-muted h-40 rounded-xl" />
          <div className="bg-muted h-64 rounded-xl" />
        </div>
        <div className="bg-muted h-72 rounded-xl" />
      </div>
    </div>
  );
}
