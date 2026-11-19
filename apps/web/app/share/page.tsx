"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createStore, del, get } from "idb-keyval";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { detectPlatform, extractFirstUrl, isHttpUrl, PLATFORM_LABELS } from "@personalhub/shared";
import { useHub } from "@/components/providers/HubProvider";
import { useAreas, useItems } from "@/lib/data/hooks";
import { createItem, saveBlob, updateItem } from "@/lib/data/repos";
import { aiFollowUp, unfurlInBackground } from "@/lib/data/itemActions";
import { api } from "@/lib/api/client";
import { compressImage, makeThumbnail } from "@/lib/image";
import { AreaPicker, TagInput } from "@/components/item/inputs";
import { Button, Spinner, Textarea } from "@/components/ui/primitives";

type Payload = { id: string; receivedAt: number; title: string; text: string; url: string; files: File[] };
const shareStore = () => createStore("personalhub-share", "queue");

function ShareScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { status, settings } = useHub();
  const areas = useAreas();
  const { items } = useItems();
  const [payload, setPayload] = useState<Payload | null | undefined>(undefined);
  const [itemId, setItemId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [visionNote, setVisionNote] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (status === "signedOut" || status === "rejected") router.replace("/signin");
  }, [status, router]);

  useEffect(() => {
    const id = params.get("id");
    // Fallback for GET share (e.g. ?url=…&text=…) when the service worker is not active.
    if (!id) {
      const url = params.get("url") ?? "";
      const text = params.get("text") ?? "";
      const title = params.get("title") ?? "";
      setPayload(url || text ? { id: "get", receivedAt: Date.now(), url, text, title, files: [] } : null);
      return;
    }
    get<Payload>(id, shareStore()).then((p) => setPayload(p ?? null)).catch(() => setPayload(null));
  }, [params]);

  const url = useMemo(() => {
    if (!payload) return null;
    if (isHttpUrl(payload.url)) return payload.url;
    return extractFirstUrl(payload.text) ?? extractFirstUrl(payload.title);
  }, [payload]);
  const image = payload?.files?.[0] ?? null;
  const kind = image ? "image" : url ? "link" : "note";
  const sharedText = useMemo(() => {
    if (!payload) return "";
    return [payload.title, payload.text].filter((t) => t && t !== url).join("\n").replace(url ?? "", "").trim();
  }, [payload, url]);

  // Recently used areas first
  const sortedAreas = useMemo(() => {
    const last = new Map<string, number>();
    for (const i of items) if (i.areaId) last.set(i.areaId, Math.max(last.get(i.areaId) ?? 0, i.capturedAt));
    return [...areas].sort((a, b) => (last.get(b.id) ?? 0) - (last.get(a.id) ?? 0));
  }, [areas, items]);

  useEffect(() => {
    if (image) setPreview(URL.createObjectURL(image));
  }, [image]);

  const save = async (): Promise<string | null> => {
    if (!payload || state !== "idle") return null;
    setState("saving");
    try {
      const aiOn = settings.ai.enabled && settings.ai.suggestOnCapture && navigator.onLine;
      if (image) {
        const c = await compressImage(image, 1600, 0.8);
        const r = await createItem({
          kind: "image", source: "share", title: payload.title || "Screenshot", note: [note, sharedText].filter(Boolean).join("\n\n"),
          areaId, tags, extra: { image: { width: c.width, height: c.height, mime: "image/webp", bytes: c.bytes } },
        });
        setItemId(r.id);
        setState("saved");
        void processImage(r.id, c);
        if (payload.id !== "get") void del(payload.id, shareStore());
        return r.id;
      } else {
        const r = await createItem({
          kind: url ? "link" : "note", source: "share", url, title: url ? (payload.title && !isHttpUrl(payload.title) ? payload.title : undefined) : sharedText.split("\n")[0],
          note: [note, url ? sharedText : sharedText.split("\n").slice(1).join("\n")].filter(Boolean).join("\n\n"), areaId, tags,
        });
        setItemId(r.id);
        setState("saved");
        if (url && !r.duplicateOf && navigator.onLine) unfurlInBackground(r.id);
        if (!r.duplicateOf) aiFollowUp(r.id, aiOn);
        if (payload.id !== "get") void del(payload.id, shareStore());
        return r.id;
      }
    } catch {
      setState("idle");
      return null;
    }
  };

  const processImage = async (id: string, c: Awaited<ReturnType<typeof compressImage>>) => {
    const patch: Parameters<typeof updateItem>[1] = {};
    const imageMeta = { width: c.width, height: c.height, mime: "image/webp", bytes: c.bytes } as NonNullable<Parameters<typeof updateItem>[1]["image"]>;
    try {
      if (settings.storageMode === "r2") {
        const { key, url: put } = await api<{ key: string; url: string }>("/api/storage/upload-url", { body: { itemId: id, mime: "image/webp", bytes: c.bytes } });
        await fetch(put, { method: "PUT", body: c.blob, headers: { "content-type": "image/webp" } });
        imageMeta.storageKey = key;
      } else if (settings.thumbnails) {
        const thumb = await makeThumbnail(c.blob);
        if (thumb) imageMeta.blobId = await saveBlob(id, thumb);
      }
      if (settings.ai.enabled && settings.ai.taskModels.vision && navigator.onLine && c.base64.length < 2_000_000) {
        setVisionNote("Reading screenshot…");
        const v = await api<{ ocrText: string; description: string; suggestedTitle: string }>("/api/ai/vision", { body: { image: c.base64, mime: "image/webp" } });
        imageMeta.ocrText = v.ocrText;
        patch.description = v.description;
        if (!payload?.title) patch.title = v.suggestedTitle || "Screenshot";
        setVisionNote("Text extracted ✓");
        aiFollowUp(id, settings.ai.suggestOnCapture);
      }
    } catch {
      setVisionNote(null);
    }
    patch.image = imageMeta;
    await updateItem(id, patch).catch(() => {});
  };

  // Instant save: save as soon as the payload and session are ready.
  useEffect(() => {
    if (status === "ready" && payload && settings.instantShareSave && !started.current) {
      started.current = true;
      void save();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, payload, settings.instantShareSave]);

  // Auto-save after 8 s of no interaction when instant save is off.
  useEffect(() => {
    if (status !== "ready" || !payload || settings.instantShareSave || state !== "idle") return;
    const t = setTimeout(() => void save(), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, payload, note, tags, areaId, state]);

  // After saving, edits update the saved item.
  const editSaved = (patch: Parameters<typeof updateItem>[1]) => {
    if (itemId) void updateItem(itemId, patch);
  };

  const done = () => {
    if (window.history.length > 1) window.close();
    router.replace("/inbox");
  };

  if (status === "loading" || payload === undefined) return <div className="flex h-dvh items-center justify-center"><Spinner className="size-5" /></div>;
  if (!payload) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Nothing to save</p>
        <p className="text-[13px] text-muted-foreground">Share a link or screenshot to PersonalHub from another app.</p>
        <Button variant="outline" onClick={() => router.replace("/")}>Open PersonalHub</Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-4 pb-safe">
      <header className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Save to Hub</span>
        {state === "saved" ? <span className="flex items-center gap-1 text-[13px] text-success"><Check className="size-4" /> Saved</span> : state === "saving" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </header>

      <div className="space-y-4">
        <div className="rounded-lg border p-3">
          {image ? (
            preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Shared screenshot" className="max-h-56 w-full rounded-md object-contain" />
            ) : <ImageIcon className="size-6 text-muted-foreground" />
          ) : null}
          <p className="mt-1 line-clamp-2 text-[14px] font-medium">{payload.title || (url ? new URL(url).hostname : sharedText.split("\n")[0]) || "Shared item"}</p>
          {url ? (
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {detectPlatform(url) !== "web" ? <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{PLATFORM_LABELS[detectPlatform(url)]}</span> : null}
              <span className="truncate">{url}</span>
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">{kind === "image" ? "Image · original stays in your gallery" : kind === "link" ? "Link" : "Note"}{visionNote ? ` · ${visionNote}` : ""}</p>
        </div>

        {state === "saved" ? <p className="text-[13px] text-muted-foreground">Saved ✓ — add details?</p> : null}

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Area</p>
          <AreaPicker areas={sortedAreas} value={areaId} onChange={(v) => { setAreaId(v); editSaved({ areaId: v }); }} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tags</p>
          <TagInput value={tags} onChange={(t) => { setTags(t); editSaved({ tags: t }); }} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Note</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note && editSaved({ note: [note, sharedText].filter(Boolean).join("\n\n") })} placeholder="Why is this worth keeping?" className="min-h-20" />
        </div>
      </div>

      <div className="mt-auto flex gap-2 pt-6 pb-4">
        {state === "saved" ? (
          <>
            <Button variant="outline" className="h-12 flex-1" onClick={() => itemId && router.replace(`/item/${itemId}`)}>Open</Button>
            <Button variant="primary" className="h-12 flex-1" onClick={done}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="outline" className="h-12 flex-1" disabled={state !== "idle"} onClick={() => void save().then((id) => id && router.replace(`/item/${id}`))}>Save &amp; open</Button>
            <Button variant="primary" className="h-12 flex-[2] text-base" loading={state === "saving"} onClick={() => void save()}>Save</Button>
          </>
        )}
      </div>
    </main>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareScreen />
    </Suspense>
  );
}
