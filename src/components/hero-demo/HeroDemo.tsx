"use client";

import { Star } from "lucide-react";
import { Bar, Collapse, Popover, Roll, Stage, Text, Window, type Act } from "@/stageshow/kit";
import "./hero-demo.css";

// The home-page hero: a Lisbon guide, rated both ways. Someone opens Rate on a food hall, gives
// it five stars and "Local gem", saves: its score rolls up, a "Local gem" badge appears by its
// name, the city score ticks up a beat later. Then the same on a seafood place, two stars and
// "Tourist trap": its score rolls down, its pin turns red, and a warning lands in "Watch out".
// The good comes first, so the platform reads as a guide, not a place to roast businesses.
// Plays once; the payoff (both results on screen) is the still.
//
// Gold: hero-demo (corner bleed, one satellite, a popover anchored to its trigger,
// targets measured with rect()). Motion borrowed from table-edit (the total rolls
// a beat after the edit that caused it).
//
// Real strings: Lisbon, the three restaurants, the warning rows, the tag that is
// chosen, the popover's words. The map and the lower rows are filler.

type Who = "good" | "bad";
type S = {
  open: Who | null; // which row's rating popover is open
  stars: number; // 0..5, in the open popover
  tag: string | null; // the tag picked in the open popover
  goodSaved: boolean; // food hall rated: score up, "Local gem" badge, city +0.1
  badSaved: boolean; // seafood place rated: score down, pin red, warning landed, city -0.1
};

const initial: S = { open: null, stars: 0, tag: null, goodSaved: false, badSaved: false };
const poster: S = { open: null, stars: 0, tag: null, goodSaved: true, badSaved: true };

// Every place in this demo is fictional (checked against Overture Maps: no place in Portugal has
// these names), so the demo never rates a real business.
const PLACE = "Polvo Dourado"; // rated down
const GOOD = "Mercado Lagarto Azul"; // rated up
const REST = { wide: { x: 300, y: 330 }, compact: { x: 310, y: 250 } };

async function script(a: Act<S>) {
  await a.wait(900);

  // 1. The good rating
  a.mark("open-good");
  await a.move({ at: "row-good", x: 0.35, y: 0.5 });
  await a.wait(450);
  await a.click({ at: "rate-good", x: 0.86, y: 0.65 });
  a.put({ open: "good", stars: 0, tag: null });
  await a.wait(650);
  a.mark("stars-good");
  await a.click({ at: "star-5", x: 0.5, y: 0.5 });
  a.put({ stars: 5 });
  await a.wait(450);
  await a.click({ at: "tag-gem", x: 0.85, y: 0.72 });
  a.put({ tag: "gem" });
  await a.wait(550);
  a.mark("save-good");
  await a.click({ at: "save", x: 0.9, y: 0.7 });
  a.put({ open: null });
  await a.wait(250);
  a.put({ goodSaved: true });
  // Step off the row so its new score is read, then hold on it
  await a.move("rest", { duration: 650 });
  a.mark("payoff-good");
  await a.wait(1600);

  // 2. The warning
  a.mark("open-bad");
  await a.move({ at: "row-bad", x: 0.35, y: 0.5 });
  await a.wait(450);
  await a.click({ at: "rate-bad", x: 0.86, y: 0.65 });
  a.put({ open: "bad", stars: 0, tag: null });
  await a.wait(650);
  a.mark("stars-bad");
  await a.click({ at: "star-2", x: 0.5, y: 0.5 });
  a.put({ stars: 2 });
  await a.wait(450);
  await a.click({ at: "tag-trap", x: 0.9, y: 0.72 });
  a.put({ tag: "trap" });
  await a.wait(550);
  a.mark("save-bad");
  await a.click({ at: "save", x: 0.9, y: 0.7 });
  a.put({ open: null });
  await a.wait(250);
  a.put({ badSaved: true });
  // Off the rows, so both results and the new warning are read uncovered
  await a.move("rest", { duration: 700 });
  a.mark("payoff");
  await a.wait(2400);
}

export function HeroDemo() {
  return (
    <Stage<S>
      width={720}
      height={380}
      compact={{ below: 600, width: 358, height: 350 }}
      initial={initial}
      poster={poster}
      script={script}
      play="once"
      accent="#e8613c"
      cursor={{ at: REST }}
      className="rdh"
    >
      {(s, rect, layout) => {
        const rateRect = rect(s.open === "good" ? "rate-good" : "rate-bad");
        const ratedName = s.open === "good" ? GOOD : PLACE;
        const cityScore = 7.8 + (s.goodSaved ? 0.1 : 0) - (s.badSaved ? 0.1 : 0);
        const placeScore = s.badSaved ? 7.6 : 8.1;
        const goodScore = s.goodSaved ? 9.1 : 8.6;
        const circumference = 2 * Math.PI * 19;
        return (
          <>
            <Window
              url="ratedestinations.com/city/pt/lisbon"
              urlShape="pill"
              className="rdh-browser"
              data-cursor="pointer"
            >
              <div className="rdh-page">
                <div className="rdh-main">
                  <div className="rdh-city">
                    <div>
                      <div className="rdh-kicker">Portugal</div>
                      <div className="rdh-name">Lisbon</div>
                    </div>
                    <div className="rdh-score">
                      <div className="rdh-ring" aria-hidden>
                        <svg width="44" height="44" viewBox="0 0 44 44">
                          <circle className="rdh-ring__track" cx="22" cy="22" r="19" />
                          <circle
                            className="rdh-ring__arc"
                            cx="22"
                            cy="22"
                            r="19"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference * (1 - cityScore / 10)}
                          />
                        </svg>
                        <span className="rdh-ring__value">
                          <Roll delay={350}>{cityScore.toFixed(1)}</Roll>
                        </span>
                      </div>
                      <div className="rdh-score__meta">
                        <b>City score</b>
                        Community verified
                      </div>
                    </div>
                  </div>

                  <div className="rdh-section">
                    <span className="rdh-section__title">
                      <span className="rdh-section__kicker">The good</span>Restaurants
                    </span>
                    <Bar w={36} h={6} tone={2} />
                  </div>

                  <div className="rdh-list">
                    <div
                      className="rdh-row"
                      data-target="row-bad"
                      data-open={s.open === "bad" || undefined}
                    >
                      <div>
                        <Text className="rdh-row__name">{PLACE}</Text>
                        <Text className="rdh-row__sub">Seafood · Intendente</Text>
                      </div>
                      <div className="rdh-row__end">
                        <span className="rdh-rate" data-target="rate-bad" data-cursor="hand">
                          Rate
                        </span>
                        <span className="rdh-pill" data-tone={s.badSaved ? "warn" : undefined}>
                          <Roll>{placeScore.toFixed(1)}</Roll>
                        </span>
                      </div>
                    </div>

                    <div
                      className="rdh-row"
                      data-target="row-good"
                      data-open={s.open === "good" || undefined}
                    >
                      <div>
                        <div className="rdh-row__head">
                          <Text className="rdh-row__name">{GOOD}</Text>
                          {/* The good rating's mark, as "Tourist trap ×2" is the bad one's */}
                          <span className="rdh-badge" data-show={s.goodSaved}>
                            Local gem
                          </span>
                        </div>
                        <Text className="rdh-row__sub">Food hall · Cais do Sodré</Text>
                      </div>
                      <div className="rdh-row__end">
                        <span className="rdh-rate" data-target="rate-good" data-cursor="hand">
                          Rate
                        </span>
                        <span className="rdh-pill" data-tone={s.goodSaved ? "good" : undefined}>
                          <Roll>{goodScore.toFixed(1)}</Roll>
                        </span>
                      </div>
                    </div>

                    <div className="rdh-row rdh-wide-only">
                      <div>
                        <Text className="rdh-row__name">Nata Dourada</Text>
                        <Text className="rdh-row__sub">Pastry · Belém</Text>
                      </div>
                      <div className="rdh-row__end">
                        <span className="rdh-pill">7.9</span>
                      </div>
                    </div>

                    {[
                      [112, 64, 24],
                      [92, 80, 24],
                      [126, 56, 24],
                    ].map(([name, sub, pill], i) => (
                      <div key={i} className="rdh-row">
                        <div>
                          <Bar w={name} h={7} tone={3} />
                          <Bar w={sub} h={5} tone={2} style={{ marginTop: 6 }} />
                        </div>
                        <div className="rdh-row__end">
                          <Bar w={pill} h={20} r={5} tone={1} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rdh-map rdh-wide-only" data-crop aria-hidden>
                  <div className="rdh-map__water" />
                  <div
                    className="rdh-map__road"
                    style={{ left: 8, top: 110, width: 240, transform: "rotate(-14deg)" }}
                  />
                  <div
                    className="rdh-map__road"
                    style={{ left: 120, top: 20, width: 7, height: 300 }}
                  />
                  <div
                    className="rdh-map__road"
                    style={{ left: 8, top: 214, width: 300, transform: "rotate(8deg)" }}
                  />
                  <div className="rdh-map__pin" style={{ left: 62, top: 70 }} />
                  <div
                    className="rdh-map__pin"
                    style={{ left: 148, top: 128 }}
                    data-warn={s.badSaved}
                  />
                  <div className="rdh-map__pin" style={{ left: 40, top: 186 }} />
                  <div className="rdh-map__pin" style={{ left: 210, top: 236 }} />
                </div>
              </div>
            </Window>

            <Popover
              show={s.open !== null}
              origin="top right"
              className="rdh-pop"
              style={{
                left: rateRect.x + rateRect.width - (layout === "compact" ? 232 : 236),
                top: rateRect.y + rateRect.height + 4,
              }}
            >
              <div className="rdh-pop__title">Rate {ratedName}</div>
              {/* The controls, one block under the title */}
              <div className="rdh-pop__body">
                <div className="rdh-pop__row">
                  <div className="rdh-stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="rdh-star"
                        data-target={`star-${n}`}
                        data-cursor="hand"
                        data-on={s.stars >= n}
                      >
                        <Star />
                      </span>
                    ))}
                  </div>
                  <span className="rdh-save" data-target="save" data-cursor="hand">
                    Save rating
                  </span>
                </div>
                <div className="rdh-tags">
                  <span
                    className="rdh-tag"
                    data-target="tag-gem"
                    data-cursor="hand"
                    data-tone="good"
                    data-on={s.tag === "gem"}
                  >
                    Local gem
                  </span>
                  <span
                    className="rdh-tag"
                    data-target="tag-trap"
                    data-cursor="hand"
                    data-on={s.tag === "trap"}
                  >
                    Tourist trap
                  </span>
                  <span className="rdh-tag" data-cursor="hand">
                    Dirty
                  </span>
                </div>
              </div>
            </Popover>

            <div className="rdh-watch">
              <div className="rdh-watch__head">
                <span className="rdh-watch__kicker">Watch out</span>
                <span className="rdh-watch__title">What people warn about</span>
              </div>
              <Collapse open={s.badSaved} reveal="drop">
                <div className="rdh-warn rdh-warn--new">
                  <div>
                    <div className="rdh-warn__name">{PLACE}</div>
                    <div className="rdh-warn__why">Tourist trap ×2 · just now</div>
                  </div>
                  <span className="rdh-pill" data-tone="warn">
                    7.6
                  </span>
                </div>
              </Collapse>
              <div className="rdh-warn rdh-wide-only">
                <div>
                  <div className="rdh-warn__name">Bar Esquina Torta</div>
                  <div className="rdh-warn__why">Overpriced ×3 · Felt unsafe ×1</div>
                </div>
                <span className="rdh-pill" data-tone="warn">
                  5.9
                </span>
              </div>
              <div className="rdh-warn rdh-compact-only">
                <div>
                  <Bar w={96} h={7} tone={3} />
                  <Bar w={120} h={5} tone={2} style={{ marginTop: 5 }} />
                </div>
                <Bar w={26} h={20} r={5} tone={1} />
              </div>
              <div className="rdh-warn rdh-compact-only">
                <div>
                  <Bar w={84} h={7} tone={3} />
                  <Bar w={104} h={5} tone={2} style={{ marginTop: 5 }} />
                </div>
                <Bar w={26} h={20} r={5} tone={1} />
              </div>
              <div className="rdh-warn">
                <div>
                  <Bar w={104} h={7} tone={3} />
                  <Bar w={72} h={5} tone={2} style={{ marginTop: 5 }} />
                </div>
                <Bar w={26} h={20} r={5} tone={1} />
              </div>
            </div>

            <span
              data-target="rest"
              style={{ position: "absolute", left: REST[layout].x, top: REST[layout].y }}
            />
          </>
        );
      }}
    </Stage>
  );
}
