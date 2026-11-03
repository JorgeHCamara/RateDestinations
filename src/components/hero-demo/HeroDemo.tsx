"use client";

import { Star } from "lucide-react";
import { Bar, Collapse, Popover, Roll, Stage, Text, Window, type Act } from "@/stageshow/kit";
import "./hero-demo.css";

// The home-page hero: a Lisbon guide. Someone hovers a restaurant, opens Rate,
// gives it two stars and the "Tourist trap" tag, saves, and the guide answers: the
// place's score rolls down, its map pin turns red, and a new warning lands in the
// "Watch out" card. Plays once; the payoff is the still.
//
// Gold: hero-demo (corner bleed, one satellite, a popover anchored to its trigger,
// targets measured with rect()). Motion borrowed from table-edit (the total rolls
// a beat after the edit that caused it).
//
// Real strings: Lisbon, the three restaurants, the warning rows, the tag that is
// chosen, the popover's words. The map and the lower rows are filler.

type S = {
  open: boolean; // the rating popover
  stars: number; // 0..5
  tag: boolean; // "Tourist trap" picked
  saved: boolean; // after Save: score rolled, pin red, warning landed
};

const initial: S = { open: false, stars: 0, tag: false, saved: false };
const poster: S = { open: false, stars: 2, tag: true, saved: true };

// Every place in this demo is fictional (checked against Overture Maps: no place in Portugal has
// these names), so the demo never rates a real business.
const PLACE = "Polvo Dourado";
const REST = { wide: { x: 300, y: 330 }, compact: { x: 310, y: 250 } };

async function script(a: Act<S>) {
  await a.wait(900);
  a.mark("open");
  await a.move({ at: "row", x: 0.35, y: 0.5 });
  await a.wait(500);
  await a.click({ at: "rate", x: 0.86, y: 0.65 });
  a.put({ open: true });
  await a.wait(700);

  a.mark("stars");
  await a.click({ at: "star-2", x: 0.5, y: 0.5 });
  a.put({ stars: 2 });
  await a.wait(500);

  a.mark("tag");
  await a.click({ at: "tag-trap", x: 0.9, y: 0.72 });
  a.put({ tag: true });
  await a.wait(600);

  a.mark("save");
  await a.click({ at: "save", x: 0.9, y: 0.7 });
  a.put({ open: false });
  await a.wait(250);
  a.put({ saved: true });
  // Off the row, so the rolled score and the new warning are read uncovered
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
        const rateRect = rect("rate");
        const cityScore = s.saved ? 7.7 : 7.8;
        const placeScore = s.saved ? 7.6 : 8.1;
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
                    <div className="rdh-row" data-target="row" data-open={s.open || undefined}>
                      <div>
                        <Text className="rdh-row__name">{PLACE}</Text>
                        <Text className="rdh-row__sub">Seafood · Intendente</Text>
                      </div>
                      <div className="rdh-row__end">
                        <span className="rdh-rate" data-target="rate" data-cursor="hand">
                          Rate
                        </span>
                        <span className="rdh-pill" data-tone={s.saved ? "warn" : undefined}>
                          <Roll>{placeScore.toFixed(1)}</Roll>
                        </span>
                      </div>
                    </div>

                    <div className="rdh-row">
                      <div>
                        <Text className="rdh-row__name">Mercado Lagarto Azul</Text>
                        <Text className="rdh-row__sub">Food hall · Cais do Sodré</Text>
                      </div>
                      <div className="rdh-row__end">
                        <span className="rdh-pill">8.6</span>
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
                    data-warn={s.saved}
                  />
                  <div className="rdh-map__pin" style={{ left: 40, top: 186 }} />
                  <div className="rdh-map__pin" style={{ left: 210, top: 236 }} />
                </div>
              </div>
            </Window>

            <Popover
              show={s.open}
              origin="top right"
              className="rdh-pop"
              style={{
                left: rateRect.x + rateRect.width - (layout === "compact" ? 220 : 236),
                top: rateRect.y + rateRect.height + 4,
              }}
            >
              <div className="rdh-pop__title">Rate {PLACE}</div>
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
              <div className="rdh-tags">
                <span className="rdh-tag" data-cursor="hand">
                  Great value
                </span>
                <span className="rdh-tag" data-target="tag-trap" data-cursor="hand" data-on={s.tag}>
                  Tourist trap
                </span>
                <span className="rdh-tag" data-cursor="hand">
                  Dirty
                </span>
                <span className="rdh-tag" data-cursor="hand">
                  Overpriced
                </span>
              </div>
              <div className="rdh-pop__actions">
                <span className="rdh-save" data-target="save" data-cursor="hand">
                  Save rating
                </span>
              </div>
            </Popover>

            <div className="rdh-watch">
              <div className="rdh-watch__head">
                <span className="rdh-watch__kicker">Watch out</span>
                <span className="rdh-watch__title">What people warn about</span>
              </div>
              <Collapse open={s.saved} reveal="drop">
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
