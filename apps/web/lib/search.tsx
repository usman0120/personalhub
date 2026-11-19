"use client";

import MiniSearch from "minisearch";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, Item, Project, Task } from "@personalhub/shared";
import { useCollection } from "@/lib/data/store";
import { stores } from "@/lib/data/repos";

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

/** Live search index; rebuilt (debounced) when synced data changes. */
function useBuildIndex() {
  const items = useCollection(stores.items).docs;
  const projects = useCollection(stores.projects).docs;
  const tasks = useCollection(stores.tasks).docs;
  const accounts = useCollection(stores.accounts).docs;
  const [index, setIndex] = useState(() => createIndex());
  useEffect(() => {
    const t = setTimeout(() => {
      const idx = createIndex();
      idx.addAll(buildDocs(items, projects, tasks, accounts));
      setIndex(idx);
    }, 150);
    return () => clearTimeout(t);
  }, [items, projects, tasks, accounts]);
  return index;
}

const SearchCtx = createContext<MiniSearch<SearchDoc> | null>(null);
export function SearchProvider({ children }: { children: ReactNode }) {
  const index = useBuildIndex();
  return <SearchCtx.Provider value={index}>{children}</SearchCtx.Provider>;
}
export function useSearchIndex(): MiniSearch<SearchDoc> {
  const idx = useContext(SearchCtx);
  if (!idx) throw new Error("useSearchIndex outside SearchProvider");
  return idx;
}

/** Returns item ids matching a query (Library search box, Assistant retrieval). */
export function useItemSearch(q: string): Set<string> | null {
  const index = useSearchIndex();
  return useMemo(() => {
    const query = q.trim();
    if (!query) return null;
    return new Set(index.search(query, { filter: (r) => r.type === "item" }).map((r) => r.refId as string));
  }, [index, q]);
}
