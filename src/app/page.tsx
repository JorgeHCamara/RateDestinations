import Link from "next/link";
import { CitySearch } from "@/components/city-search";
import { ScorePill } from "@/components/score";
import { getFeaturedCities, getTrendingCities, type TrendingCity } from "@/lib/queries/cities";

export default function HomePage() {
  return (
    <>
      <section className="bg-surface relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_70%_-10%,var(--brand-soft),transparent)]"
        />
        <div className="container-page relative py-16 sm:py-24">
          <p className="text-brand mb-3 text-xs font-semibold tracking-[0.2em] uppercase">
            The whole city, rated
          </p>
          <h1 className="font-display max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            Know a city before you go.{" "}
            <span className="text-muted-foreground">The good and the bad.</span>
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-base sm:text-lg">
            One honest guide per city: the restaurants, parks and sights worth your time, plus the
            places, scams and streets travellers say to avoid.
          </p>
          <div className="mt-8 max-w-2xl">
            <CitySearch autoFocus />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            31,000+ cities worldwide · built from OpenStreetMap, scored by travellers like you
          </p>
        </div>
      </section>

      <section className="container-page py-12">
        <Header title="Start somewhere" subtitle="A few cities to get a feel for it." />
        <FeaturedCities />
      </section>

      <section className="container-page py-6">
        <Header title="Most rated right now" subtitle="Where the community has been busy." />
        <TrendingCities />
      </section>

      <section id="how-it-works" className="container-page scroll-mt-20 py-12">
        <Header title="How scores work" subtitle="Honest by design." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card
            title="Every city, day one"
            body="Each guide starts from OpenStreetMap, the world's open map. Notable, well-documented places rank higher until people weigh in."
          />
          <Card
            title="Travellers take over"
            body="Scores blend community ratings with that starting point. With a handful of ratings the community dominates; one grumpy review can't sink a place."
          />
          <Card
            title="The bad is a feature"
            body="Rate a city's safety, cleanliness and value, and tag places as dirty, unsafe or a scam. Warnings get their own section — the part other guides leave out."
          />
        </div>
      </section>
    </>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">{subtitle}</p>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card rounded-xl border p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

async function FeaturedCities() {
  const cities = await getFeaturedCities();
  if (cities.length === 0) return <EmptyCities />;
  return <CityGrid cities={cities} />;
}

async function TrendingCities() {
  const cities = await getTrendingCities(8);
  if (cities.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
        No ratings yet. Search a city you know and be the first.
      </p>
    );
  }
  return <CityGrid cities={cities} />;
}

function EmptyCities() {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
      City data is still loading on this deployment. Run the seed script to populate cities.
    </p>
  );
}

function CityGrid({ cities }: { cities: TrendingCity[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cities.map((c) => (
        <li key={c.id}>
          <Link
            href={`/city/${c.country_code.toLowerCase()}/${c.slug}`}
            prefetch={true}
            className="group bg-card block rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display truncate text-xl font-semibold group-hover:underline group-hover:underline-offset-4">
                  {c.name}
                </p>
                <p className="text-muted-foreground truncate text-sm">{c.country_name}</p>
              </div>
              {c.overall !== null && <ScorePill score={c.overall} count={c.rating_count} />}
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              {c.place_count > 0
                ? `${c.place_count.toLocaleString()} places`
                : "Guide builds on first visit"}
              {c.rating_count > 0 && ` · ${c.rating_count} ratings`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
