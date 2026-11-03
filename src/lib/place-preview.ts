/**
 * Client-side access to /api/places/:id/preview (photo, address, website), shared by the hover
 * card, the tap preview on touch screens, list thumbnails and the place page. One request per
 * place per page view, at most 3 at a time, so scrolling a long list doesn't fire dozens at once.
 */
export type PlacePhotoData = {
  url: string;
  source: "commons" | "website";
  credit: string;
  page: string;
};

export type PlacePreview = {
  image: PlacePhotoData | null;
  address: string | null;
  websiteHost: string | null;
};

const previews = new Map<number, Promise<PlacePreview | null>>();
const MAX_IN_FLIGHT = 3;
let inFlight = 0;
const waiting: (() => void)[] = [];

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

export function loadPreview(id: number): Promise<PlacePreview | null> {
  let p = previews.get(id);
  if (!p) {
    p = slot(() =>
      fetch(`/api/places/${id}/preview`)
        .then((r) => (r.ok ? (r.json() as Promise<PlacePreview>) : null))
        .catch(() => null),
    );
    previews.set(id, p);
  }
  return p;
}

/**
 * A small version of a photo for list thumbnails. Wikimedia serves fixed thumbnail widths, so a
 * Commons photo is asked for at 250 px instead of 960 (about a tenth of the bytes); website
 * photos are used as they are.
 */
export function thumbnailUrl(photo: PlacePhotoData): string {
  if (photo.source !== "commons") return photo.url;
  return photo.url.replace(/\/(\d+)px-([^/]+)$/, (m, w: string, rest: string) =>
    Number(w) > 250 ? `/250px-${rest}` : m,
  );
}
