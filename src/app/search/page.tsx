import Link from "next/link";
import { Suspense } from "react";
import { CitySearch } from "@/components/city-search";
import { searchCities } from "@/lib/queries/cities";

export const metadata = { title: "Search cities", robots: { index: false, follow: true } };

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <div className="container-page py-10">
      <h1 className="font-display mb-4 text-3xl font-semibold">Find a city</h1>
      <div className="max-w-2xl">
        <CitySearch autoFocus />
      </div>
      <Suspense fallback={<p className="text-muted-foreground mt-8 text-sm">Searching…</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const { q } = await searchParams;
  const term = typeof q === "string" ? q : "";
  if (term.trim().length < 2) return null;
  const hits = await searchCities(term, 20);
  if (hits.length === 0) {
    return (
      <p className="text-muted-foreground mt-8 text-sm">
        No city matches “{term}”. We cover places with more than 15,000 people — try the nearest
        bigger town.
      </p>
    );
  }
  return (
    <ul className="bg-card mt-8 max-w-2xl divide-y rounded-xl border">
      {hits.map((h) => (
        <li key={h.id}>
          <Link
            href={`/city/${h.country_code.toLowerCase()}/${h.slug}`}
            prefetch={true}
            className="hover:bg-accent flex items-baseline justify-between gap-3 px-4 py-3"
          >
            <span>
              <span className="font-medium">{h.name}</span>
              <span className="text-muted-foreground">
                {h.admin1 ? `, ${h.admin1}` : ""} · {h.country_name}
              </span>
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {h.population.toLocaleString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
