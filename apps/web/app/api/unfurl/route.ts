import { UnfurlInput } from "@personalhub/shared";
import { fail, ok, preflight, readJson, route } from "@/lib/api/server";
import { loadItem, unfurlItem } from "@/lib/server/items";
import { unfurl } from "@/lib/unfurl";

export const runtime = "nodejs";
export const OPTIONS = preflight;

export const POST = route(["idToken", "captureToken"], async (req, auth) => {
  const input = await readJson(req, UnfurlInput);
  if ("url" in input) return ok(req, await unfurl(input.url));
  const item = await loadItem(auth.uid, input.itemId);
  if (!item || item.isDeleted) throw fail("NOT_FOUND", "Item not found");
  if (!item.url) throw fail("INVALID_INPUT", "Item has no URL");
  return ok(req, await unfurlItem(auth.uid, item));
});
