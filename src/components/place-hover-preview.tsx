"use client";

import { MapPin, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { PlacePhoto, type PlacePhotoData } from "@/components/place-photo";
import { ScorePill } from "@/components/score";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CATEGORY_META, type PlaceCategory } from "@/lib/import/categories";

type Preview = { image: PlacePhotoData | null; address: string | null; websiteHost: string | null };

// One request per place per page view, shared by every card showing that place.
const previews = new Map<number, Promise<Preview | null>>();

function loadPreview(id: number): Promise<Preview | null> {
  let p = previews.get(id);
  if (!p) {
    p = fetch(`/api/places/${id}/preview`)
      .then((r) => (r.ok ? (r.json() as Promise<Preview>) : null))
      .catch(() => null);
    previews.set(id, p);
  }
  return p;
}

export type PreviewPlace = {
  id: number;
  name: string;
  category: PlaceCategory;
  subcategory: string | null;
  blended_score: number;
  user_count: number;
  warning_count: number;
  address?: string | null;
};

/**
 * Wraps a place link: hovering it (with a mouse; touch screens just follow the link) opens a card
 * with the place's photo, score and address. The photo is looked up on first hover.
 */
export function PlaceHoverPreview({
  place,
  children,
}: {
  place: PreviewPlace;
  children: ReactElement;
}) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const address = preview?.address ?? place.address ?? null;
  return (
    <HoverCard
      openDelay={300}
      closeDelay={100}
      onOpenChange={(open) => {
        if (open && preview === undefined) loadPreview(place.id).then(setPreview);
      }}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80 p-0">
        <PlacePhoto
          photo={preview?.image ?? null}
          category={place.category}
          loading={preview === undefined}
        />
        <div className="space-y-1.5 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="leading-snug font-medium">{place.name}</p>
            <ScorePill score={place.blended_score} count={place.user_count} />
          </div>
          <p className="text-muted-foreground text-xs">
            {place.subcategory ?? CATEGORY_META[place.category].label}
            {preview?.websiteHost && <> · {preview.websiteHost}</>}
          </p>
          {address && (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <MapPin className="mt-px size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{address}</span>
            </p>
          )}
          {place.warning_count > 0 && (
            <p className="text-bad flex items-center gap-1.5 text-xs">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              {place.warning_count} traveller warning{place.warning_count > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * The photo at the top of a place page: shown when one is stored, looked up when the place was
 * never checked, and left out entirely when there is none.
 */
export function PlacePagePhoto({
  placeId,
  category,
  initial,
  checked,
  className,
}: {
  placeId: number;
  category: PlaceCategory;
  initial: PlacePhotoData | null;
  checked: boolean;
  className?: string;
}) {
  const [photo, setPhoto] = useState<PlacePhotoData | null | undefined>(
    initial ?? (checked ? null : undefined),
  );
  useEffect(() => {
    if (photo !== undefined) return;
    let live = true;
    loadPreview(placeId).then((p) => live && setPhoto(p?.image ?? null));
    return () => {
      live = false;
    };
  }, [photo, placeId]);
  if (photo === null) return null;
  return (
    <PlacePhoto
      photo={photo ?? null}
      category={category}
      loading={photo === undefined}
      className={className}
    />
  );
}
