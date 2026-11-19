import {
  CreateItemPayload, CreateProjectPayload, CreateTaskPayload, UpdateItemPayload, type ActionType, type Settings,
} from "@personalhub/shared";
import type { z } from "zod";

export const ACTION_SCHEMAS: Record<ActionType, z.ZodType> = {
  create_item: CreateItemPayload,
  update_item: UpdateItemPayload,
  create_task: CreateTaskPayload,
  create_project: CreateProjectPayload,
};

/** Splits the reply text from the trailing ```actions block and validates each proposal. */
export function parseActions(full: string, settings: Pick<Settings, "areas">) {
  const at = full.indexOf("```actions");
  const text = (at >= 0 ? full.slice(0, at) : full).trim();
  if (at < 0) return { text, actions: [] as Array<{ type: ActionType; payload: Record<string, unknown> }> };
  const body = full.slice(at + "```actions".length).replace(/```[\s\S]*$/, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { text, actions: [] };
  }
  const areaIds = new Set(settings.areas.map((a) => a.id));
  const actions: Array<{ type: ActionType; payload: Record<string, unknown> }> = [];
  for (const a of Array.isArray(raw) ? raw.slice(0, 5) : []) {
    const type = (a as { type?: string })?.type as ActionType;
    const schema = ACTION_SCHEMAS[type];
    if (!schema) continue;
    const parsed = schema.safeParse((a as { payload?: unknown }).payload);
    if (!parsed.success) continue;
    const payload = parsed.data as Record<string, unknown>;
    if (typeof payload.areaId === "string" && !areaIds.has(payload.areaId)) delete payload.areaId;
    actions.push({ type, payload });
  }
  return { text, actions };
}
