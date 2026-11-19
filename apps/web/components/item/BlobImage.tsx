"use client";

import { useEffect, useState } from "react";
import { getDoc } from "firebase/firestore";
import type { Item } from "@personalhub/shared";
import { docRef } from "@/lib/data/repos";
import { api } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/primitives";

/** Loads a thumbnail from `blobs` (no-storage mode) or a presigned R2 URL. */
export function BlobImage({ image, className }: { image: NonNullable<Item["image"]>; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (image.storageKey) {
          const { url } = await api<{ url: string }>(`/api/storage/view-url?key=${encodeURIComponent(image.storageKey)}`);
          if (!cancelled) setSrc(url);
        } else if (image.blobId) {
          const snap = await getDoc(docRef("blobs", image.blobId));
          const d = snap.data();
          if (!cancelled && d) setSrc(`data:${d.mime};base64,${d.dataBase64}`);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [image.blobId, image.storageKey]);
  if (failed) return <p className="text-[13px] text-muted-foreground">Image unavailable.</p>;
  if (!src) return <Skeleton className="h-40 w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className ?? "max-h-80 w-full rounded-md border object-contain"} />;
}
