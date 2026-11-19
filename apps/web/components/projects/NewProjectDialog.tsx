"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { AREA_COLORS, type Project } from "@personalhub/shared";
import { useAreas, useLive } from "@/lib/data/hooks";
import { createDoc } from "@/lib/data/repos";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const areas = useAreas();
  const { docs } = useLive("projects");
  const router = useRouter();
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [status, setStatus] = useState<Project["status"]>("active");
  const activeCount = docs.filter((p) => p.status === "active").length;
  const submit = async () => {
    if (!name.trim()) return;
    const id = await createDoc("projects", {
      name: name.trim().slice(0, 120), status, areaId: areaId || null,
      color: areas.find((a) => a.id === areaId)?.color ?? AREA_COLORS[docs.length % AREA_COLORS.length],
      problem: "", goal: "", doneWhen: "", deadline: null, links: [], lastActivityAt: Date.now(), isDeleted: false, deletedAt: null,
    });
    onOpenChange(false);
    setName("");
    router.push(`/projects/${id}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New project" footer={<Button variant="primary" disabled={!name.trim()} onClick={() => void submit()}>Create</Button>}>
      <div className="space-y-3">
        <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area">
            <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">None</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}>
              <option value="active">Active</option><option value="idea">Idea</option><option value="paused">Paused</option>
            </Select>
          </Field>
        </div>
        {status === "active" && activeCount >= 2 ? (
          <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-[13px]"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> You already have {activeCount} active projects. Consider pausing one first.</p>
        ) : null}
      </div>
    </Dialog>
  );
}

