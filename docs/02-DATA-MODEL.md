# 02 — Data model (Firestore)

All owner data lives under `users/{uid}`. Server-only data lives in top-level collections
that security rules close to every client (`private`, `captureTokens`, `rateLimits`);
only `firebase-admin` in route handlers can touch them.

Conventions: ids are Firestore auto-ids unless stated · timestamps are Firestore
`Timestamp` set with `serverTimestamp()` · every syncable doc has `createdAt`,
`updatedAt`, `isDeleted` (bool) and `deletedAt` (Timestamp|null) — soft delete so delta
sync can propagate deletions; Trash purges after 30 days (client job on app open).
Zod schemas in `packages/shared/schemas/*.ts` are the source of truth; this file mirrors them.

## 1. Collections

```
users/{uid}                                   # profile + settings
users/{uid}/items/{itemId}
users/{uid}/blobs/{blobId}                    # optional thumbnails (no-storage mode)
users/{uid}/projects/{projectId}
users/{uid}/tasks/{taskId}
users/{uid}/accounts/{accountId}
users/{uid}/tags/{tagSlug}
users/{uid}/rules/{ruleId}
users/{uid}/conversations/{convId}
users/{uid}/conversations/{convId}/messages/{msgId}
users/{uid}/imports/{importId}
users/{uid}/aiUsage/{yyyy-mm-dd}
private/{uid}/aiKeys/{providerId}             # server-only, encrypted
captureTokens/{tokenHash}                     # server-only
rateLimits/{uid_bucket}                       # server-only
```

## 2. Documents

### 2.1 `users/{uid}`

```ts
{
  email: string, displayName: string, photoURL?: string,
  timezone: string,                       // "Asia/Karachi"
  createdAt, updatedAt,
  settings: {
    theme: "system" | "light" | "dark",
    areas: Array<{ id: string; name: string; color: string; icon: string;
                   aiAllowed: boolean; order: number }>,
    // seeded: Career, Freelance, Dev Resources, Study, Projects, Personal, Finance
    defaultAreaId: string | null,
    inboxZeroGoal: "weekly" | "daily",
    thumbnails: boolean,                  // store small thumbnails in no-storage mode
    storageMode: "none" | "r2",
    instantShareSave: boolean,            // default true: /share saves immediately
    pkrPerUsd: number,                    // for Accounts cost summary (user-set)
    views: Array<{ id: string; name: string; filter: LibraryFilter }>,   // max 12 saved Library views
    lastExportAt: Timestamp | null,
    ai: {
      enabled: boolean,
      providers: Array<{ id: string; type: "gemini"|"groq"|"openrouter"|"openai-compatible"|"anthropic";
                         label: string; baseUrl?: string; hasKey: boolean; last4?: string }>,
      taskModels: Record<"summarize"|"classify"|"extract"|"vision"|"chat",
                         { providerId: string; model: string; fallbackProviderId?: string;
                           fallbackModel?: string } | null>,
      suggestOnCapture: boolean,          // run suggest automatically after capture
      autoApply: { enabled: boolean; fields: Array<"tags"|"areaId"|"kind"|"description">;
                   minConfidence: number },   // default disabled, 0.85
      dailyRequestLimit: number           // default 150
    }
  }
}
```

### 2.2 `items/{itemId}`

```ts
{
  kind: "link" | "note" | "image" | "idea" | "decision",
  status: "inbox" | "active" | "archived",
  title: string,                          // ≤ 300
  url: string | null,                     // original
  urlNormalized: string | null,           // lowercased host, no tracking params, no hash
  urlHash: string | null,                 // sha256(urlNormalized) hex, for dedupe
  domain: string | null,
  platform: "web"|"instagram"|"linkedin"|"facebook"|"tiktok"|"youtube"|"x"|"github"
            |"reddit"|"medium"|"other",
  description: string | null,             // ≤ 1000 (from page or AI)
  note: string,                           // Markdown, ≤ 20 000
  selection: string | null,               // highlighted text at capture, ≤ 5 000
  faviconUrl: string | null,
  imageUrl: string | null,                // og:image (remote URL)
  areaId: string | null,
  tags: string[],                         // tag slugs, ≤ 20
  projectId: string | null,
  pinned: boolean,
  source: "web"|"extension"|"share"|"import"|"api"|"assistant",
  capturedAt: Timestamp,
  reviewedAt: Timestamp | null,           // set when leaving inbox
  idea?:     { stage: "someday"|"exploring"|"promoted"|"dropped"; promotedProjectId?: string },
  decision?: { context: string; decision: string; consequences: string; decidedAt: Timestamp },
  image?:    { width: number; height: number; mime: string; bytes: number;
               blobId?: string; storageKey?: string; ocrText?: string },
  unfurl:    { status: "pending"|"ok"|"partial"|"blocked"|"failed"|"skipped";
               siteName?: string; fetchedAt?: Timestamp },
  ai: {
    status: "none"|"pending"|"suggested"|"accepted"|"partially-accepted"|"rejected"|"error",
    summary?: string,                     // ≤ 1200
    suggestion?: {
      title?: string; description?: string; kind?: Item["kind"];
      areaId?: string; tags?: string[];
      tasks?: Array<{ title: string; due?: string /* ISO date */ }>;
      confidence: number                  // 0..1
    },
    provider?: string, model?: string, updatedAt?: Timestamp, error?: string
  },
  rulesApplied: string[],
  createdAt, updatedAt, isDeleted: boolean, deletedAt: Timestamp | null
}
```

### 2.3 `blobs/{blobId}` (no-storage mode only)

`{ itemId: string, mime: "image/webp", dataBase64: string /* ≤ 80 000 chars */, createdAt }`
Loaded only when an image item is opened or shown in grid view.

### 2.4 `projects/{projectId}`

```ts
{ name: string, status: "idea"|"active"|"paused"|"done"|"archived",
  areaId: string|null, color: string,
  problem: string, goal: string, doneWhen: string,   // brief fields, each ≤ 2 000
  deadline: Timestamp|null, links: Array<{label: string; url: string}>,
  lastActivityAt: Timestamp, createdAt, updatedAt, isDeleted, deletedAt }
```
Rule enforced in UI: warn when more than 2 projects are `active` (Standards pack rule).

### 2.5 `tasks/{taskId}`

```ts
{ title: string /* ≤ 300 */, status: "todo"|"doing"|"done",
  due: Timestamp|null, dueHasTime: boolean, priority: 1|2|3,
  projectId: string|null, itemId: string|null, areaId: string|null,
  source: "manual"|"quickadd"|"ai", completedAt: Timestamp|null,
  createdAt, updatedAt, isDeleted, deletedAt }
```

### 2.6 `accounts/{accountId}` — metadata only, never secrets, never sent to AI

```ts
{ service: string, url: string|null,
  category: "email"|"dev"|"cloud"|"social"|"freelance"|"finance"|"university"|"shopping"|"other",
  loginIdentifier: string,                // email or username (no password)
  signInMethod: "password"|"google"|"github"|"apple"|"microsoft"|"magic-link"|"other",
  twoFactor: "none"|"authenticator"|"passkey"|"security-key"|"sms"|"email",
  recoveryLocation: string,               // e.g. "Bitwarden › Dev & Cloud › Vercel"
  plan: string|null, cost: { amount: number; currency: "USD"|"PKR"; cycle: "monthly"|"yearly"|"one-time" } | null,
  renewalDate: Timestamp|null,
  owner: "me"|"client", clientName: string|null,
  status: "active"|"dormant"|"to-close"|"closed",
  lastReviewedAt: Timestamp|null,
  notes: string,                          // ≤ 2 000; secret-pattern check client+server
  createdAt, updatedAt, isDeleted, deletedAt }
```

### 2.7 `tags/{tagSlug}`

`{ name: string, color: string|null, lastUsedAt: Timestamp, createdAt }` — slug =
kebab-case of name. Rename/merge is a batched rewrite of affected items (client batch,
≤ 500 writes per batch).

### 2.8 `rules/{ruleId}`

```ts
{ name: string, enabled: boolean, order: number,
  match: "all" | "any",
  conditions: Array<{ field: "domain"|"url"|"title"|"text"|"platform"|"kind"|"source";
                      op: "equals"|"contains"|"startsWith"|"endsWith"|"in";
                      value: string | string[] }>,     // no user regex (ReDoS risk)
  actions: { setAreaId?: string; addTags?: string[]; setKind?: Item["kind"];
             setStatus?: "active";          // skip inbox
             setProjectId?: string; runAi?: boolean },
  hits: number, lastHitAt: Timestamp|null, createdAt, updatedAt }
```
Evaluation: rules sorted by `order`; every matching rule applies; later rules override
single-value fields; tags union. Pure function `applyRules(item, rules)` in `shared`.

Seed rules: `github.com → Dev Resources + tag github` · `instagram.com|tiktok.com → tag reel`
· `linkedin.com/jobs → Career + tag job` · `free-for.dev, *.dev docs → Dev Resources`.

### 2.9 `conversations/{convId}` and `messages/{msgId}`

```ts
conversation: { title: string, createdAt, updatedAt }
message: { role: "user"|"assistant", content: string /* ≤ 20 000 */,
           actions?: Array<{ id: string; type: "create_item"|"update_item"|"create_task"|"create_project";
                             payload: object; status: "proposed"|"applied"|"dismissed" }>,
           provider?: string, model?: string, createdAt }
```
Keep the latest 50 conversations; older ones deleted on app open.

### 2.10 `imports/{importId}`

`{ type: "chrome-html"|"url-list"|"csv"|"json-backup", status: "parsing"|"review"|"done",
   total, created, duplicates, failed, createdAt, updatedAt }`

### 2.11 `aiUsage/{yyyy-mm-dd}`

`{ requests: number, byTask: Record<string, number>, byProvider: Record<string, number>,
   tokensIn: number, tokensOut: number }` — written by server with `FieldValue.increment`.

### 2.12 Server-only

```ts
private/{uid}/aiKeys/{providerId}:
  { ciphertext: string, iv: string, authTag: string, keyVersion: number,
    last4: string, createdAt, updatedAt }
captureTokens/{sha256(pepper + token)}:
  { uid: string, name: string, scopes: ("capture"|"read:taxonomy")[],
    last4: string, createdAt, lastUsedAt: Timestamp|null, revokedAt: Timestamp|null }
rateLimits/{uid}_{window}:
  { count: number, windowStart: Timestamp }
```

## 3. Indexes (`firebase/firestore.indexes.json`)

| Collection | Fields | Used by |
|---|---|---|
| items | `isDeleted` ASC, `status` ASC, `capturedAt` DESC | Inbox, Library default |
| items | `isDeleted` ASC, `areaId` ASC, `updatedAt` DESC | Area filter |
| items | `isDeleted` ASC, `projectId` ASC, `updatedAt` DESC | Project detail |
| items | `urlHash` ASC, `isDeleted` ASC | Dedupe |
| items | `updatedAt` ASC | Delta sync (single-field, automatic) |
| tasks | `isDeleted` ASC, `status` ASC, `due` ASC | Tasks, Home upcoming |
| tasks | `isDeleted` ASC, `projectId` ASC, `status` ASC | Project detail |
| accounts | `isDeleted` ASC, `renewalDate` ASC | Home renewals |
| projects | `isDeleted` ASC, `status` ASC, `lastActivityAt` DESC | Projects list |

Tag/kind/platform filtering in Library happens client-side on the synced set (personal
scale: up to ~10 000 items).

## 4. Sync strategy

1. On sign-in, Firestore is initialised with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
2. Per collection, read `lastSyncAt` from IndexedDB; `getDocs(where("updatedAt", ">", lastSyncAt))`
   (includes soft-deleted docs) → upsert/remove in the local store + MiniSearch index.
3. Attach `onSnapshot(where("updatedAt", ">", syncStart))` for live changes.
4. Every write sets `updatedAt: serverTimestamp()`.

## 5. Security rules (`firebase/firestore.rules`)

`OWNER_EMAILS_PLACEHOLDER` is replaced from `OWNER_EMAILS` by `scripts/render-rules.mjs`
before `firebase deploy --only firestore`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isOwner(uid) {
      return signedIn()
        && request.auth.uid == uid
        && request.auth.token.email_verified == true
        && request.auth.token.email in OWNER_EMAILS_PLACEHOLDER;   // e.g. ['me@x.com']
    }
    function str(v, max) { return v is string && v.size() <= max; }
    function optStr(v, max) { return v == null || str(v, max); }
    function stamped() {
      return request.resource.data.updatedAt == request.time;
    }
    function createStamped() {
      return stamped() && request.resource.data.createdAt == request.time;
    }
    function immutableCreatedAt() {
      return request.resource.data.createdAt == resource.data.createdAt;
    }

    function validItem(d) {
      return d.keys().hasOnly(['kind','status','title','url','urlNormalized','urlHash','domain',
          'platform','description','note','selection','faviconUrl','imageUrl','areaId','tags',
          'projectId','pinned','source','capturedAt','reviewedAt','idea','decision','image',
          'unfurl','ai','rulesApplied','createdAt','updatedAt','isDeleted','deletedAt'])
        && d.kind in ['link','note','image','idea','decision']
        && d.status in ['inbox','active','archived']
        && str(d.title, 300)
        && optStr(d.url, 2048)
        && str(d.note, 20000)
        && d.tags is list && d.tags.size() <= 20
        && d.isDeleted is bool;
    }

    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid) && request.resource.data.email == request.auth.token.email;
      allow update: if isOwner(uid) && request.resource.data.email == resource.data.email;
      allow delete: if false;

      match /items/{id} {
        allow read: if isOwner(uid);
        allow create: if isOwner(uid) && validItem(request.resource.data) && createStamped();
        allow update: if isOwner(uid) && validItem(request.resource.data) && stamped() && immutableCreatedAt();
        allow delete: if isOwner(uid) && resource.data.isDeleted == true;   // purge from trash only
      }

      match /blobs/{id} {
        allow read, delete: if isOwner(uid);
        allow create: if isOwner(uid) && str(request.resource.data.dataBase64, 80000);
        allow update: if false;
      }

      match /accounts/{id} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && str(request.resource.data.service, 120)
          && str(request.resource.data.notes, 2000)
          && !('password' in request.resource.data)
          && !('secret' in request.resource.data)
          && stamped();
        allow delete: if isOwner(uid) && resource.data.isDeleted == true;
      }

      // projects, tasks, tags, rules, conversations(+messages), imports:
      // same pattern — owner only, shape checks for required fields and sizes, stamped().
      match /{coll}/{id} {
        allow read: if isOwner(uid) && coll in ['projects','tasks','tags','rules','conversations','imports','aiUsage'];
        allow write: if isOwner(uid) && coll in ['projects','tasks','tags','rules','conversations','imports'];
        match /messages/{mid} {
          allow read, write: if isOwner(uid) && coll == 'conversations';
        }
      }
    }

    // Server-only
    match /private/{document=**}       { allow read, write: if false; }
    match /captureTokens/{document=**} { allow read, write: if false; }
    match /rateLimits/{document=**}    { allow read, write: if false; }
  }
}
```

Claude Code: replace the generic `/{coll}/{id}` block with explicit per-collection blocks
and validators (`validProject`, `validTask`, `validRule`, …) in Phase 1–5 as each
collection is implemented, and cover each with rules tests (owner allowed, other user
denied, unauthenticated denied, bad shape denied, server-only denied). `aiUsage` is
written only by the server.
