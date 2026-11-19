import { z } from "zod";
import { AI_PROVIDER_TYPES, LIMITS, TOKEN_SCOPES } from "../constants";

export const ERROR_CODES = [
  "UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "NOT_FOUND", "RATE_LIMITED",
  "UPSTREAM_ERROR", "AI_NOT_CONFIGURED", "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export const CaptureInput = z
  .object({
    url: z.string().max(LIMITS.url).optional(),
    title: z.string().max(LIMITS.title).optional(),
    text: z.string().max(LIMITS.note).optional(),
    selection: z.string().max(LIMITS.selection).optional(),
    note: z.string().max(LIMITS.note).optional(),
    kind: z.enum(["link", "note", "idea"]).optional(),
    areaId: z.string().max(64).optional(),
    tags: z.array(z.string().max(40)).max(LIMITS.tags).optional(),
    source: z.enum(["extension", "share", "api", "web"]),
    faviconUrl: z.string().max(LIMITS.url).optional(),
    description: z.string().max(LIMITS.description).optional(),
    runUnfurl: z.boolean().optional(),
    runAi: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.url?.trim() || v.text?.trim()), {
    message: "Provide at least a url or text",
  });
export type CaptureInput = z.infer<typeof CaptureInput>;
export type CaptureOutput = { itemId: string; duplicateOf?: string; status: "inbox" | "active" };

export const UnfurlInput = z.union([
  z.object({ itemId: z.string().min(1).max(128) }),
  z.object({ url: z.string().url().max(LIMITS.url) }),
]);
export type UnfurlResult = {
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  faviconUrl?: string;
  canonicalUrl?: string;
  status: "ok" | "partial" | "blocked" | "failed";
};

export const AiSuggestInput = z.object({ itemId: z.string().min(1).max(128), force: z.boolean().optional() });
export const AiVisionInput = z.object({
  image: z.string().max(2_100_000),
  mime: z.enum(["image/webp", "image/png", "image/jpeg"]).default("image/webp"),
  hint: z.string().max(500).optional(),
});
export const VisionResultSchema = z.object({
  ocrText: z.string().max(5000),
  description: z.string().max(600),
  suggestedTitle: z.string().max(120),
});
export type VisionResult = z.infer<typeof VisionResultSchema>;
export const AiChatInput = z.object({
  conversationId: z.string().max(128).optional(),
  message: z.string().min(1).max(8000),
  contextItemIds: z.array(z.string().max(128)).max(8).optional(),
});
export const ApplyActionInput = z.object({
  conversationId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
  actionId: z.string().min(1).max(64),
  edits: z.record(z.string(), z.unknown()).optional(),
  dismiss: z.boolean().optional(),
});
export const AiTestInput = z.object({ providerId: z.string().min(1).max(64), model: z.string().max(120).optional() });
export const AiKeyInput = z.object({
  providerId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  type: z.enum(AI_PROVIDER_TYPES),
  label: z.string().min(1).max(60),
  apiKey: z.string().min(8).max(400),
  baseUrl: z.string().url().max(500).optional(),
});
export const CreateTokenInput = z.object({
  name: z.string().min(1).max(60),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
});
export const ExtractResultSchema = z.object({
  tasks: z.array(z.object({ title: z.string().max(200), due: z.string().optional() })).max(10),
});

export const ImportEntrySchema = z.object({
  url: z.string(),
  title: z.string(),
  folderPath: z.array(z.string()),
  addDate: z.number().optional(),
});
export type ImportEntry = z.infer<typeof ImportEntrySchema>;
