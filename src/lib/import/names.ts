/** Name and distance helpers shared by the importers (pure: no database). */
import { stripDiacritics } from "@/lib/slug";

/** Lowercase, no accents or punctuation: "Café A Brasileira" → "cafe a brasileira", "K.O.B" → "kob". */
export function normalizeName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/(\w)\.(?=\w)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Words that don't tell two places apart: articles, legal suffixes and the place type in several
 * languages ("Museu Medeiros e Almeida" and "Medeiros & Almeida Museum" are the same museum).
 */
const FILLER = new Set(
  (
    "a an and the of by at e y et und o os as de da do das dos del della di du le la les el los " +
    "lda ltd llc inc sa srl gmbh co dr doutor " +
    "museum museu museo musee museo galeria gallery galerie cafe caffe coffee bar pub restaurant restaurante " +
    "ristorante trattoria tasca cervejaria park parque parc jardim garden jardin market mercado marche shop store " +
    "viewpoint miradouro mirador belvedere aussichtspunkt lookout"
  ).split(" "),
);

export function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !FILLER.has(t));
}

/** Sørensen–Dice similarity of character bigrams, 0..1 ("forno d oro" vs "forno d ouro" ≈ 0.9). */
export function diceSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const m = new Map<string, number>();
    const t = s.replace(/ /g, "");
    for (let i = 0; i < t.length - 1; i++)
      m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/** Metres between two points (equirectangular; accurate at city scale). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const x = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = ((b.lat - a.lat) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
