"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FlaskConical, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  applyRules, detectPlatform, getDomain, ITEM_KINDS, shortId, type Rule, type RuleCondition,
} from "@personalhub/shared";
import { useSettings } from "@/components/providers/HubProvider";
import { useCollection } from "@/lib/data/store";
import { deleteRule, saveRule, stores } from "@/lib/data/repos";
import { relativeTime, toastError, undoToast } from "@/lib/ui";
import { Badge, Button, Field, Input, Select, Switch } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { TagInput } from "@/components/item/inputs";
import { SectionTitle } from "./basic";

type Draft = Pick<Rule, "id" | "name" | "enabled" | "order" | "match" | "conditions" | "actions">;
const FIELDS: RuleCondition["field"][] = ["domain", "url", "title", "text", "platform", "kind", "source"];
const OPS: RuleCondition["op"][] = ["equals", "contains", "startsWith", "endsWith", "in"];
const OP_LABEL = { equals: "is", contains: "contains", startsWith: "starts with", endsWith: "ends with", in: "is one of" };

function describe(r: Draft, areaName: (id: string) => string) {
  const cond = r.conditions.map((c) => `${c.field} ${OP_LABEL[c.op]} ${Array.isArray(c.value) ? c.value.join(", ") : c.value}`).join(r.match === "all" ? " and " : " or ");
  const acts = [
    r.actions.setAreaId ? `area ${areaName(r.actions.setAreaId)}` : null,
    r.actions.addTags?.length ? r.actions.addTags.map((t) => `#${t}`).join(" ") : null,
    r.actions.setKind ? `kind ${r.actions.setKind}` : null,
    r.actions.setStatus ? "skip Inbox" : null,
    r.actions.runAi ? "run AI" : null,
  ].filter(Boolean).join(", ");
  return `If ${cond} → ${acts || "nothing"}`;
}

function RuleEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const settings = useSettings();
  const { docs: projects } = useCollection(stores.projects);
  const [r, setR] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const setCond = (i: number, patch: Partial<RuleCondition>) => setR((x) => ({ ...x, conditions: x.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setAct = (patch: Partial<Rule["actions"]>) => setR((x) => ({ ...x, actions: { ...x.actions, ...patch } }));
  const valid = r.name.trim() && r.conditions.length && r.conditions.every((c) => (Array.isArray(c.value) ? c.value.length : c.value.trim()));
  const submit = async () => {
    setBusy(true);
    try {
      const clean: Rule["actions"] = Object.fromEntries(Object.entries(r.actions).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));
      await saveRule({ ...r, name: r.name.trim().slice(0, 80), actions: clean, conditions: r.conditions.map((c) => ({ ...c, value: c.op === "in" && typeof c.value === "string" ? c.value.split(",").map((s) => s.trim()).filter(Boolean) : c.value })) });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={draft.name ? "Edit rule" : "New rule"} className="max-w-2xl" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={busy} onClick={() => void submit()}>Save rule</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input autoFocus value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="GitHub → Dev Resources" /></Field>
        <div>
          <div className="mb-2 flex items-center gap-2 text-[13px]">
            When
            <Select value={r.match} onChange={(e) => setR({ ...r, match: e.target.value as "all" })} className="h-8 w-24 text-[13px]"><option value="any">any</option><option value="all">all</option></Select>
            of these match:
          </div>
          <div className="space-y-1.5">
            {r.conditions.map((c, i) => (
              <div key={i} className="flex gap-1.5">
                <Select value={c.field} onChange={(e) => setCond(i, { field: e.target.value as RuleCondition["field"] })} className="h-8 w-28 text-[13px]">{FIELDS.map((f) => <option key={f}>{f}</option>)}</Select>
                <Select value={c.op} onChange={(e) => setCond(i, { op: e.target.value as RuleCondition["op"] })} className="h-8 w-32 text-[13px]">{OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</Select>
                <Input value={Array.isArray(c.value) ? c.value.join(", ") : c.value} onChange={(e) => setCond(i, { value: e.target.value })} placeholder={c.op === "in" ? "a, b, c" : "github.com"} className="h-8 flex-1 text-[13px]" />
                <Button size="icon-sm" variant="ghost" aria-label="Remove condition" disabled={r.conditions.length === 1} onClick={() => setR({ ...r, conditions: r.conditions.filter((_, j) => j !== i) })}><X /></Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-1" disabled={r.conditions.length >= 10} onClick={() => setR({ ...r, conditions: [...r.conditions, { field: "domain", op: "equals", value: "" }] })}><Plus /> Condition</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Set area">
            <Select value={r.actions.setAreaId ?? ""} onChange={(e) => setAct({ setAreaId: e.target.value || undefined })}>
              <option value="">Don&apos;t change</option>
              {settings.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Set kind">
            <Select value={r.actions.setKind ?? ""} onChange={(e) => setAct({ setKind: (e.target.value || undefined) as Rule["actions"]["setKind"] })}>
              <option value="">Don&apos;t change</option>
              {ITEM_KINDS.map((k) => <option key={k}>{k}</option>)}
            </Select>
          </Field>
          <Field label="Add tags" className="sm:col-span-2"><TagInput value={r.actions.addTags ?? []} onChange={(t) => setAct({ addTags: t.slice(0, 10) })} /></Field>
          <Field label="Set project">
            <Select value={r.actions.setProjectId ?? ""} onChange={(e) => setAct({ setProjectId: e.target.value || undefined })}>
              <option value="">Don&apos;t change</option>
              {projects.filter((p) => !p.isDeleted).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className="space-y-2 pt-6 text-[13px]">
            <label className="flex items-center gap-2"><Switch checked={r.actions.setStatus === "active"} onChange={(v) => setAct({ setStatus: v ? "active" : undefined })} /> Skip Inbox</label>
            <label className="flex items-center gap-2"><Switch checked={Boolean(r.actions.runAi)} onChange={(v) => setAct({ runAi: v || undefined })} /> Run AI after capture</label>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function TestPanel() {
  const { docs: rules } = useCollection(stores.rules);
  const settings = useSettings();
  const [v, setV] = useState("");
  const result = useMemo(() => {
    if (!v.trim()) return null;
    const isUrl = /^https?:\/\//i.test(v.trim());
    const url = isUrl ? v.trim() : null;
    return applyRules({ url, domain: getDomain(url), title: isUrl ? "" : v, text: v, platform: detectPlatform(url), kind: url ? "link" : "note", source: "web" }, rules);
  }, [v, rules]);
  return (
    <section className="mt-6 rounded-lg border p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><FlaskConical className="size-4" /> Test rules</h3>
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste a URL or title…" />
      {result ? (
        <div className="mt-3 text-[13px]">
          {result.rulesApplied.length ? (
            <ul className="space-y-1">
              <li>Matched: {result.rulesApplied.map((id) => rules.find((r) => r.id === id)?.name ?? id).join(", ")}</li>
              {result.areaId ? <li>Area → <b>{settings.areas.find((a) => a.id === result.areaId)?.name}</b></li> : null}
              {result.tags.length ? <li>Tags → {result.tags.map((t) => `#${t}`).join(" ")}</li> : null}
              {result.kind ? <li>Kind → {result.kind}</li> : null}
              {result.status ? <li>Skips Inbox</li> : null}
            </ul>
          ) : <p className="text-muted-foreground">No rule matches.</p>}
        </div>
      ) : null}
    </section>
  );
}

export function RulesSection() {
  const { docs } = useCollection(stores.rules);
  const settings = useSettings();
  const rules = useMemo(() => [...docs].sort((a, b) => a.order - b.order), [docs]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const areaName = (id: string) => settings.areas.find((a) => a.id === id)?.name ?? id;

  const move = (i: number, d: -1 | 1) => {
    const a = rules[i]!;
    const b = rules[i + d]!;
    void saveRule({ ...a, order: b.order });
    void saveRule({ ...b, order: a.order });
  };
  const remove = (r: Rule) => {
    void deleteRule(r.id);
    undoToast(`Deleted rule “${r.name}”`, () => saveRule(r));
  };

  return (
    <>
      <div className="flex items-start justify-between">
        <SectionTitle title="Rules" description="Deterministic rules run first on every capture. Later rules override earlier ones; tags add up." />
        <Button size="sm" variant="outline" onClick={() => setEditing({ id: shortId(12), name: "", enabled: true, order: (rules.at(-1)?.order ?? 0) + 1, match: "any", conditions: [{ field: "domain", op: "equals", value: "" }], actions: {} })}><Plus /> New rule</Button>
      </div>
      {!rules.length ? <p className="text-[13px] text-muted-foreground">No rules yet.</p> : (
        <ul className="divide-y rounded-lg border">
          {rules.map((r, i) => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
              <Switch checked={r.enabled} label={`Enable ${r.name}`} onChange={(v) => void saveRule({ ...r, enabled: v })} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{r.name}</p>
                <p className="text-[12px] text-muted-foreground">{describe(r, areaName)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground"><Badge>{r.hits} hits</Badge> {r.lastHitAt ? `last ${relativeTime(r.lastHitAt)}` : ""}</p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} className="text-destructive" onClick={() => remove(r)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <TestPanel />
      {editing ? <RuleEditor draft={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
