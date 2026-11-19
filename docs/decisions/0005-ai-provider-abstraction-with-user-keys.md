# ADR-005: AI provider abstraction with user keys

Status: Accepted · 19 Nov 2026

One interface, adapters for Gemini,
Groq, OpenRouter, generic OpenAI-compatible (base URL), Anthropic. Per-task provider/model.
Keys encrypted server-side (AES-256-GCM), never returned to the client after save.
