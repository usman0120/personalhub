import { z } from "zod";
import {
  ACCOUNT_CATEGORIES, ACCOUNT_STATUSES, AI_PROVIDER_TYPES, AI_STATUSES, IDEA_STAGES, ITEM_KINDS,
  ITEM_SOURCES, ITEM_STATUSES, LIMITS, PLATFORMS, PROJECT_STATUSES, SIGN_IN_METHODS, TASK_STATUSES,
  TOKEN_SCOPES, TWO_FACTOR_TYPES, UNFURL_STATUSES,
} from "../constants";

/** App-layer timestamps are epoch milliseconds; repositories convert Firestore Timestamps. */
export const Millis = z.number();
export const NullableMillis = Millis.nullable();

export const ItemKind = z.enum(ITEM_KINDS);
export const ItemStatus = z.enum(ITEM_STATUSES);
export const Platform = z.enum(PLATFORMS);
export const ItemSource = z.enum(ITEM_SOURCES);
export const AiProviderType = z.enum(AI_PROVIDER_TYPES);
export type ItemKind = z.infer<typeof ItemKind>;
export type ItemStatus = z.infer<typeof ItemStatus>;
export type Platform = z.infer<typeof Platform>;
export type ItemSource = z.infer<typeof ItemSource>;
export type AiProviderType = z.infer<typeof AiProviderType>;

const syncFields = {
  createdAt: Millis,
  updatedAt: Millis,
  isDeleted: z.boolean(),
  deletedAt: NullableMillis,
};

export const SuggestionSchema = z.object({
  title: z.string().max(120).optional(),
  description: z.string().max(400).optional(),
  summary: z.string().max(1200).optional(),
  kind: z.enum(["link", "note", "idea", "decision"]).optional(),
  areaId: z.string().optional(),
  tags: z.array(z.string().max(40)).max(6).optional(),
  tasks: z.array(z.object({ title: z.string().max(200), due: z.string().optional() })).max(5).optional(),
  confidence: z.number().min(0).max(1),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  kind: ItemKind,
  status: ItemStatus,
  title: z.string().max(LIMITS.title),
  url: z.string().max(LIMITS.url).nullable(),
  urlNormalized: z.string().nullable(),
  urlHash: z.string().nullable(),
  domain: z.string().nullable(),
  platform: Platform,
  description: z.string().max(LIMITS.description).nullable(),
  note: z.string().max(LIMITS.note),
  selection: z.string().max(LIMITS.selection).nullable(),
  faviconUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  areaId: z.string().nullable(),
  tags: z.array(z.string()).max(LIMITS.tags),
  projectId: z.string().nullable(),
  pinned: z.boolean(),
  source: ItemSource,
  capturedAt: Millis,
  reviewedAt: NullableMillis,
  idea: z.object({ stage: z.enum(IDEA_STAGES), promotedProjectId: z.string().optional() }).optional(),
  decision: z
    .object({ context: z.string(), decision: z.string(), consequences: z.string(), decidedAt: Millis })
    .optional(),
  image: z
    .object({
      width: z.number(), height: z.number(), mime: z.string(), bytes: z.number(),
      blobId: z.string().optional(), storageKey: z.string().optional(), ocrText: z.string().optional(),
    })
    .optional(),
  unfurl: z.object({
    status: z.enum(UNFURL_STATUSES),
    siteName: z.string().optional(),
    fetchedAt: Millis.optional(),
  }),
  ai: z.object({
    status: z.enum(AI_STATUSES),
    summary: z.string().max(1200).optional(),
    suggestion: SuggestionSchema.optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    updatedAt: Millis.optional(),
    error: z.string().optional(),
  }),
  rulesApplied: z.array(z.string()),
  ...syncFields,
});
export type Item = z.infer<typeof ItemSchema>;

export const AreaSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  color: z.string(),
  icon: z.string(),
  aiAllowed: z.boolean(),
  order: z.number(),
  archived: z.boolean().optional(),
});
export type Area = z.infer<typeof AreaSchema>;

export const LibraryFilterSchema = z.object({
  q: z.string().optional(),
  kinds: z.array(ItemKind).optional(),
  areaIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  platforms: z.array(Platform).optional(),
  status: z.enum(["active", "archived", "all"]).optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  hasNote: z.boolean().optional(),
  pinned: z.boolean().optional(),
  sort: z.enum(["newest", "oldest", "title", "updated"]).optional(),
});
export type LibraryFilter = z.infer<typeof LibraryFilterSchema>;

export const TaskModelSchema = z
  .object({
    providerId: z.string(),
    model: z.string(),
    fallbackProviderId: z.string().optional(),
    fallbackModel: z.string().optional(),
  })
  .nullable();
export type TaskModel = z.infer<typeof TaskModelSchema>;

export const AiProviderConfigSchema = z.object({
  id: z.string(),
  type: AiProviderType,
  label: z.string().max(60),
  baseUrl: z.string().optional(),
  hasKey: z.boolean(),
  last4: z.string().optional(),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;

export const AiSettingsSchema = z.object({
  enabled: z.boolean(),
  providers: z.array(AiProviderConfigSchema),
  taskModels: z.object({
    summarize: TaskModelSchema,
    classify: TaskModelSchema,
    extract: TaskModelSchema,
    vision: TaskModelSchema,
    chat: TaskModelSchema,
  }),
  suggestOnCapture: z.boolean(),
  autoApply: z.object({
    enabled: z.boolean(),
    fields: z.array(z.enum(["tags", "areaId", "kind", "description"])),
    minConfidence: z.number().min(0).max(1),
  }),
  dailyRequestLimit: z.number().int().min(1).max(10000),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const SavedViewSchema = z.object({ id: z.string(), name: z.string().max(40), filter: LibraryFilterSchema });
export type SavedView = z.infer<typeof SavedViewSchema>;

export const SettingsSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  areas: z.array(AreaSchema),
  defaultAreaId: z.string().nullable(),
  inboxZeroGoal: z.enum(["weekly", "daily"]),
  thumbnails: z.boolean(),
  storageMode: z.enum(["none", "r2"]),
  instantShareSave: z.boolean(),
  pkrPerUsd: z.number().positive(),
  views: z.array(SavedViewSchema).max(LIMITS.savedViews),
  lastExportAt: NullableMillis,
  ai: AiSettingsSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

export const UserDocSchema = z.object({
  email: z.string(),
  displayName: z.string(),
  photoURL: z.string().optional(),
  timezone: z.string(),
  createdAt: Millis,
  updatedAt: Millis,
  settings: SettingsSchema,
});
export type UserDoc = z.infer<typeof UserDocSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  status: z.enum(PROJECT_STATUSES),
  areaId: z.string().nullable(),
  color: z.string(),
  problem: z.string().max(LIMITS.brief),
  goal: z.string().max(LIMITS.brief),
  doneWhen: z.string().max(LIMITS.brief),
  deadline: NullableMillis,
  links: z.array(z.object({ label: z.string().max(80), url: z.string().max(LIMITS.url) })).max(20),
  lastActivityAt: Millis,
  ...syncFields,
});
export type Project = z.infer<typeof ProjectSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(LIMITS.taskTitle),
  status: z.enum(TASK_STATUSES),
  due: NullableMillis,
  dueHasTime: z.boolean(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  projectId: z.string().nullable(),
  itemId: z.string().nullable(),
  areaId: z.string().nullable(),
  source: z.enum(["manual", "quickadd", "ai"]),
  completedAt: NullableMillis,
  ...syncFields,
});
export type Task = z.infer<typeof TaskSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  service: z.string().min(1).max(120),
  url: z.string().max(LIMITS.url).nullable(),
  category: z.enum(ACCOUNT_CATEGORIES),
  loginIdentifier: z.string().max(200),
  signInMethod: z.enum(SIGN_IN_METHODS),
  twoFactor: z.enum(TWO_FACTOR_TYPES),
  recoveryLocation: z.string().max(200),
  plan: z.string().max(80).nullable(),
  cost: z
    .object({
      amount: z.number().min(0),
      currency: z.enum(["USD", "PKR"]),
      cycle: z.enum(["monthly", "yearly", "one-time"]),
    })
    .nullable(),
  renewalDate: NullableMillis,
  owner: z.enum(["me", "client"]),
  clientName: z.string().max(120).nullable(),
  status: z.enum(ACCOUNT_STATUSES),
  lastReviewedAt: NullableMillis,
  notes: z.string().max(LIMITS.accountNotes),
  ...syncFields,
});
export type Account = z.infer<typeof AccountSchema>;

export const TagSchema = z.object({
  slug: z.string(),
  name: z.string().max(40),
  color: z.string().nullable(),
  lastUsedAt: Millis,
  createdAt: Millis,
});
export type Tag = z.infer<typeof TagSchema>;

export const RuleConditionSchema = z.object({
  field: z.enum(["domain", "url", "title", "text", "platform", "kind", "source"]),
  op: z.enum(["equals", "contains", "startsWith", "endsWith", "in"]),
  value: z.union([z.string().max(300), z.array(z.string().max(300)).max(50)]),
});
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

export const RuleActionsSchema = z.object({
  setAreaId: z.string().optional(),
  addTags: z.array(z.string()).max(10).optional(),
  setKind: ItemKind.optional(),
  setStatus: z.literal("active").optional(),
  setProjectId: z.string().optional(),
  runAi: z.boolean().optional(),
});
export type RuleActions = z.infer<typeof RuleActionsSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  order: z.number(),
  match: z.enum(["all", "any"]),
  conditions: z.array(RuleConditionSchema).min(1).max(10),
  actions: RuleActionsSchema,
  hits: z.number(),
  lastHitAt: NullableMillis,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Rule = z.infer<typeof RuleSchema>;

export const ActionTypeSchema = z.enum(["create_item", "update_item", "create_task", "create_project"]);
export type ActionType = z.infer<typeof ActionTypeSchema>;
export const ProposedActionSchema = z.object({
  id: z.string(),
  type: ActionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(["proposed", "applied", "dismissed"]),
  resultId: z.string().optional(),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string().max(120),
  createdAt: Millis,
  updatedAt: Millis,
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(LIMITS.message),
  actions: z.array(ProposedActionSchema).optional(),
  contextItemIds: z.array(z.string()).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  createdAt: Millis,
});
export type Message = z.infer<typeof MessageSchema>;

export const CaptureTokenInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.enum(TOKEN_SCOPES)),
  last4: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
});
export type CaptureTokenInfo = z.infer<typeof CaptureTokenInfoSchema>;

/** Payload shapes for assistant proposed actions (validated before applying). */
export const CreateItemPayload = z.object({
  url: z.string().max(LIMITS.url).optional(),
  title: z.string().min(1).max(LIMITS.title),
  kind: z.enum(["link", "note", "idea", "decision"]).default("link"),
  areaId: z.string().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  description: z.string().max(LIMITS.description).optional(),
  note: z.string().max(LIMITS.note).optional(),
});
export const UpdateItemPayload = z.object({
  itemId: z.string(),
  fields: z
    .object({
      title: z.string().max(LIMITS.title).optional(),
      description: z.string().max(LIMITS.description).optional(),
      areaId: z.string().optional(),
      tags: z.array(z.string().max(40)).max(LIMITS.tags).optional(),
      kind: z.enum(["link", "note", "idea", "decision"]).optional(),
      note: z.string().max(LIMITS.note).optional(),
    })
    .strict(),
});
export const CreateTaskPayload = z.object({
  title: z.string().min(1).max(LIMITS.taskTitle),
  due: z.string().optional(),
  projectId: z.string().optional(),
  itemId: z.string().optional(),
});
export const CreateProjectPayload = z.object({
  name: z.string().min(1).max(120),
  areaId: z.string().optional(),
  problem: z.string().max(LIMITS.brief).optional(),
  goal: z.string().max(LIMITS.brief).optional(),
});
