"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, FolderKanban, KeyRound, RotateCcw, Trash2 } from "lucide-react";
import { useLive } from "@/lib/data/hooks";
import { purge, restore } from "@/lib/data/repos";
import { ItemIcon } from "@/components/item/bits";
import { DAY, relativeTime, toastError, useNow } from "@/lib/ui";
import { Button } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/ui/states";

type Name = "items" | "projects" | "tasks" | "accounts";
type Row = { name: Name; id: string; title: string; deletedAt: number; icon: React.ReactNode };

export default function TrashPage() {
  const items = useLive("items", true);
  const projects = useLive("projects", true);
  const tasks = useLive("tasks", true);
  const accounts = useLive("accounts", true);
  const now = useNow();
  const [confirm, setConfirm] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => [
    ...items.docs.filter((d) => d.isDeleted).map((d) => ({ name: "items" as const, id: d.id, title: d.title, deletedAt: d.deletedAt ?? 0, icon: <ItemIcon item={d} /> })),
    ...projects.docs.filter((d) => d.isDeleted).map((d) => ({ name: "projects" as const, id: d.id, title: d.name, deletedAt: d.deletedAt ?? 0, icon: <FolderKanban className="size-4 text-muted-foreground" /> })),
    ...tasks.docs.filter((d) => d.isDeleted).map((d) => ({ name: "tasks" as const, id: d.id, title: d.title, deletedAt: d.deletedAt ?? 0, icon: <CheckSquare className="size-4 text-muted-foreground" /> })),
    ...accounts.docs.filter((d) => d.isDeleted).map((d) => ({ name: "accounts" as const, id: d.id, title: d.service, deletedAt: d.deletedAt ?? 0, icon: <KeyRound className="size-4 text-muted-foreground" /> })),
  ].sort((a, b) => b.deletedAt - a.deletedAt), [items.docs, projects.docs, tasks.docs, accounts.docs]);

  const doPurge = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      for (const r of confirm) await purge(r.name, r.id);
      toast.success(`${confirm.length} deleted forever`);
      setConfirm(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Trash"
        subtitle="Items are deleted forever after 30 days."
        actions={rows.length ? <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirm(rows)}><Trash2 /> Empty trash</Button> : null}
      />
      {!items.loaded ? <ListSkeleton /> : !rows.length ? (
        <EmptyState icon={<Trash2 />} title="Trash is empty" description="Deleted items stay here for 30 days." />
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={`${r.name}-${r.id}`} className="flex items-center gap-3 px-4 py-2.5 md:px-6">
              {r.icon}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px]">{r.title}</p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {r.name.slice(0, -1)} · deleted {relativeTime(r.deletedAt)} · {Math.max(0, Math.ceil((r.deletedAt + 30 * DAY - now) / DAY))} days left
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void restore(r.name, r.id).then(() => toast.success("Restored"))}><RotateCcw /> Restore</Button>
              <Button size="icon-sm" variant="ghost" aria-label="Delete forever" className="text-destructive" onClick={() => setConfirm([r])}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(v) => !v && setConfirm(null)}
        title="Delete forever?"
        description={`${confirm?.length ?? 0} ${confirm?.length === 1 ? "entry" : "entries"} will be permanently deleted. This cannot be undone.`}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={() => void doPurge()}>Delete forever</Button></>}
      >
        <p className="text-[13px] text-muted-foreground">Export a backup first if you might need them later.</p>
      </Dialog>
    </div>
  );
}
