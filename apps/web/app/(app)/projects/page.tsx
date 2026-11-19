"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { NewProjectDialog } from "@/components/projects/NewProjectDialog";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, FolderKanban, Plus } from "lucide-react";
import type { Project } from "@personalhub/shared";
import { useAreaMap, useLive } from "@/lib/data/hooks";
import { relativeTime, shortDate } from "@/lib/ui";
import { Button } from "@/components/ui/primitives";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/ui/states";

const GROUPS: Array<{ status: Project["status"]; label: string }> = [
  { status: "active", label: "Active" },
  { status: "paused", label: "Paused" },
  { status: "idea", label: "Ideas" },
  { status: "done", label: "Done" },
];

function ProjectsScreen() {
  const { docs, loaded } = useLive("projects");
  const { docs: tasks } = useLive("tasks");
  const areas = useAreaMap();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);
  const stats = useMemo(() => {
    const m = new Map<string, { open: number; total: number }>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      const s = m.get(t.projectId) ?? { open: 0, total: 0 };
      s.total++;
      if (t.status !== "done") s.open++;
      m.set(t.projectId, s);
    }
    return m;
  }, [tasks]);
  const active = docs.filter((p) => p.status === "active").length;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Projects" actions={<Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus /> New project</Button>} />
      {active > 2 ? (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2 text-[13px] md:px-6"><AlertTriangle className="size-4 text-warning" /> {active} active projects. Focus beats breadth — pause what can wait.</div>
      ) : null}
      {!loaded ? <ListSkeleton /> : !docs.length ? (
        <EmptyState icon={<FolderKanban />} title="No projects yet" description="Projects group tasks, links and decisions." action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}>New project</Button>} />
      ) : (
        <div className="space-y-6 px-4 py-5 md:px-6">
          {GROUPS.map((g) => {
            const list = docs.filter((p) => p.status === g.status).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
            if (!list.length) return null;
            return (
              <section key={g.status}>
                <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label} <span className="tabular-nums">{list.length}</span></h2>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((p) => {
                    const s = stats.get(p.id);
                    const area = p.areaId ? areas.get(p.areaId) : null;
                    return (
                      <Link key={p.id} href={`/projects/${p.id}`} className="rounded-lg border bg-card px-3.5 py-3 transition-colors hover:border-foreground/20">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                          <span className="truncate text-sm font-medium">{p.name}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                          {area ? <span>{area.name}</span> : null}
                          <span>{s?.open ?? 0} open tasks</span>
                          {p.deadline ? <span className={p.deadline < Date.now() ? "text-destructive" : ""}>Due {shortDate(p.deadline)}</span> : null}
                          <span className="ml-auto">{relativeTime(p.lastActivityAt)}</span>
                        </div>
                        {s?.total ? (
                          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary/70" style={{ width: `${((s.total - s.open) / s.total) * 100}%` }} />
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {docs.some((p) => p.status === "archived") ? <p className="text-xs text-muted-foreground">{docs.filter((p) => p.status === "archived").length} archived projects hidden.</p> : null}
        </div>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ProjectsScreen />
    </Suspense>
  );
}
