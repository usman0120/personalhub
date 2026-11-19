"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import { ArrowUp, Bot, Check, Edit3, ImagePlus, MessageSquarePlus, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { extractFirstUrl, getDomain, type Message, type ProposedAction } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useAreaMap, useLive } from "@/lib/data/hooks";
import { deleteConversation, renameConversation, stores, uid } from "@/lib/data/repos";
import { fromFs } from "@/lib/data/store";
import { firestore } from "@/lib/firebase/client";
import { api, authHeader, errorMessage } from "@/lib/api/client";
import { useSearchIndex } from "@/lib/search";
import { useUi } from "@/components/shell/UiProvider";
import { Markdown } from "@/components/item/inputs";
import { compressImage } from "@/lib/image";
import { relativeTime, toastError } from "@/lib/ui";
import { Button, cn, Input, Spinner, Textarea } from "@/components/ui/primitives";
import { Dialog, Menu, MenuItem, Popover } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/states";

const EXAMPLES = [
  "What is this? https://free-for.dev",
  "What did I save about free hosting?",
  "Turn my notes on the PersonalHub project into tasks",
  "Summarise everything in project PersonalHub",
];

const ACTION_LABEL: Record<ProposedAction["type"], string> = {
  create_item: "Save to Library", update_item: "Update item", create_task: "Create task", create_project: "Create project",
};

function ActionCard({ action, conversationId, messageId }: { action: ProposedAction; conversationId: string; messageId: string }) {
  const areas = useAreaMap();
  const { openItem } = useUi();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [json, setJson] = useState(JSON.stringify(action.payload, null, 2));
  const p = action.payload as Record<string, unknown>;
  const fields = action.type === "update_item" ? (p.fields as Record<string, unknown>) : p;

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api("/api/ai/actions/apply", { body: { conversationId, messageId, actionId: action.id, ...body } });
      if (!body.dismiss) toast.success("Applied");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const applyEdited = async () => {
    try {
      await run({ edits: JSON.parse(json) });
      setEditOpen(false);
    } catch {
      toast.error("Invalid JSON");
    }
  };

  const summary = [
    (fields.title ?? fields.name) as string | undefined,
    fields.areaId ? `Area ${areas.get(fields.areaId as string)?.name ?? fields.areaId}` : null,
    Array.isArray(fields.tags) && fields.tags.length ? `tags ${(fields.tags as string[]).join(", ")}` : null,
    fields.due ? `due ${fields.due}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={cn("rounded-lg border bg-card p-3", action.status !== "proposed" && "opacity-70")}>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{ACTION_LABEL[action.type]}</p>
      <p className="mt-1 text-[13px] font-medium">{summary || "—"}</p>
      {fields.description ? <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{fields.description as string}</p> : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {action.status === "proposed" ? (
          <>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void run({})}><Check /> Apply</Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Edit3 /> Edit then apply</Button>
            <Button size="sm" variant="ghost" onClick={() => void run({ dismiss: true })}><X /> Dismiss</Button>
          </>
        ) : action.status === "applied" ? (
          <span className="flex items-center gap-2 text-[12.5px] text-success">
            <Check className="size-3.5" /> Applied
            {action.resultId && (action.type === "create_item" || action.type === "update_item") ? <button className="text-primary hover:underline" onClick={() => openItem(action.resultId!)}>Open item</button> : null}
            {action.resultId && action.type === "create_project" ? <Link href={`/projects/${action.resultId}`} className="text-primary hover:underline">Open project</Link> : null}
            {action.type === "create_task" ? <Link href="/tasks" className="text-primary hover:underline">View tasks</Link> : null}
          </span>
        ) : <span className="text-[12.5px] text-muted-foreground">Dismissed</span>}
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit before applying" description="Adjust the proposed fields. Validation runs on the server." footer={<Button variant="primary" loading={busy} onClick={() => void applyEdited()}>Apply</Button>}>
        <Textarea value={json} onChange={(e) => setJson(e.target.value)} className="min-h-56 font-mono text-xs" spellCheck={false} />
      </Dialog>
    </div>
  );
}

function AssistantScreen() {
  const settings = useSettings();
  const params = useSearchParams();
  const { docs: conversations } = useLive("conversations");
  const index = useSearchIndex();
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [streaming, setStreaming] = useState<{ text: string; contextIds: string[] } | null>(null);
  const [image, setImage] = useState<{ base64: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const configured = settings.ai.enabled && Boolean(settings.ai.taskModels.chat ?? settings.ai.taskModels.classify);
  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);

  useEffect(() => {
    if (!convId) return setMessages([]);
    const q = query(collection(firestore(), "users", uid(), "conversations", convId, "messages"), orderBy("createdAt"));
    return onSnapshot(q, (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...fromFs<Omit<Message, "id">>(d.data({ serverTimestamps: "estimate" })) }))));
  }, [convId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  const send = async (textArg?: string) => {
    let text = (textArg ?? input).trim();
    if (!text && !image) return;
    setInput("");
    try {
      if (image) {
        const v = await api<{ ocrText: string; description: string }>("/api/ai/vision", { body: { image: image.base64, mime: "image/webp", hint: text.slice(0, 500) } });
        text = `${text || "What is this screenshot?"}\n\n[Attached screenshot] ${v.description}\nText in image: ${v.ocrText.slice(0, 2000)}`;
        setImage(null);
      }
      const url = extractFirstUrl(text);
      const queryText = [text.replace(url ?? "", ""), url ? getDomain(url) : ""].join(" ").trim();
      const contextItemIds = queryText
        ? index.search(queryText, { combineWith: "OR", filter: (r) => r.type === "item" }).slice(0, 8).map((r) => r.refId as string)
        : [];
      setStreaming({ text: "", contextIds: contextItemIds });
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { ...(await authHeader()), "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId ?? undefined, message: text.slice(0, 8000), contextItemIds }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          const ev = JSON.parse(part.slice(5));
          if (ev.t === "start") setConvId(ev.conversationId);
          else if (ev.t === "delta") setStreaming((s) => s && { ...s, text: s.text + ev.text });
          else if (ev.t === "error") throw new Error(ev.error?.message ?? "AI error");
        }
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStreaming(null);
    }
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    try {
      const out = await compressImage(file, 1600, 0.8);
      if (out.base64.length > 2_000_000) return void toast.error("Image is too large");
      setImage({ base64: out.base64, name: file.name });
    } catch {
      toast.error("Could not read that image");
    }
  };

  if (!configured) {
    return (
      <EmptyState
        className="flex-1"
        icon={<Bot />}
        title="Assistant needs an AI provider"
        description="Add a free API key (Gemini, Groq, OpenRouter…) and pick a chat model. The assistant only proposes actions; you decide."
        action={<Link href="/settings/ai"><Button variant="primary" size="sm">Open Settings › AI</Button></Link>}
      />
    );
  }

  const pending = streaming;
  return (
    <div className="flex min-h-0 flex-1 md:h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center justify-between border-b px-3">
          <span className="text-[13px] font-semibold">Conversations</span>
          <Button size="icon-sm" variant="ghost" aria-label="New conversation" onClick={() => setConvId(null)}><MessageSquarePlus /></Button>
        </div>
        <ul className="scrollbar-thin flex-1 overflow-y-auto p-1.5">
          {sorted.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button onClick={() => setConvId(c.id)} className={cn("flex h-9 min-w-0 flex-1 flex-col justify-center rounded-md px-2 text-left", c.id === convId ? "bg-accent" : "hover:bg-accent/60")}>
                <span className="truncate text-[13px]">{c.title}</span>
              </button>
              <Menu trigger={<Button size="icon-sm" variant="ghost" aria-label="Conversation actions" className="size-7 opacity-0 group-hover:opacity-100"><MoreHorizontal /></Button>}>
                <MenuItem icon={<Pencil />} onSelect={() => setRenaming({ id: c.id, title: c.title })}>Rename</MenuItem>
                <MenuItem danger icon={<Trash2 />} onSelect={() => { if (convId === c.id) setConvId(null); void deleteConversation(c.id).catch(toastError); }}>Delete</MenuItem>
              </Menu>
            </li>
          ))}
          {!sorted.length ? <li className="px-2 py-4 text-[12.5px] text-muted-foreground">No conversations yet.</li> : null}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <span className="truncate text-[13px] font-medium">{sorted.find((c) => c.id === convId)?.title ?? "New conversation"}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setConvId(null)}><MessageSquarePlus /> New</Button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            {!messages.length && !pending ? (
              <div className="pt-8 text-center">
                <Bot className="mx-auto size-8 text-muted-foreground/60" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium">Ask about anything you found or saved</p>
                <p className="mt-1 text-[13px] text-muted-foreground">It proposes actions as cards. Nothing changes until you click Apply.</p>
                <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-2">
                  {EXAMPLES.map((e) => (
                    <button key={e} onClick={() => void send(e)} className="rounded-lg border px-3 py-2.5 text-left text-[13px] hover:bg-accent/50">{e}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" && "items-end")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-[13.5px] whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div className="w-full space-y-2.5">
                    <Markdown>{m.content}</Markdown>
                    {m.actions?.map((a) => <ActionCard key={a.id} action={a} conversationId={convId!} messageId={m.id} />)}
                    <p className="text-[11px] text-muted-foreground">{m.model} · {relativeTime(m.createdAt)}</p>
                  </div>
                )}
                {m.role === "user" && m.contextItemIds?.length ? <ContextChip ids={m.contextItemIds} /> : null}
              </div>
            ))}
            {pending ? (
              <div className="space-y-2">
                {pending.contextIds.length ? <ContextChip ids={pending.contextIds} /> : null}
                {pending.text ? <Markdown>{pending.text}</Markdown> : <Spinner />}
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="border-t bg-background p-3">
          <div className="mx-auto max-w-3xl">
            {image ? (
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                <ImagePlus className="size-3.5" /> {image.name}
                <button aria-label="Remove image" onClick={() => setImage(null)}><X className="size-3" /></button>
              </div>
            ) : null}
            <div className="flex items-end gap-2 rounded-xl border bg-card p-1.5 focus-within:border-ring/60">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void attach(e.target.files?.[0])} />
              <Button size="icon-sm" variant="ghost" aria-label="Attach screenshot" disabled={!settings.ai.taskModels.vision} title={settings.ai.taskModels.vision ? "Attach screenshot" : "Set a vision model in Settings › AI"} onClick={() => fileRef.current?.click()}><ImagePlus /></Button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={1}
                placeholder="Ask, or paste a URL…"
                aria-label="Message"
                className="field-sizing-content max-h-48 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
              />
              <Button size="icon-sm" variant="primary" aria-label="Send" disabled={Boolean(pending) || (!input.trim() && !image)} onClick={() => void send()}><ArrowUp /></Button>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={Boolean(renaming)} onOpenChange={(v) => !v && setRenaming(null)} title="Rename conversation" footer={<Button variant="primary" onClick={() => { if (renaming) void renameConversation(renaming.id, renaming.title); setRenaming(null); }}>Save</Button>}>
        <Input autoFocus value={renaming?.title ?? ""} onChange={(e) => setRenaming((r) => r && { ...r, title: e.target.value })} />
      </Dialog>
    </div>
  );
}

function ContextChip({ ids }: { ids: string[] }) {
  const { openItem } = useUi();
  const items = ids.map((id) => stores.items.get(id)).filter(Boolean);
  if (!items.length) return null;
  return (
    <Popover trigger={<button className="text-[11.5px] text-muted-foreground hover:text-foreground">Using {items.length} items from your hub</button>} align="end">
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i!.id}><button onClick={() => openItem(i!.id)} className="w-full truncate text-left text-[13px] hover:underline">{i!.title}</button></li>
        ))}
      </ul>
    </Popover>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantScreen />
    </Suspense>
  );
}

