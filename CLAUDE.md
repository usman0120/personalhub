# CLAUDE.md — PersonalHub

You are building **PersonalHub**, a single-owner personal information hub for Usman Ahmad:
capture links, reels, screenshots, notes, ideas, decisions, tasks, projects and an account
registry from browser and phone in one or two taps, then organise them with deterministic
rules first and an optional, user-approved AI assistant second.

> Product principle: **the software manages the information; the user should not get a
> second job managing the software.** No custom databases, no property builders, no
> page-nesting. Fixed, opinionated views.

## Read these first (in order)

1. `docs/00-PRODUCT.md` — problem, scope, non-goals, build-vs-buy
2. `docs/01-ARCHITECTURE.md` — stack, components, folder structure, env vars, ADRs
3. `docs/02-DATA-MODEL.md` — Firestore schema, indexes, security rules
4. `docs/03-API.md` — Next.js route handlers and contracts
5. `docs/04-SCREENS.md` — screen-by-screen UI requirements
6. `docs/05-CAPTURE.md` — PWA share target, Chrome extension, Android permissions
7. `docs/06-AI.md` — provider abstraction, tasks, prompts, approval flow
8. `docs/07-SECURITY.md` — threat model and controls
9. `docs/08-IMPLEMENTATION-PLAN.md` — the step-by-step plan; **work through it in order**
10. `docs/09-TESTING-AND-DEPLOY.md` — test strategy, CI, deploy, free-tier budgets

## Hard constraints

- **$0 infrastructure, no credit card:** Firebase **Spark** plan (Auth + Firestore only —
  no Cloud Functions, no Cloud Storage; both need Blaze), **Vercel Hobby**, free-tier AI
  APIs with user-supplied keys. All server logic runs in Next.js route handlers on Vercel.
- **Binary storage is optional.** Default mode stores no files. Cloudflare R2 is an
  optional adapter (`STORAGE_DRIVER=r2`) — see ADR-004.
- **Never store passwords, 2FA secrets or recovery codes.** The Accounts module stores
  metadata only and points to the password manager.
- **AI is an assistant, never the controller.** AI output is a *suggestion* until the user
  accepts it (or a user-enabled auto-apply rule accepts it). AI never deletes anything.

## Stack (do not change without writing an ADR in `docs/decisions/`)

Next.js (latest stable, App Router) · TypeScript `strict` · Tailwind CSS · shadcn/ui ·
lucide-react · Firebase JS SDK (Auth, Firestore with persistent local cache) ·
firebase-admin (server) · Zod · TanStack Query (server-route calls only) · MiniSearch
(client search) · chrono-node (dates) · Serwist (service worker / PWA) · Vitest +
Testing Library · Playwright (e2e) · Firebase Emulator Suite (rules tests) ·
Chrome extension: Manifest V3 + Vite + TypeScript (separate package).

## Repository layout (monorepo, npm workspaces)

```
personalhub/
├─ apps/web/            # Next.js app (UI + API routes + PWA)
├─ apps/extension/      # Chrome MV3 extension
├─ packages/shared/     # Zod schemas, types, URL normaliser, platform detector, rules engine
├─ firebase/            # firestore.rules, firestore.indexes.json, firebase.json, rules tests
├─ docs/                # these specs + docs/decisions/ ADRs
└─ CLAUDE.md
```

## Commands (create these in Phase 0)

```
npm run dev            # web app on :3000
npm run dev:ext        # extension build --watch → apps/extension/dist
npm run emulators      # firebase emulators (auth, firestore)
npm run test           # vitest (unit) across workspaces
npm run test:rules     # firestore rules tests against emulator
npm run test:e2e       # playwright
npm run lint && npm run typecheck
npm run build
```

## Working rules for Claude Code

1. Follow `docs/08-IMPLEMENTATION-PLAN.md` step by step. Finish a step's acceptance
   criteria (including tests) before starting the next. Commit per step with
   Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
2. All data shapes live in `packages/shared/schemas` as Zod schemas; derive TS types from
   them; validate at every boundary (API input, AI output, Firestore reads in server code).
3. Every Firestore path change must update `firebase/firestore.rules` **and** the rules
   tests in the same commit.
4. No secrets in the repo. New env vars → add to `.env.example` and `docs/01-ARCHITECTURE.md`.
5. Server routes: verify auth first (Firebase ID token or capture token), validate input
   with Zod, return typed JSON `{ ok: true, data } | { ok: false, error: { code, message } }`.
6. UI: every list/screen has loading, empty and error states; mobile-first; keyboard
   accessible; dark mode.
7. Keep it small. If a feature isn't in the specs, don't add it — write it in
   `docs/IDEAS.md` instead.
8. When a spec is ambiguous, choose the simplest option, note the assumption in the PR/commit
   body, and add it to `docs/OPEN-QUESTIONS.md`.
9. Before saying a step is done: `npm run lint && npm run typecheck && npm run test`
   (and `test:rules` if rules changed) must pass.
