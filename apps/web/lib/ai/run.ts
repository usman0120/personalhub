import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { AI_TASKS, Settings } from "@personalhub/shared";
import { adminDb } from "@/lib/firebase/admin";
import { fail, rateLimit, userRef } from "@/lib/api/server";
import { decryptSecret, encryptSecret, needsRotation, type EncryptedSecret } from "@/lib/crypto/keys";
import { createProvider, mockProvider, type AIProvider } from "./providers";

export type AiTask = (typeof AI_TASKS)[number];

export const keyRef = (uid: string, providerId: string) =>
  adminDb().collection("private").doc(uid).collection("aiKeys").doc(providerId);

export async function providerById(uid: string, settings: Settings, providerId: string): Promise<AIProvider> {
  if (process.env.AI_MOCK === "1") return mockProvider();
  const cfg = settings.ai.providers.find((p) => p.id === providerId);
  if (!cfg) throw fail("AI_NOT_CONFIGURED", "Provider not found");
  const snap = await keyRef(uid, providerId).get();
  if (!snap.exists) throw fail("AI_NOT_CONFIGURED", "No API key saved for this provider");
  const enc = snap.data() as EncryptedSecret;
  const apiKey = decryptSecret(enc);
  if (needsRotation(enc)) void keyRef(uid, providerId).update({ ...encryptSecret(apiKey), updatedAt: FieldValue.serverTimestamp() });
  return createProvider(cfg, apiKey);
}

/** Resolves the provider + model configured for a task, with optional fallback. */
export async function resolveTask(uid: string, settings: Settings, task: AiTask) {
  if (!settings.ai.enabled) throw fail("AI_NOT_CONFIGURED", "AI is turned off in Settings");
  const tm = settings.ai.taskModels[task] ?? settings.ai.taskModels.classify;
  if (process.env.AI_MOCK === "1") return { provider: mockProvider(), model: "mock", fallback: null };
  if (!tm) throw fail("AI_NOT_CONFIGURED", `No model selected for "${task}" in Settings › AI`);
  const provider = await providerById(uid, settings, tm.providerId);
  const fallback =
    tm.fallbackProviderId && tm.fallbackModel
      ? { provider: await providerById(uid, settings, tm.fallbackProviderId).catch(() => null), model: tm.fallbackModel }
      : null;
  return { provider, model: tm.model, fallback: fallback?.provider ? (fallback as { provider: AIProvider; model: string }) : null };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Enforces 10 AI calls/min and the daily request limit. */
export async function checkAiBudget(uid: string, settings: Settings) {
  await rateLimit(uid, "ai", 10);
  const snap = await userRef(uid).collection("aiUsage").doc(today()).get();
  const used = (snap.data()?.requests as number) ?? 0;
  if (used >= settings.ai.dailyRequestLimit) {
    const now = new Date();
    const reset = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000);
    throw fail("RATE_LIMITED", "Daily AI limit reached. It resets at midnight UTC.", { retryAfter: reset });
  }
}

export async function recordUsage(uid: string, task: AiTask, providerId: string, usage: { tokensIn: number; tokensOut: number }, latencyMs: number) {
  await userRef(uid).collection("aiUsage").doc(today()).set(
    {
      requests: FieldValue.increment(1),
      byTask: { [task]: FieldValue.increment(1) },
      byProvider: { [providerId]: FieldValue.increment(1) },
      tokensIn: FieldValue.increment(usage.tokensIn),
      tokensOut: FieldValue.increment(usage.tokensOut),
    },
    { merge: true },
  );
  console.info(JSON.stringify({ level: "info", ai: task, provider: providerId, latencyMs }));
}

/** Runs a JSON task with fallback on upstream failure and usage accounting. */
export async function runJsonTask<T>(
  uid: string,
  settings: Settings,
  task: AiTask,
  build: (model: string) => Parameters<AIProvider["generateJSON"]>[0],
): Promise<{ data: T; provider: string; model: string }> {
  await checkAiBudget(uid, settings);
  const { provider, model, fallback } = await resolveTask(uid, settings, task);
  const started = Date.now();
  try {
    const { data, usage } = await provider.generateJSON(build(model));
    await recordUsage(uid, task, provider.id, usage, Date.now() - started);
    return { data: data as T, provider: provider.id, model };
  } catch (e) {
    if (!fallback) throw e;
    const { data, usage } = await fallback.provider.generateJSON(build(fallback.model));
    await recordUsage(uid, task, fallback.provider.id, usage, Date.now() - started);
    return { data: data as T, provider: fallback.provider.id, model: fallback.model };
  }
}

export const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : "");
