# 09 — Testing, deployment, operations

## 1. Test strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | `packages/shared` (URL normaliser, platform detector, quick-add parser, rules engine, schemas), crypto, SSRF guard, secret guard, import parsers, AI adapters (mocked HTTP), rate limiter |
| Rules | `@firebase/rules-unit-testing` + emulator | For each collection: owner allowed, other uid denied, unauthenticated denied, invalid shape denied, server-only collections denied, hard delete only from trash |
| Component | Testing Library | Item card, Inbox chips, quick capture, Accounts form secret guard |
| E2E | Playwright + emulators | Sign-in, quick add, inbox triage with keyboard, import fixture, AI suggest with mocked provider, accounts flow, export round-trip; axe accessibility checks |
| Manual device | Android phone | Install PWA, share from Instagram/LinkedIn/YouTube/Gallery, offline share, extension on Chrome desktop |

Fixtures: `fixtures/bookmarks-chrome.html` (≈ 500 links, nested folders, duplicates),
`fixtures/urls.txt`, `fixtures/items-5000.json` (search benchmark), mocked AI responses
(valid, invalid JSON, 429).

Coverage target: 90% lines for `packages/shared` and `lib/{crypto,unfurl,auth,ai}`;
no global target for UI.

## 2. Environments

| Env | Firebase | Vercel | AI |
|---|---|---|---|
| Local | Emulator Suite | `next dev` | Mock provider by default (`AI_MOCK=1`) |
| Preview | Emulator not available → use a second Spark project `personalhub-dev` | Preview deployments | Owner's keys (dev project) |
| Production | `personalhub-prod` (Spark) | Production | Owner's keys |

## 3. Deploy steps

1. `firebase login` → `firebase use personalhub-prod`.
2. `node scripts/render-rules.mjs` (injects `OWNER_EMAILS`) → `firebase deploy --only firestore:rules,firestore:indexes`.
3. Vercel: import GitHub repo, root `apps/web`, set env vars (01-ARCHITECTURE §5) for
   Production; generate `KEY_ENCRYPTION_SECRET` with `openssl rand -base64 32` and
   `CAPTURE_TOKEN_PEPPER` with `openssl rand -base64 32`.
4. Firebase Auth → authorised domains: add the Vercel production domain.
5. Google Cloud console → restrict the Firebase web API key to your domains.
6. Extension: `npm run build:ext` with `HUB_ORIGIN` → `chrome://extensions` → Developer
   mode → Load unpacked `apps/extension/dist` → paste capture token in Options.
7. Android: install the PWA from Chrome; pin "Hub" in the share sheet.

## 4. Release checklist

- [ ] CI green; rules tests green; e2e green.
- [ ] Lighthouse mobile ≥ 90 (Performance, Accessibility, Best Practices) on Home/Inbox/Library.
- [ ] 07-SECURITY §10 checklist done.
- [ ] Export → wipe dev project → import backup → data identical (round-trip test).
- [ ] CHANGELOG updated; version tagged.

## 5. Operations

- **Quotas:** Settings › Data shows Firestore document counts and AI usage this month.
  If Firestore reads approach the daily free limit, check for listener loops (most
  common cause) and that delta sync is working.
- **Backups:** export ZIP monthly (Home reminder) to Google Drive.
- **Monitoring:** Vercel logs (no content), `/api/health`; optional free uptime monitor.
- **Key rotation:** yearly or on suspicion: rotate `KEY_ENCRYPTION_SECRET` (versioned),
  capture tokens, Firebase service account key.
- **Verify yearly:** Firebase Spark limits, Vercel Hobby terms, AI providers' free tiers and
  data-use terms, Chrome Web Store/MV3 changes, Web Share Target support.
