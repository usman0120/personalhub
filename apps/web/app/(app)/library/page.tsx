"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  Archive, BookmarkPlus, FolderInput, LayoutGrid, Library as LibraryIcon, List, Search, SlidersHorizontal, Sparkles, Tag, Trash2, X,
} from "lucide-react";
import {
  ITEM_KINDS, PLATFORM_LABELS, shortId, type Item, type LibraryFilter, type Platform,
} from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useAreaMap, useAreas, useItems, useTags } from "@/lib/data/hooks";
import { updateSettings } from "@/lib/data/repos";
import { addTags, moveToArea, requestSuggestion, setStatus, trashItems } from "@/lib/data/itemActions";
import { useItemSearch } from "@/lib/search";
import { useUi } from "@/components/shell/UiProvider";
import { ItemRow } from "@/components/item/ItemRow";
import { AiBadge, AreaChip, ItemIcon, itemSubtitle, KIND_LABEL } from "@/components/item/bits";
import { fromDateInput, relativeTime, toastError, toDateInput } from "@/lib/ui";
import { Button, Checkbox, cn, Input, Select } from "@/components/ui/primitives";
import { Dialog, Menu, MenuItem, Popover } from "@/components/ui/overlay";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/ui/states";

const toggle = <T,>(arr: T[] | undefined, v: T) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);

function applyFilter(items: Item[], f: LibraryFilter, hits: Set<string> | null): Item[] {
  const out = items.filter((i) => {
    if (hits && !hits.has(i.id)) return false;
    const status = f.status ?? "active";
    if (status === "active" && i.status === "archived") return false;
    if (status === "archived" && i.status !== "archived") return false;
    if (f.kinds?.length && !f.kinds.includes(i.kind)) return false;
    if (f.areaIds?.length && !f.areaIds.includes(i.areaId ?? "__none")) return false;
    if (f.tags?.length && !f.tags.every((t) => i.tags.includes(t))) return false;
    if (f.platforms?.length && !f.platforms.includes(i.platform)) return false;
    if (f.from && i.capturedAt < f.from) return false;
    if (f.to && i.capturedAt > f.to) return false;
    if (f.hasNote && !i.note.trim()) return false;
    if (f.pinned && !i.pinned) return false;
    return true;
  });
  const sort = f.sort ?? (hits ? undefined : "newest");
  if (sort === "newest") out.sort((a, b) => b.capturedAt - a.capturedAt);
  else if (sort === "oldest") out.sort((a, b) => a.capturedAt - b.capturedAt);
  else if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "updated") out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

function GridCard({ item, onOpen, selected, onSelect }: { item: Item; onOpen: () => void; selected: boolean; onSelect: (v: boolean) => void }) {
  const areas = useAreaMap();
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()} className={cn("group flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/20", selected && "ring-2 ring-primary/50")}>
      <div className="relative aspect-[1.91/1] bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
        ) : (
          <div className="flex size-full items-center justify-center"><ItemIcon item={item} className="size-6 opacity-60" /></div>
        )}
        <span className={cn("absolute top-2 left-2 rounded bg-background/90 p-0.5", !selected && "opacity-0 group-hover:opacity-100")} onClick={(e) => e.stopPropagation()}>
          <Checkbox label={`Select ${item.title}`} checked={selected} onChange={onSelect} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start gap-1.5">
          <p className="line-clamp-2 flex-1 text-[13px] leading-5 font-medium">{item.title}</p>
          <AiBadge item={item} />
        </div>
        <div className="mt-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <ItemIcon item={item} className="size-3.5" />
          <span className="truncate">{itemSubtitle(item)}</span>
          <AreaChip area={item.areaId ? areas.get(item.areaId) : null} />
          <span className="ml-auto shrink-0">{relativeTime(item.capturedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
function FacetRow({ label, count, active, onClick, dot }: { label: string; count: number; active: boolean; onClick: () => void; dot?: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("flex h-7 items-center gap-2 rounded px-2 text-left text-[13px] hover:bg-accent/60", active && "bg-accent font-medium")}>
      {dot ? <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} /> : null}
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

function LibraryScreen() {
  const params = useSearchParams();
  const settings = useSettings();
  const { items, loaded, error } = useItems();
  const areas = useAreas();
  const areaMap = useAreaMap();
  const tags = useTags();
  const { openItem } = useUi();
  const [filter, setFilter] = useState<LibraryFilter>(() => ({
    kinds: params.get("kind") ? [params.get("kind") as Item["kind"]] : undefined,
    tags: params.get("tag") ? [params.get("tag")!] : undefined,
    areaIds: params.get("area") ? [params.get("area")!] : undefined,
  }));
  const unfurlFailed = params.get("unfurl") === "failed";
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const hits = useItemSearch(filter.q ?? "");

  const base = useMemo(() => (unfurlFailed ? items.filter((i) => i.unfurl.status === "failed") : items), [items, unfurlFailed]);
  const list = useMemo(() => applyFilter(base, filter, hits), [base, filter, hits]);
  const scope = useMemo(() => applyFilter(base, { status: filter.status }, null), [base, filter.status]);
  const counts = useMemo(() => {
    const area = new Map<string, number>();
    const platform = new Map<Platform, number>();
    const tag = new Map<string, number>();
    for (const i of scope) {
      area.set(i.areaId ?? "__none", (area.get(i.areaId ?? "__none") ?? 0) + 1);
      platform.set(i.platform, (platform.get(i.platform) ?? 0) + 1);
      for (const t of i.tags) tag.set(t, (tag.get(t) ?? 0) + 1);
    }
    return { area, platform, tag: [...tag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20) };
  }, [scope]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: list.length, getScrollElement: () => parentRef.current, estimateSize: () => 62, overscan: 12 });

  const set = (patch: Partial<LibraryFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const activeCount = [filter.kinds?.length, filter.areaIds?.length, filter.tags?.length, filter.platforms?.length, filter.from, filter.to, filter.hasNote, filter.pinned, filter.status && filter.status !== "active"].filter(Boolean).length;
  const ids = [...selected];

  const saveView = async () => {
    if (!viewName.trim()) return;
    if (settings.views.length >= 12) return void toast.error("You can save up to 12 views");
    await updateSettings({ views: [...settings.views, { id: shortId(8), name: viewName.trim().slice(0, 40), filter }] }).catch(toastError);
    setSaveOpen(false);
    setViewName("");
    toast.success("View saved");
  };

  const onSelect = (item: Item, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(item.id); else n.delete(item.id); return n; });

  const facets = (
    <div className="space-y-4">
      {settings.views.length ? (
        <Facet title="Saved views">
          {settings.views.map((v) => (
            <div key={v.id} className="group flex items-center">
              <button onClick={() => setFilter(v.filter)} className="flex h-7 flex-1 items-center truncate rounded px-2 text-left text-[13px] hover:bg-accent/60">{v.name}</button>
              <button aria-label={`Delete view ${v.name}`} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground" onClick={() => void updateSettings({ views: settings.views.filter((x) => x.id !== v.id) })}><X className="size-3" /></button>
            </div>
          ))}
        </Facet>
      ) : null}
      <Facet title="Areas">
        {areas.map((a) => <FacetRow key={a.id} label={a.name} dot={a.color} count={counts.area.get(a.id) ?? 0} active={Boolean(filter.areaIds?.includes(a.id))} onClick={() => set({ areaIds: toggle(filter.areaIds, a.id) })} />)}
        <FacetRow label="No area" count={counts.area.get("__none") ?? 0} active={Boolean(filter.areaIds?.includes("__none"))} onClick={() => set({ areaIds: toggle(filter.areaIds, "__none") })} />
      </Facet>
      {counts.tag.length ? (
        <Facet title="Tags">
          {counts.tag.map(([t, c]) => <FacetRow key={t} label={`#${t}`} count={c} active={Boolean(filter.tags?.includes(t))} onClick={() => set({ tags: toggle(filter.tags, t) })} />)}
        </Facet>
      ) : null}
      <Facet title="Platforms">
        {[...counts.platform.entries()].sort((a, b) => b[1] - a[1]).map(([p, c]) => <FacetRow key={p} label={PLATFORM_LABELS[p]} count={c} active={Boolean(filter.platforms?.includes(p))} onClick={() => set({ platforms: toggle(filter.platforms, p) })} />)}
      </Facet>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Library" subtitle={loaded ? `${list.length} of ${items.length} items` : undefined} />
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter.q ?? ""} onChange={(e) => set({ q: e.target.value })} placeholder="Search title, notes, tags, domain…" className="h-8 pl-8 text-[13px]" aria-label="Search library" />
        </div>
        <Popover
          align="end"
          className="w-80"
          trigger={<Button size="sm" variant="outline"><SlidersHorizontal /> Filters{activeCount ? <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{activeCount}</span> : null}</Button>}
        >
          <div className="space-y-3 text-[13px]">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Kind</p>
              <div className="flex flex-wrap gap-1">
                {ITEM_KINDS.map((k) => (
                  <button key={k} onClick={() => set({ kinds: toggle(filter.kinds, k) })} aria-pressed={filter.kinds?.includes(k)} className={cn("h-7 rounded-md border px-2 text-xs", filter.kinds?.includes(k) ? "border-foreground/30 bg-accent font-medium" : "text-muted-foreground")}>{KIND_LABEL[k]}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Status
                <Select value={filter.status ?? "active"} onChange={(e) => set({ status: e.target.value as LibraryFilter["status"] })} className="mt-1 h-8 text-[13px]">
                  <option value="active">Active + inbox</option><option value="archived">Archived</option><option value="all">All</option>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">Sort
                <Select value={filter.sort ?? "newest"} onChange={(e) => set({ sort: e.target.value as LibraryFilter["sort"] })} className="mt-1 h-8 text-[13px]">
                  <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option><option value="updated">Recently updated</option>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">From<Input type="date" value={toDateInput(filter.from)} onChange={(e) => set({ from: fromDateInput(e.target.value) ?? undefined })} className="mt-1 h-8 text-[13px]" /></label>
              <label className="text-xs text-muted-foreground">To<Input type="date" value={toDateInput(filter.to)} onChange={(e) => set({ to: fromDateInput(e.target.value, true) ?? undefined })} className="mt-1 h-8 text-[13px]" /></label>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2"><Checkbox checked={Boolean(filter.hasNote)} onChange={(v) => set({ hasNote: v || undefined })} /> Has note</label>
              <label className="flex items-center gap-2"><Checkbox checked={Boolean(filter.pinned)} onChange={(v) => set({ pinned: v || undefined })} /> Pinned</label>
            </div>
            <div className="lg:hidden">{facets}</div>
            <div className="flex justify-between border-t pt-3">
              <Button size="sm" variant="ghost" onClick={() => setFilter({ q: filter.q })}>Reset</Button>
              <Button size="sm" variant="outline" onClick={() => setSaveOpen(true)}><BookmarkPlus /> Save view</Button>
            </div>
          </div>
        </Popover>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
          <Button size="icon-sm" variant={view === "list" ? "secondary" : "ghost"} className="size-7" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List /></Button>
          <Button size="icon-sm" variant={view === "grid" ? "secondary" : "ghost"} className="size-7" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid /></Button>
        </div>
      </div>

      {selected.size ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-primary/[0.04] px-4 py-2 md:px-6">
          <span className="mr-1 text-[13px] font-medium">{selected.size} selected</span>
          <Menu trigger={<Button size="sm" variant="outline"><FolderInput /> Move</Button>} align="start">
            <MenuItem onSelect={() => void moveToArea(ids, null)}>No area</MenuItem>
            {areas.map((a) => <MenuItem key={a.id} onSelect={() => void moveToArea(ids, a.id)}>{a.name}</MenuItem>)}
          </Menu>
          <Popover trigger={<Button size="sm" variant="outline"><Tag /> Tag</Button>} className="w-60">
            <form onSubmit={(e) => { e.preventDefault(); if (bulkTag.trim()) void addTags(ids, bulkTag.split(/[\s,]+/)); setBulkTag(""); }} className="flex gap-1.5">
              <Input autoFocus value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="tag-name" className="h-8" list="tag-options" />
              <datalist id="tag-options">{tags.slice(0, 50).map((t) => <option key={t.slug} value={t.slug} />)}</datalist>
              <Button size="sm" type="submit" variant="primary">Add</Button>
            </form>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => void setStatus(ids, "archived").then(() => setSelected(new Set()))}><Archive /> Archive</Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => void trashItems(ids).then(() => setSelected(new Set()))}><Trash2 /> Delete</Button>
          {settings.ai.enabled ? (
            <Button size="sm" variant="ghost" onClick={() => { toast.promise((async () => { for (const id of ids.slice(0, 20)) { const r = await requestSuggestion(id); if (!r.ok) throw new Error(`Rate limited. Retry in ${r.retryAfter}s`); } })(), { loading: "Running AI…", success: "Suggestions ready", error: (e) => (e as Error).message }); }}><Sparkles /> Run AI</Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(list.map((i) => i.id)))}>Select all</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="scrollbar-thin hidden w-56 shrink-0 overflow-y-auto border-r p-3 lg:block">{facets}</aside>
        <div ref={parentRef} className="scrollbar-thin min-h-0 min-w-0 flex-1 overflow-y-auto">
          {error ? <ErrorState message={error.message} onRetry={() => location.reload()} /> : !loaded ? <ListSkeleton /> : !list.length ? (
            items.length ? (
              <EmptyState icon={<Search />} title="No matches" description="Try fewer filters or a different search." action={<Button size="sm" variant="outline" onClick={() => setFilter({})}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<LibraryIcon />} title="Your library is empty" description="Capture links and notes, or import your bookmarks." action={<Link href="/import"><Button size="sm" variant="primary">Import bookmarks</Button></Link>} />
            )
          ) : view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4 md:p-6">
              {list.slice(0, 600).map((i) => <GridCard key={i.id} item={i} onOpen={() => openItem(i.id)} selected={selected.has(i.id)} onSelect={(v) => onSelect(i, v)} />)}
            </div>
          ) : (
            <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
              {virtual.getVirtualItems().map((v) => {
                const i = list[v.index]!;
                return (
                  <div key={i.id} data-index={v.index} ref={virtual.measureElement} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${v.start}px)` }}>
                    <ItemRow item={i} area={i.areaId ? areaMap.get(i.areaId) : null} selectable selected={selected.has(i.id)} selectedIds={ids} onSelect={(it, c) => onSelect(it, c)} onOpen={() => openItem(i.id)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen} title="Save view" description="Saves the current filters (max 12 views)." footer={<Button variant="primary" onClick={() => void saveView()}>Save</Button>}>
        <Input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Hosting resources" maxLength={40} onKeyDown={(e) => e.key === "Enter" && void saveView()} />
      </Dialog>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <LibraryScreen />
    </Suspense>
  );
}
