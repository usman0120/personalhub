import { describe, expect, it } from "vitest";
import { buildItem, type Item } from "@personalhub/shared";
import { createIndex, itemDoc } from "@/lib/search-core";

function fixtures(n: number): Item[] {
  const words = ["react", "hosting", "firebase", "career", "freelance", "invoice", "design", "rust", "python", "linux", "docker", "seo"];
  return Array.from({ length: n }, (_, i) => {
    const w = words[i % words.length]!;
    const base = buildItem({ kind: "link", source: "import", url: `https://site${i}.example.com/${w}`, title: `${w} resource number ${i}`, note: `Notes about ${w} and ${words[(i * 7) % words.length]}` }, 0);
    return { ...base, id: `i${i}`, urlHash: null, tags: [w], createdAt: 0, updatedAt: 0 } as Item;
  });
}

describe("search", () => {
  const items = fixtures(5000);
  const index = createIndex();
  index.addAll(items.map(itemDoc));

  it("finds across title, note, tags and domain", () => {
    expect(index.search("hosting").length).toBeGreaterThan(0);
    expect(index.search("site42").map((r) => r.refId)).toContain("i42");
    expect(index.search("resource number 4999")[0]?.refId).toBe("i4999");
  });

  it("answers queries in < 100 ms for 5 000 items", () => {
    const queries = ["react", "fire", "freelance invoice", "docker linux", "seo"];
    const t = performance.now();
    for (const q of queries) index.search(q);
    expect((performance.now() - t) / queries.length).toBeLessThan(100);
  });
});
