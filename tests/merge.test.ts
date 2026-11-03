import { describe, expect, it } from "vitest";
import { diceSimilarity, isSamePlace, nameTokens, normalizeName } from "@/lib/import/merge";

const at = (name: string, dm = 0) => ({ name, lat: 38.7 + dm / 111_320, lng: -9.14 });

describe("cross-source matching", () => {
  it("normalises names", () => {
    expect(normalizeName("Café A Brasileira")).toBe("cafe a brasileira");
    expect(normalizeName("K.O.B by Olivier")).toBe("kob by olivier");
    expect(nameTokens("Medeiros & Almeida Museum")).toEqual(["medeiros", "almeida"]);
    expect(diceSimilarity("forno d oro", "forno d ouro")).toBeGreaterThan(0.75);
  });

  it("matches the duplicates found between Overture and OpenStreetMap in Lisbon", () => {
    const pairs: [string, string, number][] = [
      ["A Panificacao Mecanica", "Panificação Mecânica Lda", 4],
      ["Medeiros & Almeida Museum", "Museu Medeiros e Almeida", 5],
      ["Forno d'Oro", "Forno d' Ouro", 8],
      ["Casa-Museu Dr. Anastácio Gonçalves", "Casa-Museu Doutor Anastácio Gonçalves", 8],
      ["Atelier-Museum Júlio Pomar", "Atelier-Museu Júlio Pomar", 11],
      ["K.O.B by Olivier", "KOB", 11],
      ["Cervejaria Ramiro", "Cervejaria Ramiro", 70],
      ["Viewpoint of Monte Agudo", "Miradouro do Monte Agudo", 2],
    ];
    for (const [a, b, d] of pairs) expect(isSamePlace(at(a), at(b, d)), `${a} / ${b}`).toBe(true);
  });

  it("keeps neighbours with different names apart", () => {
    const pairs: [string, string, number][] = [
      ["Lisboa Story Centre", "Nosolo Italia", 1],
      ["Tivoli Caffè", "Skybar Seen by Olivier", 1],
      ["Monkey Mash", "Fontória", 2],
      ["SushiCafé Avenida", "Guilty", 8],
      ["A Tasca", "The Corner Irish Pub Lisbon", 9],
      ["Taqueria Patron", "Mamma Rosa", 10],
      ["Galeria Reverso", "A Tasca Das Manas", 15],
      ["Café Central", "Café Central", 300],
    ];
    for (const [a, b, d] of pairs) expect(isSamePlace(at(a), at(b, d)), `${a} / ${b}`).toBe(false);
  });
});
