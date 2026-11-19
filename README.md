# PersonalHub — specification pack (v1.0, 19 Nov 2026)

Hand this folder to Claude Code as the starting point of a new repository.

1. Create an empty GitHub repo `personalhub`, copy these files into it, commit.
2. Open it with Claude Code and give it the "First prompt" at the end of
   `docs/08-IMPLEMENTATION-PLAN.md`.
3. Work phase by phase; stop at each ★ gate and use the app for real.

| File | Contents |
|---|---|
| CLAUDE.md | Instructions Claude Code reads automatically: constraints, stack, rules |
| docs/00-PRODUCT.md | Problem, scope, non-goals, build vs buy |
| docs/01-ARCHITECTURE.md | System diagram, components, env vars, ADRs |
| docs/02-DATA-MODEL.md | Firestore schema, indexes, security rules |
| docs/03-API.md | Route handlers and contracts |
| docs/04-SCREENS.md | Screen-by-screen UI requirements (web, mobile, extension) |
| docs/05-CAPTURE.md | PWA share target, Chrome extension, Android permissions, import |
| docs/06-AI.md | Provider abstraction, prompts, schemas, approval flow, privacy |
| docs/07-SECURITY.md | Threat model and controls |
| docs/08-IMPLEMENTATION-PLAN.md | Step-by-step plan with acceptance criteria |
| docs/09-TESTING-AND-DEPLOY.md | Tests, environments, deployment, operations |

Items that depend on changing external terms (free-tier limits, R2 card requirement,
AI provider data use, Chrome Web Store fee) are marked "verify" — check them when you reach
that step.
