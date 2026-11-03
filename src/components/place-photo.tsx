"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import type { PlaceCategory } from "@/lib/import/categories";
import { cn } from "@/lib/utils";

export type PlacePhotoData = {
  url: string;
  source: "commons" | "website";
  credit: string;
  page: string;
};

/**
 * A place's photo with its credit, or a category tile when there is none (or it fails to load:
 * website images are hotlinked and can disappear). The image loads straight from Wikimedia or the
 * place's website, without a referrer.
 */
export function PlacePhoto({
  photo,
  category,
  loading = false,
  className,
}: {
  photo: PlacePhotoData | null;
  category: PlaceCategory;
  loading?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = photo && failed !== photo.url;
  const safePage = photo && /^https?:\/\//i.test(photo.page) ? photo.page : undefined;
  return (
    <div className={cn("bg-surface relative aspect-[16/9] w-full overflow-hidden", className)}>
      {show ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- third-party hotlink, not ours to optimise */}
          <img
            src={photo.url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(photo.url)}
            className="size-full object-cover"
          />
          <a
            href={safePage}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="absolute right-1.5 bottom-1.5 max-w-[85%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90 hover:text-white"
            title={
              photo.source === "commons"
                ? `Photo: ${photo.credit} (Wikimedia Commons)`
                : `Image from ${photo.credit}`
            }
          >
            {photo.source === "commons" ? `Photo: ${photo.credit}` : `Image: ${photo.credit}`}
          </a>
        </>
      ) : (
        <div
          className={cn(
            "text-muted-foreground/60 grid size-full place-items-center",
            loading && "animate-pulse",
          )}
        >
          <CategoryIcon category={category} className="size-10" />
        </div>
      )}
    </div>
  );
}
