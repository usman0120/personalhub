import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  applyRules, buildItem, cleanTags, DEFAULT_SETTINGS, extractFirstUrl, hashUrl, isHttpUrl, RuleSchema,
  SettingsSchema, type CaptureInput, type CaptureOutput, type Item, type Rule, type Settings, type UnfurlResult,
} from "@personalhub/shared";
import { adminDb, fromAdmin } from "@/lib/firebase/admin";
import { userRef } from "@/lib/api/server";
import { unfurl } from "@/lib/unfurl";

export async function loadSettings(uid: string): Promise<Settings> {
  const snap = await userRef(uid).get();
  const parsed = SettingsSchema.safeParse(fromAdmin(snap.data()?.settings));
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS, ...(fromAdmin<Partial<Settings>>(snap.data()?.settings) ?? {}) };
}

export async function loadRules(uid: string): Promise<Rule[]> {
  const snap = await userRef(uid).collection("rules").get();
  return snap.docs
    .map((d) => RuleSchema.safeParse({ id: d.id, ...fromAdmin<object>(d.data()) }))
    .filter((r) => r.success)
    .map((r) => r.data!);
}

export async function loadItem(uid: string, itemId: string): Promise<Item | null> {
  const snap = await userRef(uid).collection("items").doc(itemId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...fromAdmin<Omit<Item, "id">>(snap.data()) };
}

/** Converts known millis fields to admin Timestamps for writes. */
function toAdminTimestamps(obj: Record<string, unknown>): Record<string, unknown> {
  const out = { ...obj };
  for (const k of ["capturedAt", "reviewedAt", "deletedAt"]) {
    const v = out[k];
    if (typeof v === "number") out[k] = Timestamp.fromMillis(v);
  }
  return out;
}

function unfurlPatch(item: Pick<Item, "title" | "description" | "faviconUrl" | "domain" | "url">, r: UnfurlResult) {
  const patch: Record<string, unknown> = {
    unfurl: { status: r.status, ...(r.siteName ? { siteName: r.siteName } : {}), fetchedAt: FieldValue.serverTimestamp() },
  };
  const titleIsPlaceholder = !item.title || item.title === item.domain || item.title === item.url;
  if (r.title && titleIsPlaceholder) patch.title = r.title.slice(0, 300);
  if (r.description && !item.description) patch.description = r.description.slice(0, 1000);
  if (r.faviconUrl && !item.faviconUrl) patch.faviconUrl = r.faviconUrl;
  if (r.imageUrl) patch.imageUrl = r.imageUrl;
  return patch;
}

export async function unfurlItem(uid: string, item: Item, timeoutMs = 5000): Promise<UnfurlResult> {
  if (!item.url) return { status: "failed" };
  const result = await unfurl(item.url, timeoutMs);
  await userRef(uid).collection("items").doc(item.id).update({ ...unfurlPatch(item, result), updatedAt: FieldValue.serverTimestamp() });
  return result;
}

/** Server-side capture used by /api/capture (extension, API, share fallback). */
export async function captureItem(uid: string, input: CaptureInput): Promise<CaptureOutput> {
  const items = userRef(uid).collection("items");
  const url = input.url && isHttpUrl(input.url) ? input.url.trim() : extractFirstUrl(input.text) ?? null;
  const kind = input.kind ?? (url ? "link" : "note");
  const noteParts = [input.note, url ? input.text?.replace(url, "").trim() : input.text].filter((s): s is string => Boolean(s?.trim()));
  const note = noteParts.join("\n\n");

  const base = buildItem({
    kind, source: input.source, url, title: input.title, note, selection: input.selection ?? null,
    description: input.description ?? null, faviconUrl: input.faviconUrl ?? null, areaId: input.areaId ?? null,
    tags: cleanTags(input.tags ?? []),
  });
  const urlHash = await hashUrl(base.urlNormalized);

  if (urlHash) {
    const dup = await items.where("urlHash", "==", urlHash).where("isDeleted", "==", false).limit(1).get();
    const existing = dup.docs[0];
    if (existing) {
      const data = existing.data();
      const addition = [input.selection ? `> ${input.selection.replace(/\n/g, "\n> ")}` : "", note].filter(Boolean).join("\n\n");
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (addition && !String(data.note ?? "").includes(addition)) {
        patch.note = `${data.note ? `${data.note}\n\n` : ""}${addition}`.slice(0, 20000);
      }
      const tags = cleanTags([...(data.tags ?? []), ...(input.tags ?? [])]);
      if (tags.length !== (data.tags ?? []).length) patch.tags = tags;
      await existing.ref.update(patch);
      return { itemId: existing.id, duplicateOf: existing.id, status: data.status === "inbox" ? "inbox" : "active" };
    }
  }

  const [rules, settings] = await Promise.all([loadRules(uid), loadSettings(uid)]);
  const r = applyRules(
    { url: base.url, domain: base.domain, title: base.title, text: [note, input.selection, input.description].filter(Boolean).join("\n"), platform: base.platform, kind: base.kind, source: base.source },
    rules,
  );
  const item = {
    ...base,
    urlHash,
    areaId: input.areaId ?? r.areaId ?? settings.defaultAreaId ?? null,
    tags: cleanTags([...base.tags, ...r.tags]),
    kind: input.kind ? base.kind : (r.kind ?? base.kind),
    status: r.status ?? "inbox",
    projectId: r.projectId ?? null,
    rulesApplied: r.rulesApplied,
    reviewedAt: r.status === "active" ? Date.now() : null,
  } satisfies Omit<Item, "id" | "createdAt" | "updatedAt">;

  const area = settings.areas.find((a) => a.id === item.areaId);
  const wantAi = (input.runAi ?? r.runAi ?? settings.ai.suggestOnCapture) && settings.ai.enabled && (area?.aiAllowed ?? true);
  if (wantAi) item.ai = { status: "pending" };

  const ref = items.doc();
  await ref.set({
    ...toAdminTimestamps(item),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await bumpRuleHits(uid, r.rulesApplied);
  await touchTags(uid, item.tags);

  if (url && input.runUnfurl !== false) {
    await unfurlItem(uid, { ...item, id: ref.id, createdAt: 0, updatedAt: 0 } as Item, 4000).catch(() => {});
  }
  return { itemId: ref.id, status: item.status };
}

export async function bumpRuleHits(uid: string, ids: string[]) {
  if (!ids.length) return;
  const batch = adminDb().batch();
  for (const id of ids) {
    batch.update(userRef(uid).collection("rules").doc(id), {
      hits: FieldValue.increment(1),
      lastHitAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit().catch(() => {});
}

export async function touchTags(uid: string, slugs: string[]) {
  if (!slugs.length) return;
  const refs = slugs.map((s) => userRef(uid).collection("tags").doc(s));
  const snaps = await adminDb().getAll(...refs);
  const batch = adminDb().batch();
  snaps.forEach((snap, i) => {
    if (snap.exists) batch.update(refs[i]!, { lastUsedAt: FieldValue.serverTimestamp() });
    else batch.set(refs[i]!, { name: slugs[i], color: null, lastUsedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
  });
  await batch.commit().catch(() => {});
}
