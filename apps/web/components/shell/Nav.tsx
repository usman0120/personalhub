"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot, CheckSquare, FolderKanban, Home, Inbox, KeyRound, Library, LogOut, Menu as MenuIcon, Moon, Plus, Search,
  Settings, Sun, Trash2, Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useHub } from "@/components/providers/HubProvider";
import { useItems } from "@/lib/data/hooks";
import { updateSettings } from "@/lib/data/repos";
import { Button, cn, Kbd } from "@/components/ui/primitives";
import { Menu, MenuItem, MenuSeparator, Sheet } from "@/components/ui/overlay";
import { useUi } from "./UiProvider";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/library", label: "Library", icon: Library },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/accounts", label: "Accounts", icon: KeyRound },
  { href: "/assistant", label: "Assistant", icon: Bot },
];
const SECONDARY = [
  { href: "/import", label: "Import", icon: Upload },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/settings/general", label: "Settings", icon: Settings },
];

function useInboxCount() {
  const { items } = useItems();
  return items.filter((i) => i.status === "inbox").length;
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href.split("/").slice(0, 2).join("/")));

function NavLink({ href, label, icon: Icon, badge, onClick }: { href: string; label: string; icon: typeof Home; badge?: number; onClick?: () => void }) {
  const path = usePathname();
  const active = isActive(path, href);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      <span className="flex-1 truncate">{label}</span>
      {badge ? <span className="text-[11px] tabular-nums text-muted-foreground">{badge}</span> : null}
    </Link>
  );
}

function UserMenu() {
  const { user, signOutNow } = useHub();
  const { resolvedTheme, setTheme } = useTheme();
  const initial = (user?.displayName ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <Menu
      align="start"
      trigger={
        <button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent/60" aria-label="Account menu">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{initial}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{user?.email}</span>
        </button>
      }
    >
      <MenuItem icon={resolvedTheme === "dark" ? <Sun /> : <Moon />} onSelect={() => { const t = resolvedTheme === "dark" ? "light" : "dark"; setTheme(t); void updateSettings({ theme: t }); }}>
        {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<LogOut />} onSelect={() => void signOutNow()}>
        Sign out
      </MenuItem>
    </Menu>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const inbox = useInboxCount();
  const { setPaletteOpen, setCaptureOpen } = useUi();
  return (
    <div className="flex h-full flex-col gap-1 p-2">
      <div className="flex h-10 items-center gap-2 px-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">P</span>
        <span className="text-sm font-semibold tracking-tight">PersonalHub</span>
      </div>
      <div className="flex gap-1 px-0.5 pb-2">
        <Button size="sm" variant="outline" className="flex-1 justify-start text-muted-foreground" onClick={() => { onNavigate?.(); setPaletteOpen(true); }}>
          <Search /> <span className="flex-1 text-left">Search</span> <Kbd>Ctrl K</Kbd>
        </Button>
        <Button size="icon-sm" variant="primary" aria-label="Quick capture (N)" onClick={() => { onNavigate?.(); setCaptureOpen(true); }}>
          <Plus />
        </Button>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.href} {...n} badge={n.href === "/inbox" ? inbox : undefined} onClick={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        {SECONDARY.map((n) => (
          <NavLink key={n.href} {...n} onClick={onNavigate} />
        ))}
        <div className="mt-1 border-t pt-1">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r bg-sidebar lg:block">
      <SidebarBody />
    </aside>
  );
}

/** Tablet/mobile top bar with a slide-in sidebar. */
export function TopBar() {
  const [open, setOpen] = useState(false);
  const { setPaletteOpen } = useUi();
  return (
    <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur lg:hidden">
      <Button size="icon" variant="ghost" aria-label="Open menu" onClick={() => setOpen(true)}>
        <MenuIcon />
      </Button>
      <span className="text-sm font-semibold">PersonalHub</span>
      <Button size="icon" variant="ghost" className="ml-auto" aria-label="Search" onClick={() => setPaletteOpen(true)}>
        <Search />
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" className="right-auto left-0 max-w-64 border-r border-l-0 bg-sidebar sm:max-w-64">
        <SidebarBody onNavigate={() => setOpen(false)} />
      </Sheet>
    </div>
  );
}

/** Mobile bottom nav: Home, Inbox, +, Library, More. */
export function BottomNav() {
  const path = usePathname();
  const inbox = useInboxCount();
  const { setCaptureOpen } = useUi();
  const tab = (href: string, label: string, Icon: typeof Home, badge?: number) => (
    <Link
      href={href}
      className={cn("relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px]", isActive(path, href) ? "text-foreground" : "text-muted-foreground")}
    >
      <Icon className="size-5" strokeWidth={isActive(path, href) ? 2.2 : 1.8} />
      {label}
      {badge ? <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 backdrop-blur md:hidden" aria-label="Mobile">
      {tab("/", "Home", Home)}
      {tab("/inbox", "Inbox", Inbox, inbox)}
      <button onClick={() => setCaptureOpen(true)} className="flex h-14 flex-1 items-center justify-center" aria-label="Quick capture">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <Plus className="size-5" />
        </span>
      </button>
      {tab("/library", "Library", Library)}
      <MoreButton />
    </nav>
  );
}

function MoreButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
        <MenuIcon className="size-5" strokeWidth={1.8} />
        More
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" className="max-w-72 sm:max-w-72">
        <SidebarBody onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
