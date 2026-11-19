import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { fail, ok, route } from "@/lib/api/server";

export const runtime = "nodejs";

/** Revokes a token. `id` is the first 16 hex chars of the stored hash (never the token itself). */
export const DELETE = route(["idToken"], async (req, auth, params) => {
  const id = params.id ?? "";
  if (!/^[0-9a-f]{16}$/.test(id)) throw fail("INVALID_INPUT", "Invalid token id");
  const snap = await adminDb().collection("captureTokens").where("uid", "==", auth.uid).get();
  const doc = snap.docs.find((d) => d.id.startsWith(id));
  if (!doc) throw fail("NOT_FOUND", "Token not found");
  await doc.ref.update({ revokedAt: FieldValue.serverTimestamp() });
  return ok(req, { revoked: true });
});
