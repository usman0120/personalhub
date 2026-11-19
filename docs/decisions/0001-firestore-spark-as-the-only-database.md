# ADR-001: Firestore (Spark) as the only database

Status: Accepted · 19 Nov 2026

Owner chose Firebase Auth + Firestore.
Document model fits items; offline cache is built in; free without card. Trade-offs: no
full-text search (→ client MiniSearch), no joins (→ denormalised fields), daily op quotas
(→ delta sync).
