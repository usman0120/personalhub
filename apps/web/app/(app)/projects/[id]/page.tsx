"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Plus, Scale, Search, Trash2, X } from "lucide-react";
import type { Project } from "@personalhub/shared";
import { useAreaMap, useAreas, useItems, useLive } from "@/lib/data/hooks";
import { createItem, restore, softDelete, updateDocument, updateItem } from "@/lib/data/repos";
import { useItemSearch } from "@/lib/search";
import { useUi } from "@/components/shell/UiProvider";
import { createTask } from "@/components/capture/quickAdd";
import { TaskRow } from "@/components/tasks/TaskRow";
import { ItemRow } from "@/components/item/ItemRow";
import { ItemIcon } from "@/components/item/bits";
import { fromDateInput, shortDate, toDateInput, undoToast } from "@/lib/ui";
import { Button, cn, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/states";

const TABS = ["Overview", "Tasks", "Items", "Decisions"] as const;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { docs: projects, loaded } = useLive("projects");
  const { docs: tasks } = useLive("tasks");
  const { items } = useItems();
  const areas = useAreas();
  const areaMap = useAreaMap();
  const { openItem } = useUi();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [taskText, setTaskText] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [q, setQ] = useState("");
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decision, setDecision] = useState({ title: "", context: "", decision: "", consequences: "" });
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const hits = useItemSearch(q);

  const project = projects.find((p) => p.id === id);
  const pTasks = useMemo(() => tasks.filter((t) => t.projectId === id), [tasks, id]);
  const pItems = useMemo(() => items.filter((i) => i.projectId === id && i.kind !== "decision"), [items, id]);
  const decisions = useMemo(() => items.filter((i) => i.projectId === id && i.kind === "decision").sort((a, b) => (b.decision?.decidedAt ?? 0) - (a.decision?.decidedAt ?? 0)), [items, id]);

  if (!loaded) return null;
  if (!project) return <EmptyState title="Project not found" action={<Link href="/projects"><Button size="sm">Back to projects</Button></Link>} />;

  const update = (patch: Partial<Project>) => void updateDocument("projects", id, { ...patch, lastActivityAt: Date.now() });
  const done = pTasks.filter((t) => t.status === "done").length;
  const progress = pTasks.length ? Math.round((done / pTasks.length) * 100) : 0;
  const activeOthers = projects.filter((p) => p.status === "active" && p.id !== id).length;

  const setStatus = (status: Project["status"]) => {
    if (status === "active" && activeOthers >= 2) toast.warning(`That makes ${activeOthers + 1} active projects. Consider pausing one.`);
    update({ status });
  };
  const addTask = async () => {
    if (!taskText.trim()) return;
    await createTask(taskText, { areas }, { projectId: id });
    setTaskText("");
    update({});
  };
  const addDecision = async () => {
    if (!decision.title.trim()) return;
    await createItem({
      kind: "decision", source: "web", title: decision.title, projectId: id, areaId: project.areaId, status: "active", skipRules: true,
      extra: { decision: { context: decision.context, decision: decision.decision, consequences: decision.consequences, decidedAt: Date.now() } },
    });
    setDecision({ title: "", context: "", decision: "", consequences: "" });
    setDecisionOpen(false);
    update({});
  };
  const remove = () => {
    void softDelete("projects", id);
    undoToast("Project moved to Trash", () => restore("projects", id));
    router.push("/projects");
  };

  const candidates = (hits ? items.filter((i) => hits.has(i.id)) : [...items].sort((a, b) => b.capturedAt - a.capturedAt)).filter((i) => i.projectId !== id).slice(0, 20);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-4 pt-3 md:px-6">
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> Projects</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="size-3 rounded-sm" style={{ background: project.color }} />
          <input
            defaultValue={project.name}
            aria-label="Project name"
            onBlur={(e) => e.target.value.trim() && e.target.value !== project.name && update({ name: e.target.value.trim().slice(0, 120) })}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
          />
          <Select value={project.status} onChange={(e) => setStatus(e.target.value as Project["status"])} aria-label="Status" className="h-8 w-32 text-[13px]">
            <option value="idea">Idea</option><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option><option value="archived">Archived</option>
          </Select>
          <Button size="icon-sm" variant="ghost" aria-label="Delete project" className="text-muted-foreground" onClick={remove}><Trash2 /></Button>
        </div>
        <nav className="-mb-px mt-2 flex gap-4" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("border-b-2 pb-2 text-[13px]", tab === t ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t}
              <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">{t === "Tasks" ? pTasks.length || "" : t === "Items" ? pItems.length || "" : t === "Decisions" ? decisions.length || "" : ""}</span>
            </button>
          ))}
        </nav>
      </header>

      {tab === "Overview" ? (
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 md:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{progress}%</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{done}/{pTasks.length} tasks done</p>
            </div>
            <Field label="Deadline" className="rounded-lg border p-3">
              <Input type="date" value={toDateInput(project.deadline)} onChange={(e) => update({ deadline: fromDateInput(e.target.value, true) })} className="h-8" />
            </Field>
            <Field label="Area" className="rounded-lg border p-3">
              <Select value={project.areaId ?? ""} onChange={(e) => update({ areaId: e.target.value || null })} className="h-8">
                <option value="">None</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
          {(["problem", "goal", "doneWhen"] as const).map((f) => (
            <Field key={f} label={f === "doneWhen" ? "Done when" : f[0]!.toUpperCase() + f.slice(1)} hint={f === "problem" ? "What problem does this solve?" : f === "goal" ? "What outcome do you want?" : "How will you know it's finished?"}>
              <Textarea defaultValue={project[f]} maxLength={2000} className="min-h-20 text-[13.5px]" onBlur={(e) => e.target.value !== project[f] && update({ [f]: e.target.value })} />
            </Field>
          ))}
          <Field label="Links">
            <ul className="space-y-1">
              {project.links.map((l, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">{l.label || l.url}</a>
                  <button aria-label="Remove link" className="text-muted-foreground hover:text-foreground" onClick={() => update({ links: project.links.filter((_, j) => j !== i) })}><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//.test(newLink.url)) { update({ links: [...project.links, { label: newLink.label.slice(0, 80), url: newLink.url }] }); setNewLink({ label: "", url: "" }); } else toast.error("Enter a full https:// URL"); }}>
              <Input placeholder="Label" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} className="h-8 w-32" />
              <Input placeholder="https://…" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} className="h-8 flex-1" />
              <Button size="sm" type="submit" variant="outline">Add</Button>
            </form>
          </Field>
          <p className="text-[11px] text-muted-foreground">Created {shortDate(project.createdAt)} · Last activity {shortDate(project.lastActivityAt, true)}</p>
        </div>
      ) : null}

      {tab === "Tasks" ? (
        <div>
          <form onSubmit={(e) => { e.preventDefault(); void addTask(); }} className="flex gap-2 border-b px-4 py-3 md:px-6">
            <Input value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="Add a task… e.g. write README tomorrow !1" aria-label="New task" />
            <Button type="submit" variant="primary" disabled={!taskText.trim()}>Add</Button>
          </form>
          {pTasks.length ? (
            <ul>{[...pTasks].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due ?? Infinity) - (b.due ?? Infinity)).map((t) => <TaskRow key={t.id} task={t} projects={projects} showProject={false} />)}</ul>
          ) : <EmptyState title="No tasks in this project" description="Add the next concrete step above." />}
        </div>
      ) : null}

      {tab === "Items" ? (
        <div>
          <div className="flex justify-end border-b px-4 py-2 md:px-6">
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}><Plus /> Add existing item</Button>
          </div>
          {pItems.length ? pItems.map((i) => <ItemRow key={i.id} item={i} area={i.areaId ? areaMap.get(i.areaId) : null} onOpen={() => openItem(i.id)} />) : <EmptyState title="No linked items" description="Link resources, notes and ideas to this project." />}
        </div>
      ) : null}

      {tab === "Decisions" ? (
        <div>
          <div className="flex justify-end border-b px-4 py-2 md:px-6">
            <Button size="sm" variant="outline" onClick={() => setDecisionOpen(true)}><Scale /> New decision</Button>
          </div>
          {decisions.length ? (
            <ul className="divide-y">
              {decisions.map((d) => (
                <li key={d.id}>
                  <button onClick={() => openItem(d.id)} className="w-full px-4 py-3 text-left hover:bg-accent/40 md:px-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-medium">{d.title}</span>
                      <span className="text-[11px] text-muted-foreground">{shortDate(d.decision?.decidedAt)}</span>
                    </div>
                    {d.decision?.decision ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{d.decision.decision}</p> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Scale />} title="No decisions recorded" description="Write down what you decided and why, so future you remembers." />}
        </div>
      ) : null}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen} title="Link items" description="Search your hub and add items to this project.">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8" />
        </div>
        <ul className="divide-y">
          {candidates.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2 text-[13px]">
              <ItemIcon item={i} />
              <span className="flex-1 truncate">{i.title}</span>
              <Button size="sm" variant="outline" onClick={() => { void updateItem(i.id, { projectId: id }); update({}); toast.success("Linked"); }}>Add</Button>
            </li>
          ))}
          {!candidates.length ? <li className="py-6 text-center text-[13px] text-muted-foreground">No items found.</li> : null}
        </ul>
      </Dialog>

      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen} title="New decision" footer={<Button variant="primary" disabled={!decision.title.trim()} onClick={() => void addDecision()}>Save decision</Button>}>
        <div className="space-y-3">
          <Field label="Title"><Input autoFocus value={decision.title} onChange={(e) => setDecision({ ...decision, title: e.target.value })} placeholder="Use Firestore instead of Postgres" /></Field>
          <Field label="Context"><Textarea value={decision.context} onChange={(e) => setDecision({ ...decision, context: e.target.value })} className="min-h-16" /></Field>
          <Field label="Decision"><Textarea value={decision.decision} onChange={(e) => setDecision({ ...decision, decision: e.target.value })} className="min-h-16" /></Field>
          <Field label="Consequences"><Textarea value={decision.consequences} onChange={(e) => setDecision({ ...decision, consequences: e.target.value })} className="min-h-16" /></Field>
        </div>
      </Dialog>
    </div>
  );
}
