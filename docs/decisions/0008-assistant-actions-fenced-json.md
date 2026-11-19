# ADR-008: Assistant actions via a fenced JSON block

Status: Accepted · 19 Nov 2026

**Context.** 06-AI §3.4 describes proposals as provider tool calls. Streaming tool calls differ
between Gemini, OpenAI-compatible APIs and Anthropic, and several free models handle tools poorly.

**Decision.** The chat model streams plain text and ends its reply with one fenced
```` ```actions ```` block containing a JSON array of `{type, payload}`. The server hides the block
from the stream, validates every payload with the shared Zod schemas, drops unknown area ids and
stores valid entries as `actions[]` with status `proposed`. Nothing is applied until the user clicks.

**Consequences.** One streaming code path for all providers; invalid proposals are silently dropped.
Native tool calls can replace this later without changing the stored message shape.
