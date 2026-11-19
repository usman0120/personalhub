# ADR-004: Binary storage optional (StorageAdapter)

Status: Accepted · 19 Nov 2026

Default `none`: images are
processed client-side (resize/compress), optionally sent to a vision model for
text/description, and only a small thumbnail (≤ 60 KB WebP, opt-in) is stored in
Firestore in a separate `blobs` doc. `r2` driver: private bucket, presigned PUT/GET from
`/api/storage/*`. Verify whether Cloudflare requires a payment method for R2 before
choosing it.
