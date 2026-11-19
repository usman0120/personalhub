import { dedupeEntries, parseBookmarksHtml, parseCsv, parseUrlList } from "@personalhub/shared";
import { fail, ok, route } from "@/lib/api/server";

export const runtime = "nodejs";

const MAX = 5 * 1024 * 1024;

/** Parses an uploaded bookmarks HTML / URL list / CSV. No writes: the client reviews, then writes in batches. */
export const POST = route(["idToken"], async (req) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX + 10_000) throw fail("INVALID_INPUT", "File too large (max 5 MB)");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw fail("INVALID_INPUT", "Expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw fail("INVALID_INPUT", "Missing file");
  if (file.size > MAX) throw fail("INVALID_INPUT", "File too large (max 5 MB)");
  const text = await file.text();
  const name = file.name.toLowerCase();
  const type = String(form.get("type") ?? "");
  const raw =
    type === "chrome-html" || name.endsWith(".html") || name.endsWith(".htm") || /<!DOCTYPE NETSCAPE-Bookmark/i.test(text)
      ? parseBookmarksHtml(text)
      : type === "csv" || name.endsWith(".csv")
        ? parseCsv(text)
        : parseUrlList(text);
  const { entries, duplicatesInFile } = dedupeEntries(raw.slice(0, 20000));
  return ok(req, { entries, duplicatesInFile });
});
