"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Area, Item } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useCollection, type CollectionStore } from "./store";
import { stores, tagStore } from "./repos";

export function useItems(opts: { includeDeleted?: boolean } = {}) {
  const { docs, loaded, error } = useCollection(stores.items);
  const items = useMemo(() => (opts.includeDeleted ? docs : docs.filter((d) => !d.isDeleted)), [docs, opts.includeDeleted]);
  return { items, loaded, error };
}

type Stores = typeof stores;
type DocOf<N extends keyof Stores> = ReturnType<Stores[N]["all"]>[number];

export function useLive<N extends keyof Stores>(name: N, includeDeleted = false) {
  const { docs, loaded, error } = useCollection(stores[name] as unknown as CollectionStore<DocOf<N>>);
  const live = useMemo(
    () => (includeDeleted ? docs : docs.filter((d) => !(d as { isDeleted?: boolean }).isDeleted)),
    [docs, includeDeleted],
  );
  return { docs: live as DocOf<N>[], loaded, error };
}

export function useItem(id: string | null | undefined): Item | undefined {
  const { docs } = useCollection(stores.items);
  return useMemo(() => (id ? docs.find((d) => d.id === id) : undefined), [docs, id]);
}

export function useAreas(includeArchived = false): Area[] {
  const settings = useSettings();
  return useMemo(
    () => [...settings.areas].filter((a) => includeArchived || !a.archived).sort((a, b) => a.order - b.order),
    [settings.areas, includeArchived],
  );
}

export function useAreaMap(): Map<string, Area> {
  const areas = useAreas(true);
  return useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
}

export function useTags() {
  const docs = useSyncExternalStore(tagStore.subscribe, tagStore.all, tagStore.all);
  const { items } = useItems();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    const names = new Map(docs.map((d) => [d.id, d.name]));
    for (const slug of counts.keys()) if (!names.has(slug)) names.set(slug, slug);
    return [...names.entries()]
      .map(([slug, name]) => ({ slug, name: name || slug, count: counts.get(slug) ?? 0, lastUsedAt: docs.find((d) => d.id === slug)?.lastUsedAt ?? 0 }))
      .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  }, [docs, items]);
}
