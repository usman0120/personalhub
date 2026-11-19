import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { CreateTokenInput } from "@personalhub/shared";
import { adminDb } from "@/lib/firebase/admin";
import { fail, generateCaptureToken, hashCaptureToken, ok, readJson, route } from "@/lib/api/server";

export const runtime = "nodejs";

const ms = (t: unknown) => ((t as Timestamp | null)?.toMillis?.() ?? null);

export const GET = route(["idToken"], async (req, auth) => {
  const snap = await adminDb().collection("captureTokens").where("uid", "==", auth.uid).get();
  const tokens = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id.slice(0, 16),
        name: x.name as string,
        scopes: x.scopes as string[],
        last4: x.last4 as string,
        createdAt: ms(x.createdAt) ?? 0,
        lastUsedAt: ms(x.lastUsedAt),
        revokedAt: ms(x.revokedAt),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  return ok(req, tokens);
});

export const POST = route(["idToken"], async (req, auth) => {
  const input = await readJson(req, CreateTokenInput);
  const existing = await adminDb().collection("captureTokens").where("uid", "==", auth.uid).where("revokedAt", "==", null).count().get();
  if (existing.data().count >= 20) throw fail("INVALID_INPUT", "Too many active tokens. Revoke one first.");
  const token = generateCaptureToken();
  const hash = hashCaptureToken(token);
  await adminDb().collection("captureTokens").doc(hash).set({
    uid: auth.uid, name: input.name, scopes: input.scopes, last4: token.slice(-4),
    createdAt: FieldValue.serverTimestamp(), lastUsedAt: null, revokedAt: null,
  });
  return ok(req, { id: hash.slice(0, 16), token }, 201);
});
