"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, Edit3, KeyRound, MoreHorizontal, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { ACCOUNT_CATEGORIES, faviconFor, getDomain, TWO_FACTOR_TYPES, type Account } from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useLive } from "@/lib/data/hooks";
import { restore, softDelete, updateDocument } from "@/lib/data/repos";
import { AccountForm } from "@/components/accounts/AccountForm";
import { DAY, nowMs, relativeTime, shortDate, undoToast, useNow } from "@/lib/ui";
import { Button, cn, Select } from "@/components/ui/primitives";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/ui/states";

const TWO_FA_TONE: Record<Account["twoFactor"], string> = {
  passkey: "bg-success/15 text-success", "security-key": "bg-success/15 text-success", authenticator: "bg-success/15 text-success",
  sms: "bg-warning/15 text-warning", email: "bg-warning/15 text-warning", none: "bg-destructive/15 text-destructive",
};
const cap = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function monthly(a: Account, pkrPerUsd: number) {
  if (!a.cost || a.status === "closed" || a.cost.cycle === "one-time") return 0;
  const usd = a.cost.currency === "USD" ? a.cost.amount : a.cost.amount / pkrPerUsd;
  return a.cost.cycle === "yearly" ? usd / 12 : usd;
}

function Favicon({ a }: { a: Account }) {
  const src = faviconFor(getDomain(a.url));
  const [ok, setOk] = useState(Boolean(src));
  return ok && src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={16} height={16} referrerPolicy="no-referrer" onError={() => setOk(false)} className="size-4 rounded-sm" />
  ) : <KeyRound className="size-4 text-muted-foreground" />;
}

function AccountsScreen() {
  const settings = useSettings();
  const params = useSearchParams();
  const { docs, loaded } = useLive("accounts");
  const [category, setCategory] = useState("");
  const [twoFa, setTwoFa] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [review, setReview] = useState(params.get("review") === "1");
  const [editing, setEditing] = useState<Account | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") setFormOpen(true);
    const id = params.get("id");
    if (id && loaded) {
      const a = docs.find((d) => d.id === id);
      if (a) { setEditing(a); setFormOpen(true); }
    }
  }, [params, loaded, docs]);

  const now = useNow();
  const needsReview = (a: Account) => a.status !== "closed" && (!a.lastReviewedAt || a.lastReviewedAt < now - 90 * DAY);
  const list = useMemo(
    () => docs
      .filter((a) => (!category || a.category === category) && (!twoFa || a.twoFactor === twoFa) && (!status || a.status === status) && (!owner || a.owner === owner) && (!review || needsReview(a)))
      .sort((a, b) => a.service.localeCompare(b.service)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docs, category, twoFa, status, owner, review, now],
  );
  const summary = useMemo(() => {
    const live = docs.filter((a) => a.status !== "closed");
    const usd = live.reduce((s, a) => s + monthly(a, settings.pkrPerUsd), 0);
    return { total: live.length, no2fa: live.filter((a) => a.twoFactor === "none").length, usd, pkr: usd * settings.pkrPerUsd };
  }, [docs, settings.pkrPerUsd]);

  const markReviewed = (a: Account) => void updateDocument("accounts", a.id, { lastReviewedAt: nowMs() }).then(() => toast.success(`${a.service} reviewed`));
  const remove = (a: Account) => { void softDelete("accounts", a.id); undoToast(`${a.service} moved to Trash`, () => restore("accounts", a.id)); };
  const edit = (a: Account) => { setEditing(a); setFormOpen(true); };

  const rowMenu = (a: Account) => (
    <Menu trigger={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${a.service}`} className="text-muted-foreground"><MoreHorizontal /></Button>}>
      <MenuItem icon={<CalendarCheck />} onSelect={() => markReviewed(a)}>Mark reviewed today</MenuItem>
      <MenuItem icon={<Edit3 />} onSelect={() => edit(a)}>Edit</MenuItem>
      <MenuSeparator />
      <MenuItem danger icon={<Trash2 />} onSelect={() => remove(a)}>Delete</MenuItem>
    </Menu>
  );
  const renewal = (a: Account) => a.renewalDate ? <span className={cn(a.renewalDate < now + 30 * DAY && a.renewalDate > now - DAY && "font-medium text-warning")}>{shortDate(a.renewalDate)}</span> : <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Accounts" actions={<Button size="sm" variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Add account</Button>} />
      <div className="flex items-center gap-2 border-b bg-surface px-4 py-2 text-[12.5px] text-muted-foreground md:px-6">
        <ShieldCheck className="size-4 shrink-0" /> Metadata only. Passwords, 2FA secrets and recovery codes belong in your password manager.
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-4 py-2.5 text-[13px] md:px-6">
        <span><span className="font-semibold tabular-nums">{summary.total}</span> <span className="text-muted-foreground">accounts</span></span>
        <span className={summary.no2fa ? "text-destructive" : ""}><span className="font-semibold tabular-nums">{summary.no2fa}</span> <span className={summary.no2fa ? "" : "text-muted-foreground"}>without 2FA</span></span>
        <span><span className="font-semibold tabular-nums">${summary.usd.toFixed(2)}</span> <span className="text-muted-foreground">/ month · PKR {Math.round(summary.pkr).toLocaleString()}</span></span>
      </div>
      <div className="flex flex-wrap gap-2 border-b px-4 py-2 md:px-6">
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="h-8 w-36 text-[13px]"><option value="">All categories</option>{ACCOUNT_CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select>
        <Select value={twoFa} onChange={(e) => setTwoFa(e.target.value)} aria-label="2FA" className="h-8 w-36 text-[13px]"><option value="">Any 2FA</option>{TWO_FACTOR_TYPES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="h-8 w-32 text-[13px]"><option value="">Any status</option><option value="active">Active</option><option value="dormant">Dormant</option><option value="to-close">To close</option><option value="closed">Closed</option></Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className="h-8 w-28 text-[13px]"><option value="">Anyone</option><option value="me">Me</option><option value="client">Client</option></Select>
        <Button size="sm" variant={review ? "secondary" : "ghost"} aria-pressed={review} onClick={() => setReview((v) => !v)}>Needs review</Button>
      </div>

      {!loaded ? <ListSkeleton /> : !docs.length ? (
        <EmptyState icon={<KeyRound />} title="No accounts yet" description="Track which email and sign-in method each service uses, 2FA, renewals and costs." action={<Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>Add account</Button>} />
      ) : !list.length ? <EmptyState title="No accounts match these filters" /> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>{["Service", "Login", "Sign-in", "2FA", "Plan / cost", "Renewal", "Status", "Reviewed", ""].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-6">{h}</th>)}</tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="group border-b hover:bg-accent/40">
                    <td className="py-2 pr-3 pl-6"><button onClick={() => edit(a)} className="flex items-center gap-2 font-medium"><Favicon a={a} />{a.service}</button><span className="ml-6 text-[11px] text-muted-foreground">{cap(a.category)}{a.owner === "client" ? ` · ${a.clientName ?? "client"}` : ""}</span></td>
                    <td className="max-w-48 truncate px-3 text-muted-foreground">{a.loginIdentifier}</td>
                    <td className="px-3">{cap(a.signInMethod)}</td>
                    <td className="px-3"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", TWO_FA_TONE[a.twoFactor])}>{cap(a.twoFactor)}</span></td>
                    <td className="px-3 text-muted-foreground">{[a.plan, a.cost ? `${a.cost.currency === "USD" ? "$" : "PKR "}${a.cost.amount}/${a.cost.cycle === "monthly" ? "mo" : a.cost.cycle === "yearly" ? "yr" : "once"}` : null].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 tabular-nums">{renewal(a)}</td>
                    <td className="px-3">{cap(a.status)}</td>
                    <td className={cn("px-3 text-[12px]", needsReview(a) ? "text-warning" : "text-muted-foreground")}>{a.lastReviewedAt ? relativeTime(a.lastReviewedAt) : "Never"}</td>
                    <td className="pr-4 text-right">{rowMenu(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y md:hidden">
            {list.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5"><Favicon a={a} /></span>
                <button onClick={() => edit(a)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{a.service}</span>
                    <span className={cn("rounded px-1.5 text-[10px] font-medium", TWO_FA_TONE[a.twoFactor])}>{cap(a.twoFactor)}</span>
                  </div>
                  <p className="truncate text-[12px] text-muted-foreground">{a.loginIdentifier} · {cap(a.signInMethod)}</p>
                  <p className="text-[11px] text-muted-foreground">{a.renewalDate ? <>Renews {renewal(a)} · </> : null}{needsReview(a) ? <span className="text-warning">Needs review</span> : `Reviewed ${relativeTime(a.lastReviewedAt)}`}</p>
                </button>
                {rowMenu(a)}
              </li>
            ))}
          </ul>
        </>
      )}
      <AccountForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }} account={editing} />
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AccountsScreen />
    </Suspense>
  );
}
