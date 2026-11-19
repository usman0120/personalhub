import { FieldValue } from "firebase-admin/firestore";
import { AiChatInput, extractFirstUrl, shortId, truncate } from "@personalhub/shared";
import { errorResponse, readJson, route, userRef } from "@/lib/api/server";
import { fromAdmin } from "@/lib/firebase/admin";
import { loadSettings } from "@/lib/server/items";
import { CHAT_SYSTEM } from "@/lib/ai/prompts";
import { checkAiBudget, recordUsage, resolveTask } from "@/lib/ai/run";
import { parseActions } from "@/lib/ai/actions";
import { unfurl } from "@/lib/unfurl";
import type { ChatMessage } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MARKER = "```actions";

export const POST = route(["idToken"], async (req, auth) => {
  const input = await readJson(req, AiChatInput);
  const settings = await loadSettings(auth.uid);
  await checkAiBudget(auth.uid, settings);
  const { provider, model } = await resolveTask(auth.uid, settings, "chat");
  const user = userRef(auth.uid);

  // Conversation
  let convId = input.conversationId;
  if (convId) {
    const c = await user.collection("conversations").doc(convId).get();
    if (!c.exists) convId = undefined;
  }
  if (!convId) {
    const ref = user.collection("conversations").doc();
    await ref.set({ title: truncate(input.message.replace(/\s+/g, " "), 60), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    convId = ref.id;
  }
  const convRef = user.collection("conversations").doc(convId);
  const historySnap = await convRef.collection("messages").orderBy("createdAt", "desc").limit(10).get();
  const history: ChatMessage[] = historySnap.docs
    .reverse()
    .map((d) => ({ role: d.data().role as "user" | "assistant", content: String(d.data().content ?? "").slice(0, 4000) }));

  // Retrieval: client-sent ids, excluding AI-disallowed areas. Accounts are never loaded here.
  const blockedAreas = new Set(settings.areas.filter((a) => !a.aiAllowed).map((a) => a.id));
  const ids = [...new Set(input.contextItemIds ?? [])].slice(0, 8);
  const snaps = ids.length ? await user.firestore.getAll(...ids.map((id) => user.collection("items").doc(id))) : [];
  const items = snaps
    .filter((s) => s.exists && !s.data()?.isDeleted && !blockedAreas.has(s.data()?.areaId))
    .map((s) => {
      const x = fromAdmin<Record<string, unknown>>(s.data());
      return {
        id: s.id, title: x.title, kind: x.kind, area: settings.areas.find((a) => a.id === x.areaId)?.name ?? null,
        tags: x.tags, description: x.description, note: truncate(String(x.note ?? ""), 800), url: x.url,
      };
    });

  const url = extractFirstUrl(input.message);
  const page = url ? await unfurl(url, 4000).catch(() => null) : null;

  const context = [
    `Areas: ${JSON.stringify(settings.areas.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name })))}`,
    `Hub items (${items.length}): ${JSON.stringify(items)}`,
    page ? `Page metadata for ${url}: ${JSON.stringify({ status: page.status, title: page.title, description: page.description, siteName: page.siteName })}` : "",
    `Today: ${new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean).join("\n");

  const userMsgRef = convRef.collection("messages").doc();
  await userMsgRef.set({ role: "user", content: input.message, contextItemIds: items.map((i) => i.id), createdAt: FieldValue.serverTimestamp() });
  const conversationId = convId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ t: "start", conversationId, contextItemIds: items.map((i) => i.id) });
      let full = "";
      let emitted = 0;
      let hidden = false;
      const started = Date.now();
      try {
        for await (const chunk of provider.streamChat({
          model,
          system: `${CHAT_SYSTEM}\n\n${context}`,
          messages: [...history, { role: "user", content: input.message }],
          maxTokens: 1200,
          timeoutMs: 30000,
        })) {
          full += chunk;
          if (hidden) continue;
          const markerAt = full.indexOf(MARKER);
          if (markerAt >= 0) {
            if (markerAt > emitted) send({ t: "delta", text: full.slice(emitted, markerAt) });
            emitted = markerAt;
            hidden = true;
            continue;
          }
          const safeEnd = Math.max(emitted, full.length - MARKER.length);
          if (safeEnd > emitted) {
            send({ t: "delta", text: full.slice(emitted, safeEnd) });
            emitted = safeEnd;
          }
        }
        if (!hidden && full.length > emitted) send({ t: "delta", text: full.slice(emitted) });
        const { text, actions } = parseActions(full, settings);
        const msgRef = convRef.collection("messages").doc();
        await msgRef.set({
          role: "assistant", content: text.slice(0, 20000),
          actions: actions.map((a) => ({ ...a, id: shortId(8), status: "proposed" })),
          provider: provider.id, model, createdAt: FieldValue.serverTimestamp(),
        });
        await convRef.update({ updatedAt: FieldValue.serverTimestamp() });
        await recordUsage(auth.uid, "chat", provider.id, { tokensIn: 0, tokensOut: 0 }, Date.now() - started);
        send({ t: "done", messageId: msgRef.id });
      } catch (e) {
        const res = errorResponse(req, e);
        const body = await res.json();
        send({ t: "error", error: body.error });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
});
