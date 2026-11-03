import { CategoryIcon } from "@/components/category-icon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { PlaceCard } from "@/components/place-card";
import { CATEGORY_META, PLACE_CATEGORIES, type PlaceCategory } from "@/lib/import/categories";
import { getCityBySlug, getCityCategory, getCityGuide } from "@/lib/queries/cities";
import { MIN_CATEGORY_PLACES } from "@/lib/queries/seo";
import {
  breadcrumbJsonLd,
  categoryDescription,
  categoryTitle,
  cityPath,
} from "@/lib/structured-data";

type Props = PageProps<"/city/[country]/[slug]/[category]">;

function asCategory(c: string): PlaceCategory | null {
  return (PLACE_CATEGORIES as readonly string[]).includes(c) ? (c as PlaceCategory) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, slug, category } = await params;
  const cat = asCategory(category);
  const city = cat ? await getCityBySlug(country, slug) : null;
  if (!city || !cat) return { title: "Not found" };
  const version = city.imported_at ?? "0";
  const [places, guide] = await Promise.all([
    getCityCategory(city.id, cat, version),
    getCityGuide(city.id, version),
  ]);
  // The list shows at most 200; the guide counts them all.
  const count = Math.max(places.length, guide.counts[cat] ?? 0);
  const description = categoryDescription(
    cat,
    city,
    count,
    places.map((p) => p.name),
  );
  return {
    title: categoryTitle(cat, city),
    description,
    alternates: { canonical: `${cityPath(country, slug)}/${cat}` },
    // A list of one or two places isn't worth a search result (nor a sitemap entry).
    robots: places.length >= MIN_CATEGORY_PLACES ? undefined : { index: false, follow: true },
    openGraph: { title: categoryTitle(cat, city), description },
  };
}

export default function CategoryPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <div className="bg-muted h-8 w-64 animate-pulse rounded" />
        </div>
      }
    >
      <CategoryList params={props.params} />
    </Suspense>
  );
}

async function CategoryList({ params }: { params: Props["params"] }) {
  const { country, slug, category } = await params;
  const cat = asCategory(category);
  if (!cat) notFound();
  const city = await getCityBySlug(country, slug);
  if (!city) notFound();
  const places = await getCityCategory(city.id, cat, city.imported_at ?? "0");
  const meta = CATEGORY_META[cat];
  const back = `/city/${country.toLowerCase()}/${slug}`;
  return (
    <div className="container-page py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "RateDestinations", path: "/" },
          { name: city.name, path: back },
          { name: meta.plural, path: `${back}/${cat}` },
        ])}
      />
      <nav className="text-muted-foreground mb-4 text-sm">
        <Link href={back} prefetch={true} className="hover:underline">
          {city.name}
        </Link>{" "}
        <span aria-hidden>/</span> {meta.plural}
      </nav>
      <h1 className="font-display flex items-center gap-3 text-3xl font-semibold sm:text-4xl">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-lg">
          <CategoryIcon category={cat} className="size-5" />
        </span>
        {meta.plural} in {city.name}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {places.length} places. Rated places are ranked by what people gave them; places nobody has
        rated yet follow, best-known first.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} rank={p.rank} />
        ))}
      </div>
      {places.length === 0 && (
        <p className="text-muted-foreground mt-6 rounded-xl border border-dashed p-6 text-sm">
          Nothing in this category yet.
        </p>
      )}
    </div>
  );
}
