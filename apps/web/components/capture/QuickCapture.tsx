"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, FileText, Lightbulb, Link2 } from "lucide-react";
import { parseQuickAdd } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useAreas } from "@/lib/data/hooks";
import { useUi } from "@/components/shell/UiProvider";
import { toastError } from "@/lib/ui";
import { Button, cn, Kbd } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { saveQuickAdd } from "./quickAdd";

const TYPE_META = {
  link: { icon: Link2, label: "Link" },
  task: { icon: CheckSquare, label: "Task" },
  idea: { icon: Lightbulb, label: "Idea" },
  note: { icon: FileText, label: "Note" },
} as const;

/** Inline quick-capture box (Home) and the global dialog (N / +). */
export function QuickCaptureBox({ autoFocus, initial = "", onSaved, className }: { autoFocus?: boolean; initial?: string; onSaved?: () => void; className?: string }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const settings = useSettings();
  const areas = useAreas();
  const ref = useRef<HTMLTextAreaElement>(null);
  const type = useMemo(() => (text.trim() ? parseQuickAdd(text).type : null), [text]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const r = await saveQuickAdd(text, { areas, aiOnCapture: settings.ai.enabled && settings.ai.suggestOnCapture, defaultAreaId: settings.defaultAreaId });
      toast.success(r.duplicate ? "Already saved — note added" : `${TYPE_META[r.kind as keyof typeof TYPE_META]?.label ?? "Item"} saved${r.kind === "task" ? "" : " to Inbox"}`);
      setText("");
      onSaved?.();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  const Meta = type ? TYPE_META[type] : null;
  return (
    <div className={cn("rounded-lg border bg-card shadow-xs focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20", className)}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        rows={2}
        aria-label="Quick capture"
        placeholder="Paste a link, jot a note…   todo: call client fri 5pm !1   idea: …   #tag @area"
        className="field-sizing-content max-h-60 min-h-16 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center gap-2 px-2 pb-2">
        {Meta ? (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Meta.icon className="size-3" /> {Meta.label}
          </span>
        ) : (
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            <Kbd>Enter</Kbd> save · <Kbd>Shift Enter</Kbd> new line
          </span>
        )}
        <Button size="sm" variant="primary" className="ml-auto" disabled={!text.trim()} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function QuickCaptureDialog() {
  const { captureOpen, setCaptureOpen, captureInitial } = useUi();
  return (
    <Dialog open={captureOpen} onOpenChange={(v) => setCaptureOpen(v)} title="Quick capture" description="Everything lands in your Inbox. Tasks go to Tasks.">
      <QuickCaptureBox autoFocus initial={captureInitial} onSaved={() => setCaptureOpen(false)} className="shadow-none" />
    </Dialog>
  );
}
