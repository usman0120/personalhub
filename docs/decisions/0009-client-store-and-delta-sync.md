# ADR-009: In-memory collection store with IndexedDB delta sync

Status: Accepted · 19 Nov 2026

**Decision.** Each owner collection is mirrored in a small in-memory store persisted to IndexedDB
(`idb-keyval`). On start the cached docs load instantly, then one `onSnapshot` listens to
`updatedAt > lastSyncAt` (soft deletes travel as updates). Writes are applied optimistically to the
store and to Firestore (whose persistent cache queues them offline). Listener `removed` events are
ignored because they only mean a doc left the delta window.

**Why.** Re-reading every document on each app open would exhaust the Spark read quota quickly.

**Consequences.** All filtering, facets and search run client-side (fine up to ~10k items).
The MiniSearch index is rebuilt in memory from the store (≈150 ms for 5k items) instead of being
serialised to IndexedDB — simpler and always consistent.
