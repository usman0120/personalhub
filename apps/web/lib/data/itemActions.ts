"use client";

import { toast } from "sonner";
import type { Item, Suggestion } from "@personalhub/shared";
import { cleanTags } from "@personalhub/shared";
import { api, ClientApiError } from "@/lib/api/client";
import { toastError, undoToast } from "@/lib/ui";
import { bulkUpdateItems, createDoc, restore, softDelete, stores, touchTags, updateItem } from "./repos";

const snapshot = (ids: string[]) => ids.map((id) => stores.items.get(id)).filter((i): i is Item => Boolean(i));

function restoreSnapshot(prev: Item[], fields: Array<keyof Item>) {
  for (const p of prev) {
    const patch: Partial<Item> = {};
    for (const f of fields) (patch as Record<string, unknown>)[f] = p[f];
    void updateItem(p.id, patch);
  }
}

export async function setStatus(ids: string[], status: Item["status"], label?: string) {
  const prev = snapshot(ids);
  await bulkUpdateItems(ids, (i) => ({ status, reviewedAt: status === "inbox" ? null : i.reviewedAt ?? Date.now() })).catch(toastError);
  undoToast(label ?? `${ids.length === 1 ? "Item" : `${ids.length} items`} ${status === "archived" ? "archived" : status === "active" ? "kept" : "moved to Inbox"}`, () =>
    restoreSnapshot(prev, ["status", "reviewedAt"]),
  );
}

export async function trashItems(ids: string[]) {
  await Promise.all(ids.map((id) => softDelete("items", id))).catch(toastError);
  undoToast(`${ids.length === 1 ? "Item" : `${ids.length} items`} moved to Trash`, () => Promise.all(ids.map((id) => restore("items", id))));
}

export async function moveToArea(ids: string[], areaId: string | null) {
  const prev = snapshot(ids);
  await bulkUpdateItems(ids, { areaId }).catch(toastError);
  if (ids.length > 1) undoToast(`Moved ${ids.length} items`, () => restoreSnapshot(prev, ["areaId"]));
}

export async function addTags(ids: string[], tags: string[]) {
  const prev = snapshot(ids);
  const clean = cleanTags(tags);
  await bulkUpdateItems(ids, (i) => ({ tags: cleanTags([...i.tags, ...clean]) })).catch(toastError);
  void touchTags(clean);
  if (ids.length > 1) undoToast(`Tagged ${ids.length} items`, () => restoreSnapshot(prev, ["tags"]));
}

export async function removeTag(ids: string[], tag: string) {
  const prev = snapshot(ids);
  await bulkUpdateItems(ids, (i) => ({ tags: i.tags.filter((t) => t !== tag) })).catch(toastError);
  if (ids.length > 1) undoToast(`Removed tag from ${ids.length} items`, () => restoreSnapshot(prev, ["tags"]));
}

export const togglePin = (item: Item) => updateItem(item.id, { pinned: !item.pinned }).catch(toastError);

export type ChipField = "title" | "description" | "kind" | "areaId" | "tags" | "tasks";

/** Applies accepted suggestion fields (all when `fields` omitted). Tags merge, tasks are created. */
export async function acceptSuggestion(item: Item, fields?: ChipField[], tagSubset?: string[]) {
  const s = item.ai.suggestion;
  if (!s) return;
  const want = (f: ChipField) => !fields || fields.includes(f);
  const patch: Partial<Item> = {};
  if (want("title") && s.title) patch.title = s.title;
  if (want("description") && s.description) patch.description = s.description;
  if (want("kind") && s.kind) patch.kind = s.kind;
  if (want("areaId") && s.areaId) patch.areaId = s.areaId;
  if (want("tags") && s.tags?.length) patch.tags = cleanTags([...item.tags, ...(tagSubset ?? s.tags)]);
  if (want("tasks") && s.tasks?.length) {
    for (const t of s.tasks) {
      const due = t.due && !Number.isNaN(Date.parse(t.due)) ? Date.parse(t.due) : null;
      await createDoc("tasks", {
        title: t.title, status: "todo", due, dueHasTime: false, priority: 2, projectId: item.projectId,
        itemId: item.id, areaId: item.areaId, source: "ai", completedAt: null, isDeleted: false, deletedAt: null,
      });
    }
  }
  const remaining = remainingSuggestion(s, item, { ...item, ...patch }, fields);
  patch.ai = { ...item.ai, status: remaining ? "partially-accepted" : "accepted", suggestion: remaining ?? s };
  await updateItem(item.id, patch).catch(toastError);
  if (patch.tags) void touchTags(patch.tags);
}

function remainingSuggestion(s: Suggestion, before: Item, after: Item, fields?: ChipField[]): Suggestion | null {
  if (!fields) return null;
  const r: Suggestion = { confidence: s.confidence };
  if (s.title && after.title !== s.title) r.title = s.title;
  if (s.description && after.description !== s.description) r.description = s.description;
  if (s.kind && after.kind !== s.kind) r.kind = s.kind;
  if (s.areaId && after.areaId !== s.areaId) r.areaId = s.areaId;
  const tags = s.tags?.filter((t) => !after.tags.includes(t));
  if (tags?.length) r.tags = tags;
  if (s.tasks?.length && !fields.includes("tasks")) r.tasks = s.tasks;
  void before;
  return Object.keys(r).length > 1 ? r : null;
}

export async function rejectSuggestion(item: Item, field?: ChipField, tag?: string) {
  const s = item.ai.suggestion;
  if (!s) return;
  if (!field) return updateItem(item.id, { ai: { ...item.ai, status: "rejected" } }).catch(toastError);
  const next: Suggestion = { ...s };
  if (field === "tags" && tag) next.tags = s.tags?.filter((t) => t !== tag);
  else delete next[field];
  const empty = !next.title && !next.description && !next.kind && !next.areaId && !next.tags?.length && !next.tasks?.length;
  await updateItem(item.id, { ai: { ...item.ai, suggestion: next, status: empty ? "rejected" : item.ai.status } }).catch(toastError);
}

/** Calls /api/ai/suggest. Returns false when rate limited (with retryAfter seconds). */
export async function requestSuggestion(itemId: string, force = false): Promise<{ ok: boolean; retryAfter?: number; skipped?: string }> {
  try {
    const r = await api<{ skipped?: boolean; reason?: string }>("/api/ai/suggest", { body: { itemId, force } });
    return { ok: true, skipped: r.skipped ? r.reason : undefined };
  } catch (e) {
    if (e instanceof ClientApiError && e.code === "RATE_LIMITED") return { ok: false, retryAfter: e.retryAfter ?? 30 };
    throw e;
  }
}

/** Fire-and-forget unfurl for items created on the client. */
export function unfurlInBackground(itemId: string, attempt = 0) {
  // The optimistic local write may not have reached the server yet: retry NOT_FOUND a few times.
  void api("/api/unfurl", { body: { itemId } }).catch((e) => {
    if (e instanceof ClientApiError && e.code === "NOT_FOUND" && attempt < 4) setTimeout(() => unfurlInBackground(itemId, attempt + 1), 1200 * (attempt + 1));
  });
}

export function aiFollowUp(itemId: string, enabled: boolean) {
  if (!enabled) return;
  const run = (attempt: number) =>
    requestSuggestion(itemId).catch((e) => {
      if (e instanceof ClientApiError && e.code === "NOT_FOUND" && attempt < 3) setTimeout(() => void run(attempt + 1), 2000);
      else toast.error(`AI: ${(e as Error).message}`);
    });
  setTimeout(() => void run(0), 2500);
}
