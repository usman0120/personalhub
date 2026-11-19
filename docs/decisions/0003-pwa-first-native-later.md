# ADR-003: PWA first, native later

Status: Accepted · 19 Nov 2026

A PWA with Web Share Target appears in Android's share
sheet once installed from Chrome, needs no store account and shares the web codebase.
Limits: no background sync guarantees on all devices, share target only after install,
iOS does not support Web Share Target. Revisit (TWA via Bubblewrap, or Flutter) only if
these limits hurt in daily use.
