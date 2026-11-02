# RateDestinations

**The whole city, rated.** One honest guide per city: the restaurants, parks and sights worth
your time, plus the places, scams and streets travellers say to avoid. Search any of 31,000+
cities; every guide starts from OpenStreetMap and is scored by the community.

Built with Next.js 16 (App Router, Cache Components), Supabase (Postgres + PostGIS + Auth),
Tailwind v4 + shadcn/ui, MapLibre with OpenFreeMap tiles. Deploys on Vercel.

## How it works

- **Cities** come from GeoNames (every populated place over 15,000 people), seeded into Postgres,
  searched with trigram matching (`search_cities`).
- **Places** come from OpenStreetMap through the Overpass API, imported per city the first time
  anyone visits its guide (`POST /api/cities/:id/build`), refreshed every 90 days by a cron.
  Wikidata sitelink counts add a _prominence_ signal for sights.
- **Scores** blend community ratings with a prior (an external rating when there is one,
  otherwise prominence): `w = n / (n + 10)`, `score = w·user_avg + (1 − w)·prior`. One rating
  barely moves a place; thirty dominate it. The same formula lives in `src/lib/scoring.ts` and in
  the SQL functions (`blend_score`, `place_prior`), with tests asserting they agree.
- **The bad is a feature.** Travellers rate nine city dimensions (safety and cleanliness weigh
  1.5×) and tag places as dirty, unsafe, a scam, overpriced… Warnings get their own section.
- **Google Places** is optional (`GOOGLE_PLACES_ENABLED=true`). It only supplies the prior and
  is refreshed within Google's 30-day caching terms (`src/lib/providers/ratings`).

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
4. Seed cities from your machine against the project's **direct** connection string
   (Project Settings → Database): `DATABASE_URL=postgres://… pnpm db:seed:cities`.

### 2. Vercel

Import the repo, then set these environment variables (Production and Preview):

| Variable                                                     | Value                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `DATABASE_URL`                                               | Supabase **transaction pooler** URL (port 6543, `?sslmode=require`)               |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API                                                            |
| `NEXT_PUBLIC_SITE_URL`                                       | `https://<your-domain>`                                                           |
| `CRON_SECRET`                                                | a long random string (Vercel sends it to `/api/cron/refresh`)                     |
| `OVERPASS_ENDPOINTS`                                         | optional; default is the main instance, comma-separate mirrors                    |
| `IMPORT_USER_AGENT`                                          | `RateDestinations/1.0 (contact: you@example.com)` — OSM and Wikidata ask for this |
| `GOOGLE_PLACES_ENABLED` / `GOOGLE_PLACES_API_KEY`            | optional, see above                                                               |

`vercel.json` schedules the daily refresh cron. City imports run inside `after()` on the
`/api/cities/[id]/build` route (`maxDuration = 300`), so enable Fluid Compute / a plan that
allows 5-minute functions, or lower the Overpass caps in `src/lib/import/overpass.ts`.

## Data and attribution

Place data © OpenStreetMap contributors (ODbL). City data by GeoNames (CC BY 4.0). Map tiles
by OpenFreeMap. Notability signal from Wikidata (CC0). Keep the attribution in the footer.

## Roadmap (not in the MVP)

Written reviews with photos, user-drawn "avoid this area" zones, reporting and moderation,
city comparison, trip lists, other languages, an admin dashboard.
