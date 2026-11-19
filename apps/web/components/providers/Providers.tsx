"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { SerwistProvider } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";
import { TipProvider } from "@/components/ui/overlay";
import { HubProvider, useHub } from "./HubProvider";

/** Keeps next-themes in sync with the theme stored in settings. */
function ThemeSync() {
  const { settings, status } = useHub();
  const { setTheme } = useTheme();
  useEffect(() => {
    if (status === "ready") setTheme(settings.theme);
  }, [settings.theme, status, setTheme]);
  return null;
}

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" options={{ scope: "/" }} disable={process.env.NODE_ENV !== "production"} reloadOnOnline={false}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <HubProvider>
        <TipProvider>
          <ThemeSync />
          {children}
          <Toaster position="bottom-right" closeButton toastOptions={{ className: "text-[13px]" }} />
        </TipProvider>
      </HubProvider>
    </ThemeProvider>
    </SerwistProvider>
  );
}
