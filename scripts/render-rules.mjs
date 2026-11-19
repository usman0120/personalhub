#!/usr/bin/env node
// Renders firebase/firestore.rules → firebase/firestore.rendered.rules with OWNER_EMAILS injected.
// Usage: OWNER_EMAILS="me@example.com" node scripts/render-rules.mjs   (reads .env.local if present)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", "apps/web/.env.local"]) {
  const p = join(root, f);
  if (!process.env.OWNER_EMAILS && existsSync(p)) {
    const m = /^OWNER_EMAILS=(.*)$/m.exec(readFileSync(p, "utf8"));
    if (m) process.env.OWNER_EMAILS = m[1].trim();
  }
}
const emails = (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!emails.length) {
  console.error("OWNER_EMAILS is empty. Set it in the environment or .env.local");
  process.exit(1);
}
for (const e of emails) if (!/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(e)) {
  console.error(`Invalid email: ${e}`);
  process.exit(1);
}
const tpl = readFileSync(join(root, "firebase/firestore.rules"), "utf8");
const out = tpl.replaceAll("OWNER_EMAILS_PLACEHOLDER", `[${emails.map((e) => `'${e}'`).join(", ")}]`);
writeFileSync(join(root, "firebase/firestore.rendered.rules"), out);
console.log(`Rendered rules for ${emails.length} owner email(s).`);
