/** Remove diacritics: "São Paulo" -> "Sao Paulo", "München" -> "Munchen". */
export function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** URL slug: lowercase ASCII letters, digits and single hyphens. */
export function slugify(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
