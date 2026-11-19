# 00 — Product: PersonalHub

Version 1.0 · 19 Nov 2026 · Owner: Usman Ahmad

## 1. Problem

| # | Pain today | Consequence |
|---|---|---|
| P1 | Useful things are scattered: saved reels on Instagram, saved posts on LinkedIn, screenshots in the phone gallery, hundreds of browser bookmarks (some useful, most "maybe someday") | Can't find anything; re-discovers the same resources; bookmarks are noise |
| P2 | Many emails and platform accounts (GitHub, Vercel, Firebase, social, freelancing) | Forgets which email/login method each uses, renewal dates, recovery setup |
| P3 | Many projects, ideas, decisions, study tasks | Ideas lost, decisions forgotten, too many half-started projects |
| P4 | Tried Notion for ~1 month | Too much setup: databases, relations, views — the tool became the work |

## 2. Product statement

PersonalHub is a **private, single-owner hub** where anything worth keeping is captured in
≤ 2 taps from the browser or phone, auto-filled (title, link, source, date, preview), and
organised by **rules first, AI suggestions second, the user always last word**.

## 3. Principles

1. **Capture is instant; organising is optional and later.** Everything lands in the Inbox.
2. **Fixed structure, no builders.** A small set of item kinds and fixed views. Areas and
   tags are the only user-defined taxonomy.
3. **Auto-fill everything that can be known** (URL, title, site, platform, favicon,
   description, date, device/source).
4. **AI is a helper.** It suggests summary, description, area, tags, tasks and dates; the
   user accepts, edits or rejects. Auto-apply only through rules the user turned on.
5. **Own your data.** One-click export (JSON, Markdown, CSV). No lock-in.
6. **Secrets never enter the hub.** Passwords live in a password manager (Bitwarden).
7. **$0 to run** on free tiers without a credit card.

## 4. Users

Single owner (Usman). The data model is per-user (`users/{uid}/…`) so the app *could*
become multi-user later, but access is restricted to an allow-listed owner email.

## 5. Scope

### In scope (v1)

| Module | What it does |
|---|---|
| **Capture** | Quick-add bar (paste URL or text), Chrome extension (popup, context menu, shortcut, save all tabs), PWA share target on Android (links from Instagram/LinkedIn/TikTok/YouTube/Facebook, images from gallery), import Chrome bookmarks HTML / URL list / CSV, capture API for other tools |
| **Inbox** | Triage queue of new items with rule + AI suggestions; accept / edit / skip / delete; keyboard-driven |
| **Library** | All items; filters (kind, area, tag, platform, status, date); search; list/grid |
| **Items** | Kinds: `link`, `note`, `image`, `idea`, `decision`. Fields auto-filled; Markdown note; pin; archive; trash |
| **Projects** | Light project records: status, area, brief (problem, goal, done-when, deadline), linked items, tasks, decisions |
| **Tasks** | Simple tasks: title, due date (natural language), priority, status, optional project/item link |
| **Accounts** | Registry of accounts (service, login email, sign-in method, 2FA type, recovery location, plan/cost, renewal date, status, last reviewed). **No secrets.** |
| **Assistant** | Chat that can explain a URL/tool, answer questions over your hub, and *propose* actions (save, tag, create task) as confirmable cards |
| **Rules** | Deterministic "if domain/keyword/platform → set area/tags/kind" rules; optional AI auto-apply thresholds |
| **Settings** | Areas, tags (rename/merge), rules, AI providers/keys/models per task, AI privacy, capture tokens, storage mode, export, trash |

### Non-goals (v1)

- No collaboration, sharing or public pages.
- No custom fields, databases, relations builder, kanban builder, page nesting.
- No password/secret storage, no 2FA codes.
- No scraping of Instagram/LinkedIn/TikTok content behind login walls (against their
  terms and unreliable). We store the link + whatever public metadata the page exposes +
  the user's note; AI works on that.
- No native mobile app in v1 (PWA first; Flutter/TWA only if PWA limits hurt — see ADR-003).
- No calendar sync, email ingestion or Cloud Functions in v1.

### Later (backlog, only after v1 is used daily for a month)

Web push reminders (FCM) · daily digest · semantic search with embeddings · read-only MCP
server so Claude/ChatGPT can query the hub (idea borrowed from personalhub.io's "Personal
MCP") · Android TWA in Play Store · dead-link checker schedule.

## 6. Success measures

- Capture from phone share sheet ≤ 2 taps, ≤ 3 s perceived.
- Capture from browser ≤ 1 click + optional note.
- Inbox processed weekly to zero in ≤ 15 minutes for ~50 items.
- Any saved item found again in ≤ 10 s via search.
- Monthly infra cost: $0.

## 7. Key user stories (acceptance criteria in 08-IMPLEMENTATION-PLAN)

1. *Saving a reel:* In Instagram I tap Share → PersonalHub. The link is saved with
   platform = instagram, date, and a note field I can fill or skip.
2. *Saving a screenshot:* In Gallery I share a screenshot to PersonalHub. The app extracts
   text/description (AI vision, optional) and saves an `image` item (thumbnail optional).
3. *Saving a page:* On free-for.dev I click the extension. Title, URL, description, favicon,
   date are filled; I pick "Dev Resources" or let rules/AI suggest; Save.
4. *Asking:* In Assistant I paste `https://free-for.dev` and ask "what is this?". It
   explains, proposes area + tags + description, and a "Save to Library" card I confirm.
5. *Cleaning bookmarks:* I import my Chrome bookmarks HTML. Duplicates are merged; I triage
   them in Inbox with keyboard shortcuts (K keep, A archive, D delete).
6. *Accounts:* I add "Vercel — login via GitHub, 2FA authenticator, Hobby plan". Home shows
   renewals due in 30 days and accounts not reviewed in 90 days.
7. *Projects:* I create "PersonalHub" project, link items and tasks, record decisions.

## 8. Build vs buy (why build)

Existing tools solve parts of this: Raindrop.io (bookmarks), Karakeep/Hoarder and
Linkwarden (self-hosted bookmark managers with AI tagging), Google Keep (quick notes),
Obsidian (notes), Bitwarden (passwords). They are good — if you only need bookmarks, use
Raindrop or Karakeep and stop here. Building is justified because: (a) one hub for links +
ideas + tasks + account registry, (b) AI with your own free keys and your own rules,
(c) it is a strong portfolio project (Next.js + Firebase + PWA + Chrome extension + AI).
**Until v1 is usable, capture into one temporary place** (a single Google Keep note or
Raindrop) and import later. Passwords always stay in Bitwarden.

Note: personalhub.io (checked 19 Nov 2026) is a different product — an encrypted personal
data vault with an MCP connection for AI assistants and purchase tracking — not a bookmark
manager. Ideas worth borrowing: full export on every plan, AI-suggested updates that the
user approves, and (later) an MCP endpoint.
