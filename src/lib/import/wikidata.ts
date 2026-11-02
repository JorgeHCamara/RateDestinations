/**
 * Wikidata sitelink counts: how many language Wikipedias have an article about a place.
 * A cheap, free, global signal of how notable a sight is. Added to prominence (capped).
 */
const SPARQL = "https://query.wikidata.org/sparql";

export async function fetchSitelinkCounts(
  ids: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const unique = Array.from(new Set(ids.filter((id) => /^Q\d+$/.test(id))));
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    const query = `SELECT ?item ?n WHERE { VALUES ?item { ${chunk.map((q) => `wd:${q}`).join(" ")} } ?item wikibase:sitelinks ?n }`;
    try {
      const res = await fetchImpl(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
        headers: {
          accept: "application/sparql-results+json",
          "user-agent": process.env.IMPORT_USER_AGENT ?? "RateDestinations/0.1",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        results: { bindings: { item: { value: string }; n: { value: string } }[] };
      };
      for (const b of json.results.bindings) {
        const id = b.item.value.split("/").pop();
        if (id) result.set(id, Number(b.n.value) || 0);
      }
    } catch {
      // Prominence enrichment is best-effort; the import still succeeds without it.
    }
  }
  return result;
}

/** Sitelinks → prominence bonus, capped so one famous place doesn't dominate. */
export function sitelinkBonus(sitelinks: number): number {
  return Math.min(40, Math.round(sitelinks * 2.5));
}
