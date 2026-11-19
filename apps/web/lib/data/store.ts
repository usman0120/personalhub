"use client";

import { createStore, del, get, set, type UseStore } from "idb-keyval";
import {
  collection, onSnapshot, query, Timestamp, where, type DocumentData, type Unsubscribe,
} from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { firestore } from "@/lib/firebase/client";

/** Converts Firestore Timestamps to epoch millis recursively. */
export function fromFs<T>(value: unknown): T {
  if (value instanceof Timestamp) return value.toMillis() as T;
  if (Array.isArray(value)) return value.map((v) => fromFs(v)) as T;
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromFs(v);
    return out as T;
  }
  return value as T;
}

const TS_KEYS = new Set([
  "capturedAt", "reviewedAt", "deletedAt", "decidedAt", "fetchedAt", "due", "completedAt", "deadline",
  "lastActivityAt", "renewalDate", "lastReviewedAt", "lastHitAt", "lastUsedAt", "lastExportAt",
]);

/** Converts known millis fields (and nested `updatedAt`) to Timestamps for writes. */
export function toFs(value: unknown, depth = 0, key = ""): unknown {
  if (typeof value === "number" && (TS_KEYS.has(key) || (depth > 1 && key === "updatedAt"))) return Timestamp.fromMillis(value);
  if (Array.isArray(value)) return value.map((v) => toFs(v, depth + 1));
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = toFs(v, depth + 1, k);
    return out;
  }
  return value;
}

export type Doc = { id: string; updatedAt: number };
type Listener = () => void;

/**
 * In-memory collection mirror with IndexedDB persistence and delta sync:
 * load cache → listen to `updatedAt > lastSyncAt` → upsert. Soft deletes travel as updates.
 * Local writes are applied optimistically and reconciled by the snapshot.
 */
export class CollectionStore<T extends Doc> {
  private map = new Map<string, T>();
  private listeners = new Set<Listener>();
  private snapshot: T[] = [];
  private unsub: Unsubscribe | null = null;
  private idb: UseStore;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncAt = 0;
  loaded = false;
  error: Error | null = null;

  constructor(public readonly name: string) {
    this.idb = createStore("personalhub-cache", "collections");
  }

  private cacheKey(uid: string) {
    return `${uid}:${this.name}`;
  }

  async start(uid: string, path: string) {
    this.stop();
    try {
      const cached = await get<{ docs: T[]; lastSyncAt: number }>(this.cacheKey(uid), this.idb);
      if (cached) {
        for (const d of cached.docs) this.map.set(d.id, d);
        this.lastSyncAt = cached.lastSyncAt;
        this.loaded = true;
        this.emit();
      }
    } catch {
      /* IndexedDB unavailable: full sync */
    }
    const q = query(collection(firestore(), path), where("updatedAt", ">", Timestamp.fromMillis(this.lastSyncAt)));
    this.unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        let changed = false;
        for (const change of snap.docChanges()) {
          // "removed" only means the doc left the delta window (pending timestamp); deletions are soft.
          if (change.type === "removed") continue;
          const data = change.doc.data({ serverTimestamps: "estimate" }) as DocumentData;
          const doc = { id: change.doc.id, ...fromFs<Omit<T, "id">>(data) } as T;
          this.map.set(doc.id, doc);
          if (!change.doc.metadata.hasPendingWrites && doc.updatedAt > this.lastSyncAt) this.lastSyncAt = doc.updatedAt;
          changed = true;
        }
        this.loaded = true;
        this.error = null;
        if (changed || !this.snapshot.length) this.emit();
        this.schedulePersist(uid);
      },
      (err) => {
        this.error = new Error(err.message);
        this.loaded = true;
        this.emit();
      },
    );
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
  }

  async clear(uid: string) {
    this.stop();
    this.map.clear();
    this.lastSyncAt = 0;
    this.loaded = false;
    await del(this.cacheKey(uid), this.idb).catch(() => {});
    this.emit();
  }

  private schedulePersist(uid: string) {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void set(this.cacheKey(uid), { docs: [...this.map.values()], lastSyncAt: this.lastSyncAt }, this.idb).catch(() => {});
    }, 1000);
  }

  private emit() {
    this.snapshot = [...this.map.values()];
    for (const l of this.listeners) l();
  }

  /** Optimistic local upsert (merged). */
  local(id: string, patch: Partial<T>) {
    const prev = this.map.get(id);
    this.map.set(id, { ...(prev ?? {}), ...patch, id, updatedAt: Date.now() } as T);
    this.emit();
  }

  localRemove(id: string) {
    this.map.delete(id);
    this.emit();
  }

  get(id: string): T | undefined {
    return this.map.get(id);
  }

  all = (): T[] => this.snapshot;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export function useCollection<T extends Doc>(store: CollectionStore<T>): { docs: T[]; loaded: boolean; error: Error | null } {
  const docs = useSyncExternalStore(store.subscribe, store.all, store.all);
  return { docs, loaded: store.loaded, error: store.error };
}
