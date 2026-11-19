import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, route, userRef } from "@/lib/api/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Deletes every owner document (items, tasks, accounts…, keys, tokens). Requires sign-in within 5 minutes. */
export const POST = route(["idToken"], async (req, auth) => {
  await readJson(req, z.object({ confirm: z.literal("DELETE") }));
  const token = req.headers.get("authorization")!.slice(7);
  const decoded = await adminAuth().verifyIdToken(token, true);
  if (Date.now() / 1000 - decoded.auth_time > 300) throw fail("FORBIDDEN", "Please sign in again, then retry within 5 minutes");
  const db = adminDb();
  for (const col of await userRef(auth.uid).listCollections()) await db.recursiveDelete(col);
  await db.recursiveDelete(db.collection("private").doc(auth.uid));
  const tokens = await db.collection("captureTokens").where("uid", "==", auth.uid).get();
  await Promise.all(tokens.docs.map((d) => d.ref.delete()));
  await userRef(auth.uid).delete();
  return ok(req, { deleted: true });
});
