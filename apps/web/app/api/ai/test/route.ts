import { AiTestInput } from "@personalhub/shared";
import { fail, ok, readJson, route } from "@/lib/api/server";
import { loadSettings } from "@/lib/server/items";
import { providerById } from "@/lib/ai/run";

export const runtime = "nodejs";

export const POST = route(["idToken"], async (req, auth) => {
  const { providerId, model: requested } = await readJson(req, AiTestInput);
  const settings = await loadSettings(auth.uid);
  const provider = await providerById(auth.uid, settings, providerId);
  const model =
    requested ||
    Object.values(settings.ai.taskModels).find((t) => t?.providerId === providerId)?.model;
  if (!model) throw fail("INVALID_INPUT", "Enter a model name to test");
  const { latencyMs } = await provider.ping(model);
  return ok(req, { ok: true, latencyMs, model });
});
