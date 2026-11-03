/**
 * Photos from Wikimedia Commons, through Wikidata: a place's Wikidata item (from OpenStreetMap, or
 * found by name within a few hundred metres) usually names a representative photo (property P18).
 * Openly licensed; the author and licence are shown on the photo.
 */
import { diceSimilarity, nameTokens, normalizeName } from "@/lib/import/merge";

const SPARQL = "https://query.wikidata.org/sparql";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

export type CommonsImage = { url: string; page: string; credit: string };

type Fetch = typeof fetch;

function userAgent() {
  return process.env.IMPORT_USER_AGENT ?? "RateDestinations/1.0";
}

async function getJson<T>(url: string, fetchImpl: Fetch, timeoutMs: number): Promise<T | null> {
  const res = await fetchImpl(url, {
    headers: { accept: "application/json", "user-agent": userAgent() },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Throttled or down: an error, so the caller tries again later instead of recording "no photo".
  if (res.status === 429 || res.status >= 500)
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.ok ? ((await res.json()) as T) : null;
}

/** The P18 image file name of a Wikidata item, e.g. "Casa Batlló.jpg". */
export async function wikidataImageFile(
  qid: string,
  fetchImpl: Fetch = fetch,
  timeoutMs = 5_000,
): Promise<string | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const json = await getJson<{
    claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] };
  }>(
    `${WIKIDATA_API}?action=wbgetclaims&format=json&property=P18&entity=${qid}`,
    fetchImpl,
    timeoutMs,
  );
  return json?.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
}

/** Do two names refer to the same place? Same rules as merging sources, without the distance. */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 6 && long.includes(short)) return true;
  if (diceSimilarity(na, nb) >= 0.8) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [few, many] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return (
    few.join("").length >= 4 &&
    few.every((t) => many.has(t) || [...many].some((m) => diceSimilarity(t, m) >= 0.85))
  );
}

/**
 * Is a Wikidata item labelled `label` the place called `name`? One direction only: the label must
 * carry the place's whole name. "Frigideira Grill São Bento" is not the item "São Bento" (a metro
 * station it is named after), but "Parque Eduardo VII" is the item "Parque Eduardo VII de
 * Inglaterra".
 */
export function labelNamesPlace(name: string, label: string): boolean {
  const n = normalizeName(name);
  const l = normalizeName(label);
  if (!n || !l) return false;
  if (n === l) return true;
  if (n.length >= 6 && l.includes(n)) return true;
  if (diceSimilarity(n, l) >= 0.85) return true;
  const own = nameTokens(name);
  const theirs = new Set(nameTokens(label));
  // Word by word only for names of two or more meaningful words: "Bar Guanabara" is just
  // "guanabara" without the filler, and a statue called "Guanabara" is not the bar.
  return (
    own.length >= 2 &&
    own.every((t) => theirs.has(t) || [...theirs].some((m) => diceSimilarity(t, m) >= 0.85))
  );
}

/**
 * A Wikidata item with a photo, within `radiusKm` of the place and named like it (in any
 * language). Returns its image file name.
 */
export async function nearbyWikidataImageFile(
  place: { name: string; lat: number; lng: number },
  { fetchImpl = fetch, timeoutMs = 6_000, radiusKm = 0.3 } = {},
): Promise<string | null> {
  const point = `Point(${place.lng.toFixed(6)} ${place.lat.toFixed(6)})`;
  const query = `SELECT ?item ?label ?image WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "${point}"^^geo:wktLiteral ; wikibase:radius "${radiusKm}" . }
    ?item wdt:P18 ?image ; rdfs:label ?label .
  } LIMIT 400`;
  const json = await getJson<{
    results: {
      bindings: { item: { value: string }; label: { value: string }; image: { value: string } }[];
    };
  }>(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, fetchImpl, timeoutMs);
  const hit = json?.results.bindings.find((b) => labelNamesPlace(place.name, b.label.value));
  if (!hit) return null;
  // ".../Special:FilePath/Casa%20Batll%C3%B3.jpg" → "Casa Batlló.jpg"
  return decodeURIComponent(hit.image.value.split("/Special:FilePath/").pop() ?? "") || null;
}

/**
 * A photo on Wikimedia Commons taken within `radiusM` of the place whose file name carries the
 * place's whole name ("Casa-Museu Medeiros e Almeida - fachada.jpg" for "Casa-Museu Medeiros e
 * Almeida"). Finds sights that have photos but no Wikidata photo. Returns the file name.
 */
export async function nearbyCommonsFile(
  place: { name: string; lat: number; lng: number },
  { fetchImpl = fetch, timeoutMs = 5_000, radiusM = 150 } = {},
): Promise<string | null> {
  const json = await getJson<{ query?: { geosearch?: { title: string; dist: number }[] } }>(
    `${COMMONS_API}?action=query&format=json&list=geosearch&gsnamespace=6&gslimit=50&gsradius=${radiusM}&gscoord=${place.lat.toFixed(6)}|${place.lng.toFixed(6)}`,
    fetchImpl,
    timeoutMs,
  );
  for (const { title } of (json?.query?.geosearch ?? []).sort((a, b) => a.dist - b.dist)) {
    const file = title.replace(/^File:/, "");
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    // "Mercado_de_Arroios_02.jpg" → "Mercado de Arroios"
    const label = file
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_()[\]-]+/g, " ")
      .replace(/\b\d+\b/g, " ")
      .trim();
    if (labelNamesPlace(place.name, label)) return file;
  }
  return null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ImageInfo = {
  thumburl?: string;
  width?: number;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
};

async function imageInfo(
  title: string,
  width: number,
  fetchImpl: Fetch,
  timeoutMs: number,
): Promise<ImageInfo | null> {
  const json = await getJson<{ query?: { pages?: Record<string, { imageinfo?: ImageInfo[] }> } }>(
    `${COMMONS_API}?action=query&format=json&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=${width}&titles=${encodeURIComponent(title)}`,
    fetchImpl,
    timeoutMs,
  );
  return Object.values(json?.query?.pages ?? {})[0]?.imageinfo?.[0] ?? null;
}

/**
 * A scaled thumbnail of a Commons file (about 960 px wide), with its author and licence for the
 * credit. Never the original file: Wikimedia refuses hotlinked originals (HTTP 429). When the file
 * is narrower than the width asked, Commons hands back the original, so ask again smaller.
 */
export async function commonsImage(
  file: string,
  { fetchImpl = fetch, timeoutMs = 5_000, width = 960 } = {},
): Promise<CommonsImage | null> {
  const title = `File:${file.replace(/^File:/, "")}`;
  let info = await imageInfo(title, width, fetchImpl, timeoutMs);
  if (info?.thumburl && !info.thumburl.includes("/thumb/") && (info.width ?? 0) > 400)
    info = await imageInfo(title, Math.min(500, (info.width ?? 0) - 1), fetchImpl, timeoutMs);
  if (!info?.thumburl?.includes("/thumb/") || !info.descriptionurl) return null;
  if (info.mime && !/^image\/(jpeg|png|webp)$/.test(info.mime)) return null;
  const url = info.thumburl.split("?")[0]; // drop the API's utm_* tracking parameters
  const meta = info.extmetadata ?? {};
  const artist = stripHtml(meta.Artist?.value ?? "").slice(0, 80);
  const licence = stripHtml(meta.LicenseShortName?.value ?? "");
  const credit = [artist || "Wikimedia Commons", licence].filter(Boolean).join(", ");
  return { url, page: info.descriptionurl, credit };
}
