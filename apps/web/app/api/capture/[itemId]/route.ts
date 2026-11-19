import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { fail, ok, preflight, route, userRef } from "@/lib/api/server";

export const runtime = "nodejs";
export const OPTIONS = preflight;

/** Undo for the extension: soft-deletes an item captured in the last 10 minutes (moves it to Trash). */
export const DELETE = route(["idToken", "captureToken"], async (req, auth, params) => {
  if (auth.mode === "captureToken" && !auth.scopes.includes("capture")) throw fail("FORBIDDEN", "Token lacks the capture scope");
  const id = params.itemId ?? "";
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) throw fail("INVALID_INPUT", "Invalid item id");
  const ref = userRef(auth.uid).collection("items").doc(id);
  const snap = await ref.get();
  const created = (snap.data()?.createdAt as Timestamp | undefined)?.toMillis() ?? 0;
  if (!snap.exists || snap.data()?.isDeleted) throw fail("NOT_FOUND", "Item not found");
  if (Date.now() - created > 10 * 60_000) throw fail("FORBIDDEN", "Undo is only available right after saving");
  await ref.update({ isDeleted: true, deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return ok(req, { deleted: true });
});
