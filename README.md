# PersonalHub

A private, single-owner hub for links, reels, screenshots, notes, ideas, decisions, tasks,
projects and an account registry. Capture in one or two taps from the browser or phone; organise
with deterministic rules first, an optional AI assistant second, and you always have the last word.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Radix primitives · Firebase Auth +
Firestore (Spark) · Zod · MiniSearch · chrono-node · Serwist (PWA) · Vitest · Playwright · Chrome MV3.
Runs at $0 on Firebase Spark + Vercel Hobby with your own free-tier AI keys.

## Repository

```
apps/web/          Next.js app: UI, API route handlers, PWA + share target
apps/extension/    Chrome MV3 extension (Vite)
packages/shared/   Zod schemas, URL normaliser, platform detector, quick-add parser, rules engine
firebase/          firestore.rules, indexes, emulator config, rules tests
docs/              product specs (00–09), ADRs in docs/decisions, OPEN-QUESTIONS, IDEAS
scripts/           render-rules, seed-emulator, gen-icons
```

## Local development (no cloud accounts needed)

Requires Node ≥ 20, Java 21+ and the Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
cp .env.example apps/web/.env.local     # set NEXT_PUBLIC_USE_EMULATORS=1, AI_MOCK=1, OWNER_EMAILS, secrets
npm run render-rules                    # injects OWNER_EMAILS into firebase/firestore.rendered.rules
npm run emulators                       # auth :9199, firestore :8180, UI :4100
node scripts/seed-emulator.mjs you@example.com   # verified owner (password: devpassword123)
npm run dev                             # http://localhost:3000
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Web app on :3000 |
| `npm run dev:ext` / `npm run build:ext` | Extension → `apps/extension/dist` (set `HUB_ORIGIN`) |
| `npm run emulators` | Firebase emulators (auth, firestore) |
| `npm test` | Unit tests (shared + web libs) |
| `npm run test:rules` | Firestore rules tests (own emulator on :8087) |
| `npm run test:e2e` | Playwright + axe (needs emulators + seeded owner) |
| `npm run lint && npm run typecheck` | Static checks |
| `npm run build` | Production build (web + extension) |

## Deploy

See `docs/09-TESTING-AND-DEPLOY.md`. Short version: create a Firebase Spark project, render and deploy
rules + indexes, import the repo into Vercel (root `apps/web`), set the env vars from `.env.example`,
add the Vercel domain to Firebase Auth authorised domains, then build the extension with
`HUB_ORIGIN=https://<your-domain> npm run build:ext` and load it unpacked.

## Principles

Capture is instant; organising is optional. Fixed views, no builders. AI suggests, never decides,
never deletes and never sees Accounts. Passwords never enter the hub. Export everything anytime.

MIT licensed.
