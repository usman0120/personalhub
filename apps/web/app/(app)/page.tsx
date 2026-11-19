"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, FolderKanban, KeyRound } from "lucide-react";
import type { Task } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useAreaMap, useItems, useLive } from "@/lib/data/hooks";
import { updateDocument } from "@/lib/data/repos";
import { useUi } from "@/components/shell/UiProvider";
import { QuickCaptureBox } from "@/components/capture/QuickCapture";
import { ItemRow } from "@/components/item/ItemRow";
import { DAY, relativeTime, shortDate, startOfDay, useNow } from "@/lib/ui";
import { Button, Checkbox, cn } from "@/components/ui/primitives";
import { ListSkeleton, Section } from "@/components/ui/states";

function TaskLine({ t }: { t: Task }) {
  const overdue = t.due !== null && t.due < startOfDay();
  return (
    <li className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
      <Checkbox label={`Complete ${t.title}`} checked={t.status === "done"} onChange={(v) => void updateDocument("tasks", t.id, { status: v ? "done" : "todo", completedAt: v ? Date.now() : null })} />
      <span className="flex-1 truncate">{t.title}</span>
      {t.due ? <span className={cn("text-[11px] tabular-nums", overdue ? "text-destructive" : "text-muted-foreground")}>{shortDate(t.due, t.dueHasTime)}</span> : null}
    </li>
  );
}

const card = "rounded-lg border bg-card";

export default function HomePage() {
  const settings = useSettings();
  const { items, loaded } = useItems();
  const { docs: tasks } = useLive("tasks");
  const { docs: projects } = useLive("projects");
  const { docs: accounts } = useLive("accounts");
  const areas = useAreaMap();
  const { openItem } = useUi();

  const now = useNow();
  const data = useMemo(() => {
    const today = startOfDay();
    const open = tasks.filter((t) => t.status !== "done");
    const todayTasks = open.filter((t) => t.due !== null && t.due < today + DAY).sort((a, b) => a.due! - b.due!).slice(0, 7);
    const upcoming = [
      ...open.filter((t) => t.due && t.due >= today + DAY && t.due < now + 30 * DAY).map((t) => ({ id: `t-${t.id}`, date: t.due!, label: t.title, kind: "Task" as const, href: "/tasks" })),
      ...accounts.filter((a) => a.renewalDate && a.renewalDate >= today && a.renewalDate < now + 30 * DAY && a.status !== "closed").map((a) => ({ id: `a-${a.id}`, date: a.renewalDate!, label: `${a.service} renewal`, kind: "Renewal" as const, href: `/accounts?id=${a.id}` })),
    ].sort((a, b) => a.date - b.date).slice(0, 10);
    const active = projects.filter((p) => p.status === "active");
    const sorted = [...items].sort((a, b) => b.capturedAt - a.capturedAt);
    const attention = {
      accounts: accounts.filter((a) => a.status === "active" && (!a.lastReviewedAt || a.lastReviewedAt < now - 90 * DAY)).length,
      ideas: items.filter((i) => i.kind === "idea" && (i.idea?.stage ?? "someday") === "someday" && i.capturedAt < now - 30 * DAY).length,
      failed: items.filter((i) => i.unfurl.status === "failed").length,
    };
    return {
      inbox: items.filter((i) => i.status === "inbox").length,
      todayTasks, upcoming, active,
      pinned: sorted.filter((i) => i.pinned && i.status !== "archived").slice(0, 8),
      recent: sorted.slice(0, 10),
      attention,
      openByProject: (id: string) => open.filter((t) => t.projectId === id).length,
    };
  }, [items, tasks, projects, accounts, now]);

  const backupDue = !settings.lastExportAt || settings.lastExportAt < now - 30 * DAY;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{greeting}</h1>
        <p className="text-[13px] text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <QuickCaptureBox autoFocus={typeof window !== "undefined" && window.innerWidth >= 1024} />

      <div className={cn(card, "flex items-center justify-between gap-3 px-4 py-3")}>
        {data.inbox ? (
          <>
            <div>
              <p className="text-sm font-medium">{data.inbox} in Inbox</p>
              <p className="text-xs text-muted-foreground">Triage takes a few minutes with the keyboard.</p>
            </div>
            <Link href="/inbox"><Button variant="primary" size="sm">Process inbox</Button></Link>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> Inbox zero ✓</p>
        )}
      </div>

      {backupDue && loaded && items.length > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 text-[13px]">
          <Download className="size-4 text-muted-foreground" />
          <span className="flex-1">{settings.lastExportAt ? `Last backup ${relativeTime(settings.lastExportAt)}.` : "You haven't exported a backup yet."}</span>
          <Link href="/settings/data" className="font-medium text-primary hover:underline">Export</Link>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Today & overdue" action={<Link href="/tasks" className="text-xs text-muted-foreground hover:text-foreground">All tasks</Link>}>
          <div className={card}>
            {data.todayTasks.length ? (
              <ul className="divide-y">{data.todayTasks.map((t) => <TaskLine key={t.id} t={t} />)}</ul>
            ) : (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing due today.</p>
            )}
          </div>
        </Section>
        <Section title="Upcoming · 30 days">
          <div className={card}>
            {data.upcoming.length ? (
              <ul className="divide-y">
                {data.upcoming.map((u) => (
                  <li key={u.id}>
                    <Link href={u.href} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-accent/50">
                      {u.kind === "Task" ? <CalendarClock className="size-4 text-muted-foreground" /> : <KeyRound className="size-4 text-muted-foreground" />}
                      <span className="flex-1 truncate">{u.label}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{shortDate(u.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No deadlines or renewals.</p>
            )}
          </div>
        </Section>
      </div>

      <Section title="Active projects" action={<Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">All projects</Link>}>
        {data.active.length > 2 ? (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" /> {data.active.length} active projects — consider pausing some.</p>
        ) : null}
        {data.active.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.active.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className={cn(card, "block px-3 py-2.5 hover:bg-accent/40")}>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: p.color }} />
                  <span className="truncate text-[13px] font-medium">{p.name}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{data.openByProject(p.id)} open tasks · active {relativeTime(p.lastActivityAt)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><FolderKanban className="size-4" /> No active projects.</p>
        )}
      </Section>

      {data.pinned.length ? (
        <Section title="Pinned">
          <div className={cn(card, "overflow-hidden [&>*:last-child]:border-b-0")}>
            {data.pinned.map((i) => <ItemRow key={i.id} item={i} area={i.areaId ? areas.get(i.areaId) : null} onOpen={() => openItem(i.id)} />)}
          </div>
        </Section>
      ) : null}

      <Section title="Recently saved" action={<Link href="/library" className="text-xs text-muted-foreground hover:text-foreground">Library</Link>}>
        <div className={cn(card, "overflow-hidden [&>*:last-child]:border-b-0")}>
          {!loaded ? <ListSkeleton rows={4} /> : data.recent.length ? (
            data.recent.map((i) => <ItemRow key={i.id} item={i} area={i.areaId ? areas.get(i.areaId) : null} onOpen={() => openItem(i.id)} />)
          ) : (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing yet. Paste a link above to start.</p>
          )}
        </div>
      </Section>

      {data.attention.accounts || data.attention.ideas || data.attention.failed ? (
        <Section title="Needs attention">
          <ul className={cn(card, "divide-y text-[13px]")}>
            {data.attention.accounts ? <li><Link href="/accounts?review=1" className="flex px-3 py-2 hover:bg-accent/50">{data.attention.accounts} accounts not reviewed in 90 days</Link></li> : null}
            {data.attention.ideas ? <li><Link href="/library?kind=idea" className="flex px-3 py-2 hover:bg-accent/50">{data.attention.ideas} ideas older than 30 days still “someday”</Link></li> : null}
            {data.attention.failed ? <li><Link href="/library?unfurl=failed" className="flex px-3 py-2 hover:bg-accent/50">{data.attention.failed} items with unreachable links</Link></li> : null}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
