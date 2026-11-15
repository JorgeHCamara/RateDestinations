import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFeaturedCityParams } from "@/lib/queries/cities";
import {
  CategoryFallback,
  CategoryList,
  categoryMetadata,
  loadCategoryPage,
} from "./category-list";

/**
 * The page checks its URL before anything streams (a missing place or city is a real 404, not a
 * 200 with a not-found page), so a first visit waits for that cached lookup instead of showing the
 * generic shell. Navigation to it is not expected to be instant.
 */
export const instant = false;

type Props = PageProps<"/city/[country]/[slug]/[category]">;

/**
 * One category of each featured city. Cache Components needs at least one full set of params (the
 * parent's come from its page, not a layout, so they aren't passed down); without it every
 * category URL was served the generic shell forever. Every other category page renders on its
 * first visit and is cached, as before.
 */
export async function generateStaticParams() {
  return (await getFeaturedCityParams()).map((p) => ({ ...p, category: "restaurant" }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, slug, category } = await params;
  return categoryMetadata(country, slug, category, 1);
}

// Checked before anything streams, so an unknown city or category is a real 404 (cached lookup).
export default async function CategoryPage(props: Props) {
  const { country, slug, category } = await props.params;
  if (!(await loadCategoryPage(country, slug, category, 1))) notFound();
  return (
    <Suspense fallback={<CategoryFallback />}>
      <CategoryList country={country} slug={slug} category={category} page={1} />
    </Suspense>
  );
}
