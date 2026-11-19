import { adminAuth } from "@/lib/firebase/admin";
import { ok, route } from "@/lib/api/server";

export const runtime = "nodejs";

/** "Sign out everywhere": revokes all refresh tokens for the owner. */
export const POST = route(["idToken"], async (req, auth) => {
  await adminAuth().revokeRefreshTokens(auth.uid);
  return ok(req, { revoked: true });
});
