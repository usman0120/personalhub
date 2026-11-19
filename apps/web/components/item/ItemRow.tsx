"use client";

import { memo } from "react";
import { Pin } from "lucide-react";
import type { Area, Item } from "@personalhub/shared";
import { relativeTime } from "@/lib/ui";
import { Checkbox, cn } from "@/components/ui/primitives";
import { AiBadge, AreaChip, ItemIcon, ItemMenu, itemSubtitle, TagList } from "./bits";

interface Props {
  item: Item;
  area?: Area | null;
  active?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onOpen: (item: Item, e: React.MouseEvent) => void;
  onSelect?: (item: Item, checked: boolean, shift: boolean) => void;
  selectedIds?: string[];
}

/** Dense list row: icon · title (2 lines) · domain · area · tags · date · AI badge · menu. */
export const ItemRow = memo(function ItemRow({ item, area, active, selected, selectable, onOpen, onSelect, selectedIds }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-item-id={item.id}
      aria-current={active ? "true" : undefined}
      onClick={(e) => onOpen(item, e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(item, e as unknown as React.MouseEvent);
      }}
      className={cn(
        "group flex cursor-pointer items-start gap-3 border-b px-4 py-2.5 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60 md:px-6",
        active && "bg-accent/70",
        selected && "bg-primary/[0.06]",
      )}
    >
      {selectable ? (
        <span
          className={cn("-m-1 mt-0 flex h-7 items-center p-1", !selected && "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100")}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(item, !selected, e.shiftKey);
          }}
        >
          <Checkbox
            className="pointer-events-none"
            label={`Select ${item.title}`}
            checked={Boolean(selected)}
            onChange={(v) => onSelect?.(item, v, false)}
          />
        </span>
      ) : null}
      <span className="mt-0.5 flex h-5 items-center">
        <ItemIcon item={item} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p className="line-clamp-2 flex-1 text-[13.5px] leading-5 font-medium break-words">{item.title}</p>
          {item.pinned ? <Pin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" /> : null}
          <AiBadge item={item} />
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[11.5px] text-muted-foreground">
          <span className="max-w-40 shrink-0 truncate">{itemSubtitle(item)}</span>
          <AreaChip area={area} />
          <TagList tags={item.tags} />
          <span className="ml-auto shrink-0 tabular-nums">{relativeTime(item.capturedAt)}</span>
        </div>
      </div>
      <div className="-my-1 -mr-2 shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
        <ItemMenu item={item} ids={selected ? selectedIds : undefined} />
      </div>
    </div>
  );
});
