"use client";

import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bot, CheckSquare, ClipboardPaste, FileText, FolderKanban, Home, Inbox, KeyRound, Library, Plus, Settings, Trash2, Upload,
} from "lucide-react";
import { useSearchIndex } from "@/lib/search";
import { useUi } from "./UiProvider";

const NAV = [
  { label: "Home", href: "/", icon: Home },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Library", href: "/library", icon: Library },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Accounts", href: "/accounts", icon: KeyRound },
  { label: "Assistant", href: "/assistant", icon: Bot },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Trash", href: "/trash", icon: Trash2 },
  { label: "Settings", href: "/settings/general", icon: Settings },
];

const TYPE_LABEL = { item: "Item", project: "Project", task: "Task", account: "Account" } as const;

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openItem, setCaptureOpen } = useUi();
  const router = useRouter();
  const index = useSearchIndex();
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.trim() ? index.search(q.trim()).slice(0, 12) : []), [index, q]);

  const close = () => {
    setPaletteOpen(false);
    setQ("");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const actions = [
    { label: "New note", icon: FileText, run: () => { close(); setCaptureOpen(true); } },
    { label: "New task", icon: CheckSquare, run: () => { close(); setCaptureOpen(true, "todo: "); } },
    { label: "New project", icon: FolderKanban, run: () => go("/projects?new=1") },
    { label: "Add account", icon: KeyRound, run: () => go("/accounts?new=1") },
    {
      label: "Paste URL", icon: ClipboardPaste,
      run: async () => {
        let text = "";
        try { text = await navigator.clipboard.readText(); } catch { /* permission denied */ }
        close();
        setCaptureOpen(true, text);
      },
    },
    { label: "Ask assistant", icon: Bot, run: () => go(`/assistant${q ? `?q=${encodeURIComponent(q)}` : ""}`) },
  ];

  const item = "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] data-[selected=true]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground";
  return (
    <D.Root open={paletteOpen} onOpenChange={(v) => (v ? setPaletteOpen(true) : close())}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed top-[10vh] left-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl outline-none" aria-describedby={undefined}>
          <D.Title className="sr-only">Command palette</D.Title>
          <Command shouldFilter={false} loop>
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Search everything or type a command…"
              className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted-foreground">No results for “{q}”.</Command.Empty>
              {results.length ? (
                <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted-foreground">
                  {results.map((r) => (
                    <Command.Item
                      key={r.id}
                      value={r.id}
                      className={item}
                      onSelect={() => {
                        const ref = r.refId as string;
                        if (r.type === "item") { close(); openItem(ref); }
                        else if (r.type === "project") go(`/projects/${ref}`);
                        else if (r.type === "task") go("/tasks");
                        else go(`/accounts?id=${ref}`);
                      }}
                    >
                      <span className="flex-1 truncate">{r.title as string}</span>
                      <span className="text-[11px] text-muted-foreground">{TYPE_LABEL[r.type as keyof typeof TYPE_LABEL]}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted-foreground">
                {actions
                  .filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()) || results.length === 0)
                  .map((a) => (
                    <Command.Item key={a.label} value={`action:${a.label}`} className={item} onSelect={() => void a.run()}>
                      <a.icon /> {a.label}
                    </Command.Item>
                  ))}
              </Command.Group>
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted-foreground">
                {NAV.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())).map((n) => (
                  <Command.Item key={n.href} value={`nav:${n.href}`} className={item} onSelect={() => go(n.href)}>
                    <n.icon /> {n.label}
                  </Command.Item>
                ))}
              </Command.Group>
              {!q ? (
                <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] text-muted-foreground">
                  <Plus className="size-3" /> Press N anywhere to capture
                </div>
              ) : null}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
