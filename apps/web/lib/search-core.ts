import MiniSearch from "minisearch";
import type { Account, Item, Project, Task } from "@personalhub/shared";

export type SearchDoc = {
  id: string;
  type: "item" | "project" | "task" | "account";
  refId: string;
  title: string;
  text: string;
  tags: string;
  domain: string;
};

export const SEARCH_FIELDS = ["title", "text", "tags", "domain"] as const;

export function createIndex() {
  return new MiniSearch<SearchDoc>({
    fields: [...SEARCH_FIELDS],
    storeFields: ["type", "refId", "title"],
    searchOptions: { boost: { title: 3, tags: 2, domain: 1.5 }, prefix: true, fuzzy: 0.15, combineWith: "AND" },
  });
}

export function itemDoc(i: Item): SearchDoc {
  return {
    id: `item:${i.id}`, type: "item", refId: i.id, title: i.title,
    text: [i.description, i.note, i.selection, i.ai.summary, i.image?.ocrText].filter(Boolean).join(" ").slice(0, 6000),
    tags: i.tags.join(" "), domain: i.domain ?? "",
  };
}

/** Builds the MiniSearch index over items, projects, tasks and accounts (accounts: service/category only, no notes). */
export function buildDocs(items: Item[], projects: Project[], tasks: Task[], accounts: Account[]): SearchDoc[] {
  return [
    ...items.filter((i) => !i.isDeleted).map(itemDoc),
    ...projects.filter((p) => !p.isDeleted).map((p) => ({ id: `project:${p.id}`, type: "project" as const, refId: p.id, title: p.name, text: [p.problem, p.goal].join(" "), tags: "", domain: "" })),
    ...tasks.filter((t) => !t.isDeleted).map((t) => ({ id: `task:${t.id}`, type: "task" as const, refId: t.id, title: t.title, text: "", tags: "", domain: "" })),
    ...accounts.filter((a) => !a.isDeleted).map((a) => ({ id: `account:${a.id}`, type: "account" as const, refId: a.id, title: a.service, text: a.category, tags: "", domain: a.url ?? "" })),
  ];
}

