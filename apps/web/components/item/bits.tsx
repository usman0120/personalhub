"use client";

import { useState } from "react";
import {
  Archive, ArrowUpRight, Bookmark, Edit3, FileText, FolderInput, Image as ImageIcon, Inbox, Lightbulb,
  Link2, MoreHorizontal, Pin, PinOff, Scale, Sparkles, Tag, Trash2,
} from "lucide-react";
import { PLATFORM_LABELS, type Area, type Item, type ItemKind } from "@personalhub/shared";
import { useAreas } from "@/lib/data/hooks";
import { addTags, moveToArea, setStatus, togglePin, trashItems } from "@/lib/data/itemActions";
import { Badge, Button, cn, Input } from "@/components/ui/primitives";
import { Menu, MenuItem, MenuSeparator, MenuSub, Dialog } from "@/components/ui/overlay";

export const KIND_ICON: Record<ItemKind, typeof Link2> = {
  link: Link2, note: FileText, image: ImageIcon, idea: Lightbulb, decision: Scale,
};
export const KIND_LABEL: Record<ItemKind, string> = {
  link: "Link", note: "Note", image: "Image", idea: "Idea", decision: "Decision",
};

/** Favicon with graceful fallback to the kind icon. */
export function ItemIcon({ item, className }: { item: Pick<Item, "kind" | "faviconUrl">; className?: string }) {
  const [broken, setBroken] = useState(false);
  const Icon = KIND_ICON[item.kind];
  if (item.faviconUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.faviconUrl}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cn("size-4 shrink-0 rounded-sm object-contain", className)}
      />
    );
  }
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} strokeWidth={1.8} />;
}

export function AreaChip({ area }: { area?: Area | null }) {
  if (!area) return null;
  return (
    <span className="inline-flex max-w-32 items-center gap-1 truncate text-[11px] text-muted-foreground">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: area.color }} />
      <span className="truncate">{area.name}</span>
    </span>
  );
}

export function TagList({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {tags.slice(0, max).map((t) => (
        <span key={t} className="truncate text-[11px] text-muted-foreground">#{t}</span>
      ))}
      {tags.length > max ? <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span> : null}
    </span>
  );
}

export const itemSubtitle = (i: Item) =>
  i.domain ? (i.platform !== "web" && i.platform !== "other" ? PLATFORM_LABELS[i.platform] : i.domain) : KIND_LABEL[i.kind];

export function AiBadge({ item }: { item: Item }) {
  if (item.ai.status === "suggested" || item.ai.status === "partially-accepted")
    return <Sparkles className="size-3.5 shrink-0 text-primary" aria-label="AI suggestion pending" />;
  if (item.ai.status === "pending") return <Sparkles className="size-3.5 shrink-0 animate-pulse text-muted-foreground" aria-label="AI working" />;
  return null;
}

function TagPrompt({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (tags: string[]) => void }) {
  const [v, setV] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add tags"
      description="Separate with commas or spaces."
      footer={
        <Button variant="primary" onClick={() => { onSubmit(v.split(/[\s,]+/).filter(Boolean)); setV(""); onOpenChange(false); }}>
          Add
        </Button>
      }
    >
      <Input
        autoFocus
        value={v}
        placeholder="react, free-tier"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSubmit(v.split(/[\s,]+/).filter(Boolean));
            setV("");
            onOpenChange(false);
          }
        }}
      />
    </Dialog>
  );
}

/** Overflow menu shared by cards and the drawer. */
export function ItemMenu({ item, onEdit, ids }: { item: Item; onEdit?: () => void; ids?: string[] }) {
  const areas = useAreas();
  const [tagOpen, setTagOpen] = useState(false);
  const targets = ids?.length ? ids : [item.id];
  return (
    <>
      <Menu
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label="Item actions" onClick={(e) => e.stopPropagation()} className="text-muted-foreground">
            <MoreHorizontal />
          </Button>
        }
      >
        {item.url ? (
          <MenuItem icon={<ArrowUpRight />} onSelect={() => window.open(item.url!, "_blank", "noopener,noreferrer")}>
            Open link
          </MenuItem>
        ) : null}
        {onEdit ? <MenuItem icon={<Edit3 />} onSelect={onEdit}>Edit</MenuItem> : null}
        <MenuItem icon={item.pinned ? <PinOff /> : <Pin />} onSelect={() => void togglePin(item)}>
          {item.pinned ? "Unpin" : "Pin"}
        </MenuItem>
        <MenuSub label="Move to area" icon={<FolderInput />}>
          <MenuItem onSelect={() => void moveToArea(targets, null)}>No area</MenuItem>
          {areas.map((a) => (
            <MenuItem key={a.id} onSelect={() => void moveToArea(targets, a.id)} icon={<span className="size-2 rounded-full" style={{ background: a.color }} />}>
              {a.name}
            </MenuItem>
          ))}
        </MenuSub>
        <MenuItem icon={<Tag />} onSelect={() => setTagOpen(true)}>Add tag</MenuItem>
        <MenuSeparator />
        {item.status !== "active" ? (
          <MenuItem icon={<Bookmark />} onSelect={() => void setStatus(targets, "active")}>Keep</MenuItem>
        ) : (
          <MenuItem icon={<Inbox />} onSelect={() => void setStatus(targets, "inbox")}>Move to Inbox</MenuItem>
        )}
        {item.status !== "archived" ? (
          <MenuItem icon={<Archive />} onSelect={() => void setStatus(targets, "archived")}>Archive</MenuItem>
        ) : null}
        <MenuItem danger icon={<Trash2 />} onSelect={() => void trashItems(targets)}>Delete</MenuItem>
      </Menu>
      <TagPrompt open={tagOpen} onOpenChange={setTagOpen} onSubmit={(t) => void addTags(targets, t)} />
    </>
  );
}

export function PlatformBadge({ item }: { item: Item }) {
  if (item.platform === "web" || item.platform === "other") return null;
  return <Badge>{PLATFORM_LABELS[item.platform]}</Badge>;
}
