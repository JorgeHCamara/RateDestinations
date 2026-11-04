import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CountryMapLazy } from "@/components/country-map-lazy";
import { JsonLd } from "@/components/json-ld";
import { ScorePill } from "@/components/score";
import {
  CONTINENTS,
  MIN_COUNTRY_GUIDES,
  countryPath,
  getCitiesWithoutGuide,
  getCountriesWithGuides,
  getCountry,
  getCountryGuides,
} from "@/lib/queries/countries";
import {
  breadcrumbJsonLd,
  cityPath,
  countryDescription,
  countryTitle,
} from "@/lib/structured-data";

/**
 * /country/<code>: a country's city guides, on a map and in a list, and its biggest cities that
 * have no guide yet. Countries with fewer than 2 guides are kept out of search results (a page
 * repeating one city adds nothing) until they have more.
 */

type Props = PageProps<"/country/[code]">;

// The countries with enough guides are prerendered; any other country renders on its first visit.
export async function generateStaticParams() {
  const countries = await getCountriesWithGuides(MIN_COUNTRY_GUIDES).catch(() => []);
  return countries.length
    ? countries.map((c) => ({ code: c.code.toLowerCase() }))
    : [{ code: "pt" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const country = await getCountry(code);
  if (!country) return { title: "Country not found" };
  const guides = await getCountryGuides(country.code);
  const description = countryDescription(
    country,
    guides.map((c) => c.name),
  );
  return {
    title: countryTitle(country),
    description,
    alternates: { canonical: countryPath(country.code) },
    robots: guides.length >= MIN_COUNTRY_GUIDES ? undefined : { index: false, follow: true },
    openGraph: { title: `${country.name} — city guides, rated`, description },
  };
}

export default function CountryPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <div className="bg-muted h-12 w-72 animate-pulse rounded" />
        </div>
      }
    >
      <CountryGuide params={props.params} />
    </Suspense>
  );
}

async function CountryGuide({ params }: { params: Props["params"] }) {
  const { code } = await params;
  const country = await getCountry(code);
  if (!country) notFound();
  const [guides, others] = await Promise.all([
    getCountryGuides(country.code),
    getCitiesWithoutGuide(country.code, 24),
  ]);
  const path = countryPath(country.code);
  const continent = country.continent ? CONTINENTS[country.continent] : null;
  const places = guides.reduce((n, c) => n + c.place_count, 0);
  const ratings = guides.reduce((n, c) => n + c.rating_count, 0);

  return (
    <article>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "RateDestinations", path: "/" },
          { name: "All city guides", path: "/cities" },
          { name: country.name, path },
        ])}
      />
      <header className="bg-surface border-b">
        <div className="container-page py-10">
          <nav className="text-muted-foreground mb-3 text-sm">
            <Link href="/cities" className="hover:underline">
              All city guides
            </Link>
            {continent && (
              <>
                {" "}
                <span aria-hidden>/</span>{" "}
                <Link
                  href={`/cities#${country.continent!.toLowerCase()}`}
                  className="hover:underline"
                >
                  {continent}
                </Link>
              </>
            )}
          </nav>
          <h1 className="font-display text-5xl leading-none font-semibold tracking-tight sm:text-6xl">
            {country.name}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">
            {guides.length === 0
              ? "No city guides yet."
              : `${guides.length} ${guides.length === 1 ? "city guide" : "city guides"} · ${places.toLocaleString("en-US")} places`}
            {ratings > 0 && ` · ${ratings.toLocaleString("en-US")} ratings`}
          </p>
        </div>
      </header>

      <div className="container-page space-y-12 py-8">
        {guides.length > 0 && (
          <section>
            <SectionTitle kicker="City guides" title={`Where to go in ${country.name}`} />
            <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              {guides.map((c) => (
                <li key={c.id}>
                  <Link
                    href={cityPath(c.country_code, c.slug)}
                    className="group bg-card block h-full rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display min-w-0 text-lg leading-tight font-semibold break-words group-hover:underline group-hover:underline-offset-4 sm:text-xl">
                        {c.name}
                      </p>
                      {c.rating_count > 0 && <ScorePill score={c.overall} count={c.rating_count} />}
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">
                      {c.place_count.toLocaleString("en-US")} places
                      {c.rating_count > 0 &&
                        ` · ${c.rating_count} ${c.rating_count === 1 ? "rating" : "ratings"}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {guides.length > 0 && (
          <section>
            <SectionTitle kicker="Map" title={`City guides across ${country.name}`} />
            <CountryMapLazy
              cities={guides.map((c) => ({
                id: c.id,
                name: c.name,
                href: cityPath(c.country_code, c.slug),
                lat: c.lat,
                lng: c.lng,
                score: c.overall,
                count: c.rating_count,
                places: c.place_count,
              }))}
            />
          </section>
        )}

        {others.length > 0 && (
          <section>
            <SectionTitle
              kicker="More cities"
              title={
                guides.length > 0 ? `Other cities in ${country.name}` : `Cities in ${country.name}`
              }
            />
            <p className="text-muted-foreground mb-4 text-sm">
              No guide yet: opening one builds its guide from open map data.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {others.map((c) => (
                <li key={c.id}>
                  <Link
                    href={cityPath(c.country_code, c.slug)}
                    prefetch={false}
                    className="bg-card hover:bg-accent inline-flex rounded-full border px-3 py-1 text-sm"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-brand text-xs font-semibold tracking-[0.2em] uppercase">{kicker}</p>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
    </div>
  );
}
