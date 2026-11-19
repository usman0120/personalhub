"use client";

import type MiniSearch from "minisearch";
import { buildDocs, createIndex, type SearchDoc } from "./search-core";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useCollection } from "@/lib/data/store";
import { stores } from "@/lib/data/repos";

export type { SearchDoc } from "./search-core";

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
