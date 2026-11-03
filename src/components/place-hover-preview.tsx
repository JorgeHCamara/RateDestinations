"use client";

import { MapPin, Navigation, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { PlacePhoto } from "@/components/place-photo";
import { ScorePill } from "@/components/score";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CATEGORY_META, type PlaceCategory } from "@/lib/import/categories";
import { loadPreview, type PlacePhotoData, type PlacePreview } from "@/lib/place-preview";

export type PreviewPlace = {
  id: number;
  name: string;
  category: PlaceCategory;
  subcategory: string | null;
  user_avg: number | null;
  user_count: number;
  warning_count: number;
  address?: string | null;
  lat?: number;
  lng?: number;
};

/**
 * Wraps a place link with a preview of the place: its photo, score, type and address.
 * - Mouse: hovering opens a card; a click still opens the place page.
 * - Touch (no hover): a tap opens the same preview as a panel from the bottom, with "Open place"
 *   and "Directions"; it closes with its X or a tap outside.
 * - Keyboard: Enter follows the link as before.
 * The photo is looked up on first preview (shared with list thumbnails and the place page).
 */
export function PlaceHoverPreview({
  place,
  children,
}: {
  place: PreviewPlace;
  children: ReactElement;
}) {
  const [preview, setPreview] = useState<PlacePreview | null | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pointer = useRef("");
  const load = () => {
    if (preview === undefined) loadPreview(place.id).then(setPreview);
  };

  return (
    <>
      <HoverCard
        openDelay={300}
        closeDelay={100}
        onOpenChange={(open) => {
          if (open) load();
        }}
      >
        <HoverCardTrigger
          asChild
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onClick={(e) => {
            const touch = pointer.current === "touch" || pointer.current === "pen";
            pointer.current = "";
            if (!touch || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault(); // stay on the page and preview instead
            load();
            setSheetOpen(true);
          }}
        >
          {children}
        </HoverCardTrigger>
        <HoverCardContent side="top" align="start" className="w-80 p-0">
          <PlacePhoto
            photo={preview?.image ?? null}
            category={place.category}
            loading={preview === undefined}
          />
          <PreviewDetails place={place} preview={preview} />
        </HoverCardContent>
      </HoverCard>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-2xl p-0"
        >
          <div className="relative">
            <PlacePhoto
              photo={preview?.image ?? null}
              category={place.category}
              loading={preview === undefined}
              className="rounded-t-2xl"
            />
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="bg-background/90 text-foreground absolute top-3 right-3 grid size-9 place-items-center rounded-full shadow"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <div className="space-y-3 px-4 pt-3 pb-6">
            <div className="flex items-start justify-between gap-3">
              <SheetTitle className="font-display text-xl leading-snug font-semibold">
                {place.name}
              </SheetTitle>
              <ScorePill score={place.user_avg} count={place.user_count} className="mt-1" />
            </div>
            <SheetDescription className="sr-only">
              Preview of {place.name}: photo, score and address.
            </SheetDescription>
            <PreviewDetails place={place} preview={preview} hideName />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button asChild>
                <Link href={`/place/${place.id}`}>Open place</Link>
              </Button>
              {place.lat !== undefined && place.lng !== undefined && (
                <Button asChild variant="outline">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation className="size-4" aria-hidden />
                    Directions
                  </a>
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function PreviewDetails({
  place,
  preview,
  hideName = false,
}: {
  place: PreviewPlace;
  preview: PlacePreview | null | undefined;
  hideName?: boolean;
}) {
  const address = preview?.address ?? place.address ?? null;
  return (
    <div className={hideName ? "space-y-1.5" : "space-y-1.5 p-3"}>
      {!hideName && (
        <div className="flex items-start justify-between gap-3">
          <p className="leading-snug font-medium">{place.name}</p>
          <ScorePill score={place.user_avg} count={place.user_count} />
        </div>
      )}
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
          {place.warning_count} warning{place.warning_count > 1 ? "s" : ""} from people who&apos;ve
          been
        </p>
      )}
    </div>
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
