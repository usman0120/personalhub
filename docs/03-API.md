# 03 — API (Next.js route handlers)

All routes: `runtime = "nodejs"`, JSON in/out, Zod-validated, response envelope:

```ts
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: "UNAUTHENTICATED"|"FORBIDDEN"|"INVALID_INPUT"|"NOT_FOUND"
                               |"RATE_LIMITED"|"UPSTREAM_ERROR"|"AI_NOT_CONFIGURED"|"INTERNAL";
                               message: string; details?: unknown } };
```

**Auth modes**
- `idToken`: `Authorization: Bearer <Firebase ID token>`; server `verifyIdToken(token, true)`
  (checks revocation), requires `email_verified` and email ∈ `OWNER_EMAILS`.
- `captureToken`: `Authorization: Bearer ph_<random>`; server looks up
  `captureTokens/{sha256(pepper+token)}`, rejects revoked, updates `lastUsedAt` (at most once/hour).
- Routes accepting both are marked `idToken | captureToken`.

**Cross-cutting:** rate limit per uid (default 60 req/min overall, AI routes 10/min and
`dailyRequestLimit`/day) · request body max 1 MB (images go client-side compressed, ≤ 1.5 MB
for vision only) · CORS: only `APP_ORIGIN` and `chrome-extension://{EXTENSION_IDS}` ·
no secrets or stack traces in errors · structured server logs without item content.

## Capture & items

### `POST /api/capture` — `idToken | captureToken`
Create an item from any client.
```ts
in:  { url?: string; title?: string; text?: string; selection?: string; note?: string;
       kind?: "link"|"note"|"idea"; areaId?: string; tags?: string[];
       source: "extension"|"share"|"api"|"web"; faviconUrl?: string;
       runUnfurl?: boolean /* default true when url */; runAi?: boolean /* default settings.ai.suggestOnCapture */ }
out: { itemId: string; duplicateOf?: string; status: "inbox"|"active" }
```
Steps: validate (at least `url` or `text`) → if `text` contains a URL and no `url`, extract
first URL → normalise + hash → **dedupe**: if a non-deleted item has the same `urlHash`,
append the new note/selection to it, bump `updatedAt`, return `duplicateOf` → detect
platform → `applyRules` → write item → if `runUnfurl`, call unfurl inline with a 4 s
budget (else leave `unfurl.status = "pending"` for the client to trigger) → if `runAi` and
area allows AI, enqueue by setting `ai.status = "pending"` (client or extension calls
`/api/ai/suggest`).

### `POST /api/unfurl` — `idToken | captureToken`
`in: { itemId: string }` or `{ url: string }` (preview only, nothing saved)
`out: { title?, description?, siteName?, imageUrl?, faviconUrl?, canonicalUrl?, status }`
Safe fetch (see 07-SECURITY §SSRF): http/https only, DNS resolve and block private/
loopback/link-local/metadata ranges on every redirect (max 3), 5 s timeout, 1 MB cap,
`text/html` only, custom User-Agent. Parse `<title>`, OpenGraph, Twitter Card, JSON-LD
`name/description`, `<link rel=icon>`. For instagram/tiktok/facebook/linkedin a login wall
is expected → `status: "blocked"`, keep URL + platform; never retry with tricks.

### `GET /api/taxonomy` — `idToken | captureToken (read:taxonomy)`
`out: { areas: Area[]; tags: {slug,name}[]; projects: {id,name}[] }` (for extension pickers).

## AI

### `POST /api/ai/suggest` — `idToken | captureToken`
`in: { itemId: string; force?: boolean }`
Builds input from item (title, url, domain, platform, description, note, selection,
`image.ocrText`), existing areas/tags (so AI reuses them) → runs `classify` (+ `summarize`
if description/note is long) → validates JSON against `SuggestionSchema` → writes
`ai.status = "suggested"` and `ai.suggestion` → if `autoApply.enabled` and
`confidence ≥ minConfidence`, applies allowed fields and sets `ai.status = "accepted"`.
Refuses with `FORBIDDEN` if the item's area has `aiAllowed: false`.

### `POST /api/ai/vision` — `idToken`
`in: { image: base64 webp (≤ 1.5 MB), hint?: string }` → `out: { ocrText, description, suggestedTitle }`

### `POST /api/ai/chat` — `idToken` (streaming, `text/event-stream`)
`in: { conversationId?: string; message: string; contextItemIds?: string[] }`
Server: if the message contains a URL → unfurl it; retrieve up to 8 relevant items via the
client-sent `contextItemIds` (client runs MiniSearch and sends ids) → call `chat` model with
system prompt (06-AI §5) and tool schema for **proposed actions** → stream text; final event
carries `actions[]` (status `proposed`). Persist both messages.

### `POST /api/ai/actions/apply` — `idToken`
`in: { conversationId, messageId, actionId, edits?: object }` → applies one proposed action
(after Zod validation of payload + edits) → marks it `applied` → returns created/updated ids.

### `POST /api/ai/test` — `idToken`
`in: { providerId }` → sends a 1-token ping → `{ ok, latencyMs, model }`.

## Settings & secrets

### `PUT /api/settings/ai-key` — `idToken`
`in: { providerId, type, label, apiKey, baseUrl? }` → validates baseUrl (https, not private
IP) → encrypts with AES-256-GCM (`KEY_ENCRYPTION_SECRET`, random 12-byte IV) → stores in
`private/{uid}/aiKeys/{providerId}` → updates `settings.ai.providers[]` (`hasKey`, `last4`).
Key never returned.

### `DELETE /api/settings/ai-key/{providerId}` — `idToken`

### `GET /api/tokens` · `POST /api/tokens` · `DELETE /api/tokens/{id}` — `idToken`
POST `in: { name, scopes }` → generates `ph_` + 32 random bytes base64url → stores hash →
returns the plaintext **once**. GET lists `{ id(last4-based), name, scopes, createdAt,
lastUsedAt, revokedAt }`.

## Storage (only when `STORAGE_DRIVER=r2`)

### `POST /api/storage/upload-url` — `idToken`
`in: { itemId, mime: "image/webp"|"image/png"|"image/jpeg", bytes ≤ 5 MB }` →
`out: { key: "u/{uid}/{itemId}/{uuid}.webp", url (presigned PUT, 5 min) }`

### `GET /api/storage/view-url?key=…` — `idToken`
Checks the key prefix is `u/{uid}/` → presigned GET (10 min).

### `DELETE /api/storage/object?key=…` — `idToken`

## Import & export

### `POST /api/import/parse` — `idToken`
`in: multipart file (≤ 5 MB): Chrome/Edge/Firefox bookmarks HTML | .txt URL list | .csv`
→ `out: { entries: Array<{ url, title, folderPath, addDate? }>, duplicatesInFile }`
(no writes; the client reviews, then writes in batches of ≤ 400 with `source: "import"`,
folder path converted to tags, status `inbox`).

### Export (client-side, no route)
Settings → Export builds a ZIP in the browser: `items.json`, `projects.json`, `tasks.json`,
`accounts.json`, `rules.json`, `settings.json`, plus `markdown/` (one `.md` per item with
front-matter) and `items.csv`. Never includes AI keys or tokens.

## Health

### `GET /api/health` — public → `{ ok: true, version, time }` (no data).
