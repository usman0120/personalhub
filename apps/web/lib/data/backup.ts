"use client";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import {
  AccountSchema, applyRules, buildItem, cleanTags, hashUrl, ItemSchema, ProjectSchema, RuleSchema, slugify, TaskSchema,
  type ImportEntry, type Item, type Settings,
} from "@personalhub/shared";
import { firestore } from "@/lib/firebase/client";
import { stores, touchTags, uid, updateSettings } from "./repos";
import { toFs } from "./store";

const COLLECTIONS = ["items", "projects", "tasks", "accounts", "rules"] as const;
const strip = <T extends Record<string, unknown>>(o: T) => {
  const { id, createdAt, updatedAt, ...rest } = o;
  void id; void createdAt; void updatedAt;
  return rest;
};

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(" ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function markdownFor(i: Item, areaName?: string): string {
  const fm = {
    id: i.id, title: i.title, kind: i.kind, status: i.status, url: i.url, area: areaName ?? null, tags: i.tags,
    platform: i.platform, captured: new Date(i.capturedAt).toISOString(), source: i.source,
  };
  const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
  const body = [i.description ? `> ${i.description}` : "", i.note, i.selection ? `\n> ${i.selection.replace(/\n/g, "\n> ")}` : "", i.image?.ocrText ? `\n## Text in image\n\n${i.image.ocrText}` : ""].filter(Boolean).join("\n\n");
  return `---\n${yaml}\n---\n\n# ${i.title}\n\n${body}\n`;
}

/** Builds the export ZIP in the browser. Never includes AI keys or capture tokens. */
export function buildExportZip(settings: Settings): Uint8Array {
  const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2));
  const items = stores.items.all().filter((i) => !i.isDeleted);
  const areaName = new Map(settings.areas.map((a) => [a.id, a.name]));
  const files: Record<string, Uint8Array> = {
    "items.json": json(items),
    "projects.json": json(stores.projects.all().filter((p) => !p.isDeleted)),
    "tasks.json": json(stores.tasks.all().filter((t) => !t.isDeleted)),
    "accounts.json": json(stores.accounts.all().filter((a) => !a.isDeleted)),
    "rules.json": json(stores.rules.all()),
    "settings.json": json({ ...settings, ai: { ...settings.ai, providers: settings.ai.providers.map(({ id, type, label, baseUrl }) => ({ id, type, label, baseUrl })) } }),
  };
  const cols = ["id", "title", "kind", "status", "url", "domain", "platform", "area", "tags", "description", "note", "capturedAt"];
  files["items.csv"] = strToU8(
    [cols.join(","), ...items.map((i) => [i.id, i.title, i.kind, i.status, i.url, i.domain, i.platform, areaName.get(i.areaId ?? "") ?? "", i.tags, i.description, i.note, new Date(i.capturedAt).toISOString()].map(csvCell).join(","))].join("\n"),
  );
  const used = new Set<string>();
  for (const i of items) {
    let name = slugify(i.title) || i.id;
    if (used.has(name)) name = `${name}-${i.id.slice(0, 6)}`;
    used.add(name);
    files[`markdown/${name}.md`] = strToU8(markdownFor(i, areaName.get(i.areaId ?? "")));
  }
  return zipSync(files, { level: 6 });
}

async function commitInBatches(ops: Array<(b: ReturnType<typeof writeBatch>) => void>, onProgress?: (done: number) => void, size = 400) {
  for (let i = 0; i < ops.length; i += size) {
    const batch = writeBatch(firestore());
    for (const op of ops.slice(i, i + size)) op(batch);
    await batch.commit();
    onProgress?.(Math.min(ops.length, i + size));
  }
}

/** Restores a PersonalHub export ZIP (round-trip). Existing docs with the same id are overwritten. */
export async function restoreBackupZip(data: Uint8Array, onProgress?: (msg: string) => void): Promise<Record<string, number>> {
  const files = unzipSync(data, { filter: (f) => f.name.endsWith(".json") });
  const counts: Record<string, number> = {};
  const schemas = { items: ItemSchema, projects: ProjectSchema, tasks: TaskSchema, accounts: AccountSchema, rules: RuleSchema };
  const db = firestore();
  for (const name of COLLECTIONS) {
    const raw = files[`${name}.json`];
    if (!raw) continue;
    const list = JSON.parse(strFromU8(raw)) as unknown[];
    const valid = list.map((d) => schemas[name].safeParse(d)).filter((r) => r.success).map((r) => r.data as { id: string } & Record<string, unknown>);
    counts[name] = valid.length;
    onProgress?.(`Restoring ${valid.length} ${name}…`);
    await commitInBatches(valid.map((d) => (b) => b.set(doc(db, "users", uid(), name, d.id), { ...(toFs(strip(d)) as object), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })));
  }
  const s = files["settings.json"];
  if (s) {
    const parsed = JSON.parse(strFromU8(s)) as Partial<Settings>;
    const patch: Partial<Settings> = {};
    if (Array.isArray(parsed.areas)) patch.areas = parsed.areas;
    if (Array.isArray(parsed.views)) patch.views = parsed.views;
    if (typeof parsed.pkrPerUsd === "number") patch.pkrPerUsd = parsed.pkrPerUsd;
    if (Object.keys(patch).length) await updateSettings(patch);
  }
  return counts;
}

export interface ImportOptions {
  importId: string;
  folderTags: Map<string, string | null>; // folder name → tag slug (null = skip)
  runRules: boolean;
}

/** Writes parsed bookmarks to the Inbox in batches (skipping URLs already in the hub). */
export async function importEntries(entries: ImportEntry[], opts: ImportOptions, onProgress: (done: number) => void): Promise<{ created: number; duplicates: number; ids: string[] }> {
  const existing = new Set(stores.items.all().filter((i) => !i.isDeleted && i.urlHash).map((i) => i.urlHash));
  const rules = opts.runRules ? stores.rules.all() : [];
  const db = firestore();
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  const ids: string[] = [];
  const allTags = new Set<string>();
  let duplicates = 0;
  for (const e of entries) {
    const base = buildItem({ kind: "link", source: "import", url: e.url, title: e.title, capturedAt: e.addDate });
    const urlHash = await hashUrl(base.urlNormalized);
    if (!urlHash || existing.has(urlHash)) {
      duplicates++;
      continue;
    }
    existing.add(urlHash);
    const folderTags = e.folderPath.map((f) => opts.folderTags.get(f)).filter((t): t is string => Boolean(t));
    const r = applyRules({ url: base.url, domain: base.domain, title: base.title, platform: base.platform, kind: "link", source: "import" }, rules);
    const tags = cleanTags([...folderTags, ...r.tags]);
    tags.forEach((t) => allTags.add(t));
    const ref = doc(collection(db, "users", uid(), "items"));
    ids.push(ref.id);
    const item = { ...base, urlHash, tags, areaId: r.areaId ?? null, status: "inbox", rulesApplied: [...r.rulesApplied, `import:${opts.importId}`] };
    ops.push((b) => b.set(ref, { ...(toFs(item) as object), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  }
  await commitInBatches(ops, onProgress);
  void touchTags([...allTags]);
  return { created: ops.length, duplicates, ids };
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = "application/zip") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type { Item };
