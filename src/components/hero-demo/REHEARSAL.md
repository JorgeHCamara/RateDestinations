# Rehearsal: home-page hero demo (`HeroDemo.tsx`)

Gold: `hero-demo` (corner bleed: window one gutter in from the top and left, off the right and
bottom; one satellite straddling the window's edge; a popover anchored to its measured trigger).
Kept its stage size (720 wide, 380 tall here), gutter, the browser window and the satellite's
role. Changed the product to the RateDestinations city guide, the story to a rating, and borrowed
the "effect a beat after its cause" from `table-edit` (`Roll delay` on the city score).

Story (rated both ways, the good first, so the guide doesn't read as a place to roast
businesses): Rate on the food hall, five stars and the Local gem tag, Save: its score rolls
8.6 → 9.1, a green "Local gem" badge appears by its name a beat later, the city score rolls
7.8 → 7.9. Then Rate on the seafood place, two stars and Tourist trap, Save: its score rolls
8.1 → 7.6 and turns amber, the city score rolls back to 7.8, its map pin turns red, and a warning
drops into "Watch out". Plays once (`play="once"`); the payoff (both results) is the still.
About 21 s.

Poster (reduced motion): the payoff frame, both ratings saved and settled: the Local gem badge
and 9.1 on the food hall, the warning in Watch out.

Real strings: Lisbon, Portugal, City score, the three places (all fictional), Rate, the
popover's words, the Local gem badge, Watch out, the two warning rows. Filler: three list rows, the map, the last warning row.

Compact (below 600, 358 × 350): the list only, two real rows, the window off the right and
bottom, the satellite straddling the bottom edge; the second warning is filler so the only
words in the card are the payoff. Wide-only and compact-only parts are switched by a media
query that matches the stage's breakpoint, so the server-rendered frame already matches.

Captured: wide loop at 1280, phone loop at 390, `--states`, stills (wide, phone, reduced motion).
Filmed from the production Next.js server (`pnpm build && pnpm start`), Chromium headless.

Film (`scripts/film.mjs … --gate`, see `.claude/skills/stageshow`):

- `kit override` × 6 (`.ss-phone__*`): false positives. The check skips stylesheets whose href
  contains `/kit/`; in a Next.js bundle every stylesheet is `/_next/static/chunks/…css`, so the
  kit's own phone rules are counted as this example's. No phone is in the scene and no `.ss-`
  selector is styled by `hero-demo.css`.
- `manual: same-box content change: svg` at the save beat: the score ring's arc eases its
  dash offset (0.8 s travel curve). Watched at `--slow 2`; it reads as the ring giving back.
- Every other line was fixed: popover opened past the bottom (story row moved to the top of
  the list, popover tightened, stage 340 → 380); name and subtitle on one line; translucent
  stars and roads; watch-card insets; satellite running a sliver past the bottom in compact.
- Coverage is reported `inconclusive` (sampling gaps over 27 ms) on this machine's headless
  Chromium; the contact sheets and the states sheet were read frame by frame instead.

Review (fresh eye): popover first covered the city name and score — fixed by opening it
downward over filler rows. Rate button is visible at rest so the row the story touches has
a real control, not one that appears under the cursor.

Assumptions: Geist and Fraunces are loaded by the page (the stage inherits `--font-sans` and
`--font-display`). The accent is the site's coral.

Not checked: Safari and Firefox rendering; touch devices; a dark theme (the page is light).

## Revision: a good rating before the warning

- One popover serves both ratings, anchored to the measured Rate of the row being rated. Its
  title names that row; the tags are Local gem, Tourist trap, Dirty (one list, as on the site).
- Opening under the second row, the old popover ran 9px off the bottom. Instead of a taller
  stage, it is shorter: Save beside the stars, the three tags on one line (stars 22px wide so
  Save fits on one line; compact popover 232px).
- The stars row and tags are one `.rdh-pop__body` block: the title and the first tag had been
  read as a stacked pair (`loose stack`) once the popover was under 80px.
- The food hall's pill is already green at 8.6, so tone alone showed no change; the positive
  result is the roll plus a "Local gem" badge (in the layout while hidden, so nothing shifts),
  mirroring "Tourist trap ×2" on the warning. A green-pin change was removed: the pins are green.
- Film: states at 1280 and 390 with `--gate`; reduced-motion stills at both widths. Remaining
  lines are the six known `kit override` false positives (no `.ss-phone` selector in
  `hero-demo.css`) and the ring's arc (manual, as before).
