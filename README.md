# RateDestinations

**The whole city, rated.** One honest guide per city: the restaurants, parks and sights worth
your time, plus the places, scams and streets travellers say to avoid. Search any of 31,000+
cities; every guide starts from OpenStreetMap and is scored by the community.

Built with Next.js 16 (App Router, Cache Components), Supabase (Postgres + PostGIS + Auth),
Tailwind v4 + shadcn/ui, MapLibre with OpenFreeMap tiles. Deploys on Vercel.

## How it works

- **Cities** come from GeoNames (every populated place over 15,000 people), seeded into Postgres,
  searched with trigram matching (`search_cities`).
- **Places** come from several sources, so no single service can take the site down:
  - **Overture Maps** (free monthly bulk data, ~88M places from Meta, Microsoft, Foursquare and
    others) is read offline by a scheduled GitHub Action (`.github/workflows/overture-import.yml`,
    every 30 min). It builds every city a visitor opened, then pre-builds the most populous cities
    (`OVERTURE_TOP_CITIES`, default 300), and refreshes them when Overture publishes a new release.
  - On a first visit to a city that isn't built yet, the site fetches places live: Geoapify
    (`GEOAPIFY_API_KEY`), then the public Overpass servers for whatever Geoapify missed.
  - The same place from two sources is merged by name and distance (`src/lib/import/merge.ts`);
    ratings always stay on the original row.
  - **Filters** (`src/lib/import/filters.ts`) apply to every source: test and placeholder
    entries ("Test", "asdf", "N/A") are dropped; +18 venues (strip clubs, brothels, swinger clubs,
    sex shops) are stored with `adult = true` but never listed anywhere on the site or the public
    Data API. They are detected from the provider's category and from words in the name. Chains
    are ranked below local places, and bar-and-grills (Moxies, Jack Astor's) are listed as bars.
  - Sources get categories wrong (a strip club filed as a dance club), so places can be flagged
    by hand in the SQL Editor with the id from the place's URL: `select flag_adult_place(123,
    'why');` or `select hide_place(123, 'why');`. The flag lives in `place_overrides`, survives
    re-imports, and covers the same name in that city from any source. To un-flag one, insert a
    row with `adult = false` for its `source`/`source_id`.
- **Photos** (`src/lib/images`): one per place, for the hover card and the place page. Free
  sources only: the Wikimedia Commons photo of the place's Wikidata item (found by name within
  300 m when the place has no Wikidata link), else the share image (`og:image`) of the place's
  website, kept only if it looks like a photo (size, shape, and not a few flat colours like a
  logo). Website fetches refuse private addresses. A website that describes itself as an adult
  venue gets the place flagged. Looked up on first hover and by the scheduled workflow for the
  places guides show first; kept 30 days. Places without a photo show their category icon.
- **Scores** show what people actually gave. A place nobody has rated shows "Not rated", never an
  estimate; once rated, its score is the average of its ratings, with the count. A city's score is
  the average of its ratings too (each dimension's average, safety and cleanliness weighted 1.5×).
- **Ranking** (order only, never shown) blends community ratings with a prior from prominence:
  `w = n / (n + 10)`, `rank score = w·user_avg + (1 − w)·prior`, so lists start with the
  best-known places and a place with many good ratings ranks above one with a single perfect score. The same formula lives
  in `src/lib/scoring.ts` and the SQL functions (`blend_score`, `place_prior`), with tests
  asserting they agree.
- **The bad is a feature.** Travellers rate nine city dimensions (safety and cleanliness weigh
  1.5×) and tag places as dirty, unsafe, a scam, overpriced… Warnings get their own section.
- **Google Places: do not enable** (`GOOGLE_PLACES_ENABLED`, `src/lib/providers/ratings`). It
  feeds Google ratings into our ranking, and Google's terms forbid mixing its content with other
  sources, building content from it, and showing its place content on or near a non-Google map
  (our maps are OpenFreeMap). Google ratings could only be shown separately, attributed to Google,
  with Google Maps on those pages.

## Project layout

```
src/app/                 routes (home, /search, /city/[country]/[slug], /place/[id], /login, /me, api/*)
src/components/          UI; hero-demo/ is the Stageshow illustration on the home page
src/lib/db.ts            Postgres access (pg) — all data reads/writes
src/lib/queries/         typed queries with Next 'use cache' directives
src/lib/scoring.ts       the rating blend
src/lib/import/          Overpass + Wikidata import pipeline
src/lib/providers/       external rating providers (none, google)
src/lib/supabase/        Supabase Auth helpers (session only)
src/stageshow/kit        vendored Stageshow kit (see .claude/skills/stageshow)
supabase/migrations/     schema, triggers, RLS, RPCs
scripts/                 migrate, seed cities, import a city, fixtures
tests/, e2e/             Vitest unit + DB integration tests, Playwright smoke test
```

## Local development

Requirements: Node 20.9+, pnpm, a Postgres 16 with PostGIS (Docker: `supabase start`, or any
local Postgres: `createdb` and enable the extensions).

```bash
cp .env.example .env            # set DATABASE_URL to your local Postgres
pnpm install
pnpm db:migrate --with-local-shim   # --with-local-shim only for a non-Supabase Postgres (creates auth.users etc.)
pnpm db:seed:cities             # downloads GeoNames (~10 MB) and loads ~32k cities
pnpm tsx scripts/import-fixture.ts pt/lisbon tests/fixtures/overpass-lisbon.json   # a full Lisbon guide, no network
pnpm dev
```

Import a real city from OpenStreetMap (public Overpass instances rate-limit; the import retries
and falls back across `OVERPASS_ENDPOINTS`):

```bash
pnpm tsx scripts/import-city.ts fr/paris
```

Sign-in needs a Supabase project (below); without it the site works read-only.

### Testing

```bash
pnpm lint && pnpm typecheck
pnpm test        # unit tests; the DB integration tests run when DATABASE_URL is set (rolled back)
pnpm build && pnpm e2e   # Playwright smoke test against the production build (needs Lisbon imported)
```

The Stageshow hero demo has its own rehearsal notes in `src/components/hero-demo/REHEARSAL.md`;
film it with `node .claude/skills/stageshow/scripts/film.mjs http://localhost:3000 --select .rdh --gate`.

## Deploying

### 1. Supabase

1. Create a project at supabase.com. In **SQL Editor**, run `supabase/migrations/0001_init.sql`
   (or `supabase db push` with the CLI).
2. **Authentication → Providers**: enable **Google** (create an OAuth client in Google Cloud with
   redirect `https://<project>.supabase.co/auth/v1/callback`) and keep **Email** with magic links.
3. **Authentication → URL configuration**: Site URL = your production URL; add
   `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback` to the redirect list.
4. Seed cities. With a database connection (the **Session pooler** string from the
   dashboard's **Connect** button): `DATABASE_URL=postgres://… pnpm db:seed:cities`.
   Where only HTTPS is allowed, seed through the Data API instead. First run in the SQL Editor:
   `grant usage on schema public to service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;`
   then `SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… pnpm tsx scripts/seed-cities-rest.ts`.

### 2. GitHub (offline guide builds)

Add a repository secret **DATABASE_URL** (Settings → Secrets and variables → Actions) with the
same Supabase connection string Vercel uses. The **Overture import** workflow then runs every 30
minutes; trigger it once by hand (Actions → Overture import → Run workflow) to pre-build the top
cities straight away. Each city takes about 2 seconds; the free plan's 2,000 Actions minutes a
month is plenty.

### 3. Vercel

Import the repo, then set these environment variables (Production and Preview):

| Variable                                                     | Value                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                               | Supabase **transaction pooler** URL (port 6543), pasted as is: no quotes, no `?sslmode=require`           |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API                                                                                    |
| `NEXT_PUBLIC_SITE_URL`                                       | `https://<your-domain>`                                                                                   |
| `CRON_SECRET`                                                | a long random string (Vercel sends it to `/api/cron/refresh`)                                             |
| `GEOAPIFY_API_KEY`                                           | recommended: free key from geoapify.com; places come from Geoapify instead of the public Overpass servers |
| `OVERPASS_ENDPOINTS`                                         | optional; defaults to overpass-api.de plus two public mirrors, comma-separated to override                |
| `IMPORT_USER_AGENT`                                          | `RateDestinations/1.0 (contact: you@example.com)` — OSM and Wikidata ask for this                         |
| `GOOGLE_PLACES_ENABLED` / `GOOGLE_PLACES_API_KEY`            | optional, see above                                                                                       |

`vercel.json` schedules the daily refresh cron. City imports run inside `after()` on the
`/api/cities/[id]/build` route (`maxDuration = 300`). Each import has a 4-minute budget
(`IMPORT_BUDGET_MS`): every OpenStreetMap request gives up after 30 s, the endpoint list is retried
once, places are saved as each search returns, and the city is always marked `done` or `failed`
before the budget ends. A city still `pending` after 6 minutes can be claimed again (the page's
"Try again" button, or the daily cron). After pulling this change, run
`supabase/migrations/0002_import_claims.sql` through `0005_place_images.sql` in the SQL
Editor.

## Data and attribution

Place data © OpenStreetMap contributors (ODbL) and Overture Maps Foundation (CDLA Permissive
2.0 / Apache 2.0). City data by GeoNames (CC BY 4.0). Map tiles
by OpenFreeMap. Notability signal from Wikidata (CC0). Keep the attribution in the footer.

## Roadmap (not in the MVP)

Written reviews with photos, user-drawn "avoid this area" zones, reporting and moderation,
city comparison, trip lists, other languages, an admin dashboard.
