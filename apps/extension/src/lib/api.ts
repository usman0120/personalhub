import type { Area, CaptureInput, CaptureOutput } from "@personalhub/shared";

declare const __HUB_ORIGIN__: string;

export interface ExtSettings {
  hubUrl: string;
  token: string;
  defaultAreaId: string | null;
  autoAi: boolean;
}
export interface Taxonomy {
  areas: Area[];
  tags: Array<{ slug: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  defaultAreaId: string | null;
}
type Queued = { id: string; input: CaptureInput; attempts: number; queuedAt: number };

const DEFAULTS: ExtSettings = { hubUrl: __HUB_ORIGIN__, token: "", defaultAreaId: null, autoAi: false };

export async function getSettings(): Promise<ExtSettings> {
  const s = await chrome.storage.local.get(["hubUrl", "token", "defaultAreaId", "autoAi"]);
  return { ...DEFAULTS, ...(s as Partial<ExtSettings>) };
}
export const saveSettings = (s: Partial<ExtSettings>) => chrome.storage.local.set(s);

export function validHubUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public offline = false) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { hubUrl, token } = await getSettings();
  if (!token) throw new ApiError("NO_TOKEN", "Add your capture token in Options");
  if (!validHubUrl(hubUrl)) throw new ApiError("BAD_URL", "Hub URL must use https");
  let res: Response;
  try {
    res = await fetch(`${hubUrl.replace(/\/$/, "")}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK", "Offline — saved to queue", true);
  }
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new ApiError(json?.error?.code ?? "INTERNAL", json?.error?.message ?? `Request failed (${res.status})`, res.status >= 500);
  return json.data as T;
}

export const capture = (input: CaptureInput) => call<CaptureOutput>("/api/capture", { body: input });
export const suggest = (itemId: string) => call("/api/ai/suggest", { body: { itemId } });
/** Moves a just-captured item to Trash (server allows this for 10 minutes after capture). */
export const undoCapture = (itemId: string) => call(`/api/capture/${encodeURIComponent(itemId)}`, { method: "DELETE" });

export async function taxonomy(force = false): Promise<Taxonomy> {
  const cached = (await chrome.storage.local.get("taxonomy")).taxonomy as { at: number; data: Taxonomy } | undefined;
  if (!force && cached && Date.now() - cached.at < 10 * 60_000) return cached.data;
  const data = await call<Taxonomy>("/api/taxonomy");
  await chrome.storage.local.set({ taxonomy: { at: Date.now(), data } });
  return data;
}

// ---------- offline queue ----------
async function readQueue(): Promise<Queued[]> {
  return ((await chrome.storage.local.get("queue")).queue as Queued[] | undefined) ?? [];
}
async function writeQueue(q: Queued[]) {
  await chrome.storage.local.set({ queue: q });
  await chrome.action.setBadgeText({ text: q.length ? String(q.length) : "" });
  if (q.length) await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
}
export async function enqueue(input: CaptureInput) {
  const q = await readQueue();
  q.push({ id: crypto.randomUUID(), input, attempts: 0, queuedAt: Date.now() });
  await writeQueue(q.slice(-200));
}
export const queueSize = async () => (await readQueue()).length;

/** Sends queued captures; keeps failures with backoff (skip until 2^attempts minutes passed). */
export async function flushQueue(): Promise<number> {
  const q = await readQueue();
  if (!q.length) return 0;
  const remaining: Queued[] = [];
  let sent = 0;
  for (const entry of q) {
    const wait = Math.min(60, 2 ** entry.attempts) * 60_000;
    if (entry.attempts && Date.now() - entry.queuedAt < wait) {
      remaining.push(entry);
      continue;
    }
    try {
      await capture(entry.input);
      sent++;
    } catch (e) {
      if (e instanceof ApiError && !e.offline && e.code !== "RATE_LIMITED") continue; // permanent error: drop
      remaining.push({ ...entry, attempts: entry.attempts + 1 });
    }
  }
  await writeQueue(remaining);
  return sent;
}

/** Capture with automatic queueing on network failure. */
export async function captureOrQueue(input: CaptureInput): Promise<{ result?: CaptureOutput; queued?: boolean }> {
  try {
    return { result: await capture(input) };
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      await enqueue(input);
      return { queued: true };
    }
    throw e;
  }
}

export async function flashBadge(text: "✓" | "!", ms = 2000) {
  await chrome.action.setBadgeBackgroundColor({ color: text === "✓" ? "#10b981" : "#ef4444" });
  await chrome.action.setBadgeText({ text });
  setTimeout(async () => {
    const n = await queueSize();
    await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  }, ms);
}

const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;
export const isRestricted = (url?: string) => !url || RESTRICTED.test(url);

/** Reads selection + meta description from the active tab (requires a user gesture via activeTab). */
export async function readPage(tabId: number, url?: string): Promise<{ selection: string; description: string }> {
  if (isRestricted(url)) return { selection: "", description: "" };
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        selection: String(window.getSelection?.() ?? "").slice(0, 5000),
        description: (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content?.slice(0, 1000) ?? "",
      }),
    });
    return (r?.result as { selection: string; description: string }) ?? { selection: "", description: "" };
  } catch {
    return { selection: "", description: "" };
  }
}
