# 04 — Screens (UI requirements)

## 0. Global

- **Layout:** desktop ≥ 1024 px → left sidebar (Home, Inbox (badge), Library, Projects,
  Tasks, Accounts, Assistant, Settings) + content; tablet → collapsible sidebar; mobile →
  bottom nav (Home, Inbox, **+** capture, Library, More) and top search.
- **Command palette** (`Ctrl/Cmd+K`, mobile: search icon): search everything (MiniSearch),
  quick actions: "New note", "New task", "New project", "Add account", "Paste URL",
  "Ask assistant", navigate to any screen.
- **Quick capture** (`N` or the + button): one textarea. Parser (`parseQuickAdd`):
  URL → link item; text starting with `[]` or `todo:` → task (chrono-node date, `!1..3`
  priority, `#project`); text starting with `idea:` → idea; otherwise note. `#tag`
  and `@area` tokens apply tags/area. Enter saves; Shift+Enter newline.
- **Design:** shadcn/ui, Tailwind, lucide icons, system font; light/dark; 8-pt spacing;
  focus rings visible; touch targets ≥ 44 px; toasts with **Undo** for every destructive
  or bulk action (5 s).
- **States:** every list has skeleton loading, empty state with one clear action, error
  state with retry; offline banner ("Offline — changes will sync").
- **Item card (shared component):** favicon/kind icon · title (2 lines) · domain or kind ·
  area chip · up to 3 tags · relative date · AI badge (sparkle) if suggestion pending ·
  hover/long-press menu: Open, Edit, Pin, Move to area, Add tag, Archive, Delete.

## 1. Sign in (`/signin`)
Google button + email/password form; "Owner-only app" note. Non-allow-listed account →
signs out with message "This PersonalHub belongs to someone else." First sign-in seeds
`users/{uid}` with default areas, seed rules, AI disabled.

## 2. Home (`/`)
Purpose: a 10-second overview, not a dashboard to maintain.
Sections (top → bottom):
1. Quick capture bar (focused on desktop).
2. **Inbox** count + "Process inbox" button (hidden when zero → "Inbox zero ✓").
3. **Today & overdue tasks** (max 7, checkbox to complete).
4. **Upcoming (30 days):** task due dates + account renewal dates, merged timeline.
5. **Active projects** (cards with status, open tasks count, last activity; warning if > 2 active).
6. **Pinned** items (max 8).
7. **Recently saved** (last 10).
8. **Needs attention** (only if any): accounts not reviewed in 90 days, ideas older than
   30 days still "someday", items with failed unfurl.

## 3. Inbox (`/inbox`)
Purpose: turn captures into organised items fast.
- Layout: list (left) + detail pane (right) on desktop; full-screen card stack on mobile.
- Each card shows auto-filled fields + **suggestion chips** from rules (solid) and AI
  (outlined, with confidence) for area, tags, kind, title, description, tasks.
- Actions: **Accept all** (A), accept/reject single chip (click), **Edit** (E), **Keep**
  as is → status active (K), **Archive** (R), **Delete** (D), **Ask AI** (S) for a single
  item, **Skip** (J/K navigation), multi-select with Shift + bulk actions.
- Filters: source (share/extension/import), platform, has AI suggestion.
- "Process with AI" button runs `/api/ai/suggest` for up to 20 visible items sequentially
  with a progress bar and respects rate limits (pause/resume).
- Empty: "Inbox zero. Captured things land here."

## 4. Library (`/library`)
- Toolbar: search box (instant, client), filters (kind, area, tags multi, platform,
  status active/archived, date range, has note, pinned), sort (newest, oldest, title,
  recently updated), view toggle list/grid.
- Saved views: user can save the current filter as a named view (stored in
  `users/{uid}.settings.views`, max 12) — the only "custom view" feature.
- Left facet panel on desktop: Areas with counts, top 20 tags with counts, platforms.
- Bulk actions on selection: move area, add/remove tag, archive, delete, run AI.
- Infinite scroll (virtualised list, react-virtual).

## 5. Item detail (`/item/[id]`, opens as side drawer from lists)
- Header: kind icon, editable title, Open link button, copy link, pin, overflow menu.
- Preview block: og:image or thumbnail (image items), site name, domain, platform badge,
  captured date + source.
- Fields: area (select), tags (combobox with create), project (select), status.
- **Note** (Markdown editor with preview toggle; autosave 800 ms debounce).
- Selection quote (if captured).
- **AI panel:** summary, suggestion chips (accept/reject), "Regenerate", model used,
  "AI is off for this area" when blocked.
- Kind-specific: idea → stage + "Promote to project"; decision → context/decision/
  consequences fields; image → OCR text (copyable), full image (R2) or thumbnail.
- Linked tasks list + "Add task".
- Footer: created/updated times, "Move to trash".

## 6. Projects (`/projects`, `/projects/[id]`)
- List: grouped by status (Active, Paused, Ideas, Done); card shows name, area, deadline,
  open tasks, last activity. New project dialog: name, area, status.
- Detail tabs: **Overview** (brief fields: problem, goal, done-when, deadline, links;
  status; progress = done/total tasks) · **Tasks** · **Items** (linked items, add existing
  via search) · **Decisions** (decision items with this projectId; "New decision" form).
- Warning banner when setting a third project to Active.

## 7. Tasks (`/tasks`)
- Groups: Overdue, Today, Next 7 days, Later, No date, Done (collapsed, last 30 days).
- Quick add row with natural language ("submit proposal fri 5pm !1 #PersonalHub").
- Row: checkbox, title, due (relative, red if overdue), priority dot, project chip,
  linked item icon. Inline edit; drag to reorder within a day is **not** in v1.
- Filters: project, area, priority.

## 8. Accounts (`/accounts`)
- Permanent banner: "Metadata only. Passwords, 2FA secrets and recovery codes belong in
  your password manager."
- Table (desktop) / cards (mobile): service + favicon, category, login identifier,
  sign-in method, 2FA (badge: green passkey/key/authenticator, amber sms/email, red none),
  plan/cost, renewal date, status, last reviewed.
- Filters: category, 2FA type, status, owner (me/client), "needs review" (> 90 days).
- Add/Edit form with the fields from the data model; recoveryLocation placeholder
  "Bitwarden › Dev & Cloud". **Secret guard:** if notes or any text field matches secret
  patterns (see 07-SECURITY §5), block save with an explanation.
- Row action "Mark reviewed today". Summary bar: total accounts, without 2FA, monthly cost
  (USD and PKR at a user-set rate).
- Accounts are never included in AI context.

## 9. Assistant (`/assistant`)
- Left: conversation list (latest first, rename, delete). Right: chat.
- Input supports pasting URLs and attaching an image (vision, if configured).
- Assistant replies stream; **action cards** under a reply: e.g. "Save to Library:
  free-for.dev · Area Dev Resources · tags free-tier, hosting · description …" with
  **Apply**, **Edit then apply**, **Dismiss**. Applied cards show a link to the item.
- Context chips above input: "Using 5 items from your hub" (click to see which).
- When AI is not configured: empty state linking to Settings › AI.
- Example prompts: "What is this? <url>", "What did I save about free hosting?",
  "Turn my notes on X into tasks", "Summarise everything in project PersonalHub".

## 10. Import (`/import`)
Steps: 1) choose source (Chrome/Edge bookmarks HTML — with how-to-export instructions,
URL list .txt, CSV, PersonalHub JSON backup) → 2) parse preview: counts, duplicates in
file, already-in-hub duplicates, folder → tag mapping (editable), option "skip folders" →
3) import into Inbox in batches with progress → 4) "Review now" opens Inbox filtered to
this import. Optional per import: "Run rules" (default on), "Run AI in background while
I'm on this page" (default off).

## 11. Settings (`/settings/[section]`)
- **General:** name, timezone, theme, PKR/USD rate for accounts summary.
- **Areas:** list with color/icon, reorder, rename, archive; **AI allowed** toggle per area.
- **Tags:** list with counts, rename, merge, delete (with undo).
- **Rules:** list (drag to order), enable toggle, hits; editor with condition rows and
  action fields; **"Test rule"** panel: paste a URL/title → shows result of `applyRules`.
- **AI:** master toggle; providers (add: type, label, base URL for OpenAI-compatible, API
  key field — after save shows `••••last4`, Test, Remove); per-task model selectors
  (summarize, classify, extract, vision, chat) with free-tier hints; suggest-on-capture
  toggle; auto-apply (off by default; fields; min confidence slider); daily limit; usage
  this month; privacy notice (free tiers may use data to improve products; disable AI per
  area for sensitive things).
- **Capture:** extension setup steps; capture tokens (create → shown once with copy
  button; list; revoke); Android install instructions + "Test share target" link.
- **Storage:** mode (none / R2 — R2 status from server), thumbnails toggle, usage estimate.
- **Data:** Export ZIP; Trash link; purge trash now; delete all data (type-to-confirm).

## 12. Share landing (`/share`, mobile)
Opened by the share target. Shows within 1 s: detected kind (link/image/text), title,
URL/platform badge or image preview, area chips (last used first), tag input, note field,
and two buttons: **Save** (primary, big) and **Save & open**. Auto-saves after 8 s of no
interaction if the user enabled "Instant save from share" (default on: save immediately,
then let the user add note/area on the same screen with "Saved ✓ — add details?").
Works offline (queued). Closes back to the source app via "Done".

## 13. Trash (`/trash`)
Deleted items/projects/tasks/accounts for 30 days; restore; delete forever; empty trash.

## 14. Chrome extension
- **Popup (360×520):** title (editable), URL, favicon, selected text preview, area chips,
  tag input with suggestions from `/api/taxonomy`, note, kind toggle (link/idea/note),
  "Ask AI to organise" checkbox, **Save** (Enter). After save: "Saved ✓ · Open in hub ·
  Undo". Duplicate notice: "Already saved on 12 Oct — note added."
- **Context menus:** "Save page to PersonalHub", "Save link", "Save selection as note",
  "Save image link".
- **Shortcut:** `Alt+Shift+S` quick save without popup (toast via badge text "✓").
- **Save all tabs in window** (popup overflow menu; requests optional `tabs` permission once).
- **Options page:** hub URL, capture token, default area, auto-AI default, test connection.
- Offline/failed sends are queued in `chrome.storage.local` and retried on next popup
  open or browser start; badge shows queued count.
