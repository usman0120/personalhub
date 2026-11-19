"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  ACCOUNT_CATEGORIES, ACCOUNT_STATUSES, findSecrets, getDomain, SIGN_IN_METHODS, TWO_FACTOR_TYPES, type Account,
} from "@personalhub/shared";
import { createDoc, updateDocument } from "@/lib/data/repos";
import { fromDateInput, toastError, toDateInput } from "@/lib/ui";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";

type Form = Omit<Account, "id" | "createdAt" | "updatedAt" | "isDeleted" | "deletedAt">;

const EMPTY: Form = {
  service: "", url: null, category: "dev", loginIdentifier: "", signInMethod: "password", twoFactor: "none",
  recoveryLocation: "", plan: null, cost: null, renewalDate: null, owner: "me", clientName: null, status: "active",
  lastReviewedAt: null, notes: "",
};

const label = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Returns the secret-guard problems for an account form (block save when non-empty). */
export function accountSecretIssues(f: Pick<Form, "notes" | "recoveryLocation" | "loginIdentifier" | "plan" | "service">): string[] {
  const found = new Set<string>();
  for (const v of [f.notes, f.recoveryLocation, f.loginIdentifier, f.plan, f.service]) for (const m of findSecrets(v)) found.add(m.label);
  return [...found];
}

export function AccountForm({ open, onOpenChange, account }: { open: boolean; onOpenChange: (v: boolean) => void; account?: Account | null }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF(account ? { ...EMPTY, ...account } : EMPTY);
  }, [open, account]);
  const issues = useMemo(() => accountSecretIssues(f), [f]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.service.trim() || issues.length) return;
    setSaving(true);
    try {
      const data = { ...f, service: f.service.trim().slice(0, 120), url: f.url?.trim() || null, clientName: f.owner === "client" ? f.clientName : null };
      if (account) await updateDocument("accounts", account.id, data);
      else await createDoc("accounts", { ...data, isDeleted: false, deletedAt: null });
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={account ? `Edit ${account.service}` : "Add account"}
      description="Metadata only. Passwords, 2FA secrets and recovery codes belong in your password manager."
      className="max-w-2xl"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={saving} disabled={!f.service.trim() || issues.length > 0} onClick={() => void save()}>Save</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service"><Input autoFocus value={f.service} onChange={(e) => set("service", e.target.value)} placeholder="Vercel" /></Field>
        <Field label="URL"><Input value={f.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://vercel.com" onBlur={(e) => !f.service && getDomain(e.target.value) && set("service", getDomain(e.target.value)!)} /></Field>
        <Field label="Login (email or username)"><Input value={f.loginIdentifier} onChange={(e) => set("loginIdentifier", e.target.value)} autoComplete="off" /></Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => set("category", e.target.value as Form["category"])}>{ACCOUNT_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        </Field>
        <Field label="Sign-in method">
          <Select value={f.signInMethod} onChange={(e) => set("signInMethod", e.target.value as Form["signInMethod"])}>{SIGN_IN_METHODS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        </Field>
        <Field label="Two-factor">
          <Select value={f.twoFactor} onChange={(e) => set("twoFactor", e.target.value as Form["twoFactor"])}>{TWO_FACTOR_TYPES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        </Field>
        <Field label="Recovery location" className="sm:col-span-2"><Input value={f.recoveryLocation} onChange={(e) => set("recoveryLocation", e.target.value)} placeholder="Bitwarden › Dev & Cloud" /></Field>
        <Field label="Plan"><Input value={f.plan ?? ""} onChange={(e) => set("plan", e.target.value || null)} placeholder="Hobby" /></Field>
        <Field label="Cost">
          <div className="flex gap-1.5">
            <Input type="number" min={0} step="0.01" value={f.cost?.amount ?? ""} onChange={(e) => set("cost", e.target.value === "" ? null : { currency: "USD", cycle: "monthly", ...f.cost, amount: Number(e.target.value) })} placeholder="0" className="w-24" />
            <Select value={f.cost?.currency ?? "USD"} onChange={(e) => f.cost && set("cost", { ...f.cost, currency: e.target.value as "USD" })} className="w-20"><option>USD</option><option>PKR</option></Select>
            <Select value={f.cost?.cycle ?? "monthly"} onChange={(e) => f.cost && set("cost", { ...f.cost, cycle: e.target.value as "monthly" })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="one-time">One-time</option></Select>
          </div>
        </Field>
        <Field label="Renewal date"><Input type="date" value={toDateInput(f.renewalDate)} onChange={(e) => set("renewalDate", fromDateInput(e.target.value))} /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value as Form["status"])}>{ACCOUNT_STATUSES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        </Field>
        <Field label="Owner">
          <Select value={f.owner} onChange={(e) => set("owner", e.target.value as Form["owner"])}><option value="me">Me</option><option value="client">Client</option></Select>
        </Field>
        {f.owner === "client" ? <Field label="Client name"><Input value={f.clientName ?? ""} onChange={(e) => set("clientName", e.target.value || null)} /></Field> : null}
        <Field label="Notes" className="sm:col-span-2" hint="No passwords, codes or keys — they are blocked.">
          <Textarea value={f.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} className="min-h-20" />
        </Field>
      </div>
      {issues.length ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-[13px]">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>This looks like a secret ({issues.join(", ")}). Remove it and store it in your password manager instead. Saving is blocked.</span>
        </div>
      ) : null}
    </Dialog>
  );
}
