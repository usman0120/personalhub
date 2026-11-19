"use client";

import {
  collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore,
} from "firebase/firestore";
import {
  applyRules, buildItem, cleanTags, hashUrl, type Account, type Conversation, type Item, type NewItemInput,
  type Project, type Rule, type Settings, type Tag, type Task,
} from "@personalhub/shared";
import { firestore } from "@/lib/firebase/client";
import { CollectionStore, toFs } from "./store";

export type TagDoc = Tag & { id: string; updatedAt: number };

export const stores = {
  items: new CollectionStore<Item>("items"),
  projects: new CollectionStore<Project>("projects"),
  tasks: new CollectionStore<Task>("tasks"),
  accounts: new CollectionStore<Account>("accounts"),
  rules: new CollectionStore<Rule>("rules"),
  conversations: new CollectionStore<Conversation>("conversations"),
};
export type StoreName = keyof typeof stores;

let currentUid: string | null = null;
export const setUid = (uid: string | null) => (currentUid = uid);
export function uid(): string {
  if (!currentUid) throw new Error("Not signed in");
  return currentUid;
}
const db = (): Firestore => firestore();
const col = (name: string) => collection(db(), "users", uid(), name);
const ref = (name: string, id: string) => doc(db(), "users", uid(), name, id);
export const newId = (name: string) => doc(col(name)).id;

/** Writes never throw to the caller when offline: Firestore queues them; errors surface via toast. */
async function write(p: Promise<unknown>, onError?: (e: Error) => void) {
  try {
    await p;
  } catch (e) {
    onError?.(e as Error);
    throw e;
  }
}

// ---------- generic soft-deletable collections ----------
type SyncName = "items" | "projects" | "tasks" | "accounts";

export async function createDoc<N extends SyncName>(name: N, data: Record<string, unknown>, id = newId(name)): Promise<string> {
  const now = Date.now();
  stores[name].local(id, { ...data, createdAt: now, updatedAt: now } as never);
  const payload = toFs(data) as Record<string, unknown>;
  void write(setDoc(ref(name, id), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).catch(() => stores[name].localRemove(id));
  return id;
}

export function updateDocument(name: SyncName | "rules", id: string, patch: Record<string, unknown>) {
  stores[name].local(id, patch as never);
  return write(updateDoc(ref(name, id), { ...(toFs(patch) as object), updatedAt: serverTimestamp() }));
}

export const softDelete = (name: SyncName, id: string) =>
  updateDocument(name, id, { isDeleted: true, deletedAt: Date.now() });
export const restore = (name: SyncName, id: string) => updateDocument(name, id, { isDeleted: false, deletedAt: null });

export async function purge(name: SyncName, id: string) {
  const item = name === "items" ? (stores.items.get(id) as Item | undefined) : undefined;
  stores[name].localRemove(id);
  await deleteDoc(ref(name, id));
  if (item?.image?.blobId) await deleteDoc(ref("blobs", item.image.blobId)).catch(() => {});
}

// ---------- items ----------
export interface CreateItemOptions extends NewItemInput {
  status?: Item["status"];
  extra?: Partial<Item>;
  skipRules?: boolean;
}

/** Creates an item on the client (works offline). Returns { id, duplicateOf }. */
export async function createItem(input: CreateItemOptions): Promise<{ id: string; duplicateOf?: string }> {
  const base = buildItem(input);
  const urlHash = await hashUrl(base.urlNormalized);
  if (urlHash) {
    const dup = stores.items.all().find((i) => i.urlHash === urlHash && !i.isDeleted);
    if (dup) {
      const addition = [input.selection ? `> ${input.selection}` : "", input.note ?? ""].filter(Boolean).join("\n\n");
      const patch: Partial<Item> = { tags: cleanTags([...dup.tags, ...(input.tags ?? [])]) };
      if (addition && !dup.note.includes(addition)) patch.note = `${dup.note ? `${dup.note}\n\n` : ""}${addition}`.slice(0, 20000);
      await updateDocument("items", dup.id, patch);
      return { id: dup.id, duplicateOf: dup.id };
    }
  }
  const rules = input.skipRules ? [] : stores.rules.all();
  const r = applyRules(
    { url: base.url, domain: base.domain, title: base.title, text: [base.note, base.selection, base.description].filter(Boolean).join("\n"), platform: base.platform, kind: base.kind, source: base.source },
    rules,
  );
  const status = input.status ?? r.status ?? "inbox";
  const item: Omit<Item, "id" | "createdAt" | "updatedAt"> = {
    ...base,
    urlHash,
    areaId: input.areaId ?? r.areaId ?? null,
    tags: cleanTags([...base.tags, ...r.tags]),
    kind: r.kind && input.kind === "link" ? r.kind : base.kind,
    projectId: input.projectId ?? r.projectId ?? null,
    status,
    reviewedAt: status === "inbox" ? null : Date.now(),
    rulesApplied: r.rulesApplied,
    ...(input.extra ?? {}),
  };
  const id = await createDoc("items", item as unknown as Record<string, unknown>);
  for (const ruleId of r.rulesApplied) {
    const rule = stores.rules.get(ruleId);
    if (rule) void updateDocument("rules", ruleId, { hits: rule.hits + 1, lastHitAt: Date.now() }).catch(() => {});
  }
  void touchTags(item.tags);
  return { id };
}

export const updateItem = (id: string, patch: Partial<Item>) => updateDocument("items", id, patch as Record<string, unknown>);

// ---------- tags ----------
export const tagStore = new CollectionStore<TagDoc>("tags");

export async function touchTags(slugs: string[]) {
  const known = new Set(tagStore.all().map((t) => t.id));
  for (const slug of slugs) {
    if (!slug) continue;
    const data = known.has(slug)
      ? { lastUsedAt: serverTimestamp() }
      : { name: slug, color: null, lastUsedAt: serverTimestamp(), createdAt: serverTimestamp() };
    tagStore.local(slug, { slug, name: tagStore.get(slug)?.name ?? slug, lastUsedAt: Date.now() } as Partial<TagDoc>);
    void setDoc(ref("tags", slug), data, { merge: true }).catch(() => {});
  }
}

/** Renames (or merges into) a tag: rewrites affected items in batches of ≤ 450. */
export async function renameTag(from: string, toName: string) {
  const to = cleanTags([toName])[0];
  if (!to || to === from) return 0;
  const affected = stores.items.all().filter((i) => i.tags.includes(from));
  for (let i = 0; i < affected.length; i += 450) {
    const batch = writeBatch(db());
    for (const it of affected.slice(i, i + 450)) {
      const tags = cleanTags(it.tags.map((t) => (t === from ? to : t)));
      stores.items.local(it.id, { tags });
      batch.update(ref("items", it.id), { tags, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
  const existing = tagStore.get(to);
  await setDoc(ref("tags", to), { name: existing?.name ?? toName.trim().slice(0, 40), color: existing?.color ?? null, lastUsedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  await deleteDoc(ref("tags", from));
  tagStore.localRemove(from);
  return affected.length;
}

export async function deleteTag(slug: string) {
  const affected = stores.items.all().filter((i) => i.tags.includes(slug));
  for (let i = 0; i < affected.length; i += 450) {
    const batch = writeBatch(db());
    for (const it of affected.slice(i, i + 450)) {
      const tags = it.tags.filter((t) => t !== slug);
      stores.items.local(it.id, { tags });
      batch.update(ref("items", it.id), { tags, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
  await deleteDoc(ref("tags", slug));
  tagStore.localRemove(slug);
  return affected.map((a) => a.id);
}

export async function addTagToItems(itemIds: string[], tag: string) {
  const ids = new Set(itemIds);
  const batch = writeBatch(db());
  for (const it of stores.items.all().filter((i) => ids.has(i.id))) {
    const tags = cleanTags([...it.tags, tag]);
    stores.items.local(it.id, { tags });
    batch.update(ref("items", it.id), { tags, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  void touchTags([tag]);
}

/** Generic batched item patch (bulk move, archive, delete). */
export async function bulkUpdateItems(ids: string[], patch: Partial<Item> | ((i: Item) => Partial<Item>)) {
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db());
    for (const id of ids.slice(i, i + 450)) {
      const it = stores.items.get(id);
      if (!it) continue;
      const p = typeof patch === "function" ? patch(it) : patch;
      stores.items.local(id, p);
      batch.update(ref("items", id), { ...(toFs(p) as object), updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

// ---------- rules ----------
export async function saveRule(rule: Omit<Rule, "createdAt" | "updatedAt" | "hits" | "lastHitAt"> & Partial<Pick<Rule, "hits" | "lastHitAt">>) {
  const exists = stores.rules.get(rule.id);
  const data = { ...rule, hits: rule.hits ?? exists?.hits ?? 0, lastHitAt: rule.lastHitAt ?? exists?.lastHitAt ?? null };
  const { id, ...rest } = data;
  stores.rules.local(id, data as Partial<Rule>);
  await setDoc(ref("rules", id), {
    ...(toFs(rest) as object),
    createdAt: exists ? undefined : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
export async function deleteRule(id: string) {
  stores.rules.localRemove(id);
  await deleteDoc(ref("rules", id));
}

// ---------- settings ----------
export async function updateSettings(patch: Partial<Settings> | Record<string, unknown>) {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) flat[k.startsWith("settings.") ? k : `settings.${k}`] = toFs(v, 0, k.split(".").pop());
  await updateDoc(doc(db(), "users", uid()), { ...flat, updatedAt: serverTimestamp() });
}

// ---------- conversations ----------
export async function deleteConversation(id: string) {
  stores.conversations.localRemove(id);
  const msgs = await getDocs(collection(db(), "users", uid(), "conversations", id, "messages"));
  const batch = writeBatch(db());
  msgs.docs.forEach((m) => batch.delete(m.ref));
  batch.delete(ref("conversations", id));
  await batch.commit();
}
export const renameConversation = (id: string, title: string) => {
  stores.conversations.local(id, { title });
  return updateDoc(ref("conversations", id), { title: title.slice(0, 120), updatedAt: serverTimestamp() });
};

// ---------- blobs (thumbnails in no-storage mode) ----------
export async function saveBlob(itemId: string, dataBase64: string): Promise<string> {
  const id = newId("blobs");
  await setDoc(ref("blobs", id), { itemId, mime: "image/webp", dataBase64, createdAt: serverTimestamp() });
  return id;
}

export { ref as docRef, col as colRef };
