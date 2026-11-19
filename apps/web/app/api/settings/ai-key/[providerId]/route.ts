import { FieldValue } from "firebase-admin/firestore";
import { ok, route, userRef } from "@/lib/api/server";
import { keyRef } from "@/lib/ai/run";
import { loadSettings } from "@/lib/server/items";

export const runtime = "nodejs";

export const DELETE = route(["idToken"], async (req, auth, params) => {
  const providerId = params.providerId ?? "";
  await keyRef(auth.uid, providerId).delete();
  const settings = await loadSettings(auth.uid);
  const taskModels = Object.fromEntries(
    Object.entries(settings.ai.taskModels).map(([k, v]) => [k, v?.providerId === providerId ? null : v]),
  );
  await userRef(auth.uid).update({
    "settings.ai.providers": settings.ai.providers.filter((p) => p.id !== providerId),
    "settings.ai.taskModels": taskModels,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ok(req, { removed: true });
});
