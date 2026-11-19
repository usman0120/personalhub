"use client";

import { Check, Sparkles, X } from "lucide-react";
import type { Item } from "@personalhub/shared";
import { applyRules } from "@personalhub/shared";
import { useAreaMap } from "@/lib/data/hooks";
import { useCollection } from "@/lib/data/store";
import { stores } from "@/lib/data/repos";
import { acceptSuggestion, rejectSuggestion, type ChipField } from "@/lib/data/itemActions";
import { updateItem } from "@/lib/data/repos";
import { cleanTags } from "@personalhub/shared";
import { cn } from "@/components/ui/primitives";
import { KIND_LABEL } from "./bits";

function Chip({ label, value, onAccept, onReject, solid, title }: { label: string; value: string; onAccept: () => void; onReject?: () => void; solid?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-7 max-w-full items-center overflow-hidden rounded-md text-xs",
        solid ? "bg-secondary" : "border border-dashed border-primary/50 bg-primary/[0.04]",
      )}
    >
      <button type="button" onClick={onAccept} className="flex h-full min-w-0 items-center gap-1 pr-1.5 pl-2 hover:bg-accent" aria-label={`Accept ${label}: ${value}`}>
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate font-medium">{value}</span>
        <Check className="size-3 text-muted-foreground" />
      </button>
      {onReject ? (
        <button type="button" onClick={onReject} className="flex h-full items-center border-l border-dashed border-primary/30 px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Reject ${label}`}>
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/** Rule suggestions (solid) for items whose fields differ from what rules would set now, and AI suggestions (outlined). */
export function SuggestionChips({ item, compact }: { item: Item; compact?: boolean }) {
  const areas = useAreaMap();
  const rules = useCollection(stores.rules).docs;
  const r = applyRules(
    { url: item.url, domain: item.domain, title: item.title, text: [item.note, item.selection, item.description].join("\n"), platform: item.platform, kind: item.kind, source: item.source },
    rules,
  );
  const ruleArea = r.areaId && r.areaId !== item.areaId ? r.areaId : null;
  const ruleTags = r.tags.filter((t) => !item.tags.includes(t));
  const s = item.ai.status === "suggested" || item.ai.status === "partially-accepted" ? item.ai.suggestion : undefined;
  const aiTags = s?.tags?.filter((t) => !item.tags.includes(t)) ?? [];
  const conf = s ? `${Math.round(s.confidence * 100)}% confidence · ${item.ai.model ?? "AI"}` : undefined;

  const accept = (f: ChipField, tags?: string[]) => void acceptSuggestion(item, [f], tags);
  if (!ruleArea && !ruleTags.length && !s) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
      {ruleArea ? <Chip solid label="Area" value={areas.get(ruleArea)?.name ?? ruleArea} title="From rules" onAccept={() => void updateItem(item.id, { areaId: ruleArea })} /> : null}
      {ruleTags.map((t) => (
        <Chip key={`r-${t}`} solid label="Tag" value={`#${t}`} title="From rules" onAccept={() => void updateItem(item.id, { tags: cleanTags([...item.tags, t]) })} />
      ))}
      {s ? (
        <>
          <Sparkles className="ml-0.5 size-3.5 text-primary" aria-label="AI suggestions" />
          {s.areaId && s.areaId !== item.areaId ? <Chip title={conf} label="Area" value={areas.get(s.areaId)?.name ?? s.areaId} onAccept={() => accept("areaId")} onReject={() => void rejectSuggestion(item, "areaId")} /> : null}
          {aiTags.map((t) => (
            <Chip key={`a-${t}`} title={conf} label="Tag" value={`#${t}`} onAccept={() => accept("tags", [t])} onReject={() => void rejectSuggestion(item, "tags", t)} />
          ))}
          {s.kind && s.kind !== item.kind ? <Chip title={conf} label="Kind" value={KIND_LABEL[s.kind]} onAccept={() => accept("kind")} onReject={() => void rejectSuggestion(item, "kind")} /> : null}
          {s.title && s.title !== item.title && !compact ? <Chip title={conf} label="Title" value={s.title} onAccept={() => accept("title")} onReject={() => void rejectSuggestion(item, "title")} /> : null}
          {s.description && s.description !== item.description && !compact ? <Chip title={conf} label="Description" value={s.description} onAccept={() => accept("description")} onReject={() => void rejectSuggestion(item, "description")} /> : null}
          {s.tasks?.length && !compact ? <Chip title={conf} label="Tasks" value={s.tasks.map((t) => t.title).join(", ")} onAccept={() => accept("tasks")} onReject={() => void rejectSuggestion(item, "tasks")} /> : null}
          <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(s.confidence * 100)}%</span>
        </>
      ) : null}
    </div>
  );
}

/** Applies everything suggested (rules + AI). */
export async function acceptAll(item: Item, rules: Parameters<typeof applyRules>[1]) {
  const r = applyRules(
    { url: item.url, domain: item.domain, title: item.title, text: [item.note, item.selection, item.description].join("\n"), platform: item.platform, kind: item.kind, source: item.source },
    rules,
  );
  const patch: Partial<Item> = {};
  if (r.areaId && !item.areaId) patch.areaId = r.areaId;
  if (r.tags.some((t) => !item.tags.includes(t))) patch.tags = cleanTags([...item.tags, ...r.tags]);
  const merged = { ...item, ...patch };
  if (Object.keys(patch).length) await updateItem(item.id, patch);
  if (item.ai.suggestion && (item.ai.status === "suggested" || item.ai.status === "partially-accepted")) await acceptSuggestion(merged);
}
