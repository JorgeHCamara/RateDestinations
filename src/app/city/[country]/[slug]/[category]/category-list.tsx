import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { JsonLd } from "@/components/json-ld";
import { PlaceCard } from "@/components/place-card";
import { CATEGORY_META, PLACE_CATEGORIES, type PlaceCategory } from "@/lib/import/categories";
import { getCityBySlug, getCityCategory, getCityGuide } from "@/lib/queries/cities";
import { countryPath } from "@/lib/queries/countries";
import { MIN_CATEGORY_PLACES } from "@/lib/queries/seo";
import {
  breadcrumbJsonLd,
  categoryDescription,
  categoryTitle,
  cityPath,
} from "@/lib/structured-data";

/**
 * A category list, shown 48 places at a time: page 1 at /city/<cc>/<slug>/<category>, the rest at
 * …/<category>/page/<n> (a cached route of its own; a ?page= would make the page dynamic). Each
 * place card is data the page carries twice (HTML and RSC), so 200 at once made these the
 * heaviest pages.
 */
export const PAGE_SIZE = 48;

export function asCategory(c: string): PlaceCategory | null {
  return (PLACE_CATEGORIES as readonly string[]).includes(c) ? (c as PlaceCategory) : null;
}

export function categoryPagePath(country: string, slug: string, cat: string, page: number) {
  const base = `${cityPath(country, slug)}/${cat}`;
  return page <= 1 ? base : `${base}/page/${page}`;
}

/** The page's places, or null when the city, category or page doesn't exist. Cached reads. */
export async function loadCategoryPage(
  country: string,
  slug: string,
  category: string,
  page: number,
) {
  const cat = asCategory(category);
  if (!cat || !Number.isInteger(page) || page < 1) return null;
  const city = await getCityBySlug(country, slug);
  if (!city) return null;
  const all = await getCityCategory(city.id, cat, city.imported_at ?? "0");
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (page > pages) return null;
  return { cat, city, all, pages, places: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

export async function categoryMetadata(
  country: string,
  slug: string,
  category: string,
  page: number,
): Promise<Metadata> {
  const data = await loadCategoryPage(country, slug, category, page);
  if (!data) notFound();
  const { cat, city, all } = data;
  const guide = await getCityGuide(city.id, city.imported_at ?? "0");
  // The list shows at most 200; the guide counts them all.
  const count = Math.max(all.length, guide.counts[cat] ?? 0);
  const description = categoryDescription(
    cat,
    city,
    count,
    all.map((p) => p.name),
  );
  const title = page > 1 ? `${categoryTitle(cat, city)} (page ${page})` : categoryTitle(cat, city);
  return {
    title,
    description,
    alternates: { canonical: categoryPagePath(country, slug, cat, page) },
    // A list of one or two places isn't worth a search result (nor a sitemap entry); later pages
    // are for browsing, page 1 is what search should show.
    robots:
      all.length >= MIN_CATEGORY_PLACES && page === 1 ? undefined : { index: false, follow: true },
    openGraph: { title, description },
  };
}

export async function CategoryList({
  country,
  slug,
  category,
  page,
}: {
  country: string;
  slug: string;
  category: string;
  page: number;
}) {
  const data = await loadCategoryPage(country, slug, category, page);
  if (!data) notFound();
  const { cat, city, all, pages, places } = data;
  const meta = CATEGORY_META[cat];
  const back = `/city/${country.toLowerCase()}/${slug}`;
  return (
    <div className="container-page py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "RateDestinations", path: "/" },
          { name: city.country_name, path: countryPath(city.country_code) },
          { name: city.name, path: back },
          { name: meta.plural, path: `${back}/${cat}` },
        ])}
      />
      <nav className="text-muted-foreground mb-4 text-sm">
        <Link href={countryPath(city.country_code)} className="hover:underline">
          {city.country_name}
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={back} className="hover:underline">
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
        {all.length} places. Rated places are ranked by what people gave them; places nobody has
        rated yet follow, best-known first.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} rank={p.rank} />
        ))}
      </div>
      {all.length === 0 && (
        <p className="text-muted-foreground mt-6 rounded-xl border border-dashed p-6 text-sm">
          Nothing in this category yet.
        </p>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center gap-1.5 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
            n === page ? (
              <span
                key={n}
                aria-current="page"
                className="bg-foreground text-background rounded-md px-3 py-1.5 font-medium"
              >
                {n}
              </span>
            ) : (
              <Link
                key={n}
                href={categoryPagePath(country, slug, cat, n)}
                prefetch={false}
                className="hover:bg-accent rounded-md border px-3 py-1.5"
              >
                {n}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

export function CategoryFallback() {
  return (
    <div className="container-page py-10">
      <div className="bg-muted h-8 w-64 animate-pulse rounded" />
    </div>
  );
}
