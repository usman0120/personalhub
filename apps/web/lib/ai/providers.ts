import "server-only";
import { z, type ZodType } from "zod";
import type { AiProviderType } from "@personalhub/shared";
import { fail } from "@/lib/api/server";

export type ContentPart = { type: "text"; text: string } | { type: "image"; mime: string; base64: string };
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Usage = { tokensIn: number; tokensOut: number };

export interface GenerateJSONRequest<T> {
  model: string;
  system: string;
  user: ContentPart[];
  schema: ZodType<T>;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIProvider {
  id: string;
  type: AiProviderType | "mock";
  generateJSON<T>(req: GenerateJSONRequest<T>): Promise<{ data: T; usage: Usage }>;
  streamChat(req: { model: string; system: string; messages: ChatMessage[]; maxTokens: number; timeoutMs?: number }): AsyncIterable<string>;
  ping(model: string): Promise<{ latencyMs: number }>;
}

const DEFAULT_BASE: Partial<Record<AiProviderType, string>> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

async function http(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 30;
      throw fail("RATE_LIMITED", `The AI provider is rate limiting. Try again in ${retryAfter}s`, { retryAfter });
    }
    if (res.status === 401 || res.status === 403) throw fail("UPSTREAM_ERROR", "The AI provider rejected the API key");
    if (!res.ok) throw fail("UPSTREAM_ERROR", `The AI provider returned ${res.status}`);
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw fail("UPSTREAM_ERROR", "The AI provider timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads an SSE body and yields each `data:` payload. */
async function* sse(res: Response): AsyncIterable<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data && data !== "[DONE]") yield data;
      }
    }
  }
}

/** Strips code fences and extracts the outermost JSON object. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("No JSON found");
  }
}

function schemaHint(schema: ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));
  } catch {
    return "";
  }
}

/** Shared JSON flow with one repair retry. */
async function jsonWithRepair<T>(
  req: GenerateJSONRequest<T>,
  call: (system: string, user: ContentPart[]) => Promise<{ text: string; usage: Usage }>,
): Promise<{ data: T; usage: Usage }> {
  const system = `${req.system}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${schemaHint(req.schema)}`;
  const first = await call(system, req.user);
  const tryParse = (text: string) => {
    try {
      const r = req.schema.safeParse(extractJson(text));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  };
  const parsed = tryParse(first.text);
  if (parsed !== null) return { data: parsed, usage: first.usage };
  const second = await call(system, [
    ...req.user,
    { type: "text", text: `Your previous answer was not valid. Return only valid JSON for this schema. Previous answer:\n${first.text.slice(0, 2000)}` },
  ]);
  const repaired = tryParse(second.text);
  if (repaired === null) throw fail("UPSTREAM_ERROR", "The AI returned invalid JSON");
  return {
    data: repaired,
    usage: { tokensIn: first.usage.tokensIn + second.usage.tokensIn, tokensOut: first.usage.tokensOut + second.usage.tokensOut },
  };
}

export function openAiCompatible(id: string, type: AiProviderType, apiKey: string, baseUrl?: string): AIProvider {
  const base = (baseUrl || DEFAULT_BASE[type] || "").replace(/\/$/, "");
  if (!base) throw fail("AI_NOT_CONFIGURED", "Base URL is required for OpenAI-compatible providers");
  const headers = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    ...(type === "openrouter" ? { "HTTP-Referer": process.env.APP_ORIGIN ?? "", "X-Title": "PersonalHub" } : {}),
  };
  const toMessages = (system: string, parts: ContentPart[]) => [
    { role: "system", content: system },
    {
      role: "user",
      content: parts.map((p) =>
        p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.base64}` } },
      ),
    },
  ];
  return {
    id,
    type,
    generateJSON(req) {
      return jsonWithRepair(req, async (system, user) => {
        const res = await http(`${base}/chat/completions`, {
          method: "POST",
          headers,
          timeoutMs: req.timeoutMs,
          body: JSON.stringify({
            model: req.model, messages: toMessages(system, user), max_tokens: req.maxTokens,
            temperature: req.temperature ?? 0.2, response_format: { type: "json_object" },
          }),
        });
        const j = await res.json();
        return { text: j.choices?.[0]?.message?.content ?? "", usage: { tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0 } };
      });
    },
    async *streamChat(req) {
      const res = await http(`${base}/chat/completions`, {
        method: "POST",
        headers,
        timeoutMs: req.timeoutMs ?? 30000,
        body: JSON.stringify({
          model: req.model, stream: true, max_tokens: req.maxTokens, temperature: 0.4,
          messages: [{ role: "system", content: req.system }, ...req.messages],
        }),
      });
      for await (const data of sse(res)) {
        try {
          const t = JSON.parse(data).choices?.[0]?.delta?.content;
          if (t) yield t as string;
        } catch {
          /* skip keep-alives */
        }
      }
    },
    async ping(model) {
      const t = Date.now();
      await http(`${base}/chat/completions`, {
        method: "POST", headers, timeoutMs: 15000,
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      return { latencyMs: Date.now() - t };
    },
  };
}

export function gemini(id: string, apiKey: string): AIProvider {
  const base = "https://generativelanguage.googleapis.com/v1beta/models";
  const headers = { "x-goog-api-key": apiKey, "content-type": "application/json" };
  const parts = (p: ContentPart[]) => p.map((x) => (x.type === "text" ? { text: x.text } : { inlineData: { mimeType: x.mime, data: x.base64 } }));
  const model = (m: string) => encodeURIComponent(m.replace(/^models\//, ""));
  return {
    id,
    type: "gemini",
    generateJSON(req) {
      return jsonWithRepair(req, async (system, user) => {
        const res = await http(`${base}/${model(req.model)}:generateContent`, {
          method: "POST", headers, timeoutMs: req.timeoutMs,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: parts(user) }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: req.maxTokens, temperature: req.temperature ?? 0.2 },
          }),
        });
        const j = await res.json();
        const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        return { text, usage: { tokensIn: j.usageMetadata?.promptTokenCount ?? 0, tokensOut: j.usageMetadata?.candidatesTokenCount ?? 0 } };
      });
    },
    async *streamChat(req) {
      const res = await http(`${base}/${model(req.model)}:streamGenerateContent?alt=sse`, {
        method: "POST", headers, timeoutMs: req.timeoutMs ?? 30000,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: req.maxTokens, temperature: 0.4 },
        }),
      });
      for await (const data of sse(res)) {
        try {
          const ps = JSON.parse(data).candidates?.[0]?.content?.parts ?? [];
          const t = ps.map((p: { text?: string }) => p.text ?? "").join("");
          if (t) yield t;
        } catch {
          /* ignore */
        }
      }
    },
    async ping(m) {
      const t = Date.now();
      await http(`${base}/${model(m)}:generateContent`, {
        method: "POST", headers, timeoutMs: 15000,
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } }),
      });
      return { latencyMs: Date.now() - t };
    },
  };
}

export function anthropic(id: string, apiKey: string): AIProvider {
  const url = "https://api.anthropic.com/v1/messages";
  const headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  const content = (p: ContentPart[]) =>
    p.map((x) => (x.type === "text" ? { type: "text", text: x.text } : { type: "image", source: { type: "base64", media_type: x.mime, data: x.base64 } }));
  return {
    id,
    type: "anthropic",
    generateJSON(req) {
      return jsonWithRepair(req, async (system, user) => {
        const res = await http(url, {
          method: "POST", headers, timeoutMs: req.timeoutMs,
          body: JSON.stringify({ model: req.model, system, max_tokens: req.maxTokens, temperature: req.temperature ?? 0.2, messages: [{ role: "user", content: content(user) }] }),
        });
        const j = await res.json();
        const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
        return { text, usage: { tokensIn: j.usage?.input_tokens ?? 0, tokensOut: j.usage?.output_tokens ?? 0 } };
      });
    },
    async *streamChat(req) {
      const res = await http(url, {
        method: "POST", headers, timeoutMs: req.timeoutMs ?? 30000,
        body: JSON.stringify({ model: req.model, system: req.system, max_tokens: req.maxTokens, stream: true, messages: req.messages }),
      });
      for await (const data of sse(res)) {
        try {
          const j = JSON.parse(data);
          if (j.type === "content_block_delta" && j.delta?.text) yield j.delta.text as string;
        } catch {
          /* ignore */
        }
      }
    },
    async ping(model) {
      const t = Date.now();
      await http(url, { method: "POST", headers, timeoutMs: 15000, body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }) });
      return { latencyMs: Date.now() - t };
    },
  };
}

/** Deterministic provider for local dev and tests (AI_MOCK=1). */
export function mockProvider(): AIProvider {
  return {
    id: "mock",
    type: "mock",
    async generateJSON<T>(req: GenerateJSONRequest<T>) {
      const text = req.user.map((p) => (p.type === "text" ? p.text : "")).join("\n");
      const candidates: unknown[] = [
        {
          description: "A curated list of services with free tiers for developers.",
          tags: ["free-tier", "hosting"],
          areaId: /areas:.*dev-resources/i.test(text) ? "dev-resources" : undefined,
          confidence: 0.9,
          title: undefined,
        },
        { ocrText: "Sample text from screenshot", description: "A screenshot.", suggestedTitle: "Screenshot" },
        { tasks: [{ title: "Follow up" }] },
      ];
      for (const c of candidates) {
        const r = req.schema.safeParse(c);
        if (r.success) return { data: r.data, usage: { tokensIn: 0, tokensOut: 0 } };
      }
      throw fail("UPSTREAM_ERROR", "Mock provider cannot satisfy schema");
    },
    async *streamChat(req) {
      const last = req.messages[req.messages.length - 1]?.content ?? "";
      const url = /https?:\/\/\S+/.exec(last)?.[0];
      const reply = url
        ? `This looks like a useful resource (${url}). It lists developer services with free tiers.\n\n\`\`\`actions\n${JSON.stringify([{ type: "create_item", payload: { url, title: "free-for.dev", kind: "link", areaId: "dev-resources", tags: ["free-tier", "hosting"], description: "List of SaaS, PaaS and IaaS offerings with free tiers." } }])}\n\`\`\``
        : "I could not find anything about that in your hub.";
      for (const chunk of reply.match(/[\s\S]{1,24}/g) ?? []) yield chunk;
    },
    async ping() {
      return { latencyMs: 1 };
    },
  };
}

export function createProvider(cfg: { id: string; type: AiProviderType; baseUrl?: string }, apiKey: string): AIProvider {
  if (process.env.AI_MOCK === "1") return mockProvider();
  switch (cfg.type) {
    case "gemini":
      return gemini(cfg.id, apiKey);
    case "anthropic":
      return anthropic(cfg.id, apiKey);
    default:
      return openAiCompatible(cfg.id, cfg.type, apiKey, cfg.baseUrl);
  }
}
