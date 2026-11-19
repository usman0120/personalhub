# 05 — Capture: PWA share target, Chrome extension, Android, imports

## 1. Capture channels

| Channel | Captures | Auth | v1 |
|---|---|---|---|
| Web quick-add / Cmd-K | URL, text, task, idea | Firebase session | ✓ |
| PWA share target (Android) | Links/text from Instagram, LinkedIn, TikTok, YouTube, Facebook, X, Chrome; images from Gallery/Screenshots | Firebase session (in PWA) | ✓ |
| Chrome extension | Current page, link, selection, image link, all tabs | Capture token | ✓ |
| Import | Bookmarks HTML, URL list, CSV, JSON backup | Firebase session | ✓ |
| Capture API | Anything that can send HTTP (Android "HTTP Shortcuts" app, scripts) | Capture token | ✓ (same endpoint) |
| Platform exports (e.g. Instagram "Download your information" saved posts) | Old saved reels in bulk | — | Backlog; verify export format first |

Saved reels/posts already inside Instagram or LinkedIn have no public API for your saved
list. Strategy: from now on share new ones to PersonalHub; clear the old backlog by opening
each saved collection and sharing items (or later, a data-export importer).

## 2. PWA

### 2.1 Manifest (`app/manifest.ts`)

```ts
export default function manifest() {
  return {
    name: "PersonalHub", short_name: "Hub", id: "/", start_url: "/?source=pwa",
    scope: "/", display: "standalone", background_color: "#0f172a", theme_color: "#0f172a",
    icons: [ { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
             { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
             { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" } ],
    share_target: {
      action: "/share-target", method: "POST", enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url",
                files: [ { name: "files", accept: ["image/png","image/jpeg","image/webp","image/gif"] } ] }
    },
    shortcuts: [ { name: "Quick capture", url: "/?capture=1" }, { name: "Inbox", url: "/inbox" } ]
  };
}
```

### 2.2 Service worker (Serwist) — share handling

```ts
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const payload = {
        id: crypto.randomUUID(), receivedAt: Date.now(),
        title: form.get("title") ?? "", text: form.get("text") ?? "", url: form.get("url") ?? "",
        files: form.getAll("files").filter((f) => f instanceof File).slice(0, 5)
      };
      await idbPut("shareQueue", payload);         // idb-keyval store; Files are structured-cloneable
      return Response.redirect(`/share?id=${payload.id}`, 303);
    })());
  }
});
```

Notes:
- Many apps put the link in `text` instead of `url` (Instagram, LinkedIn often send
  "Check out this post… https://…"). `/share` must extract the first URL from `text`.
- Strip tracking params (`igsh`, `utm_*`, `si`, `fbclid`, `trk`, …) in `normalizeUrl`.
- Images: on `/share`, decode with `createImageBitmap`, resize to max 1600 px long edge,
  encode WebP q=0.8 (canvas). Then: vision AI (if enabled) → `ocrText`, description,
  suggested title; thumbnail (≤ 400 px, ≤ 60 KB) to `blobs` if thumbnails on; or upload to
  R2 if `storageMode = r2`. Original never stored in no-storage mode — the item says
  "Original stays in your gallery".
- Precache the app shell; runtime cache `NetworkFirst` for pages, `StaleWhileRevalidate`
  for static assets; never cache `/api/*`.

### 2.3 Install & test (Android)

1. Open the Vercel URL in **Chrome for Android** → menu → **Install app** (or "Add to Home
   screen" → Install). Share target registration requires the installed (WebAPK) app.
2. In Instagram: Share → (scroll the share sheet / "More") → **Hub**. Pin it in the share
   sheet for one-tap access.
3. In Gallery: select screenshot(s) → Share → **Hub**.
4. Settings › Capture has a "Test share target" check that confirms `navigator.standalone`
   / `display-mode: standalone` and SW registration.

### 2.4 Android permissions

| Context | Permission | Needed? | Why / how |
|---|---|---|---|
| PWA (v1) | Manifest permissions | **None** | PWAs have no install-time permissions; the WebAPK Chrome mints only declares what Chrome needs |
| PWA | Notifications | Not in v1 | Only when push reminders ship (backlog), requested in context with explanation, never on first load |
| PWA | Clipboard read | Optional | "Paste from clipboard" button calls `navigator.clipboard.readText()` on user tap; Chrome prompts once |
| PWA | Camera / microphone / location / contacts / storage | **Never** | Images arrive via share target or file picker (`<input type="file" accept="image/*">`, uses the system photo picker without storage permission) |
| Future TWA (Bubblewrap) | `INTERNET` | Yes | Default; nothing else for the same feature set |
| Future native (Flutter) | `INTERNET`; `POST_NOTIFICATIONS` (Android 13+) only if reminders | Minimal | Receive shares with an `ACTION_SEND`/`ACTION_SEND_MULTIPLE` intent filter (`text/plain`, `image/*`); use the Android Photo Picker — **no** `READ_MEDIA_IMAGES`/`READ_EXTERNAL_STORAGE` |

Principle: request nothing at install, ask only at the moment of use, explain why, and the
app must work fully when a permission is denied.

## 3. Chrome extension (Manifest V3)

### 3.1 `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "PersonalHub Capture",
  "version": "1.0.0",
  "description": "Save pages, links and notes to your PersonalHub in one click.",
  "action": { "default_popup": "popup.html", "default_title": "Save to PersonalHub" },
  "background": { "service_worker": "background.js", "type": "module" },
  "options_page": "options.html",
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "permissions": ["activeTab", "contextMenus", "storage", "scripting"],
  "optional_permissions": ["tabs"],
  "host_permissions": ["https://YOUR-APP.vercel.app/*"],
  "commands": {
    "quick-save": { "suggested_key": { "default": "Alt+Shift+S" }, "description": "Save current page" },
    "_execute_action": { "suggested_key": { "default": "Alt+Shift+P" } }
  },
  "content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }
}
```

| Permission | Why | Notes |
|---|---|---|
| `activeTab` | Read URL/title of the current tab when the user clicks/uses shortcut | No broad host access; no install warning |
| `scripting` | Inject a one-off function to read `window.getSelection()` and `<meta name=description>` from the active tab | Only after user gesture (activeTab) |
| `contextMenus` | Right-click save | — |
| `storage` | Token, settings, offline queue (`chrome.storage.local`) | Token never in `sync` storage |
| `host_permissions` (your app origin only) | Call `/api/*` without CORS issues | Set at build from env `HUB_ORIGIN` |
| `tabs` (optional) | "Save all tabs in window" | Requested at runtime the first time that feature is used |

Not requested: `<all_urls>`, `bookmarks`, `history`, `cookies`, `webRequest`. Bookmark
cleanup uses the HTML export → web Import instead of the `bookmarks` permission.

### 3.2 Flows

- **Popup open:** `chrome.tabs.query({active:true,currentWindow:true})` → `scripting.executeScript`
  returns `{selection, metaDescription}` → fetch `/api/taxonomy` (cached 10 min) → render.
  Restricted pages (`chrome://`, Web Store) → disable selection read, still allow URL save.
- **Save:** `POST /api/capture` `{source:"extension", url, title, selection, note, areaId,
  tags, kind, faviconUrl, runAi}`. On network failure → push to queue; retry with backoff
  on `chrome.runtime.onStartup` and when popup opens.
- **Quick-save command:** same without popup; badge text `✓` for 2 s, `!` on error.
- **Save all tabs:** request `tabs` → list tabs in current window (skip pinned & chrome://)
  → confirm count → sequential captures (max 50) with a shared tag `session-YYYY-MM-DD`.
- **Options:** hub URL (validated https), capture token (password field; "Test" calls
  `/api/taxonomy`), defaults.
- Build: Vite multi-entry (popup, options, background), TypeScript, shared Zod schemas
  imported from `packages/shared`. Load unpacked for personal use; Chrome Web Store
  publishing (one-time developer fee) is optional and not needed for personal use.
  `verify current fee`

## 4. Capture API for other tools

`POST {APP_ORIGIN}/api/capture` with `Authorization: Bearer ph_…` and JSON
`{ "source": "api", "url": "…", "note": "…" }`. Example Android "HTTP Shortcuts" app
setup is documented in Settings › Capture (optional; the PWA share target covers most
needs).

## 5. Import (bookmarks clean-up)

1. Chrome → Bookmarks manager (`Ctrl+Shift+O`) → ⋮ → **Export bookmarks** → HTML file.
2. PersonalHub › Import → upload → preview (parse Netscape bookmark format: `<DT><A
   HREF ADD_DATE>` within nested `<DL>` folders → `folderPath`).
3. Map folders to tags (default: last folder name → tag; "Bookmarks bar" ignored).
4. Duplicates (by `urlHash`) skipped or merged.
5. Items land in Inbox with `source: "import"`. Triage with keyboard: K keep, R archive,
   D delete. Optional "Check dead links" (HEAD via `/api/unfurl`, batched 5 at a time)
   marks `unfurl.status = "failed"` so they can be bulk-deleted.
6. After import and triage, delete the browser bookmarks you no longer need, keeping
   only a handful of daily-use links in the bookmarks bar.
