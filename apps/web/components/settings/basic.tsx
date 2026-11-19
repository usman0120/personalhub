"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Merge, Pencil, Plus, Trash2 } from "lucide-react";
import { AREA_COLORS, slugify, type Area } from "@personalhub/shared";
import { useHub, useSettings } from "@/components/providers/HubProvider";
import { useTags } from "@/lib/data/hooks";
import { addTagToItems, deleteTag, renameTag, updateSettings } from "@/lib/data/repos";
import { toastError, undoToast } from "@/lib/ui";
import { Button, Field, Input, Select, Switch } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">{title}</p>
        {description ? <p className="text-[12.5px] text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const save = (patch: Record<string, unknown>) => updateSettings(patch).catch(toastError);

export function GeneralSection() {
  const { profile, user } = useHub();
  const settings = useSettings();
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Asia/Karachi", "UTC"];
  const updateProfile = (patch: Record<string, unknown>) =>
    updateDoc(doc(firestore(), "users", user!.uid), { ...patch, updatedAt: serverTimestamp() }).catch(toastError);
  return (
    <>
      <SectionTitle title="General" />
      <SettingRow title="Name">
        <Input defaultValue={profile?.displayName} onBlur={(e) => e.target.value.trim() && void updateProfile({ displayName: e.target.value.trim().slice(0, 80) })} className="w-56" />
      </SettingRow>
      <SettingRow title="Timezone">
        <Select value={profile?.timezone ?? "Asia/Karachi"} onChange={(e) => void updateProfile({ timezone: e.target.value })} className="w-56">
          {zones.map((z) => <option key={z}>{z}</option>)}
        </Select>
      </SettingRow>
      <SettingRow title="Theme">
        <Select value={settings.theme} onChange={(e) => void save({ theme: e.target.value })} className="w-40">
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </Select>
      </SettingRow>
      <SettingRow title="PKR per USD" description="Used for the monthly cost summary in Accounts.">
        <Input type="number" min={1} step="0.01" defaultValue={settings.pkrPerUsd} onBlur={(e) => Number(e.target.value) > 0 && void save({ pkrPerUsd: Number(e.target.value) })} className="w-32" />
      </SettingRow>
      <SettingRow title="Default area for new captures">
        <Select value={settings.defaultAreaId ?? ""} onChange={(e) => void save({ defaultAreaId: e.target.value || null })} className="w-48">
          <option value="">None (Inbox decides)</option>
          {settings.areas.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </SettingRow>
      <SettingRow title="Inbox zero goal">
        <Select value={settings.inboxZeroGoal} onChange={(e) => void save({ inboxZeroGoal: e.target.value })} className="w-32">
          <option value="weekly">Weekly</option><option value="daily">Daily</option>
        </Select>
      </SettingRow>
    </>
  );
}

export function AreasSection() {
  const settings = useSettings();
  const areas = [...settings.areas].sort((a, b) => a.order - b.order);
  const [editing, setEditing] = useState<Area | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(AREA_COLORS[0]);

  const write = (next: Area[]) => save({ areas: next.map((a, i) => ({ ...a, order: i })) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...areas];
    const [a] = next.splice(i, 1);
    next.splice(i + d, 0, a!);
    void write(next);
  };
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    if (editing?.id) void write(areas.map((a) => (a.id === editing.id ? { ...a, name: n, color } : a)));
    else {
      let id = slugify(n) || `area-${areas.length + 1}`;
      if (areas.some((a) => a.id === id)) id = `${id}-${areas.length}`;
      void write([...areas, { id, name: n.slice(0, 60), color, icon: "folder", aiAllowed: true, order: areas.length }]);
    }
    setEditing(null);
  };
  const open = (a: Area | null) => {
    setEditing(a ?? ({} as Area));
    setName(a?.name ?? "");
    setColor(a?.color ?? AREA_COLORS[areas.length % AREA_COLORS.length]!);
  };

  return (
    <>
      <div className="flex items-start justify-between">
        <SectionTitle title="Areas" description="Broad buckets for everything you save. AI never sees items in areas where it is off." />
        <Button size="sm" variant="outline" onClick={() => open(null)}><Plus /> Add area</Button>
      </div>
      <ul className="divide-y rounded-lg border">
        {areas.map((a, i) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <span className="size-3 rounded-sm" style={{ background: a.color }} />
            <span className={`flex-1 text-[13.5px] ${a.archived ? "text-muted-foreground line-through" : ""}`}>{a.name}</span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">AI <Switch checked={a.aiAllowed} label={`AI allowed for ${a.name}`} onChange={(v) => void write(areas.map((x) => (x.id === a.id ? { ...x, aiAllowed: v } : x)))} /></label>
            <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === areas.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Rename ${a.name}`} onClick={() => open(a)}><Pencil /></Button>
            <Button size="sm" variant="ghost" onClick={() => void write(areas.map((x) => (x.id === a.id ? { ...x, archived: !x.archived } : x)))}>{a.archived ? "Restore" : "Archive"}</Button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} title={editing?.id ? "Edit area" : "New area"} footer={<Button variant="primary" onClick={submit}>Save</Button>}>
        <div className="space-y-3">
          <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {AREA_COLORS.map((c) => (
                <button key={c} aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-7 rounded-md ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function TagsSection() {
  const tags = useTags();
  const [target, setTarget] = useState<{ slug: string; mode: "rename" | "merge" } | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const submit = async () => {
    if (!target || !value.trim()) return;
    setBusy(true);
    try {
      const n = await renameTag(target.slug, value);
      toast.success(`${target.mode === "merge" ? "Merged" : "Renamed"} · ${n} items updated`);
      setTarget(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (slug: string) => {
    try {
      const ids = await deleteTag(slug);
      undoToast(`Deleted #${slug} from ${ids.length} items`, () => addTagToItems(ids, slug));
    } catch (e) {
      toastError(e);
    }
  };
  const list = tags.filter((t) => !q || t.slug.includes(q.toLowerCase()));

  return (
    <>
      <SectionTitle title="Tags" description="Rename or merge tags across all items. Deleting a tag removes it from items (undo available)." />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tags…" className="mb-3 h-8 max-w-xs" />
      {!list.length ? <p className="text-[13px] text-muted-foreground">No tags yet.</p> : (
        <ul className="divide-y rounded-lg border">
          {list.map((t) => (
            <li key={t.slug} className="flex items-center gap-3 px-3 py-1.5">
              <span className="flex-1 text-[13.5px]">#{t.slug}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Rename ${t.slug}`} onClick={() => { setTarget({ slug: t.slug, mode: "rename" }); setValue(t.slug); }}><Pencil /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Merge ${t.slug}`} onClick={() => { setTarget({ slug: t.slug, mode: "merge" }); setValue(""); }}><Merge /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.slug}`} className="text-destructive" onClick={() => void remove(t.slug)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)} title={target?.mode === "merge" ? `Merge #${target?.slug} into…` : `Rename #${target?.slug}`} footer={<Button variant="primary" loading={busy} onClick={() => void submit()}>{target?.mode === "merge" ? "Merge" : "Rename"}</Button>}>
        {target?.mode === "merge" ? (
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose a tag…</option>
            {tags.filter((t) => t.slug !== target.slug).map((t) => <option key={t.slug} value={t.slug}>#{t.slug} ({t.count})</option>)}
          </Select>
        ) : (
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
        )}
      </Dialog>
    </>
  );
}
