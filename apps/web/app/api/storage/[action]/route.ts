import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, ok, readJson, route } from "@/lib/api/server";
import { presign, r2Configured, storageDriver } from "@/lib/storage/r2";

export const runtime = "nodejs";

function requireR2() {
  if (storageDriver() !== "r2" || !r2Configured()) throw fail("FORBIDDEN", "R2 storage is not enabled on the server");
}
function ownKey(uid: string, key: string | null): string {
  if (!key || !key.startsWith(`u/${uid}/`) || key.includes("..")) throw fail("FORBIDDEN", "Key not allowed");
  return key;
}

const UploadInput = z.object({
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  mime: z.enum(["image/webp", "image/png", "image/jpeg"]),
  bytes: z.number().int().positive().max(5 * 1024 * 1024),
});

/** GET /api/storage/status · GET /api/storage/view-url?key= */
export const GET = route(["idToken"], async (req, auth, params) => {
  if (params.action === "status") return ok(req, { driver: storageDriver(), configured: r2Configured() });
  if (params.action !== "view-url") throw fail("NOT_FOUND", "Unknown storage action");
  requireR2();
  const key = ownKey(auth.uid, req.nextUrl.searchParams.get("key"));
  return ok(req, { url: presign("GET", key, 600) });
});

/** POST /api/storage/upload-url */
export const POST = route(["idToken"], async (req, auth, params) => {
  if (params.action !== "upload-url") throw fail("NOT_FOUND", "Unknown storage action");
  requireR2();
  const input = await readJson(req, UploadInput);
  const ext = input.mime.split("/")[1];
  const key = `u/${auth.uid}/${input.itemId}/${randomUUID()}.${ext}`;
  return ok(req, { key, url: presign("PUT", key, 300) });
});

/** DELETE /api/storage/object?key= */
export const DELETE = route(["idToken"], async (req, auth, params) => {
  if (params.action !== "object") throw fail("NOT_FOUND", "Unknown storage action");
  requireR2();
  const key = ownKey(auth.uid, req.nextUrl.searchParams.get("key"));
  const res = await fetch(presign("DELETE", key, 60), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw fail("UPSTREAM_ERROR", "Could not delete object");
  return ok(req, { deleted: true });
});
