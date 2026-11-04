"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useState } from "react";
import { setWorkerUrl } from "maplibre-gl";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import { toTenScale, toneFor } from "@/lib/scoring";

export type CountryMapCity = {
  id: number;
  name: string;
  href: string;
  lat: number;
  lng: number;
  /** City score (1–5), null until rated. */
  score: number | null;
  count: number;
  places: number;
};

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
setWorkerUrl("/maplibre-gl-worker.mjs");
const tone = {
  good: "bg-good",
  ok: "bg-ok",
  bad: "bg-bad",
  neutral: "bg-brand",
} as const;

/** One dot per city guide, framed to fit them all; a click names the city and links to it. */
export function CountryMap({
  cities,
  height = 380,
}: {
  cities: CountryMapCity[];
  height?: number;
}) {
  const [selected, setSelected] = useState<CountryMapCity | null>(null);
  if (cities.length === 0) return null;
  const lats = cities.map((c) => c.lat);
  const lngs = cities.map((c) => c.lng);
  const single = cities.length === 1;
  return (
    <div className="overflow-hidden rounded-xl border" style={{ height }}>
      <Map
        initialViewState={
          single
            ? { latitude: lats[0], longitude: lngs[0], zoom: 6 }
            : {
                bounds: [
                  [Math.min(...lngs), Math.min(...lats)],
                  [Math.max(...lngs), Math.max(...lats)],
                ],
                fitBoundsOptions: { padding: 48, maxZoom: 8 },
              }
        }
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cooperativeGestures
      >
        <NavigationControl position="top-right" showCompass={false} />
        {cities.map((c) => (
          <Marker
            key={c.id}
            latitude={c.lat}
            longitude={c.lng}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelected(c);
            }}
          >
            <button
              type="button"
              aria-label={c.name}
              className={`block size-4 rounded-full border-2 border-white shadow-md transition hover:scale-125 ${tone[toneFor(c.score, c.count)]}`}
            />
          </Marker>
        ))}
        {selected && (
          <Popup
            latitude={selected.lat}
            longitude={selected.lng}
            anchor="bottom"
            offset={12}
            onClose={() => setSelected(null)}
            closeButton={false}
            className="text-foreground"
          >
            <div className="min-w-36 p-1 text-sm">
              <Link href={selected.href} className="font-medium underline-offset-2 hover:underline">
                {selected.name}
              </Link>
              <p className="text-muted-foreground text-xs">
                {selected.count && selected.score !== null
                  ? `${toTenScale(selected.score).toFixed(1)} · ${selected.count} ratings`
                  : `${selected.places.toLocaleString("en-US")} places`}
              </p>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
