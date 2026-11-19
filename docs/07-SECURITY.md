# 07 — Security design

## 1. Assets

| Asset | Sensitivity | Where |
|---|---|---|
| Saved items, notes, projects, tasks | Personal / medium | Firestore `users/{uid}` |
| Account registry (metadata) | Medium–high (reveals which accounts exist, login emails) | Firestore `accounts` |
| AI provider API keys | High (billable) | `private/{uid}/aiKeys` (encrypted) |
| Capture tokens | High (write access) | Hash only in `captureTokens` |
| Firebase Admin service account | Critical | Vercel env only |
| `KEY_ENCRYPTION_SECRET`, `CAPTURE_TOKEN_PEPPER` | Critical | Vercel env only |

## 2. Threat model (STRIDE, condensed)

| Threat | Example | Control |
|---|---|---|
| Spoofing | Someone signs up with their Google account | Owner allow-list in rules **and** server; `email_verified` required |
| Spoofing | Stolen capture token | Tokens scoped (`capture`, `read:taxonomy`), revocable, `lastUsedAt` shown, rate-limited; extension stores in `chrome.storage.local` |
| Tampering | Client writes malformed or oversized docs | Rules shape/size validation; server Zod validation |
| Tampering | Stored XSS via note/title/og data | Render Markdown with a sanitiser (`rehype-sanitize`), no `dangerouslySetInnerHTML` on raw input; escape all metadata; strict CSP |
| Repudiation | "Did the AI change this?" | `ai.*` provenance fields, `rulesApplied`, Undo |
| Information disclosure | AI provider sees private notes | Per-area `aiAllowed`; Accounts excluded server-side; privacy notice |
| Information disclosure | Keys leak via logs/errors | Never log bodies; error envelope without internals; keys never returned |
| DoS / cost | Abuse of AI routes, quota exhaustion | Per-uid rate limits, daily caps, timeouts, request size caps |
| Elevation | SSRF through `/api/unfurl` or custom AI base URL | SSRF guard (§4) |
| Supply chain | Malicious npm package | Lockfile, Dependabot, minimal deps, `npm audit` in CI |

## 3. Authentication & authorisation

- Firebase Auth: Google + email/password (email verification required). Session
  persistence `browserLocalPersistence`.
- API: `verifyIdToken(token, /*checkRevoked*/ true)`; then allow-list check.
- Rules: `isOwner(uid)` on every user path; server-only collections closed.
- Capture tokens: `ph_` + 32 bytes CSPRNG (base64url). Stored as
  `sha256(CAPTURE_TOKEN_PEPPER + token)`; compared via document lookup (no timing leak on
  string compare). Shown once.
- Owner-only "Sign out everywhere" in Settings calls a route that runs
  `revokeRefreshTokens(uid)`.

## 4. SSRF guard (`lib/unfurl/safeFetch.ts`)

1. Accept only `http:`/`https:`; ports 80/443 only.
2. Resolve DNS (`dns.promises.lookup` with `all: true`); reject if any address is
   private, loopback, link-local, CGNAT, multicast, reserved or metadata
   (`10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10, 0/8, ::1, fc00::/7, fe80::/10`).
3. Connect to the validated IP (custom `lookup` in the agent) to prevent DNS rebinding.
4. `redirect: "manual"`; re-validate each hop; max 3 hops.
5. Timeout 5 s; abort after 1 MB; accept `text/html` / `application/xhtml+xml` only.
6. Same validation for user-supplied AI `baseUrl` (https required).

## 5. Secret guard (Accounts and notes)

Client and server check text fields in Accounts (and warn — not block — in item notes)
against patterns: `password\s*[:=]`, `pass\s*[:=]`, `pwd\s*[:=]`, 6–8 digit sequences next to
"code/otp/backup", PEM headers, `sk-[A-Za-z0-9]{20,}`, `AIza[0-9A-Za-z_-]{35}`,
`ghp_[A-Za-z0-9]{36}`, `xox[baprs]-`, AWS `AKIA[0-9A-Z]{16}`, long base32 strings (TOTP
seeds), 12/24-word seed-phrase-like sequences. Accounts: block save with explanation.
Notes: show a warning banner "This looks like a secret — move it to your password manager."

## 6. Crypto for AI keys

AES-256-GCM via Node `crypto`: key = base64-decoded `KEY_ENCRYPTION_SECRET` (32 bytes), IV =
12 random bytes per encryption, store `{ciphertext, iv, authTag, keyVersion}`. Rotation:
add `KEY_ENCRYPTION_SECRET_V{n}`; re-encrypt lazily on next use. Unit tests: round-trip,
tamper detection (modified ciphertext/authTag fails).

## 7. Web security headers (`next.config` / middleware)

- `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'nonce-…';
  connect-src 'self' https://*.googleapis.com https://*.firebaseio.com
  https://securetoken.googleapis.com https://identitytoolkit.googleapis.com;
  img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline';
  frame-src https://*.firebaseapp.com; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'` (adjust Firebase Auth domains as needed; `img-src https:` allows
  og:images and favicons).
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy:
  camera=(), microphone=(), geolocation=()`.
- Remote og:images: `referrerPolicy="no-referrer"` on `<img>`; lazy-load.

## 8. Extension security

- Minimal permissions (05-CAPTURE §3). No content scripts injected persistently.
- Token only in `chrome.storage.local`; never logged; options page masks it.
- `fetch` only to the configured hub origin; reject non-https origins.
- MV3 CSP default (no remote code, no `eval`).

## 9. Data protection & recovery

- Soft delete + 30-day trash; Undo toasts.
- Weekly reminder on Home to export a backup (ZIP) if the last export > 30 days.
- Firestore has no point-in-time recovery on Spark — exports are the backup.
- "Delete all my data" requires typing `DELETE` and re-authentication.

## 10. Operational checklist (before first real use)

- [ ] Rules deployed from the rendered template; rules tests green.
- [ ] Allow-list contains only the owner's email.
- [ ] Vercel env vars set for Production only (not exposed to Preview unless needed).
- [ ] Service account key not committed; GitHub push protection on.
- [ ] Firebase API key restricted to the app's HTTP referrers in Google Cloud console.
- [ ] Authorised domains in Firebase Auth: only localhost + production domain.
- [ ] Dependabot + `npm audit` clean (no high/critical).
