# Open questions

Add questions/assumptions here while building.

## Waiting on the owner

- Does Cloudflare require a payment method to enable R2 on your account? (decides STORAGE_DRIVER; the
  `r2` adapter is implemented and off by default)
- Which free AI models are available on your keys today? (decides default taskModels — the UI lets you
  type any model id per task)
- Chrome Web Store publishing (one-time developer fee — verify) or load-unpacked only?

## Assumptions made while building (v1)

1. **Milestone gates skipped.** All phases were built in one pass at the owner's request; the ★ gates
   (real daily use) still apply before calling v1 "done".
2. **Assistant proposals** use a fenced JSON block instead of native tool calls (ADR-008).
3. **Search index** is rebuilt in memory on load rather than persisted to IndexedDB (ADR-009).
4. **Imports** mark items with `rulesApplied: ["import:<id>"]` so the Inbox can filter "this import"
   without adding a new item field.
5. **Folder → tag mapping** uses the last folder of each bookmark path only.
6. **Undo from the extension** uses `DELETE /api/capture/{itemId}` (soft delete, only within 10
   minutes of capture). Not in 03-API originally; added to satisfy the popup's "Undo".
7. **`GET /api/me`** added so the client can confirm the owner allow-list (OWNER_EMAILS lives only on
   the server) and sign out non-owners immediately.
8. **`GET /api/storage/status`** reports the server storage driver for Settings › Storage.
9. **Rule ordering** uses up/down buttons rather than drag-and-drop (keyboard accessible, no extra
   dependency).
10. **Area AI default:** Personal and Finance seeded with AI off, as in 06-AI §6.
11. **Daily AI limit** resets at midnight UTC (usage docs are keyed by UTC date).
12. **Delete all data** requires a sign-in within the last 5 minutes (Google users are re-prompted;
    email/password users sign out and in again).
13. **Dev emulator ports** are 9199 (auth) and 8180 (Firestore); rules tests use 8087 so they never
    clash with a running dev emulator.
14. **Instagram/LinkedIn/TikTok/Facebook unfurls** are treated as `blocked` when the page only returns
    generic login-wall metadata.
