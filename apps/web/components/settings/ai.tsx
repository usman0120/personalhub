"use client";

import { useEffect, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Info, Plus, Trash2, Zap } from "lucide-react";
import { AI_PROVIDER_TYPES, AI_TASKS, slugify, type AiProviderType, type AiSettings } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { updateSettings, uid } from "@/lib/data/repos";
import { firestore } from "@/lib/firebase/client";
import { api, errorMessage } from "@/lib/api/client";
import { toastError } from "@/lib/ui";
import { Button, Checkbox, Field, Input, Select, Switch } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { SectionTitle, SettingRow } from "./basic";

const TYPE_LABEL: Record<AiProviderType, string> = {
  gemini: "Google Gemini", groq: "Groq", openrouter: "OpenRouter", "openai-compatible": "OpenAI-compatible", anthropic: "Anthropic",
};
const TASK_HINT: Record<(typeof AI_TASKS)[number], string> = {
  classify: "Cheap & fast JSON — e.g. a Flash-Lite or 8B-class model",
  summarize: "Good reading, short output — a Flash-class model",
  extract: "Reliable JSON for tasks and dates — a Flash-class model",
  vision: "Must accept images — a Gemini Flash-class model",
  chat: "Best free chat model you have (Groq, OpenRouter free, Gemini Flash)",
};

function AddProvider({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const settings = useSettings();
  const [type, setType] = useState<AiProviderType>("gemini");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const base = slugify(label || type) || type;
      let providerId = base;
      for (let n = 2; settings.ai.providers.some((p) => p.id === providerId); n++) providerId = `${base}-${n}`;
      await api("/api/settings/ai-key", { method: "PUT", body: { providerId, type, label: label || TYPE_LABEL[type], apiKey: key.trim(), ...(type === "openai-compatible" ? { baseUrl } : {}) } });
      toast.success("Provider saved. The key is encrypted and never shown again.");
      setKey("");
      setLabel("");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add AI provider" description="Use your own free-tier key. It is encrypted with AES-256-GCM on the server." footer={<Button variant="primary" loading={busy} disabled={key.trim().length < 8 || (type === "openai-compatible" && !baseUrl)} onClick={() => void submit()}>Save</Button>}>
      <div className="space-y-3">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as AiProviderType)}>{AI_PROVIDER_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select>
        </Field>
        <Field label="Label"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={TYPE_LABEL[type]} /></Field>
        {type === "openai-compatible" ? <Field label="Base URL" hint="https only, e.g. https://api.example.com/v1"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" /></Field> : null}
        <Field label="API key"><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function useMonthUsage() {
  const [usage, setUsage] = useState<{ requests: number; tokensIn: number; tokensOut: number } | null>(null);
  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    const q = query(collection(firestore(), "users", uid(), "aiUsage"), where(documentId(), ">=", `${month}-01`), where(documentId(), "<=", `${month}-31`));
    getDocs(q)
      .then((s) => setUsage(s.docs.reduce((acc, d) => ({ requests: acc.requests + (d.data().requests ?? 0), tokensIn: acc.tokensIn + (d.data().tokensIn ?? 0), tokensOut: acc.tokensOut + (d.data().tokensOut ?? 0) }), { requests: 0, tokensIn: 0, tokensOut: 0 })))
      .catch(() => setUsage({ requests: 0, tokensIn: 0, tokensOut: 0 }));
  }, []);
  return usage;
}

export function AiSection() {
  const settings = useSettings();
  const ai = settings.ai;
  const [addOpen, setAddOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const usage = useMonthUsage();
  // Dotted paths so server-managed fields (providers) are never overwritten by a stale client copy.
  const save = (patch: Partial<AiSettings>) =>
    updateSettings(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`ai.${k}`, v]))).catch(toastError);

  const test = async (providerId: string) => {
    setTesting(providerId);
    try {
      const r = await api<{ latencyMs: number; model: string }>("/api/ai/test", { body: { providerId } });
      toast.success(`${r.model} responded in ${r.latencyMs} ms`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(null);
    }
  };
  const remove = async (providerId: string) => {
    try {
      await api(`/api/settings/ai-key/${providerId}`, { method: "DELETE" });
      toast.success("Provider removed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const setTask = (task: (typeof AI_TASKS)[number], patch: Partial<NonNullable<AiSettings["taskModels"]["chat"]>> | null) => {
    const cur = ai.taskModels[task];
    const next = patch === null ? null : { providerId: cur?.providerId ?? ai.providers[0]?.id ?? "", model: cur?.model ?? "", ...(cur ?? {}), ...patch };
    void save({ taskModels: { ...ai.taskModels, [task]: next && next.providerId ? next : null } });
  };

  return (
    <>
      <SectionTitle title="AI" description="AI suggests; you decide. It never deletes anything and never sees Accounts." />
      <div className="mb-4 flex gap-2.5 rounded-lg border bg-surface p-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>Free tiers of some providers may use your prompts to improve their products and may allow human review. Turn off AI for areas with private content (Settings › Areas). Verify each provider&apos;s current terms.</p>
      </div>
      <SettingRow title="Enable AI" description="Master switch for suggestions, vision and the assistant.">
        <Switch checked={ai.enabled} label="Enable AI" onChange={(v) => void save({ enabled: v, suggestOnCapture: v && ai.providers.length ? true : ai.suggestOnCapture })} />
      </SettingRow>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold">Providers</h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus /> Add provider</Button>
      </div>
      {ai.providers.length ? (
        <ul className="divide-y rounded-lg border">
          {ai.providers.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{p.label}</p>
                <p className="text-[12px] text-muted-foreground">{TYPE_LABEL[p.type]} · key ••••{p.last4}{p.baseUrl ? ` · ${p.baseUrl}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" loading={testing === p.id} onClick={() => void test(p.id)}><Zap /> Test</Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.label}`} className="text-destructive" onClick={() => void remove(p.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg border border-dashed px-3 py-4 text-[13px] text-muted-foreground">No providers yet. Gemini and Groq both offer free API keys.</p>}

      <h3 className="mt-6 mb-2 text-[13.5px] font-semibold">Models per task</h3>
      <div className="divide-y rounded-lg border">
        {AI_TASKS.map((t) => {
          const tm = ai.taskModels[t];
          return (
            <div key={t} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[100px_1fr_1fr] sm:items-center">
              <div>
                <p className="text-[13px] font-medium capitalize">{t}</p>
              </div>
              <Select value={tm?.providerId ?? ""} onChange={(e) => setTask(t, e.target.value ? { providerId: e.target.value } : null)} className="h-8 text-[13px]" aria-label={`${t} provider`}>
                <option value="">{t === "summarize" || t === "extract" ? "Same as classify" : "Not set"}</option>
                {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
              <Input defaultValue={tm?.model ?? ""} key={`${t}-${tm?.providerId}`} disabled={!tm} placeholder="model id, e.g. gemini-flash-latest" onBlur={(e) => tm && e.target.value !== tm.model && setTask(t, { model: e.target.value.trim() })} className="h-8 text-[13px]" aria-label={`${t} model`} />
              <p className="text-[11.5px] text-muted-foreground sm:col-span-3 sm:col-start-2">{TASK_HINT[t]}</p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 mb-1 text-[13.5px] font-semibold">Behaviour</h3>
      <SettingRow title="Suggest on capture" description="Run classification automatically after each capture.">
        <Switch checked={ai.suggestOnCapture} label="Suggest on capture" onChange={(v) => void save({ suggestOnCapture: v })} />
      </SettingRow>
      <SettingRow title="Auto-apply" description="Apply suggestions without review when confidence is high. Off by default.">
        <Switch checked={ai.autoApply.enabled} label="Auto-apply" onChange={(v) => void save({ autoApply: { ...ai.autoApply, enabled: v } })} />
      </SettingRow>
      {ai.autoApply.enabled ? (
        <div className="space-y-3 border-b py-3.5">
          <div className="flex flex-wrap gap-4 text-[13px]">
            {(["areaId", "tags", "kind", "description"] as const).map((f) => (
              <label key={f} className="flex items-center gap-2">
                <Checkbox checked={ai.autoApply.fields.includes(f)} onChange={(v) => void save({ autoApply: { ...ai.autoApply, fields: v ? [...ai.autoApply.fields, f] : ai.autoApply.fields.filter((x) => x !== f) } })} />
                {f === "areaId" ? "Area" : f[0]!.toUpperCase() + f.slice(1)}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-3 text-[13px]">
            Min confidence
            <input type="range" min={0.5} max={1} step={0.05} defaultValue={ai.autoApply.minConfidence} onMouseUp={(e) => void save({ autoApply: { ...ai.autoApply, minConfidence: Number((e.target as HTMLInputElement).value) } })} onTouchEnd={(e) => void save({ autoApply: { ...ai.autoApply, minConfidence: Number((e.target as HTMLInputElement).value) } })} className="flex-1 accent-[var(--primary)]" aria-label="Minimum confidence" />
            <span className="w-10 tabular-nums">{Math.round(ai.autoApply.minConfidence * 100)}%</span>
          </label>
        </div>
      ) : null}
      <SettingRow title="Daily request limit" description="Requests beyond this are refused until midnight UTC.">
        <Input type="number" min={1} max={10000} defaultValue={ai.dailyRequestLimit} onBlur={(e) => Number(e.target.value) >= 1 && void save({ dailyRequestLimit: Math.round(Number(e.target.value)) })} className="w-28" />
      </SettingRow>
      <SettingRow title="Usage this month" description="Requests and tokens recorded by the server.">
        <span className="text-[13px] tabular-nums">{usage ? `${usage.requests} requests · ${(usage.tokensIn + usage.tokensOut).toLocaleString()} tokens` : "…"}</span>
      </SettingRow>
      <AddProvider open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
