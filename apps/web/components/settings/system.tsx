"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { GoogleAuthProvider, reauthenticateWithPopup, signOut } from "firebase/auth";
import { CheckCircle2, Copy, Download, Plus, Smartphone, Trash2, XCircle } from "lucide-react";
import type { CaptureTokenInfo } from "@personalhub/shared";
import { useHub, useSettings } from "@/components/providers/HubProvider";
import { purge, stores, updateSettings } from "@/lib/data/repos";
import { buildExportZip, downloadBytes } from "@/lib/data/backup";
import { firebaseAuth } from "@/lib/firebase/client";
import { api, errorMessage } from "@/lib/api/client";
import { relativeTime, shortDate, toastError } from "@/lib/ui";
import { Button, Checkbox, Field, Input, Select, Switch } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { SectionTitle, SettingRow } from "./basic";

function Code({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted px-2.5 py-1.5 font-mono text-[12px]">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <button aria-label="Copy" onClick={() => void navigator.clipboard.writeText(children).then(() => toast.success("Copied"))}><Copy className="size-3.5 text-muted-foreground" /></button>
    </div>
  );
}

export function CaptureSection() {
  const settings = useSettings();
  const [tokens, setTokens] = useState<CaptureTokenInfo[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("Chrome extension");
  const [scopes, setScopes] = useState({ capture: true, taxonomy: true });
  const [created, setCreated] = useState<string | null>(null);
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [swOk, setSwOk] = useState<boolean | null>(null);

  const load = useCallback(() => {
    api<CaptureTokenInfo[]>("/api/tokens").then(setTokens).catch((e) => { toast.error(errorMessage(e)); setTokens([]); });
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    try {
      const r = await api<{ token: string }>("/api/tokens", { body: { name, scopes: [scopes.capture && "capture", scopes.taxonomy && "read:taxonomy"].filter(Boolean) } });
      setCreated(r.token);
      setNewOpen(false);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const revoke = async (id: string) => {
    try {
      await api(`/api/tokens/${id}`, { method: "DELETE" });
      toast.success("Token revoked");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const testShare = async () => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setSwOk(Boolean(await navigator.serviceWorker?.getRegistration?.()));
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <SectionTitle title="Capture" description="Save from Chrome, Android and other tools." />
      <section className="space-y-2">
        <h3 className="text-[13.5px] font-semibold">Chrome extension</h3>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
          <li>Build it: <code className="rounded bg-muted px-1">HUB_ORIGIN={origin} npm run build:ext</code></li>
          <li>Open <code className="rounded bg-muted px-1">chrome://extensions</code>, enable Developer mode, click <b>Load unpacked</b> and pick <code className="rounded bg-muted px-1">apps/extension/dist</code>.</li>
          <li>Create a capture token below and paste it in the extension&apos;s Options with hub URL <code className="rounded bg-muted px-1">{origin}</code>.</li>
          <li>Shortcuts: <b>Alt+Shift+S</b> quick save, <b>Alt+Shift+P</b> open popup.</li>
        </ol>
      </section>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold">Capture tokens</h3>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}><Plus /> New token</Button>
      </div>
      {created ? (
        <div className="mb-3 space-y-2 rounded-lg border border-success/40 bg-success/10 p-3 text-[13px]">
          <p className="font-medium">Copy this token now — it won&apos;t be shown again.</p>
          <Code>{created}</Code>
          <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Done</Button>
        </div>
      ) : null}
      {tokens === null ? <p className="text-[13px] text-muted-foreground">Loading…</p> : tokens.length ? (
        <ul className="divide-y rounded-lg border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className={t.revokedAt ? "text-muted-foreground line-through" : "font-medium"}>{t.name} <span className="font-mono text-xs text-muted-foreground">ph_…{t.last4}</span></p>
                <p className="text-[11.5px] text-muted-foreground">{t.scopes.join(", ")} · created {shortDate(t.createdAt)} · {t.lastUsedAt ? `used ${relativeTime(t.lastUsedAt)}` : "never used"}{t.revokedAt ? ` · revoked ${shortDate(t.revokedAt)}` : ""}</p>
              </div>
              {!t.revokedAt ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void revoke(t.id)}>Revoke</Button> : null}
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg border border-dashed px-3 py-4 text-[13px] text-muted-foreground">No tokens yet.</p>}

      <section className="mt-6 space-y-2">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold"><Smartphone className="size-4" /> Android</h3>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
          <li>Open this site in <b>Chrome for Android</b> → menu → <b>Install app</b>.</li>
          <li>In Instagram, LinkedIn, YouTube or Gallery tap Share → <b>Hub</b>. Pin it in the share sheet.</li>
          <li>No permissions are requested. Images are processed on the phone; originals stay in your gallery.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => void testShare()}>Test share target</Button>
          {standalone !== null ? (
            <span className="flex items-center gap-3 text-[12.5px]">
              <span className="flex items-center gap-1">{standalone ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />} Installed app</span>
              <span className="flex items-center gap-1">{swOk ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />} Service worker</span>
            </span>
          ) : null}
        </div>
        <SettingRow title="Instant save from share" description="Save immediately, then add details on the same screen.">
          <Switch checked={settings.instantShareSave} label="Instant save from share" onChange={(v) => void updateSettings({ instantShareSave: v }).catch(toastError)} />
        </SettingRow>
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="text-[13.5px] font-semibold">Capture API</h3>
        <p className="text-[13px] text-muted-foreground">Any tool that sends HTTP (e.g. the Android “HTTP Shortcuts” app) can save with a token:</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-[11.5px]">{`POST ${origin}/api/capture
Authorization: Bearer ph_…
Content-Type: application/json

{ "source": "api", "url": "https://…", "note": "optional" }`}</pre>
      </section>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="New capture token" footer={<Button variant="primary" disabled={!name.trim() || (!scopes.capture && !scopes.taxonomy)} onClick={() => void create()}>Create</Button>}>
        <div className="space-y-3">
          <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="space-y-1.5 text-[13px]">
            <label className="flex items-center gap-2"><Checkbox checked={scopes.capture} onChange={(v) => setScopes({ ...scopes, capture: v })} /> capture — save items</label>
            <label className="flex items-center gap-2"><Checkbox checked={scopes.taxonomy} onChange={(v) => setScopes({ ...scopes, taxonomy: v })} /> read:taxonomy — list areas, tags, projects</label>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function StorageSection() {
  const settings = useSettings();
  const [server, setServer] = useState<{ driver: string; configured: boolean } | null>(null);
  useEffect(() => {
    api<{ driver: string; configured: boolean }>("/api/storage/status").then(setServer).catch(() => setServer({ driver: "none", configured: false }));
  }, []);
  const images = stores.items.all().filter((i) => !i.isDeleted && i.image?.blobId).length;
  return (
    <>
      <SectionTitle title="Storage" description="By default no image files are stored. Originals stay on your device." />
      <SettingRow title="Mode" description={server ? `Server driver: ${server.driver}${server.driver === "r2" ? (server.configured ? " (configured)" : " (missing credentials)") : ""}` : "Checking server…"}>
        <Select value={settings.storageMode} onChange={(e) => void updateSettings({ storageMode: e.target.value }).catch(toastError)} className="w-44">
          <option value="none">No files</option>
          <option value="r2" disabled={!server?.configured}>Cloudflare R2</option>
        </Select>
      </SettingRow>
      <SettingRow title="Thumbnails" description="Store a small (≤ 60 KB) WebP thumbnail in Firestore for shared screenshots.">
        <Switch checked={settings.thumbnails} label="Thumbnails" onChange={(v) => void updateSettings({ thumbnails: v }).catch(toastError)} />
      </SettingRow>
      <SettingRow title="Usage estimate">
        <span className="text-[13px] tabular-nums text-muted-foreground">{images} thumbnails · ~{Math.round((images * 45) / 1024)} MB</span>
      </SettingRow>
    </>
  );
}

export function DataSection() {
  const settings = useSettings();
  const { user } = useHub();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const counts = {
    items: stores.items.all().filter((i) => !i.isDeleted).length,
    projects: stores.projects.all().filter((i) => !i.isDeleted).length,
    tasks: stores.tasks.all().filter((i) => !i.isDeleted).length,
    accounts: stores.accounts.all().filter((i) => !i.isDeleted).length,
    trash: (["items", "projects", "tasks", "accounts"] as const).reduce((n, s) => n + stores[s].all().filter((d) => d.isDeleted).length, 0),
  };

  const exportZip = async () => {
    const bytes = buildExportZip(settings);
    downloadBytes(bytes, `personalhub-${new Date().toISOString().slice(0, 10)}.zip`);
    await updateSettings({ lastExportAt: Date.now() }).catch(() => {});
    toast.success("Export downloaded");
  };
  const purgeTrash = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const s of ["items", "projects", "tasks", "accounts"] as const) for (const d of stores[s].all().filter((x) => x.isDeleted)) { await purge(s, d.id); n++; }
      toast.success(`${n} entries deleted forever`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const deleteAll = async () => {
    setBusy(true);
    try {
      const auth = firebaseAuth();
      const providerId = auth.currentUser?.providerData[0]?.providerId;
      if (providerId === "google.com") await reauthenticateWithPopup(auth.currentUser!, new GoogleAuthProvider());
      else throw new Error("Sign out and sign in again, then retry within 5 minutes.");
      await auth.currentUser!.getIdToken(true);
      await api("/api/data/delete-all", { body: { confirm: "DELETE" } });
      toast.success("All data deleted");
      await signOut(auth);
    } catch (e) {
      // Email/password users: a fresh sign-in satisfies the server's 5-minute check.
      const msg = errorMessage(e);
      if (/sign in again/i.test(msg)) {
        try {
          await api("/api/data/delete-all", { body: { confirm: "DELETE" } });
          toast.success("All data deleted");
          await signOut(firebaseAuth());
          return;
        } catch (e2) {
          toast.error(errorMessage(e2));
        }
      } else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  const signOutEverywhere = async () => {
    try {
      await api("/api/auth/revoke", { method: "POST", body: {} });
      toast.success("Signed out on all devices");
      await signOut(firebaseAuth());
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <SectionTitle title="Data" description="Your data, exportable at any time. Firestore on the free plan has no point-in-time recovery — exports are your backup." />
      <SettingRow title="Export everything" description={`JSON, Markdown (one file per item) and CSV in a ZIP. Never includes AI keys or tokens. Last export: ${settings.lastExportAt ? relativeTime(settings.lastExportAt) : "never"}.`}>
        <Button variant="primary" size="sm" onClick={() => void exportZip()}><Download /> Export ZIP</Button>
      </SettingRow>
      <SettingRow title="Restore from backup" description="Import a PersonalHub export ZIP.">
        <Link href="/import"><Button size="sm" variant="outline">Open Import</Button></Link>
      </SettingRow>
      <SettingRow title="Document counts" description="Helps you stay within Firestore's free quota.">
        <span className="text-[13px] tabular-nums text-muted-foreground">{counts.items} items · {counts.projects} projects · {counts.tasks} tasks · {counts.accounts} accounts</span>
      </SettingRow>
      <SettingRow title="Trash" description={`${counts.trash} entries. Purged automatically after 30 days.`}>
        <div className="flex gap-2">
          <Link href="/trash"><Button size="sm" variant="outline">Open Trash</Button></Link>
          <Button size="sm" variant="outline" className="text-destructive" loading={busy} disabled={!counts.trash} onClick={() => void purgeTrash()}>Purge now</Button>
        </div>
      </SettingRow>
      <SettingRow title="Sign out everywhere" description="Revokes sessions on all devices.">
        <Button size="sm" variant="outline" onClick={() => void signOutEverywhere()}>Sign out everywhere</Button>
      </SettingRow>
      <SettingRow title="Delete all my data" description="Permanently deletes everything in your hub. Requires re-authentication.">
        <Button size="sm" variant="danger" onClick={() => setConfirmOpen(true)}><Trash2 /> Delete all data</Button>
      </SettingRow>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Delete all data?" description={`Everything for ${user?.email} will be permanently deleted. This cannot be undone. Export a backup first.`} footer={<Button variant="danger" disabled={typed !== "DELETE"} loading={busy} onClick={() => void deleteAll()}>Delete everything</Button>}>
        <Field label='Type "DELETE" to confirm'><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
      </Dialog>
    </>
  );
}
