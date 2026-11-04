"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const CountryMap = dynamic(() => import("./country-map").then((m) => m.CountryMap), {
  ssr: false,
  loading: () => (
    <div className="bg-muted h-[380px] animate-pulse rounded-xl border" aria-label="Loading map" />
  ),
});

export function CountryMapLazy(props: ComponentProps<typeof CountryMap>) {
  return <CountryMap {...props} />;
}
