"use client";

import { useState } from "react";
import { Calendar, Link2, MoreHorizontal, Trash2 } from "lucide-react";
import type { Project, Task } from "@personalhub/shared";
import { restore, softDelete, updateDocument } from "@/lib/data/repos";
import { useUi } from "@/components/shell/UiProvider";
import { fromDateInput, relativeTime, shortDate, startOfDay, toDateInput, undoToast, useNow } from "@/lib/ui";
import { Button, Checkbox, cn, Input, Select } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlay";

const PRIORITY_COLOR = { 1: "bg-destructive", 2: "bg-warning", 3: "bg-muted-foreground/40" } as const;
const PRIORITY_LABEL = { 1: "High", 2: "Medium", 3: "Low" } as const;

export function TaskRow({ task, projects, showProject = true }: { task: Task; projects: Project[]; showProject?: boolean }) {
  const { openItem } = useUi();
  const [title, setTitle] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const now = useNow();
  const done = task.status === "done";
  const overdue = !done && task.due !== null && task.due < (task.dueHasTime ? now : startOfDay(new Date(now)));
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const update = (patch: Partial<Task>) => void updateDocument("tasks", task.id, patch);
  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== task.title) update({ title: t.slice(0, 300) });
    else setTitle(task.title);
  };

  return (
    <li className="group flex min-h-10 items-center gap-3 border-b px-4 py-1.5 md:px-6">
      <Checkbox label={`Complete ${task.title}`} checked={done} onChange={(v) => update({ status: v ? "done" : "todo", completedAt: v ? Date.now() : null })} />
      <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_COLOR[task.priority])} title={`${PRIORITY_LABEL[task.priority]} priority`} />
      {editing ? (
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setTitle(task.title); setEditing(false); } }} className="h-7 flex-1 text-[13.5px]" aria-label="Task title" />
      ) : (
        <button onClick={() => setEditing(true)} className={cn("min-w-0 flex-1 truncate text-left text-[13.5px]", done && "text-muted-foreground line-through")}>{task.title}</button>
      )}
      {task.itemId ? (
        <button aria-label="Open linked item" onClick={() => openItem(task.itemId)} className="text-muted-foreground hover:text-foreground"><Link2 className="size-3.5" /></button>
      ) : null}
      {showProject && project ? <span className="hidden max-w-32 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">{project.name}</span> : null}
      {task.due ? (
        <span className={cn("shrink-0 text-[11.5px] tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")} title={shortDate(task.due, task.dueHasTime)}>
          {Math.abs(task.due - now) < 6 * 86_400_000 ? relativeTime(task.due) : shortDate(task.due, task.dueHasTime)}
        </span>
      ) : null}
      <Popover
        align="end"
        className="w-64"
        trigger={<Button size="icon-sm" variant="ghost" aria-label="Task options" className="text-muted-foreground md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal /></Button>}
      >
        <div className="space-y-2.5 text-[13px]">
          <label className="block text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="size-3" /> Due</span>
            <div className="mt-1 flex gap-1.5">
              <Input type="date" value={toDateInput(task.due)} onChange={(e) => update({ due: fromDateInput(e.target.value, true), dueHasTime: false })} className="h-8" />
              {task.due ? <Button size="sm" variant="ghost" onClick={() => update({ due: null })}>Clear</Button> : null}
            </div>
          </label>
          <label className="block text-xs text-muted-foreground">Priority
            <Select value={String(task.priority)} onChange={(e) => update({ priority: Number(e.target.value) as 1 | 2 | 3 })} className="mt-1 h-8 text-[13px]">
              <option value="1">High</option><option value="2">Medium</option><option value="3">Low</option>
            </Select>
          </label>
          <label className="block text-xs text-muted-foreground">Project
            <Select value={task.projectId ?? ""} onChange={(e) => update({ projectId: e.target.value || null })} className="mt-1 h-8 text-[13px]">
              <option value="">None</option>
              {projects.filter((p) => !p.isDeleted).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </label>
          <Button size="sm" variant="ghost" className="w-full justify-start text-destructive" onClick={() => { void softDelete("tasks", task.id); undoToast("Task deleted", () => restore("tasks", task.id)); }}>
            <Trash2 /> Delete task
          </Button>
        </div>
      </Popover>
    </li>
  );
}
