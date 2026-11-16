import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFeaturedCityParams } from "@/lib/queries/cities";
import {
  CategoryFallback,
  CategoryList,
  categoryMetadata,
  loadCategoryPage,
} from "../../category-list";

/** Pages 2+ of a category list (page 1 is the category URL itself). See ../../category-list.tsx. */
export const instant = false;

type Props = PageProps<"/city/[country]/[slug]/[category]/page/[n]">;

function pageNumber(n: string): number {
  // "2", not "02" or "2.0": one URL per page. Page 1 lives at the category URL.
  return /^[2-9]\d*$/.test(n) ? Number(n) : 0;
}

/** One sample, which Cache Components needs; every other page renders on its first visit. */
export async function generateStaticParams() {
  return (await getFeaturedCityParams()).map((p) => ({ ...p, category: "restaurant", n: "2" }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, slug, category, n } = await params;
  const page = pageNumber(n);
  if (!page) notFound();
  return categoryMetadata(country, slug, category, page);
}

// Checked before anything streams (a page past the end is a 404), like the category page.
export default async function CategoryPageN(props: Props) {
  const { country, slug, category, n } = await props.params;
  const page = pageNumber(n);
  if (!page || !(await loadCategoryPage(country, slug, category, page))) notFound();
  return (
    <Suspense fallback={<CategoryFallback />}>
      <CategoryList country={country} slug={slug} category={category} page={page} />
    </Suspense>
  );
}
