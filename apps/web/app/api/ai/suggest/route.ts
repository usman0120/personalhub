import { AiSuggestInput } from "@personalhub/shared";
import { fail, ok, preflight, readJson, route } from "@/lib/api/server";
import { loadItem, loadSettings } from "@/lib/server/items";
import { suggestForItem } from "@/lib/ai/suggest";

export const runtime = "nodejs";
export const maxDuration = 30;
export const OPTIONS = preflight;

export const POST = route(["idToken", "captureToken"], async (req, auth) => {
  const { itemId, force } = await readJson(req, AiSuggestInput);
  const [item, settings] = await Promise.all([loadItem(auth.uid, itemId), loadSettings(auth.uid)]);
  if (!item || item.isDeleted) throw fail("NOT_FOUND", "Item not found");
  // Skip when there is nothing to work with (login-walled URL and no note) unless forced.
  const thin = item.unfurl.status === "blocked" && !item.note.trim() && !item.selection && !item.image?.ocrText;
  if (thin && !force) {
    return ok(req, { skipped: true, reason: "Nothing to analyse beyond the URL. Add a note or use Ask AI." });
  }
  return ok(req, await suggestForItem(auth.uid, item, settings));
});
