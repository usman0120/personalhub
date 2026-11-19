export const ITEM_KINDS = ["link", "note", "image", "idea", "decision"] as const;
export const ITEM_STATUSES = ["inbox", "active", "archived"] as const;
export const PLATFORMS = [
  "web", "instagram", "linkedin", "facebook", "tiktok", "youtube", "x", "github", "reddit", "medium", "other",
] as const;
export const ITEM_SOURCES = ["web", "extension", "share", "import", "api", "assistant"] as const;
export const AI_STATUSES = [
  "none", "pending", "suggested", "accepted", "partially-accepted", "rejected", "error",
] as const;
export const UNFURL_STATUSES = ["pending", "ok", "partial", "blocked", "failed", "skipped"] as const;
export const AI_PROVIDER_TYPES = ["gemini", "groq", "openrouter", "openai-compatible", "anthropic"] as const;
export const AI_TASKS = ["summarize", "classify", "extract", "vision", "chat"] as const;
export const PROJECT_STATUSES = ["idea", "active", "paused", "done", "archived"] as const;
export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export const ACCOUNT_CATEGORIES = [
  "email", "dev", "cloud", "social", "freelance", "finance", "university", "shopping", "other",
] as const;
export const SIGN_IN_METHODS = ["password", "google", "github", "apple", "microsoft", "magic-link", "other"] as const;
export const TWO_FACTOR_TYPES = ["none", "authenticator", "passkey", "security-key", "sms", "email"] as const;
export const ACCOUNT_STATUSES = ["active", "dormant", "to-close", "closed"] as const;
export const IDEA_STAGES = ["someday", "exploring", "promoted", "dropped"] as const;
export const TOKEN_SCOPES = ["capture", "read:taxonomy"] as const;

/** Platforms whose pages sit behind a login wall: unfurl returns "blocked" without retrying. */
export const LOGIN_WALL_PLATFORMS = ["instagram", "tiktok", "facebook", "linkedin"] as const;

export const LIMITS = {
  title: 300,
  url: 2048,
  description: 1000,
  note: 20000,
  selection: 5000,
  tags: 20,
  savedViews: 12,
  accountNotes: 2000,
  brief: 2000,
  taskTitle: 300,
  message: 20000,
  blobChars: 80000,
} as const;

export const AREA_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b", "#14b8a6", "#84cc16",
] as const;
