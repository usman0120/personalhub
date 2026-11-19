"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/providers/HubProvider";
import { UiProvider } from "@/components/shell/UiProvider";
import { BottomNav, Sidebar, TopBar } from "@/components/shell/Nav";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ItemDrawer, OfflineBanner } from "@/components/shell/Overlays";
import { QuickCaptureDialog } from "@/components/capture/QuickCapture";
import { SearchProvider } from "@/lib/search";
import { Spinner } from "@/components/ui/primitives";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useHub();
  const router = useRouter();
  useEffect(() => {
    if (status === "signedOut" || status === "rejected") router.replace("/signin");
  }, [status, router]);

  if (status !== "ready") {
    return (
      <div className="flex h-dvh items-center justify-center" aria-busy="true">
        <Spinner className="size-5" />
      </div>
    );
  }
  return (
    <UiProvider>
      <SearchProvider>
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <OfflineBanner />
            <main id="main" className="flex min-h-0 flex-1 flex-col pb-16 md:pb-0">{children}</main>
          </div>
        </div>
        <BottomNav />
        <QuickCaptureDialog />
        <CommandPalette />
        <ItemDrawer />
      </SearchProvider>
    </UiProvider>
  );
}
