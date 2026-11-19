/// <reference lib="webworker" />
import { createStore, set } from "idb-keyval";
import {
  NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate, type PrecacheEntry, type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const shareStore = createStore("personalhub-share", "queue");

// Web Share Target: store the payload in IndexedDB, then hand off to /share.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const payload = {
          id: crypto.randomUUID(),
          receivedAt: Date.now(),
          title: String(form.get("title") ?? ""),
          text: String(form.get("text") ?? ""),
          url: String(form.get("url") ?? ""),
          files: form.getAll("files").filter((f): f is File => f instanceof File).slice(0, 5),
        };
        await set(payload.id, payload, shareStore);
        return Response.redirect(`/share?id=${payload.id}`, 303);
      } catch {
        return Response.redirect("/share", 303);
      }
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 4 }) },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")),
      handler: new StaleWhileRevalidate({ cacheName: "static" }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && (request.headers.get("RSC") === "1" || request.destination === "script" || request.destination === "style"),
      handler: new StaleWhileRevalidate({ cacheName: "assets" }),
    },
  ],
});

serwist.addEventListeners();
