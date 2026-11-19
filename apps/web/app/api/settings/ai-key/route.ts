import { FieldValue } from "firebase-admin/firestore";
import { AiKeyInput } from "@personalhub/shared";
import { fail, ok, readJson, route, userRef } from "@/lib/api/server";
import { encryptSecret } from "@/lib/crypto/keys";
import { keyRef } from "@/lib/ai/run";
import { loadSettings } from "@/lib/server/items";
import { SsrfError, vetUrl } from "@/lib/unfurl/safeFetch";

export const runtime = "nodejs";

export const PUT = route(["idToken"], async (req, auth) => {
  const input = await readJson(req, AiKeyInput);
  if (input.type === "openai-compatible" && !input.baseUrl) throw fail("INVALID_INPUT", "Base URL is required");
  if (input.baseUrl) {
    try {
      await vetUrl(input.baseUrl, { requireHttps: true });
    } catch (e) {
      throw fail("INVALID_INPUT", e instanceof SsrfError ? `Base URL rejected: ${e.message}` : "Invalid base URL");
    }
  }
  await keyRef(auth.uid, input.providerId).set({
    ...encryptSecret(input.apiKey),
    last4: input.apiKey.slice(-4),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const settings = await loadSettings(auth.uid);
  const entry = {
    id: input.providerId, type: input.type, label: input.label, hasKey: true, last4: input.apiKey.slice(-4),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  };
  const providers = [...settings.ai.providers.filter((p) => p.id !== input.providerId), entry];
  await userRef(auth.uid).update({ "settings.ai.providers": providers, updatedAt: FieldValue.serverTimestamp() });
  return ok(req, { provider: entry });
});
