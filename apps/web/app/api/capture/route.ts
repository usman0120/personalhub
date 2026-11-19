import { CaptureInput } from "@personalhub/shared";
import { fail, ok, preflight, readJson, route } from "@/lib/api/server";
import { captureItem } from "@/lib/server/items";

export const runtime = "nodejs";
export const OPTIONS = preflight;

export const POST = route(["idToken", "captureToken"], async (req, auth) => {
  if (auth.mode === "captureToken" && !auth.scopes.includes("capture")) throw fail("FORBIDDEN", "Token lacks the capture scope");
  const input = await readJson(req, CaptureInput);
  return ok(req, await captureItem(auth.uid, input), 201);
});
