"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Archive, Bookmark, Check, CheckCheck, Inbox as InboxIcon, Pause, Play, Sparkles, Trash2, X } from "lucide-react";
import { PLATFORM_LABELS, type Item } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useAreaMap, useItems } from "@/lib/data/hooks";
import { useCollection } from "@/lib/data/store";
import { stores } from "@/lib/data/repos";
import { requestSuggestion, setStatus, trashItems } from "@/lib/data/itemActions";
import { useUi } from "@/components/shell/UiProvider";
import { ItemRow } from "@/components/item/ItemRow";
import { ItemDetail } from "@/components/item/ItemDetail";
import { acceptAll, SuggestionChips } from "@/components/item/Suggestions";
import { AiBadge, AreaChip, ItemIcon, itemSubtitle } from "@/components/item/bits";
import { isTypingTarget, toastError } from "@/lib/ui";
import { Button, cn, Kbd, Select } from "@/components/ui/primitives";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";

function useBatchAi() {
  const [state, setState] = useState<{ total: number; done: number; running: boolean; waitUntil?: number } | null>(null);
  const queue = useRef<string[]>([]);
  const paused = useRef(false);

  const loop = useCallback(async () => {
    while (queue.current.length && !paused.current) {
      const id = queue.current[0]!;
      try {
        const r = await requestSuggestion(id);
        if (!r.ok) {
          const until = Date.now() + (r.retryAfter ?? 30) * 1000;
          setState((s) => s && { ...s, waitUntil: until });
          await new Promise((res) => setTimeout(res, until - Date.now()));
          setState((s) => s && { ...s, waitUntil: undefined });
          continue;
        }
      } catch (e) {
        toastError(e);
        if ((e as { code?: string }).code === "AI_NOT_CONFIGURED") {
          queue.current = [];
          break;
        }
      }
      queue.current.shift();
      setState((s) => s && { ...s, done: s.done + 1 });
    }
    setState((s) => s && { ...s, running: false });
  }, []);

  return {
    state,
    start: (ids: string[]) => {
      queue.current = ids.slice(0, 20);
      paused.current = false;
      setState({ total: queue.current.length, done: 0, running: true });
      void loop();
    },
    pause: () => {
      paused.current = true;
    },
    resume: () => {
      paused.current = false;
      setState((s) => s && { ...s, running: true });
      void loop();
    },
    cancel: () => {
      queue.current = [];
      paused.current = true;
      setState(null);
    },
  };
}

function InboxScreen() {
  const params = useSearchParams();
  const settings = useSettings();
  const { items, loaded, error } = useItems();
  const rules = useCollection(stores.rules).docs;
  const areas = useAreaMap();
  const { openItem } = useUi();
  const [source, setSource] = useState(params.get("source") ?? "");
  const [platform, setPlatform] = useState("");
  const [onlyAi, setOnlyAi] = useState(false);
  const importId = params.get("import");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<string | null>(null);
  const batch = useBatchAi();

  const list = useMemo(
    () =>
      items
        .filter((i) => i.status === "inbox")
        .filter((i) => !source || i.source === source)
        .filter((i) => !platform || i.platform === platform)
        .filter((i) => !onlyAi || i.ai.status === "suggested" || i.ai.status === "partially-accepted")
        .filter((i) => !importId || i.rulesApplied.includes(`import:${importId}`))
        .sort((a, b) => b.capturedAt - a.capturedAt),
    [items, source, platform, onlyAi, importId],
  );
  const active = list.find((i) => i.id === activeId) ?? list[0] ?? null;
  const activeIndex = active ? list.indexOf(active) : -1;

  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  const targets = useCallback(() => (selected.size ? [...selected] : active ? [active.id] : []), [selected, active]);
  const advance = useCallback(() => {
    const next = list[activeIndex + 1] ?? list[activeIndex - 1];
    setActiveId(next?.id ?? null);
  }, [list, activeIndex]);

  const act = useCallback(
    async (kind: "keep" | "archive" | "delete" | "accept" | "ai") => {
      const ids = targets();
      if (!ids.length) return;
      if (kind !== "ai") advance();
      setSelected(new Set());
      if (kind === "keep") await setStatus(ids, "active");
      else if (kind === "archive") await setStatus(ids, "archived");
      else if (kind === "delete") await trashItems(ids);
      else if (kind === "accept") {
        for (const id of ids) {
          const it = stores.items.get(id);
          if (it) await acceptAll(it, rules);
        }
        await setStatus(ids, "active", ids.length > 1 ? `Accepted ${ids.length} items` : "Accepted and kept");
      } else if (kind === "ai") {
        if (!settings.ai.enabled) return void toast.error("Turn on AI in Settings › AI first");
        if (ids.length > 1) return batch.start(ids);
        toast.promise(requestSuggestion(ids[0]!, true), { loading: "Asking AI…", success: (r) => (r.ok ? "Suggestions ready" : `Rate limited, retry in ${r.retryAfter}s`), error: (e) => (e as Error).message });
      }
    },
    [targets, advance, rules, settings.ai.enabled, batch],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        a: () => void act("accept"),
        k: () => void act("keep"),
        r: () => void act("archive"),
        d: () => void act("delete"),
        s: () => void act("ai"),
        e: () => active && openItem(active.id),
        j: () => setActiveId(list[Math.min(activeIndex + 1, list.length - 1)]?.id ?? null),
        arrowdown: () => setActiveId(list[Math.min(activeIndex + 1, list.length - 1)]?.id ?? null),
        arrowup: () => setActiveId(list[Math.max(activeIndex - 1, 0)]?.id ?? null),
        escape: () => setSelected(new Set()),
        x: () => active && setSelected((s) => { const n = new Set(s); if (n.has(active.id)) n.delete(active.id); else n.add(active.id); return n; }),
      };
      const fn = map[k];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, active, activeIndex, list, openItem]);

  useEffect(() => {
    if (activeId) document.querySelector(`[data-item-id="${activeId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const onSelect = (item: Item, checked: boolean, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked.current) {
        const a = list.findIndex((i) => i.id === lastClicked.current);
        const b = list.findIndex((i) => i.id === item.id);
        for (const i of list.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(i.id);
      } else if (checked) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    lastClicked.current = item.id;
  };

  const platforms = [...new Set(items.filter((i) => i.status === "inbox").map((i) => i.platform))];

  const actionBar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="primary" onClick={() => void act("accept")}><CheckCheck /> Accept all <Kbd className="hidden border-white/30 bg-white/10 text-primary-foreground md:inline-flex">A</Kbd></Button>
      <Button size="sm" variant="outline" onClick={() => void act("keep")}><Bookmark /> Keep <Kbd className="hidden md:inline-flex">K</Kbd></Button>
      <Button size="sm" variant="outline" onClick={() => void act("archive")}><Archive /> Archive <Kbd className="hidden md:inline-flex">R</Kbd></Button>
      <Button size="sm" variant="outline" onClick={() => void act("delete")} className="text-destructive"><Trash2 /> Delete <Kbd className="hidden md:inline-flex">D</Kbd></Button>
      <Button size="sm" variant="ghost" onClick={() => void act("ai")}><Sparkles /> Ask AI <Kbd className="hidden md:inline-flex">S</Kbd></Button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Inbox"
        subtitle={list.length ? `${list.length} to triage` : undefined}
        actions={
          settings.ai.enabled && list.length ? (
            <Button size="sm" variant="outline" disabled={batch.state?.running} onClick={() => batch.start(list.filter((i) => i.ai.status === "none" || i.ai.status === "error").map((i) => i.id))}>
              <Sparkles /> Process with AI
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
        <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source" className="h-8 w-36 text-[13px]">
          <option value="">All sources</option>
          {["share", "extension", "import", "web", "api", "assistant"].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
        </Select>
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform" className="h-8 w-36 text-[13px]">
          <option value="">All platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </Select>
        <Button size="sm" variant={onlyAi ? "secondary" : "ghost"} aria-pressed={onlyAi} onClick={() => setOnlyAi((v) => !v)}>
          <Sparkles /> Has suggestion
        </Button>
        {importId ? <span className="text-xs text-muted-foreground">Filtered to this import</span> : null}
        <span className="ml-auto hidden text-[11px] text-muted-foreground lg:inline">
          <Kbd>J</Kbd>/<Kbd>↑</Kbd> move · <Kbd>X</Kbd> select · <Kbd>E</Kbd> edit
        </span>
      </div>

      {batch.state ? (
        <div className="flex items-center gap-3 border-b bg-surface px-4 py-2 text-[13px] md:px-6">
          <Sparkles className="size-4 text-primary" />
          <span className="tabular-nums">AI {batch.state.done}/{batch.state.total}{batch.state.waitUntil ? " · waiting for rate limit" : ""}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(batch.state.done / Math.max(1, batch.state.total)) * 100}%` }} />
          </div>
          {batch.state.done < batch.state.total ? (
            batch.state.running ? <Button size="icon-sm" variant="ghost" aria-label="Pause" onClick={batch.pause}><Pause /></Button> : <Button size="icon-sm" variant="ghost" aria-label="Resume" onClick={batch.resume}><Play /></Button>
          ) : <Check className="size-4 text-success" />}
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={batch.cancel}><X /></Button>
        </div>
      ) : null}

      {selected.size ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/[0.04] px-4 py-2 md:px-6">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          {actionBar}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      {error ? <ErrorState message={error.message} onRetry={() => location.reload()} /> : !loaded ? <ListSkeleton /> : !list.length ? (
        <EmptyState icon={<InboxIcon />} title="Inbox zero." description="Captured things land here." />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* List (desktop) */}
          <div className="scrollbar-thin hidden min-h-0 w-full overflow-y-auto lg:block lg:w-[420px] lg:shrink-0 lg:border-r xl:w-[460px]" role="listbox" aria-label="Inbox items">
            {list.map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                area={i.areaId ? areas.get(i.areaId) : null}
                active={i.id === active?.id}
                selected={selected.has(i.id)}
                selectable
                selectedIds={[...selected]}
                onSelect={onSelect}
                onOpen={(it, e) => (e.shiftKey ? onSelect(it, !selected.has(it.id), true) : setActiveId(it.id))}
              />
            ))}
          </div>
          {/* Detail (desktop) / card stack (mobile) */}
          {active ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="space-y-2.5 border-b px-4 py-3 md:px-5">
                <div className="flex items-center gap-2 lg:hidden">
                  <ItemIcon item={active} />
                  <span className="text-[11px] text-muted-foreground">{activeIndex + 1} of {list.length} · {itemSubtitle(active)}</span>
                  <AreaChip area={active.areaId ? areas.get(active.areaId) : null} />
                  <AiBadge item={active} />
                </div>
                <SuggestionChips item={active} />
                {!selected.size ? actionBar : null}
              </div>
              <div className="min-h-0 flex-1">
                <ItemDetail key={active.id} id={active.id} />
              </div>
              <div className="flex border-t lg:hidden">
                <Button variant="ghost" className="h-11 flex-1 rounded-none" disabled={activeIndex <= 0} onClick={() => setActiveId(list[activeIndex - 1]?.id ?? null)}>Previous</Button>
                <Button variant="ghost" className={cn("h-11 flex-1 rounded-none border-l")} disabled={activeIndex >= list.length - 1} onClick={() => setActiveId(list[activeIndex + 1]?.id ?? null)}>Skip</Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <InboxScreen />
    </Suspense>
  );
}
