import * as chrono from "chrono-node";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  ApplyActionInput, buildItem, cleanTags, hashUrl, ProposedActionSchema, type ProposedAction,
} from "@personalhub/shared";
import { fail, ok, readJson, route, userRef } from "@/lib/api/server";
import { ACTION_SCHEMAS } from "@/lib/ai/actions";
import { loadSettings, touchTags } from "@/lib/server/items";

export const runtime = "nodejs";

const ts = () => FieldValue.serverTimestamp();

export const POST = route(["idToken"], async (req, auth) => {
  const input = await readJson(req, ApplyActionInput);
  const user = userRef(auth.uid);
  const msgRef = user.collection("conversations").doc(input.conversationId).collection("messages").doc(input.messageId);
  const snap = await msgRef.get();
  if (!snap.exists) throw fail("NOT_FOUND", "Message not found");
  const actions = ProposedActionSchema.array().parse(snap.data()?.actions ?? []);
  const idx = actions.findIndex((a) => a.id === input.actionId);
  const action = actions[idx];
  if (!action) throw fail("NOT_FOUND", "Action not found");
  if (action.status !== "proposed") throw fail("INVALID_INPUT", `Action already ${action.status}`);

  const save = async (patch: Partial<ProposedAction>) => {
    actions[idx] = { ...action, ...patch };
    await msgRef.update({ actions });
  };
  if (input.dismiss) {
    await save({ status: "dismissed" });
    return ok(req, { status: "dismissed" });
  }

  const merged = { ...action.payload, ...(input.edits ?? {}) };
  const parsed = ACTION_SCHEMAS[action.type].safeParse(merged);
  if (!parsed.success) throw fail("INVALID_INPUT", "Invalid action payload", parsed.error.issues.slice(0, 5));
  const p = parsed.data as Record<string, unknown>;
  const settings = await loadSettings(auth.uid);
  const areaOk = (id: unknown) => typeof id === "string" && settings.areas.some((a) => a.id === id);
  let resultId: string;

  switch (action.type) {
    case "create_item": {
      const base = buildItem({
        kind: p.kind as "link", source: "assistant", url: (p.url as string) ?? null, title: p.title as string,
        description: (p.description as string) ?? null, note: (p.note as string) ?? "",
        areaId: areaOk(p.areaId) ? (p.areaId as string) : null, tags: cleanTags((p.tags as string[]) ?? []),
      });
      const urlHash = await hashUrl(base.urlNormalized);
      if (urlHash) {
        const dup = await user.collection("items").where("urlHash", "==", urlHash).where("isDeleted", "==", false).limit(1).get();
        if (dup.docs[0]) {
          resultId = dup.docs[0].id;
          await dup.docs[0].ref.update({
            tags: cleanTags([...(dup.docs[0].data().tags ?? []), ...base.tags]),
            ...(base.description && !dup.docs[0].data().description ? { description: base.description } : {}),
            updatedAt: ts(),
          });
          break;
        }
      }
      const ref = user.collection("items").doc();
      await ref.set({
        ...base, urlHash, status: "active", capturedAt: Timestamp.now(), reviewedAt: Timestamp.now(),
        unfurl: { status: base.url ? "pending" : "skipped" }, createdAt: ts(), updatedAt: ts(),
      });
      await touchTags(auth.uid, base.tags);
      resultId = ref.id;
      break;
    }
    case "update_item": {
      const { itemId, fields } = p as { itemId: string; fields: Record<string, unknown> };
      const ref = user.collection("items").doc(itemId);
      const item = await ref.get();
      if (!item.exists || item.data()?.isDeleted) throw fail("NOT_FOUND", "Item not found");
      const area = settings.areas.find((a) => a.id === item.data()?.areaId);
      if (area && !area.aiAllowed) throw fail("FORBIDDEN", "AI is off for this area");
      const patch: Record<string, unknown> = { ...fields };
      if ("areaId" in patch && !areaOk(patch.areaId)) delete patch.areaId;
      if (Array.isArray(patch.tags)) patch.tags = cleanTags(patch.tags as string[]);
      await ref.update({ ...patch, updatedAt: ts() });
      resultId = itemId;
      break;
    }
    case "create_task": {
      const dueRaw = p.due as string | undefined;
      const due = dueRaw ? (Number.isNaN(Date.parse(dueRaw)) ? chrono.parseDate(dueRaw, new Date(), { forwardDate: true }) : new Date(dueRaw)) : null;
      const ref = user.collection("tasks").doc();
      await ref.set({
        title: p.title, status: "todo", due: due ? Timestamp.fromDate(due) : null, dueHasTime: Boolean(dueRaw && /T\d\d:/.test(dueRaw)),
        priority: 2, projectId: (p.projectId as string) ?? null, itemId: (p.itemId as string) ?? null, areaId: null,
        source: "ai", completedAt: null, isDeleted: false, deletedAt: null, createdAt: ts(), updatedAt: ts(),
      });
      resultId = ref.id;
      break;
    }
    case "create_project": {
      const ref = user.collection("projects").doc();
      await ref.set({
        name: p.name, status: "idea", areaId: areaOk(p.areaId) ? p.areaId : null, color: "#6366f1",
        problem: (p.problem as string) ?? "", goal: (p.goal as string) ?? "", doneWhen: "", deadline: null, links: [],
        lastActivityAt: ts(), isDeleted: false, deletedAt: null, createdAt: ts(), updatedAt: ts(),
      });
      resultId = ref.id;
      break;
    }
  }
  await save({ status: "applied", resultId, payload: p });
  return ok(req, { status: "applied", type: action.type, id: resultId });
});
