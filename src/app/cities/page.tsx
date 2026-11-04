import type { Metadata } from "next";
import Link from "next/link";
import { CitySearch } from "@/components/city-search";
import { JsonLd } from "@/components/json-ld";
import { ScorePill } from "@/components/score";
import { getCityDirectory, type DirectoryCity } from "@/lib/queries/cities";
import { breadcrumbJsonLd, cityPath } from "@/lib/structured-data";

/**
 * /cities: every city that has a guide, by continent and country. Most guides are reachable only
 * through the search box otherwise, which search engines don't type into; linked from the footer
 * and the home page, this puts every guide one link from any page.
 */

const CONTINENTS: Record<string, string> = {
  AF: "Africa",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
  AN: "Antarctica",
};
const CONTINENT_ORDER = ["EU", "NA", "SA", "AS", "AF", "OC", "AN"];

type CountryGroup = { code: string; name: string; cities: DirectoryCity[] };
type ContinentGroup = { code: string; name: string; countries: CountryGroup[]; cityCount: number };

function group(cities: DirectoryCity[]): ContinentGroup[] {
  const byContinent = new Map<string, Map<string, CountryGroup>>();
  for (const c of cities) {
    const continent = c.continent && CONTINENTS[c.continent] ? c.continent : "Other";
    const countries = byContinent.get(continent) ?? new Map<string, CountryGroup>();
    const country = countries.get(c.country_code) ?? {
      code: c.country_code,
      name: c.country_name,
      cities: [],
    };
    country.cities.push(c);
    countries.set(c.country_code, country);
    byContinent.set(continent, countries);
  }
  return [...byContinent.entries()]
    .sort(
      ([a], [b]) => (CONTINENT_ORDER.indexOf(a) + 1 || 99) - (CONTINENT_ORDER.indexOf(b) + 1 || 99),
    )
    .map(([code, countries]) => {
      const list = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
      return {
        code,
        name: CONTINENTS[code] ?? "Elsewhere",
        countries: list,
        cityCount: list.reduce((n, c) => n + c.cities.length, 0),
      };
    });
}

export async function generateMetadata(): Promise<Metadata> {
  const cities = await getCityDirectory();
  const countries = new Set(cities.map((c) => c.country_code)).size;
  const description =
    cities.length > 0
      ? `Browse ${cities.length} city guides in ${countries} countries: the best restaurants, sights, parks and bars, and what to avoid, rated by locals and travellers.`
      : "Browse every city guide: the best restaurants, sights, parks and bars, and what to avoid, rated by locals and travellers.";
  return {
    title: "All city guides",
    description,
    alternates: { canonical: "/cities" },
    openGraph: { title: "All city guides · RateDestinations", description },
  };
}

export default async function CitiesPage() {
  const cities = await getCityDirectory();
  const continents = group(cities);
  const countryCount = continents.reduce((n, c) => n + c.countries.length, 0);

  return (
    <div className="container-page py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "RateDestinations", path: "/" },
          { name: "All city guides", path: "/cities" },
        ])}
      />
      <header className="max-w-3xl">
        <p className="text-brand text-xs font-semibold tracking-[0.2em] uppercase">Browse</p>
        <h1 className="font-display mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
          All city guides
        </h1>
        <p className="text-muted-foreground mt-3">
          {cities.length > 0
            ? `${cities.length.toLocaleString("en-US")} cities in ${countryCount} countries, each with the places worth your time and what to avoid.`
            : "Every city with a guide, by continent and country."}{" "}
          Not listed? Search for it: any of 31,000+ cities gets its guide on the first visit.
        </p>
        {/* The header has its own search from sm up; phones get this one. */}
        <div className="mt-5 max-w-xl sm:hidden">
          <CitySearch variant="compact" />
        </div>
      </header>

      {continents.length > 1 && (
        <nav aria-label="Continents" className="mt-8 flex flex-wrap gap-1.5">
          {continents.map((c) => (
            <a
              key={c.code}
              href={`#${c.code.toLowerCase()}`}
              className="bg-card hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
            >
              {c.name} <span className="text-muted-foreground">{c.cityCount}</span>
            </a>
          ))}
        </nav>
      )}

      {cities.length === 0 && (
        <p className="text-muted-foreground mt-8 rounded-xl border border-dashed p-6 text-sm">
          No city guides yet. Search for a city above to build the first one.
        </p>
      )}

      <div className="mt-10 space-y-12">
        {continents.map((continent) => (
          <section
            key={continent.code}
            id={continent.code.toLowerCase()}
            aria-labelledby={`h-${continent.code}`}
            className="scroll-mt-20"
          >
            <h2
              id={`h-${continent.code}`}
              className="font-display mb-5 border-b pb-2 text-2xl font-semibold"
            >
              {continent.name}{" "}
              <span className="text-muted-foreground text-base font-normal">
                {continent.cityCount} {continent.cityCount === 1 ? "city" : "cities"}
              </span>
            </h2>
            <div className="gap-8 sm:columns-2 lg:columns-3">
              {continent.countries.map((country) => (
                <div key={country.code} className="mb-6 break-inside-avoid">
                  <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-[0.15em] uppercase">
                    {country.name}
                  </h3>
                  <ul className="space-y-1">
                    {country.cities.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3">
                        {/* No prefetch: hundreds of links would each preload a guide. */}
                        <Link
                          href={cityPath(c.country_code, c.slug)}
                          prefetch={false}
                          className="min-w-0 truncate underline-offset-4 hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.rating_count > 0 ? (
                          <ScorePill score={c.overall} count={c.rating_count} />
                        ) : (
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {c.place_count.toLocaleString("en-US")} places
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
