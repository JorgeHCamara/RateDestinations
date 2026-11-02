"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useState } from "react";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import { CATEGORY_META, type PlaceCategory } from "@/lib/import/categories";
import { toTenScale, toneFor } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export type MapPin = {
  id: number;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  score: number;
  count: number;
  warning: boolean;
};

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const pinTone = {
  good: "bg-good",
  ok: "bg-ok",
  bad: "bg-bad",
  neutral: "bg-muted-foreground",
} as const;

export function CityMap({
  center,
  pins,
  zoom = 12,
  height = 420,
  className,
}: {
  center: { lat: number; lng: number };
  pins: MapPin[];
  zoom?: number;
  height?: number;
  className?: string;
}) {
  const [selected, setSelected] = useState<MapPin | null>(null);
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)} style={{ height }}>
      <Map
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom }}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        cooperativeGestures
      >
        <NavigationControl position="top-right" showCompass={false} />
        {pins.map((p) => (
          <Marker
            key={p.id}
            latitude={p.lat}
            longitude={p.lng}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelected(p);
            }}
          >
            <button
              type="button"
              aria-label={p.name}
              className={cn(
                "grid size-6 place-items-center rounded-full border-2 border-white text-[11px] shadow-md transition hover:scale-110",
                p.warning ? pinTone.bad : pinTone[toneFor(p.score, p.count)],
              )}
            >
              <span aria-hidden className="leading-none">
                {CATEGORY_META[p.category].emoji}
              </span>
            </button>
          </Marker>
        ))}
        {selected && (
          <Popup
            latitude={selected.lat}
            longitude={selected.lng}
            anchor="bottom"
            offset={14}
            onClose={() => setSelected(null)}
            closeButton={false}
            className="text-foreground"
          >
            <div className="min-w-40 p-1 text-sm">
              <Link
                href={`/place/${selected.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {selected.name}
              </Link>
              <p className="text-muted-foreground text-xs">
                {CATEGORY_META[selected.category].label} · {toTenScale(selected.score).toFixed(1)}
                {selected.count === 0 ? " est." : ` (${selected.count})`}
              </p>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
