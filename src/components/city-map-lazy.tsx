"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { MapPin } from "./city-map";

export type MapPinInput = MapPin;

const CityMap = dynamic(() => import("./city-map").then((m) => m.CityMap), {
  ssr: false,
  loading: () => (
    <div className="bg-muted h-[420px] animate-pulse rounded-xl border" aria-label="Loading map" />
  ),
});

export function CityMapLazy(props: ComponentProps<typeof CityMap>) {
  return <CityMap {...props} />;
}
