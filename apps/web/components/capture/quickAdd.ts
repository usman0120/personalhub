"use client";

import { parseQuickAdd, parseTask, slugify, type Area, type Project } from "@personalhub/shared";
import { createDoc, createItem, stores } from "@/lib/data/repos";
import { aiFollowUp, unfurlInBackground } from "@/lib/data/itemActions";

export const resolveArea = (token: string | null, areas: Area[]) =>
  token ? areas.find((a) => a.id === slugify(token) || slugify(a.name) === slugify(token) || slugify(a.name).startsWith(slugify(token)))?.id ?? null : null;

export const resolveProject = (token: string | null, projects: Project[]) =>
  token ? projects.find((p) => !p.isDeleted && slugify(p.name) === slugify(token))?.id ?? null : null;

export interface QuickAddContext {
  areas: Area[];
  aiOnCapture: boolean;
  defaultAreaId?: string | null;
}

/** Saves quick-capture text. Returns what was created for the toast. */
export async function saveQuickAdd(text: string, ctx: QuickAddContext): Promise<{ kind: string; id: string; duplicate?: boolean }> {
  const parsed = parseQuickAdd(text);
  const projects = stores.projects.all();
  if (parsed.type === "task" && parsed.task) {
    return { kind: "task", id: await createTask(parsed.task.title ? text.replace(/^(\[\s?\]|todo:)\s*/i, "") : text, ctx) };
  }
  const areaId = resolveArea(parsed.areaToken, ctx.areas) ?? ctx.defaultAreaId ?? undefined;
  const firstLine = parsed.title;
  const rest = parsed.text.split("\n").slice(1).join("\n").trim();
  const { id, duplicateOf } = await createItem({
    kind: parsed.type === "link" ? "link" : parsed.type === "idea" ? "idea" : "note",
    source: "web",
    url: parsed.url,
    title: firstLine || undefined,
    note: parsed.type === "link" ? rest : parsed.type === "note" || parsed.type === "idea" ? (rest ? parsed.text : "") : "",
    tags: parsed.tags,
    areaId,
  });
  void projects;
  if (parsed.url && !duplicateOf) unfurlInBackground(id);
  if (!duplicateOf) aiFollowUp(id, ctx.aiOnCapture && Boolean(parsed.url || parsed.text.length > 40));
  return { kind: parsed.type, id, duplicate: Boolean(duplicateOf) };
}

export async function createTask(text: string, ctx: Pick<QuickAddContext, "areas">, extra: { projectId?: string | null; itemId?: string | null } = {}) {
  const t = parseTask(text);
  const projectId = extra.projectId ?? resolveProject(t.projectToken, stores.projects.all());
  return createDoc("tasks", {
    title: t.title, status: "todo", due: t.due, dueHasTime: t.dueHasTime, priority: t.priority,
    projectId, itemId: extra.itemId ?? null, areaId: resolveArea(t.areaToken, ctx.areas),
    source: "quickadd", completedAt: null, isDeleted: false, deletedAt: null,
  });
}
