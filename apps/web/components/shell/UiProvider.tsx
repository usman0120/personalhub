"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isTypingTarget } from "@/lib/ui";

interface UiState {
  itemId: string | null;
  openItem: (id: string | null) => void;
  captureOpen: boolean;
  setCaptureOpen: (v: boolean, initial?: string) => void;
  captureInitial: string;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
}

const Ctx = createContext<UiState | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [captureOpen, setCapture] = useState(false);
  const [captureInitial, setInitial] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const setCaptureOpen = useCallback((v: boolean, initial = "") => {
    setInitial(initial);
    setCapture(v);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        if (document.querySelector("[role=dialog]")) return;
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    const params = new URLSearchParams(window.location.search);
    if (params.get("capture") === "1") setCaptureOpen(true);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCaptureOpen]);

  return (
    <Ctx.Provider value={{ itemId, openItem: setItemId, captureOpen, setCaptureOpen, captureInitial, paletteOpen, setPaletteOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUi outside UiProvider");
  return c;
}
