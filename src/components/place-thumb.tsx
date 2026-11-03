"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import type { PlaceCategory } from "@/lib/import/categories";
import { loadPreview, thumbnailUrl, type PlacePhotoData } from "@/lib/place-preview";
import { cn } from "@/lib/utils";

/**
 * A place's photo as a small square in list cards, or its category icon when it has none (or the
 * photo fails to load: website photos are hotlinked). A place never looked up is looked up when its
 * card scrolls into view, so lists fill in with photos as people browse.
 */
export function PlaceThumb({
  placeId,
  category,
  photo: initial,
  checked,
  rank,
}: {
  placeId: number;
  category: PlaceCategory;
  photo: PlacePhotoData | null;
  checked: boolean;
  rank?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [photo, setPhoto] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (photo || checked || !ref.current) return;
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        loadPreview(placeId).then((p) => live && p?.image && setPhoto(p.image));
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [photo, checked, placeId]);

  const show = photo && !failed;
  return (
    <span
      ref={ref}
      className="bg-surface relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg"
      aria-hidden
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- third-party hotlink, not ours to optimise
        <img
          src={thumbnailUrl(photo)}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <CategoryIcon category={category} className="text-muted-foreground size-5" />
      )}
      {rank !== undefined && (
        <span
          className={cn(
            "absolute top-0.5 left-0.5 rounded px-1 font-mono text-[10px] leading-4 font-semibold",
            show ? "bg-background/90 text-foreground" : "text-muted-foreground",
          )}
        >
          #{rank}
        </span>
      )}
    </span>
  );
}
