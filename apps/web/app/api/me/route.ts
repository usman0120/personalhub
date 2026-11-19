import { ok, route } from "@/lib/api/server";
import { r2Configured, storageDriver } from "@/lib/storage/r2";

export const runtime = "nodejs";

/** Confirms the signed-in account is on the owner allow-list (route() rejects others with FORBIDDEN). */
export const GET = route(["idToken"], async (req, auth) =>
  ok(req, { uid: auth.uid, email: auth.email, storage: { driver: storageDriver(), configured: r2Configured() } }),
);
