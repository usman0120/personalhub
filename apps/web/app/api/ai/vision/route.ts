import { AiVisionInput, VisionResultSchema, type VisionResult } from "@personalhub/shared";
import { fail, ok, readJson, route } from "@/lib/api/server";
import { loadSettings } from "@/lib/server/items";
import { VISION_SYSTEM } from "@/lib/ai/prompts";
import { runJsonTask } from "@/lib/ai/run";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = route(["idToken"], async (req, auth) => {
  const input = await readJson(req, AiVisionInput, 2_200_000);
  if (Buffer.byteLength(input.image, "base64") > 1_600_000) throw fail("INVALID_INPUT", "Image too large (max 1.5 MB)");
  const settings = await loadSettings(auth.uid);
  const { data } = await runJsonTask<VisionResult>(auth.uid, settings, "vision", (model) => ({
    model,
    system: VISION_SYSTEM,
    user: [
      { type: "image", mime: input.mime, base64: input.image },
      { type: "text", text: input.hint ? `Context from the user: ${input.hint}` : "Read this screenshot." },
    ],
    schema: VisionResultSchema,
    maxTokens: 1500,
    timeoutMs: 20000,
  }));
  return ok(req, data);
});
