"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, ChevronRight } from "lucide-react";
import type { Task } from "@personalhub/shared";
import { useAreas, useLive } from "@/lib/data/hooks";
import { createTask } from "@/components/capture/quickAdd";
import { TaskRow } from "@/components/tasks/TaskRow";
import { DAY, startOfDay, toastError, useNow } from "@/lib/ui";
import { Button, cn, Input, Select } from "@/components/ui/primitives";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/ui/states";

const GROUPS = ["Overdue", "Today", "Next 7 days", "Later", "No date"] as const;

function groupOf(t: Task, today: number): (typeof GROUPS)[number] {
  if (t.due === null) return "No date";
  const overdue = t.dueHasTime ? t.due < Date.now() : t.due < today;
  if (overdue) return "Overdue";
  if (t.due < today + DAY) return "Today";
  if (t.due < today + 8 * DAY) return "Next 7 days";
  return "Later";
}

export default function TasksPage() {
  const { docs: tasks, loaded } = useLive("tasks");
  const { docs: projects } = useLive("projects");
  const areas = useAreas();
  const [text, setText] = useState("");
  const [project, setProject] = useState("");
  const [area, setArea] = useState("");
  const [priority, setPriority] = useState("");
  const [showDone, setShowDone] = useState(false);

  const filtered = useMemo(
    () => tasks.filter((t) => (!project || t.projectId === project) && (!area || t.areaId === area) && (!priority || t.priority === Number(priority))),
    [tasks, project, area, priority],
  );
  const now = useNow();
  const groups = useMemo(() => {
    const today = startOfDay();
    const map = new Map<string, Task[]>(GROUPS.map((g) => [g, []]));
    for (const t of filtered.filter((t) => t.status !== "done")) map.get(groupOf(t, today))!.push(t);
    for (const list of map.values()) list.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.priority - b.priority || b.createdAt - a.createdAt);
    const done = filtered.filter((t) => t.status === "done" && (t.completedAt ?? 0) > now - 30 * DAY).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { map, done };
  }, [filtered, now]);

  const add = async () => {
    if (!text.trim()) return;
    try {
      await createTask(text, { areas }, { projectId: project || null });
      setText("");
      toast.success("Task added");
    } catch (e) {
      toastError(e);
    }
  };
  const openCount = filtered.filter((t) => t.status !== "done").length;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Tasks" subtitle={loaded ? `${openCount} open` : undefined} />
      <div className="space-y-2 border-b px-4 py-3 md:px-6">
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task… e.g. submit proposal fri 5pm !1 #PersonalHub" aria-label="New task" className="flex-1" />
          <Button type="submit" variant="primary" disabled={!text.trim()}>Add</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project" className="h-8 w-40 text-[13px]">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filter by area" className="h-8 w-36 text-[13px]">
            <option value="">All areas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority" className="h-8 w-36 text-[13px]">
            <option value="">Any priority</option><option value="1">High</option><option value="2">Medium</option><option value="3">Low</option>
          </Select>
        </div>
      </div>
      {!loaded ? <ListSkeleton /> : !tasks.length ? (
        <EmptyState icon={<CheckSquare />} title="No tasks yet" description="Type a task above — dates like “tomorrow 9am” and priorities like !1 are understood." />
      ) : (
        <div className="pb-8">
          {GROUPS.map((g) => {
            const list = groups.map.get(g)!;
            if (!list.length) return null;
            return (
              <section key={g}>
                <h2 className={cn("sticky top-12 z-10 flex items-center gap-2 border-b bg-background/95 px-4 pt-4 pb-1.5 text-xs font-medium backdrop-blur md:top-0 md:px-6", g === "Overdue" ? "text-destructive" : "text-muted-foreground")}>
                  {g} <span className="tabular-nums">{list.length}</span>
                </h2>
                <ul>{list.map((t) => <TaskRow key={t.id} task={t} projects={projects} />)}</ul>
              </section>
            );
          })}
          {openCount === 0 ? <p className="px-6 py-8 text-center text-[13px] text-muted-foreground">All done. Nice.</p> : null}
          {groups.done.length ? (
            <section>
              <button onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex w-full items-center gap-1.5 border-b px-4 pt-4 pb-1.5 text-xs font-medium text-muted-foreground md:px-6">
                <ChevronRight className={cn("size-3.5 transition-transform", showDone && "rotate-90")} /> Done · last 30 days <span className="tabular-nums">{groups.done.length}</span>
              </button>
              {showDone ? <ul>{groups.done.map((t) => <TaskRow key={t.id} task={t} projects={projects} />)}</ul> : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
