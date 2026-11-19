import { ok, preflight, route, userRef } from "@/lib/api/server";
import { loadSettings } from "@/lib/server/items";

export const runtime = "nodejs";
export const OPTIONS = preflight;

export const GET = route(
  ["idToken", "captureToken"],
  async (req, auth) => {
    const [settings, tags, projects] = await Promise.all([
      loadSettings(auth.uid),
      userRef(auth.uid).collection("tags").orderBy("lastUsedAt", "desc").limit(200).get(),
      userRef(auth.uid).collection("projects").where("isDeleted", "==", false).get(),
    ]);
    return ok(req, {
      areas: settings.areas.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
      defaultAreaId: settings.defaultAreaId,
      tags: tags.docs.map((d) => ({ slug: d.id, name: (d.data().name as string) ?? d.id })),
      projects: projects.docs
        .filter((d) => ["active", "idea", "paused"].includes(d.data().status))
        .map((d) => ({ id: d.id, name: d.data().name as string })),
    });
  },
  { scope: "read:taxonomy" },
);
