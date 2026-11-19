"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { CheckCircle2, FileJson, FileSpreadsheet, FileText, Globe, Link2Off, Upload } from "lucide-react";
import { normalizeUrl, sha256Hex, shortId, slugify, type ImportEntry } from "@personalhub/shared";
import { api, errorMessage } from "@/lib/api/client";
import { docRef, stores } from "@/lib/data/repos";
import { importEntries, restoreBackupZip } from "@/lib/data/backup";
import { requestSuggestion } from "@/lib/data/itemActions";
import { useSettings } from "@/components/providers/HubProvider";
import { Button, Checkbox, cn, Input } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/states";

type Source = "chrome-html" | "url-list" | "csv" | "json-backup";
const SOURCES: Array<{ id: Source; label: string; hint: string; accept: string; icon: typeof Globe }> = [
  { id: "chrome-html", label: "Chrome / Edge / Firefox bookmarks", hint: "HTML export", accept: ".html,.htm", icon: Globe },
  { id: "url-list", label: "URL list", hint: ".txt, one URL per line", accept: ".txt", icon: FileText },
  { id: "csv", label: "CSV", hint: "Columns: url, title, folder, date", accept: ".csv", icon: FileSpreadsheet },
  { id: "json-backup", label: "PersonalHub backup", hint: "The .zip from Settings › Data", accept: ".zip", icon: FileJson },
];

function StepDot({ n, label, step }: { n: number; label: string; step: number }) {
  return (
    <li className={cn("flex items-center gap-2 text-[13px]", step >= n ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px]", step > n ? "bg-primary text-primary-foreground" : step === n ? "border-2 border-primary" : "border")}>{step > n ? "✓" : n}</span>
      <span className="hidden sm:inline">{label}</span>
    </li>
  );
}

export default function ImportPage() {
  const settings = useSettings();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [source, setSource] = useState<Source>("chrome-html");
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [dupInFile, setDupInFile] = useState(0);
  const [inHub, setInHub] = useState(0);
  const [folderMap, setFolderMap] = useState<Map<string, string | null>>(new Map());
  const [skipFolders, setSkipFolders] = useState(false);
  const [runRules, setRunRules] = useState(true);
  const [runAi, setRunAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [result, setResult] = useState<{ importId: string; created: number; duplicates: number; ids: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiStop = useRef(false);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) for (const f of e.folderPath) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 && source !== "json-backup") return void toast.error("File too large (max 5 MB)");
    setBusy(true);
    try {
      if (source === "json-backup") {
        const counts = await restoreBackupZip(new Uint8Array(await file.arrayBuffer()), (label) => setProgress({ done: 0, total: 0, label }));
        toast.success(`Restored ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
        setStep(1);
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("type", source);
      const res = await api<{ entries: ImportEntry[]; duplicatesInFile: number }>("/api/import/parse", { form });
      const hashes = new Set(stores.items.all().filter((i) => !i.isDeleted).map((i) => i.urlHash));
      let already = 0;
      for (const e of res.entries) if (hashes.has(await sha256Hex(normalizeUrl(e.url) ?? e.url))) already++;
      const map = new Map<string, string | null>();
      for (const e of res.entries) for (const f of e.folderPath) if (!map.has(f)) map.set(f, slugify(f) || null);
      setEntries(res.entries);
      setDupInFile(res.duplicatesInFile);
      setInHub(already);
      setFolderMap(map);
      setStep(2);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runImport = async () => {
    setBusy(true);
    setStep(3);
    const importId = shortId(10);
    const map = skipFolders ? new Map<string, string | null>() : new Map(folderMap);
    // Default mapping: only the last folder in a path becomes a tag.
    const prepared = entries.map((e) => ({ ...e, folderPath: e.folderPath.slice(-1) }));
    try {
      await setDoc(docRef("imports", importId), { type: source, status: "parsing", total: entries.length, created: 0, duplicates: 0, failed: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setProgress({ done: 0, total: entries.length, label: "Importing into Inbox…" });
      const r = await importEntries(prepared, { importId, folderTags: map, runRules }, (done) => setProgress((p) => ({ ...p, done })));
      await updateDoc(docRef("imports", importId), { status: "done", created: r.created, duplicates: r.duplicates, updatedAt: serverTimestamp() });
      setResult({ importId, ...r });
      setStep(4);
      if (runAi && settings.ai.enabled) void backgroundAi(r.ids);
    } catch (e) {
      toast.error(errorMessage(e));
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const backgroundAi = async (ids: string[]) => {
    aiStop.current = false;
    for (let i = 0; i < ids.length && !aiStop.current; i++) {
      setProgress({ done: i, total: ids.length, label: "AI is organising (keep this page open)…" });
      try {
        const r = await requestSuggestion(ids[i]!);
        if (!r.ok) await new Promise((res) => setTimeout(res, (r.retryAfter ?? 30) * 1000));
      } catch {
        break;
      }
    }
    setProgress({ done: ids.length, total: ids.length, label: "AI done" });
  };

  const checkDeadLinks = async () => {
    if (!result) return;
    setBusy(true);
    let failed = 0;
    for (let i = 0; i < result.ids.length; i += 5) {
      setProgress({ done: i, total: result.ids.length, label: "Checking links…" });
      const res = await Promise.allSettled(result.ids.slice(i, i + 5).map((itemId) => api<{ status: string }>("/api/unfurl", { body: { itemId } })));
      failed += res.filter((r) => r.status === "fulfilled" && r.value.status === "failed").length;
    }
    setProgress({ done: result.ids.length, total: result.ids.length, label: `${failed} dead links found` });
    setBusy(false);
    toast.success(`${failed} dead links marked. Filter Library by unreachable links to bulk-delete.`);
  };

  const toImport = entries.length - inHub;
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Import" subtitle="Bring bookmarks into your Inbox, then triage with the keyboard." />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-6">
        <ol className="flex items-center gap-4">
          <StepDot n={1} label="Choose source" step={step} /><span className="h-px flex-1 bg-border" />
          <StepDot n={2} label="Preview" step={step} /><span className="h-px flex-1 bg-border" />
          <StepDot n={3} label="Import" step={step} /><span className="h-px flex-1 bg-border" />
          <StepDot n={4} label="Review" step={step} />
        </ol>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {SOURCES.map((s) => (
                <button key={s.id} onClick={() => setSource(s.id)} aria-pressed={source === s.id} className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors", source === s.id ? "border-primary bg-primary/[0.04]" : "hover:bg-accent/40")}>
                  <s.icon className="mt-0.5 size-4 text-muted-foreground" />
                  <span><span className="block text-[13px] font-medium">{s.label}</span><span className="text-xs text-muted-foreground">{s.hint}</span></span>
                </button>
              ))}
            </div>
            {source === "chrome-html" ? (
              <div className="rounded-lg bg-surface p-3 text-[13px] text-muted-foreground">
                <p className="font-medium text-foreground">How to export from Chrome</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                  <li>Open the Bookmarks manager (<kbd>Ctrl+Shift+O</kbd>).</li>
                  <li>Click ⋮ (top right) → <b>Export bookmarks</b>.</li>
                  <li>Upload the saved HTML file here.</li>
                </ol>
              </div>
            ) : source === "json-backup" ? (
              <p className="rounded-lg bg-surface p-3 text-[13px] text-muted-foreground">Restores items, projects, tasks, accounts, rules, areas and views from an export ZIP. Entries with the same id are overwritten.</p>
            ) : null}
            <input ref={fileRef} type="file" hidden accept={SOURCES.find((s) => s.id === source)!.accept} onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="primary" loading={busy} onClick={() => fileRef.current?.click()}><Upload /> Choose file</Button>
            {busy && progress.label ? <p className="text-[13px] text-muted-foreground">{progress.label}</p> : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {[["Found", entries.length], ["Duplicates in file", dupInFile], ["Already in hub", inHub]].map(([l, v]) => (
                <div key={l} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{v}</p></div>
              ))}
            </div>
            {folders.length ? (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[13px] font-medium">Folder → tag</h2>
                  <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={skipFolders} onChange={setSkipFolders} /> Skip folders</label>
                </div>
                {!skipFolders ? (
                  <div className="scrollbar-thin max-h-72 divide-y overflow-y-auto rounded-lg border">
                    {folders.map(([f, c]) => (
                      <div key={f} className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{f} <span className="text-[11px] text-muted-foreground">({c})</span></span>
                        <span className="text-muted-foreground">#</span>
                        <Input value={folderMap.get(f) ?? ""} placeholder="no tag" onChange={(e) => setFolderMap((m) => new Map(m).set(f, slugify(e.target.value) || null))} className="h-7 w-40 text-[13px]" aria-label={`Tag for folder ${f}`} />
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">The last folder of each bookmark becomes its tag. Clear a field to skip that folder.</p>
              </section>
            ) : null}
            <div className="space-y-2 text-[13px]">
              <label className="flex items-center gap-2"><Checkbox checked={runRules} onChange={setRunRules} /> Run rules (sets areas and tags)</label>
              <label className={cn("flex items-center gap-2", !settings.ai.enabled && "opacity-50")}><Checkbox checked={runAi && settings.ai.enabled} onChange={setRunAi} /> Run AI in the background while I&apos;m on this page {!settings.ai.enabled ? "(AI is off)" : ""}</label>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" disabled={!toImport} onClick={() => void runImport()}>Import {toImport} into Inbox</Button>
            </div>
          </div>
        ) : null}

        {step === 3 || (step === 4 && progress.total > 0 && progress.done < progress.total) ? (
          <div className="space-y-2">
            <p className="text-[13px]">{progress.label}</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground tabular-nums">{progress.done} / {progress.total}</p>
            {step === 4 ? <Button size="sm" variant="ghost" onClick={() => (aiStop.current = true)}>Stop</Button> : null}
          </div>
        ) : null}

        {step === 4 && result ? (
          <div className="space-y-4 rounded-lg border p-5">
            <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-5 text-success" /> Imported {result.created} items</p>
            <p className="text-[13px] text-muted-foreground">{result.duplicates} duplicates skipped. Triage with <b>K</b> keep, <b>R</b> archive, <b>D</b> delete.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/inbox?import=${result.importId}`}><Button variant="primary">Review now</Button></Link>
              <Button variant="outline" loading={busy} onClick={() => void checkDeadLinks()}><Link2Off /> Check dead links</Button>
              <Button variant="ghost" onClick={() => { setStep(1); setEntries([]); setResult(null); }}>Import another</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
