#!/usr/bin/env node
// Creates a verified owner account in the local Auth emulator (127.0.0.1:9199) for development.
// Usage: node scripts/seed-emulator.mjs [email]   — password: EMULATOR_PASSWORD or "devpassword123".
// Only for the emulator: never use these values against a real Firebase project.
const host = "http://127.0.0.1:9199";
const email = process.argv[2] ?? process.env.OWNER_EMAIL ?? "owner@example.com";
const password = process.env.EMULATOR_PASSWORD ?? "devpassword123";

const res = await fetch(`${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
const json = await res.json();
if (!res.ok && json?.error?.message !== "EMAIL_EXISTS") {
  console.error("Sign-up failed:", json?.error?.message);
  process.exit(1);
}
let localId = json.localId;
if (!localId) {
  const q = await fetch(`${host}/identitytoolkit.googleapis.com/v1/projects/demo-personalhub/accounts:lookup`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" }, body: JSON.stringify({ email: [email] }),
  });
  localId = (await q.json()).users?.[0]?.localId;
}
await fetch(`${host}/identitytoolkit.googleapis.com/v1/projects/demo-personalhub/accounts:update`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer owner" },
  body: JSON.stringify({ localId, emailVerified: true }),
});
console.log(`Emulator owner ready: ${email} (verified)`);
