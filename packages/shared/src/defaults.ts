import type { Area, Item, ItemKind, ItemSource, Rule, Settings } from "./schemas/entities";
import { detectPlatform } from "./platform";
import { getDomain, normalizeUrl } from "./url";

export const SEED_AREAS: Area[] = [
  { id: "career", name: "Career", color: "#6366f1", icon: "briefcase", aiAllowed: true, order: 0 },
  { id: "freelance", name: "Freelance", color: "#0ea5e9", icon: "handshake", aiAllowed: true, order: 1 },
  { id: "dev-resources", name: "Dev Resources", color: "#10b981", icon: "code", aiAllowed: true, order: 2 },
  { id: "study", name: "Study", color: "#f59e0b", icon: "graduation-cap", aiAllowed: true, order: 3 },
  { id: "projects", name: "Projects", color: "#8b5cf6", icon: "folder", aiAllowed: true, order: 4 },
  { id: "personal", name: "Personal", color: "#ec4899", icon: "heart", aiAllowed: false, order: 5 },
  { id: "finance", name: "Finance", color: "#64748b", icon: "wallet", aiAllowed: false, order: 6 },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  areas: SEED_AREAS,
  defaultAreaId: null,
  inboxZeroGoal: "weekly",
  thumbnails: false,
  storageMode: "none",
  instantShareSave: true,
  pkrPerUsd: 280,
  views: [],
  lastExportAt: null,
  ai: {
    enabled: false,
    providers: [],
    taskModels: { summarize: null, classify: null, extract: null, vision: null, chat: null },
    suggestOnCapture: false,
    autoApply: { enabled: false, fields: ["tags", "areaId"], minConfidence: 0.85 },
    dailyRequestLimit: 150,
  },
};

type SeedRule = Omit<Rule, "createdAt" | "updatedAt">;
export const SEED_RULES: SeedRule[] = [
  {
    id: "seed-github", name: "GitHub → Dev Resources", enabled: true, order: 0, match: "any",
    conditions: [{ field: "domain", op: "equals", value: "github.com" }],
    actions: { setAreaId: "dev-resources", addTags: ["github"] }, hits: 0, lastHitAt: null,
  },
  {
    id: "seed-reels", name: "Instagram / TikTok → reel", enabled: true, order: 1, match: "any",
    conditions: [{ field: "platform", op: "in", value: ["instagram", "tiktok"] }],
    actions: { addTags: ["reel"] }, hits: 0, lastHitAt: null,
  },
  {
    id: "seed-linkedin-jobs", name: "LinkedIn jobs → Career", enabled: true, order: 2, match: "any",
    conditions: [{ field: "url", op: "contains", value: "linkedin.com/jobs" }],
    actions: { setAreaId: "career", addTags: ["job"] }, hits: 0, lastHitAt: null,
  },
  {
    id: "seed-dev-docs", name: "Dev docs → Dev Resources", enabled: true, order: 3, match: "any",
    conditions: [
      { field: "domain", op: "equals", value: "free-for.dev" },
      { field: "domain", op: "endsWith", value: ".dev" },
    ],
    actions: { setAreaId: "dev-resources" }, hits: 0, lastHitAt: null,
  },
];

export interface NewItemInput {
  kind: ItemKind;
  source: ItemSource;
  title?: string;
  url?: string | null;
  note?: string;
  selection?: string | null;
  description?: string | null;
  faviconUrl?: string | null;
  areaId?: string | null;
  tags?: string[];
  projectId?: string | null;
  capturedAt?: number;
}

/**
 * Builds a complete item (minus id, hash and timestamps) from partial capture input.
 * Repositories add `urlHash`, `createdAt`/`updatedAt` and persist.
 */
export function buildItem(input: NewItemInput, now = Date.now()): Omit<Item, "id" | "urlHash" | "createdAt" | "updatedAt"> {
  const url = input.url?.trim() || null;
  const urlNormalized = normalizeUrl(url);
  const domain = getDomain(url);
  const title = (input.title?.trim() || (url ? domain ?? url : (input.note ?? "").split("\n")[0]?.trim()) || "Untitled").slice(0, 300);
  return {
    kind: input.kind,
    status: "inbox",
    title,
    url,
    urlNormalized,
    domain,
    platform: detectPlatform(url),
    description: input.description?.slice(0, 1000) ?? null,
    note: input.note ?? "",
    selection: input.selection?.slice(0, 5000) || null,
    faviconUrl: input.faviconUrl ?? null,
    imageUrl: null,
    areaId: input.areaId ?? null,
    tags: input.tags ?? [],
    projectId: input.projectId ?? null,
    pinned: false,
    source: input.source,
    capturedAt: input.capturedAt ?? now,
    reviewedAt: null,
    ...(input.kind === "idea" ? { idea: { stage: "someday" as const } } : {}),
    unfurl: { status: url ? "pending" : "skipped" },
    ai: { status: "none" },
    rulesApplied: [],
    isDeleted: false,
    deletedAt: null,
  };
}
