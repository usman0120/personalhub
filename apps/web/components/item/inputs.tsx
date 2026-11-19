"use client";

import { useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import { cleanTags } from "@personalhub/shared";
import { useTags } from "@/lib/data/hooks";
import { cn } from "@/components/ui/primitives";

/** Sanitised Markdown renderer (no raw HTML). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-note text-[13.5px]", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{ a: ({ href, children: c }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{c}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Tag combobox: type to filter existing tags, Enter/comma to add (creates new), Backspace removes last. */
export function TagInput({ value, onChange, placeholder = "Add tag…", className, autoFocus }: { value: string[]; onChange: (tags: string[]) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const all = useTags();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const options = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((t) => !value.includes(t.slug) && (!s || t.slug.includes(s) || t.name.toLowerCase().includes(s))).slice(0, 8);
  }, [all, q, value]);

  const add = (raw: string) => {
    const next = cleanTags([...value, raw]);
    if (next.length !== value.length) onChange(next);
    setQ("");
    setHi(0);
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded bg-muted pr-1 pl-1.5 text-xs">
            #{t}
            <button type="button" aria-label={`Remove ${t}`} className="rounded text-muted-foreground hover:text-foreground" onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          role="combobox"
          aria-controls={listId}
          aria-expanded={open && (options.length > 0 || Boolean(q))}
          aria-label="Tags"
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && q.trim()) {
              e.preventDefault();
              add(options[hi] && e.key !== "," ? options[hi]!.slug : q);
            } else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-6 min-w-20 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      {open && (options.length > 0 || q.trim()) ? (
        <div id={listId} role="listbox" className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover p-1 shadow-lg">
          {options.map((o, i) => (
            <button
              key={o.slug}
              type="button"
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o.slug);
              }}
              className={cn("flex h-8 w-full items-center justify-between rounded px-2 text-left text-[13px]", i === hi && "bg-accent")}
            >
              #{o.slug}
              <span className="text-[11px] text-muted-foreground">{o.count}</span>
            </button>
          ))}
          {q.trim() && !options.some((o) => o.slug === cleanTags([q])[0]) ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(q);
              }}
              className="flex h-8 w-full items-center rounded px-2 text-left text-[13px] text-muted-foreground hover:bg-accent"
            >
              Create “{cleanTags([q])[0] ?? q}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Area chips (single select). */
export function AreaPicker({ value, onChange, areas, allowNone = true }: { value: string | null; onChange: (id: string | null) => void; areas: Array<{ id: string; name: string; color: string }>; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Area">
      {allowNone ? (
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={cn("h-8 rounded-md border px-2.5 text-[13px]", value === null ? "border-foreground/30 bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60")}>
          None
        </button>
      ) : null}
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={value === a.id}
          onClick={() => onChange(value === a.id && allowNone ? null : a.id)}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]", value === a.id ? "border-foreground/30 bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60")}
        >
          <span className="size-2 rounded-full" style={{ background: a.color }} />
          {a.name}
        </button>
      ))}
    </div>
  );
}
