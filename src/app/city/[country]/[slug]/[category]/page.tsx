import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlaceCard } from "@/components/place-card";
import { CATEGORY_META, PLACE_CATEGORIES, type PlaceCategory } from "@/lib/import/categories";
import { getCityBasic, getCityBySlug, getCityCategory } from "@/lib/queries/cities";

type Props = PageProps<"/city/[country]/[slug]/[category]">;

function asCategory(c: string): PlaceCategory | null {
  return (PLACE_CATEGORIES as readonly string[]).includes(c) ? (c as PlaceCategory) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, slug, category } = await params;
  const cat = asCategory(category);
  const city = await getCityBasic(country, slug);
  if (!city || !cat) return { title: "Not found" };
  return {
    title: `${CATEGORY_META[cat].plural} in ${city.name}`,
    description: `The best ${CATEGORY_META[cat].plural.toLowerCase()} in ${city.name}, ${city.country_name}, ranked by travellers.`,
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
      <nav className="text-muted-foreground mb-4 text-sm">
        <Link href={back} prefetch={true} className="hover:underline">
          {city.name}
        </Link>{" "}
        <span aria-hidden>/</span> {meta.plural}
      </nav>
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">
        <span aria-hidden className="mr-2">
          {meta.emoji}
        </span>
        {meta.plural} in {city.name}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {places.length} places, best first. Estimates (est.) become community scores as people rate.
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
