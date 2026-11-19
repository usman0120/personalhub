import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { cleanTags, SuggestionSchema, type Item, type Settings, type Suggestion } from "@personalhub/shared";
import { adminDb } from "@/lib/firebase/admin";
import { fail, userRef } from "@/lib/api/server";
import { CLASSIFY_SYSTEM } from "./prompts";
import { clip, runJsonTask } from "./run";

export function buildClassifyInput(item: Item, settings: Settings, tagNames: string[]): string {
  const areas = settings.areas.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name }));
  const rulesSet: Record<string, unknown> = {};
  if (item.rulesApplied.length) {
    if (item.areaId) rulesSet.areaId = item.areaId;
    if (item.tags.length) rulesSet.tags = item.tags;
  }
  return [
    `Areas: ${JSON.stringify(areas)}`,
    `Existing tags (top 100 by use): ${JSON.stringify(tagNames.slice(0, 100))}`,
    `Already set by rules: ${JSON.stringify(rulesSet)}`,
    `Item: kind=${item.kind} platform=${item.platform} url=${clip(item.url, 500)} domain=${item.domain ?? ""}`,
    `title=${clip(item.title, 300)}`,
    `page description=${clip(item.description, 1000)}`,
    `user note=${clip(item.note, 4000)}`,
    `selected text=${clip(item.selection, 2000)}`,
    `image text (OCR)=${clip(item.image?.ocrText, 3000)}`,
  ].join("\n");
}

/** Drops area ids not in the list, normalises tags. */
export function sanitizeSuggestion(s: Suggestion, settings: Settings): Suggestion {
  const areaIds = new Set(settings.areas.map((a) => a.id));
  const out: Suggestion = { ...s };
  if (out.areaId && !areaIds.has(out.areaId)) delete out.areaId;
  if (out.tags) out.tags = cleanTags(out.tags, 6);
  return out;
}

/** Fields auto-apply may write, given settings and confidence. */
export function autoApplyPatch(item: Item, s: Suggestion, settings: Settings): Record<string, unknown> | null {
  const aa = settings.ai.autoApply;
  if (!aa.enabled || s.confidence < aa.minConfidence) return null;
  const patch: Record<string, unknown> = {};
  if (aa.fields.includes("areaId") && s.areaId) patch.areaId = s.areaId;
  if (aa.fields.includes("tags") && s.tags?.length) patch.tags = cleanTags([...item.tags, ...s.tags]);
  if (aa.fields.includes("kind") && s.kind) patch.kind = s.kind;
  if (aa.fields.includes("description") && s.description) patch.description = s.description;
  return Object.keys(patch).length ? patch : null;
}

export async function suggestForItem(uid: string, item: Item, settings: Settings) {
  const area = settings.areas.find((a) => a.id === item.areaId);
  if (area && !area.aiAllowed) throw fail("FORBIDDEN", `AI is off for the "${area.name}" area`);
  const tagsSnap = await userRef(uid).collection("tags").orderBy("lastUsedAt", "desc").limit(100).get();
  const tagNames = tagsSnap.docs.map((d) => d.id);
  const input = buildClassifyInput(item, settings, tagNames);
  const long = (item.note?.length ?? 0) + (item.selection?.length ?? 0) + (item.image?.ocrText?.length ?? 0) > 1500;

  const itemRef = userRef(uid).collection("items").doc(item.id);
  try {
    const { data, provider, model } = await runJsonTask<Suggestion>(uid, settings, long ? "summarize" : "classify", (m) => ({
      model: m,
      system: CLASSIFY_SYSTEM,
      user: [{ type: "text", text: input }],
      schema: SuggestionSchema,
      maxTokens: long ? 900 : 400,
      timeoutMs: 15000,
    }));
    const suggestion = sanitizeSuggestion(data, settings);
    const auto = autoApplyPatch(item, suggestion, settings);
    const { summary, ...rest } = suggestion;
    const patch: Record<string, unknown> = {
      ...(auto ?? {}),
      ai: {
        status: auto ? "accepted" : "suggested",
        suggestion: rest,
        ...(summary ? { summary } : item.ai.summary ? { summary: item.ai.summary } : {}),
        provider, model, updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    };
    await itemRef.update(patch);
    return { suggestion: rest, summary, autoApplied: Boolean(auto) };
  } catch (e) {
    await itemRef
      .update({ ai: { ...item.ai, status: "error", error: (e as Error).message.slice(0, 200), updatedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() })
      .catch(() => {});
    throw e;
  }
}

export const itemsCol = (uid: string) => adminDb().collection("users").doc(uid).collection("items");
