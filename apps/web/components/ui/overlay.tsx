"use client";

import { Dialog as D, DropdownMenu as M, Popover as P, Tooltip as T } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./primitives";

export function Dialog({
  open, onOpenChange, title, description, children, footer, className,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: ReactNode;
  children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in" />
        <D.Content
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col rounded-lg border bg-popover text-popover-foreground shadow-xl outline-none",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-[15px] font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[13px] text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="-mr-1 rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Right-side drawer (full screen on mobile). */
export function Sheet({ open, onOpenChange, title, children, className }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content
          className={cn("fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-2xl outline-none sm:max-w-xl", className)}
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">{title}</D.Title>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={4}
          className="z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ children, onSelect, danger, icon }: { children: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] outline-none select-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground",
        danger && "text-destructive [&_svg]:text-destructive",
      )}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export function MenuSub({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <M.Sub>
      <M.SubTrigger className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] outline-none data-[highlighted]:bg-accent data-[state=open]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {label}
      </M.SubTrigger>
      <M.Portal>
        <M.SubContent className="scrollbar-thin z-50 max-h-72 min-w-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">{children}</M.SubContent>
      </M.Portal>
    </M.Sub>
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;

export function Popover({ trigger, children, className, align = "start", open, onOpenChange }: { trigger: ReactNode; children: ReactNode; className?: string; align?: "start" | "end" | "center"; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content align={align} sideOffset={4} className={cn("z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg outline-none", className)}>
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export function Tip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "right" | "left" }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 rounded bg-foreground px-2 py-1 text-[11px] text-background shadow">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TipProvider = T.Provider;
