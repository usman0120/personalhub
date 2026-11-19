# 08 — Implementation plan

Work top to bottom. Each step = one or a few commits, ends with its acceptance criteria
passing (`lint`, `typecheck`, `test`, and `test:rules` when rules changed). Rough effort
assumes 2 focused hours/day with Claude Code; the whole v1 is ~8–10 weeks part-time.
**Milestone gates (★)**: stop, use the app for real for a few days, write issues in
`docs/OPEN-QUESTIONS.md`, then continue.

## Phase 0 — Foundations (week 1)

**0.1 Monorepo scaffold.** npm workspaces `apps/web`, `apps/extension`, `packages/shared`,
`firebase/`. TypeScript strict, ESLint, Prettier, Vitest, `.editorconfig`, `.gitignore`,
`.env.example`, MIT license, README, CHANGELOG.
*AC:* `npm run lint typecheck test build` pass on an empty app.

**0.2 Next.js app shell.** App Router, Tailwind, shadcn/ui init, theme toggle, layout with
sidebar/bottom nav placeholders, 404 page, `/api/health`.
*AC:* deploys to Vercel; `/api/health` returns ok; Lighthouse PWA-ready basics.

**0.3 Firebase setup.** Create Spark project; enable Auth (Google, email/password) and
Firestore (production mode, nearest region — verify options); `firebase.json`, emulators;
`scripts/render-rules.mjs`; base deny-all rules + owner rules for `users/{uid}`;
rules test harness (`@firebase/rules-unit-testing`).
*AC:* rules tests: owner can read own user doc; other user/unauth denied; `private/**` denied.

**0.4 CI.** GitHub Actions: install, lint, typecheck, unit tests, rules tests (emulator),
build. Dependabot.
*AC:* green pipeline on PR.

## Phase 1 — Core items (weeks 2–3)

**1.1 Auth flow.** Sign-in page, `AuthProvider`, protected `(app)` layout, allow-list check
(client sign-out + server `verify.ts`), first-run seeding (areas, rules, settings).
*AC:* non-allow-listed account is rejected; seeded docs exist; e2e sign-in test with emulator.

**1.2 Shared schemas.** Zod schemas for all entities + API payloads; `normalizeUrl`,
`detectPlatform`, `parseQuickAdd`, `applyRules` with unit tests (≥ 30 cases incl.
Instagram `igsh`, LinkedIn `trk`, YouTube `si`, utm params).
*AC:* 100% branch coverage for these pure functions.

**1.3 Items repository + rules.** Typed CRUD (create, update, soft delete, restore,
purge) via Firestore SDK; `validItem` rules; persistent cache; delta sync + live listener.
*AC:* rules tests for items (valid create, oversized note denied, foreign uid denied,
hard delete only when `isDeleted`); offline create syncs after reconnect (manual test).

**1.4 Quick capture + Inbox (basic) + Library (basic) + Item drawer.** Quick-add parser
wired; list virtualisation; item card; drawer editing with autosave; Markdown note with
sanitised preview; trash.
*AC:* create link/note/idea from quick add; edit; archive; delete → trash → restore.

**1.5 `/api/capture` + `/api/unfurl`.** Server auth (ID token), dedupe by `urlHash`,
rules application, SSRF-safe unfurl with tests (private IP blocked, redirect to private
blocked, size cap, non-HTML rejected, Instagram returns `blocked` gracefully).
*AC:* pasting `https://free-for.dev` creates an item with title/description/favicon within ~3 s.

**1.6 Search.** MiniSearch index persisted in IndexedDB; Cmd-K palette; Library search box.
*AC:* search returns results across title/note/tags/domain in < 100 ms for 5 000 items (benchmark test with fixtures).

★ **Gate 1:** use quick add daily for 3 days.

## Phase 2 — Capture everywhere (weeks 3–4)

**2.1 PWA.** Manifest, icons, Serwist SW, install prompt UI, offline banner.
*AC:* installable on Android Chrome; app shell works offline.

**2.2 Share target.** `/share-target` SW handler, IndexedDB queue, `/share` screen with
instant save, URL extraction from `text`, tracking-param stripping, image resize/WebP,
thumbnail to `blobs` (if enabled).
*AC (manual on device):* share an Instagram reel, a LinkedIn post, a YouTube video, a
Gallery screenshot → each appears in Inbox with correct platform within 2 taps.

**2.3 Capture tokens.** `/api/tokens` routes, Settings › Capture UI, token hashing, auth
mode `captureToken` in `/api/capture` and `/api/taxonomy`, rate limiting.
*AC:* revoked token gets 401; token shown once; unit tests for hashing/lookup.

**2.4 Chrome extension.** Vite MV3 build, options page, popup Quick Save with selection +
meta description, context menus, `Alt+Shift+S`, offline queue, duplicate notice, save all
tabs (optional `tabs` permission).
*AC:* save from 5 different sites incl. a `chrome://` page (URL-only); offline save
queues and sends later; no permissions beyond 05-CAPTURE §3.

**2.5 Import.** `/api/import/parse` (Netscape HTML, txt, CSV) with fixtures; Import wizard;
batch writes; folder→tag mapping; dedupe; optional dead-link check.
*AC:* importing a 500-bookmark export creates ≤ 500 items, reports duplicates, finishes
< 60 s; Inbox filter "this import" works.

★ **Gate 2:** import your real bookmarks; triage at least 100.

## Phase 3 — Organise (week 5)

**3.1 Areas & tags management.** Settings pages; tag rename/merge as batched rewrites with undo.
**3.2 Rules engine UI.** Rules list/editor/test panel; `hits` counter; seed rules editable.
**3.3 Inbox (full).** Suggestion chips (rules now; AI later), keyboard shortcuts, bulk
actions, multi-select, filters, Inbox-zero state.
**3.4 Library (full).** Facets, filters, sort, grid view, saved views (max 12).
*AC (phase):* 50 items triaged in ≤ 10 min with keyboard only (timed manual test); rule
"github.com → Dev Resources" auto-applies on capture.

## Phase 4 — AI assistant (weeks 6–7)

**4.1 Key management.** Crypto module + tests; `PUT/DELETE /api/settings/ai-key`;
`/api/ai/test`; Settings › AI UI (providers, per-task models, toggles, privacy notice).
*AC:* key never appears in any client response or log (test asserts); Test button works for Gemini and one OpenAI-compatible provider.
**4.2 Provider adapters.** Gemini, OpenAI-compatible (covers Groq/OpenRouter), Anthropic;
JSON mode + repair retry; timeouts; 429 handling. Contract tests with mocked HTTP.
**4.3 Suggest.** `/api/ai/suggest` (classify + summarize), area `aiAllowed` enforcement,
auto-apply logic, usage counters, rate limits; Inbox/Item AI panels; "Process with AI" batch runner.
*AC:* for 10 fixture items, suggestions validate against schema; area ids outside the list are dropped; Accounts never reachable.
**4.4 Vision.** `/api/ai/vision`; screenshot flow fills `ocrText`, description, title.
**4.5 Assistant.** Conversations, streaming chat, retrieval via client MiniSearch ids,
URL unfurl in chat, action cards (propose → apply/edit/dismiss), `/api/ai/actions/apply`.
*AC:* "What is this? https://free-for.dev" → explanation + Save card → Apply creates an item in Dev Resources with tags and description.

★ **Gate 3:** one week of daily use with AI on; tune prompts; note costs/quotas.

## Phase 5 — Projects, tasks, accounts (week 8)

**5.1 Tasks.** Repository, rules, Tasks screen, natural-language quick add, Home sections.
**5.2 Projects.** List/detail tabs, brief fields, linked items/tasks/decisions, idea →
project promotion, > 2 active warning.
**5.3 Accounts.** Registry screen, form with secret guard (client + rules + tests),
review/renewal logic, summary bar, filters; excluded from AI and search snippets show no notes.
*AC:* Home "Upcoming" merges task dues and renewals for 30 days; secret guard blocks
`password: abc123` in notes (unit + e2e).

## Phase 6 — Hardening & release (weeks 9–10)

**6.1 Export ZIP** (JSON, Markdown with front-matter, CSV) + JSON backup import (round-trip test).
**6.2 Trash purge job, conversation pruning, backup reminder.**
**6.3 Security headers & CSP**, Firebase API key restrictions, authorised domains, final rules review.
**6.4 Accessibility pass** (axe in Playwright on main screens; keyboard-only run).
**6.5 Performance:** Lighthouse mobile ≥ 90 Performance/Accessibility/Best Practices on Home, Inbox, Library.
**6.6 Docs:** README with screenshots + GIF, architecture diagram, case study draft for portfolio, v1.0.0 tag.
*AC:* all tests green; checklists in 07-SECURITY §10 and 09-TESTING §4 done.

## Backlog (only after a month of daily use)

Web push reminders (FCM) · daily digest · semantic search (embeddings) · read-only MCP
endpoint for Claude/ChatGPT · Instagram/LinkedIn data-export importers · TWA Play Store
package · R2 full-image mode · periodic dead-link check.

## First prompt to give Claude Code

> Read CLAUDE.md and every file in docs/ in order. Then summarise the product, the
> constraints and Phase 0 in 10 bullet points, list any contradictions or open questions
> you see, and wait for my answer before writing code. After I confirm, implement step
> 0.1 only and stop for review.
