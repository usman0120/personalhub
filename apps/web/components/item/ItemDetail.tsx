"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, Copy, Eye, Pencil, Pin, PinOff, Plus, RefreshCw, Rocket, Sparkles, Trash2, X,
} from "lucide-react";
import { findSecrets, IDEA_STAGES, ITEM_KINDS, parseTask, type Item } from "@personalhub/shared";
import { useAreas, useAreaMap, useItem, useLive } from "@/lib/data/hooks";
import { createDoc, updateItem, updateDocument } from "@/lib/data/repos";
import { requestSuggestion, togglePin, trashItems } from "@/lib/data/itemActions";
import { useSettings } from "@/components/providers/HubProvider";
import { relativeTime, shortDate, toastError } from "@/lib/ui";
import { Badge, Button, Checkbox, cn, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { Tip } from "@/components/ui/overlay";
import { ItemIcon, ItemMenu, KIND_LABEL, PlatformBadge } from "./bits";
import { Markdown, TagInput } from "./inputs";
import { SuggestionChips } from "./Suggestions";
import { BlobImage } from "./BlobImage";

/** Debounced autosave for a text field (800 ms). */
function useAutosave(item: Item | undefined, field: "note" | "title", delay = 800) {
  const [value, setValue] = useState(item?.[field] ?? "");
  const dirty = useRef(false);
  const id = item?.id;
  useEffect(() => {
    if (!dirty.current) setValue(item?.[field] ?? "");
  }, [item, field]);
  useEffect(() => {
    if (!dirty.current || !id) return;
    const t = setTimeout(() => {
      dirty.current = false;
      void updateItem(id, { [field]: field === "title" ? value.trim().slice(0, 300) || "Untitled" : value }).catch(toastError);
    }, delay);
    return () => clearTimeout(t);
  }, [value, id, field, delay]);
  return [value, (v: string) => { dirty.current = true; setValue(v); }] as const;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function AiPanel({ item }: { item: Item }) {
  const settings = useSettings();
  const area = settings.areas.find((a) => a.id === item.areaId);
  const [busy, setBusy] = useState(false);
  const blocked = area && !area.aiAllowed;
  const run = async () => {
    setBusy(true);
    try {
      const r = await requestSuggestion(item.id, true);
      if (!r.ok) toast.error(`Rate limited. Try again in ${r.retryAfter}s`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-[13px] font-medium">AI</h3>
        {item.ai.model ? <span className="truncate text-[11px] text-muted-foreground">{item.ai.model} · {relativeTime(item.ai.updatedAt)}</span> : null}
        {!blocked && settings.ai.enabled ? (
          <Button size="sm" variant="ghost" className="ml-auto" loading={busy || item.ai.status === "pending"} onClick={() => void run()}>
            {!busy ? <RefreshCw /> : null}
            {item.ai.status === "none" ? "Suggest" : "Regenerate"}
          </Button>
        ) : null}
      </div>
      {blocked ? (
        <p className="text-[13px] text-muted-foreground">AI is off for the {area?.name} area.</p>
      ) : !settings.ai.enabled ? (
        <p className="text-[13px] text-muted-foreground">AI is turned off. Enable it in Settings › AI.</p>
      ) : (
        <div className="space-y-2">
          {item.ai.summary ? <p className="text-[13px] leading-relaxed">{item.ai.summary}</p> : null}
          {item.ai.status === "error" ? <p className="text-[13px] text-destructive">{item.ai.error ?? "AI failed"}</p> : null}
          <SuggestionChips item={item} />
          {item.ai.status === "none" && !item.ai.summary ? <p className="text-[13px] text-muted-foreground">No suggestions yet.</p> : null}
        </div>
      )}
    </section>
  );
}

function LinkedTasks({ item }: { item: Item }) {
  const { docs } = useLive("tasks");
  const tasks = docs.filter((t) => t.itemId === item.id);
  const [title, setTitle] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    const p = parseTask(title);
    await createDoc("tasks", {
      title: p.title, status: "todo", due: p.due, dueHasTime: p.dueHasTime, priority: p.priority, projectId: item.projectId,
      itemId: item.id, areaId: item.areaId, source: "manual", completedAt: null, isDeleted: false, deletedAt: null,
    });
    setTitle("");
  };
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">Tasks</h3>
      <ul className="mb-1.5 space-y-0.5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-1 text-[13px]">
            <Checkbox label={`Complete ${t.title}`} checked={t.status === "done"} onChange={(v) => void updateDocument("tasks", t.id, { status: v ? "done" : "todo", completedAt: v ? Date.now() : null })} />
            <span className={cn("flex-1", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
            {t.due ? <span className="text-[11px] text-muted-foreground">{shortDate(t.due)}</span> : null}
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add task… (e.g. read fri !1)" className="h-8 text-[13px]" onKeyDown={(e) => e.key === "Enter" && void add()} />
        <Button size="icon-sm" variant="outline" aria-label="Add task" onClick={() => void add()}><Plus /></Button>
      </div>
    </section>
  );
}

export function ItemDetail({ id, onClose, full }: { id: string; onClose?: () => void; full?: boolean }) {
  const item = useItem(id);
  const router = useRouter();
  const areas = useAreas();
  const areaMap = useAreaMap();
  const { docs: projects } = useLive("projects");
  const [title, setTitle] = useAutosave(item, "title");
  const [note, setNote] = useAutosave(item, "note");
  const [preview, setPreview] = useState(false);
  const secrets = useMemo(() => findSecrets(note), [note]);

  if (!item) return <EmptyState title="Item not found" description="It may have been deleted." />;
  const area = item.areaId ? areaMap.get(item.areaId) : null;

  const promote = async () => {
    const pid = await createDoc("projects", {
      name: item.title.slice(0, 120), status: "idea", areaId: item.areaId, color: area?.color ?? "#6366f1",
      problem: item.description ?? "", goal: "", doneWhen: "", deadline: null, links: item.url ? [{ label: item.domain ?? "Link", url: item.url }] : [],
      lastActivityAt: Date.now(), isDeleted: false, deletedAt: null,
    });
    await updateItem(item.id, { idea: { stage: "promoted", promotedProjectId: pid }, projectId: pid });
    toast.success("Promoted to project");
    router.push(`/projects/${pid}`);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", full && "mx-auto max-w-3xl")}>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <ItemIcon item={item} className="mx-1" />
        <span className="text-xs text-muted-foreground">{KIND_LABEL[item.kind]}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {item.url ? (
            <Tip label="Open link">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Open link">
                <ArrowUpRight className="size-4" />
              </a>
            </Tip>
          ) : null}
          {item.url ? (
            <Tip label="Copy link">
              <Button size="icon-sm" variant="ghost" aria-label="Copy link" onClick={() => void navigator.clipboard.writeText(item.url!).then(() => toast.success("Link copied"))}>
                <Copy />
              </Button>
            </Tip>
          ) : null}
          <Tip label={item.pinned ? "Unpin" : "Pin"}>
            <Button size="icon-sm" variant="ghost" aria-label={item.pinned ? "Unpin" : "Pin"} onClick={() => void togglePin(item)}>
              {item.pinned ? <PinOff /> : <Pin />}
            </Button>
          </Tip>
          <ItemMenu item={item} />
          {onClose ? (
            <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Title"
          rows={1}
          className="field-sizing-content w-full resize-none bg-transparent text-lg leading-snug font-semibold outline-none"
        />

        {item.imageUrl || item.description || item.domain ? (
          <div className="flex gap-3">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-32 shrink-0 rounded-md border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {item.unfurl.siteName ? <span className="font-medium text-foreground">{item.unfurl.siteName}</span> : null}
                {item.domain ? <span>{item.domain}</span> : null}
                <PlatformBadge item={item} />
                {item.unfurl.status === "blocked" ? <Badge>Login wall</Badge> : item.unfurl.status === "failed" ? <Badge className="text-destructive">Unreachable</Badge> : null}
              </div>
              {item.description ? <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.description}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-2.5">
          <Row label="Area">
            <Select value={item.areaId ?? ""} onChange={(e) => void updateItem(item.id, { areaId: e.target.value || null })} aria-label="Area" className="h-8">
              <option value="">No area</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Row>
          <Row label="Tags">
            <TagInput value={item.tags} onChange={(tags) => void updateItem(item.id, { tags })} />
          </Row>
          <Row label="Project">
            <Select value={item.projectId ?? ""} onChange={(e) => void updateItem(item.id, { projectId: e.target.value || null })} aria-label="Project" className="h-8">
              <option value="">None</option>
              {projects.filter((p) => p.status !== "archived").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Kind">
              <Select value={item.kind} onChange={(e) => void updateItem(item.id, { kind: e.target.value as Item["kind"], ...(e.target.value === "idea" && !item.idea ? { idea: { stage: "someday" } } : {}), ...(e.target.value === "decision" && !item.decision ? { decision: { context: "", decision: "", consequences: "", decidedAt: Date.now() } } : {}) })} aria-label="Kind" className="h-8">
                {ITEM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </Select>
            </Row>
            <Row label="Status">
              <Select value={item.status} onChange={(e) => void updateItem(item.id, { status: e.target.value as Item["status"], reviewedAt: e.target.value === "inbox" ? null : Date.now() })} aria-label="Status" className="h-8">
                <option value="inbox">Inbox</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            </Row>
          </div>
        </div>

        {item.kind === "idea" ? (
          <section className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <span className="text-[13px] text-muted-foreground">Stage</span>
            <Select value={item.idea?.stage ?? "someday"} onChange={(e) => void updateItem(item.id, { idea: { ...item.idea, stage: e.target.value as "someday" } })} className="h-8 w-36" aria-label="Idea stage">
              {IDEA_STAGES.map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
            </Select>
            {item.idea?.promotedProjectId ? (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => router.push(`/projects/${item.idea!.promotedProjectId}`)}>Open project</Button>
            ) : (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => void promote()}><Rocket /> Promote to project</Button>
            )}
          </section>
        ) : null}

        {item.kind === "decision" ? (
          <section className="space-y-3 rounded-lg border p-3">
            {(["context", "decision", "consequences"] as const).map((f) => (
              <Field key={f} label={f[0]!.toUpperCase() + f.slice(1)}>
                <Textarea
                  defaultValue={item.decision?.[f] ?? ""}
                  className="min-h-16 text-[13px]"
                  onBlur={(e) => void updateItem(item.id, { decision: { context: "", decision: "", consequences: "", decidedAt: Date.now(), ...item.decision, [f]: e.target.value.slice(0, 4000) } })}
                />
              </Field>
            ))}
          </section>
        ) : null}

        {item.kind === "image" ? (
          <section className="space-y-2">
            {item.image?.blobId || item.image?.storageKey ? <BlobImage image={item.image} /> : <p className="text-[13px] text-muted-foreground">Original stays in your gallery.</p>}
            {item.image?.ocrText ? (
              <div className="rounded-lg border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Text in image</span>
                  <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(item.image!.ocrText!).then(() => toast.success("Copied"))}><Copy /> Copy</Button>
                </div>
                <p className="text-[13px] whitespace-pre-wrap">{item.image.ocrText}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">Note</h3>
            <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
              {preview ? <Pencil /> : <Eye />} {preview ? "Edit" : "Preview"}
            </Button>
          </div>
          {secrets.length ? (
            <div role="alert" className="mb-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              This looks like a secret ({secrets.map((s) => s.label).join(", ")}) — move it to your password manager.
            </div>
          ) : null}
          {preview ? (
            note ? <Markdown className="min-h-24 rounded-md border px-3 py-2">{note}</Markdown> : <p className="text-[13px] text-muted-foreground">Nothing yet.</p>
          ) : (
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write in Markdown…" className="min-h-32 font-[inherit] text-[13.5px]" aria-label="Note" />
          )}
        </section>

        {item.selection ? (
          <blockquote className="border-l-2 pl-3 text-[13px] whitespace-pre-wrap text-muted-foreground">{item.selection}</blockquote>
        ) : null}

        <AiPanel item={item} />
        <LinkedTasks item={item} />
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t px-5 py-2.5 text-[11px] text-muted-foreground">
        <span>Captured {shortDate(item.capturedAt, true)} via {item.source}</span>
        <span className="hidden sm:inline">Updated {relativeTime(item.updatedAt)}</span>
        <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => { void trashItems([item.id]); onClose?.(); }}>
          <Trash2 /> Move to trash
        </Button>
      </div>
    </div>
  );
}
