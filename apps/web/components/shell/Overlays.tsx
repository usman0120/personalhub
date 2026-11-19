"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { Sheet } from "@/components/ui/overlay";
import { ItemDetail } from "@/components/item/ItemDetail";
import { useUi } from "./UiProvider";

export function ItemDrawer() {
  const { itemId, openItem } = useUi();
  return (
    <Sheet open={Boolean(itemId)} onOpenChange={(v) => !v && openItem(null)} title="Item">
      {itemId ? <ItemDetail id={itemId} onClose={() => openItem(null)} /> : null}
    </Sheet>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b bg-warning/15 px-4 py-1.5 text-xs">
      <CloudOff className="size-3.5" /> Offline — changes will sync
    </div>
  );
}
