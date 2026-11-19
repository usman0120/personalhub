import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, Timestamp, type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const OWNER = "owner@example.com";
let env: RulesTestEnvironment;

beforeAll(async () => {
  const tpl = readFileSync(join(__dirname, "..", "firestore.rules"), "utf8");
  env = await initializeTestEnvironment({
    projectId: "demo-personalhub",
    firestore: { rules: tpl.replaceAll("OWNER_EMAILS_PLACEHOLDER", `['${OWNER}']`) },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const owner = (): Firestore =>
  env.authenticatedContext("u1", { email: OWNER, email_verified: true }).firestore() as unknown as Firestore;
const unverified = (): Firestore =>
  env.authenticatedContext("u1", { email: OWNER, email_verified: false }).firestore() as unknown as Firestore;
const stranger = (): Firestore =>
  env.authenticatedContext("u2", { email: "evil@example.com", email_verified: true }).firestore() as unknown as Firestore;
const strangerAsU1 = (): Firestore =>
  env.authenticatedContext("u1", { email: "evil@example.com", email_verified: true }).firestore() as unknown as Firestore;
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const stamps = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const item = (over: Record<string, unknown> = {}) => ({
  kind: "link", status: "inbox", title: "GitHub", url: "https://github.com", urlNormalized: "https://github.com",
  urlHash: "abc", domain: "github.com", platform: "github", description: null, note: "", selection: null,
  faviconUrl: null, imageUrl: null, areaId: null, tags: [], projectId: null, pinned: false, source: "web",
  capturedAt: Timestamp.now(), reviewedAt: null, unfurl: { status: "pending" }, ai: { status: "none" },
  rulesApplied: [], isDeleted: false, deletedAt: null, ...stamps(), ...over,
});
const task = (over: Record<string, unknown> = {}) => ({
  title: "Do it", status: "todo", due: null, dueHasTime: false, priority: 2, projectId: null, itemId: null,
  areaId: null, source: "manual", completedAt: null, isDeleted: false, deletedAt: null, ...stamps(), ...over,
});
const project = (over: Record<string, unknown> = {}) => ({
  name: "PersonalHub", status: "active", areaId: null, color: "#6366f1", problem: "", goal: "", doneWhen: "",
  deadline: null, links: [], lastActivityAt: serverTimestamp(), isDeleted: false, deletedAt: null, ...stamps(), ...over,
});
const account = (over: Record<string, unknown> = {}) => ({
  service: "Vercel", url: "https://vercel.com", category: "cloud", loginIdentifier: "me@example.com",
  signInMethod: "github", twoFactor: "authenticator", recoveryLocation: "Bitwarden › Dev & Cloud",
  plan: "Hobby", cost: null, renewalDate: null, owner: "me", clientName: null, status: "active",
  lastReviewedAt: null, notes: "Login via GitHub", isDeleted: false, deletedAt: null, ...stamps(), ...over,
});

describe("users/{uid}", () => {
  it("owner can create and read own doc", async () => {
    await assertSucceeds(setDoc(doc(owner(), "users/u1"), { email: OWNER, displayName: "U", ...stamps() }));
    await assertSucceeds(getDoc(doc(owner(), "users/u1")));
  });
  it("cannot create with a different email", async () => {
    await assertFails(setDoc(doc(owner(), "users/u1"), { email: "x@y.com", ...stamps() }));
  });
  it("other users, unverified and unauthenticated are denied", async () => {
    await assertFails(getDoc(doc(stranger(), "users/u1")));
    await assertFails(getDoc(doc(strangerAsU1(), "users/u1")));
    await assertFails(getDoc(doc(unverified(), "users/u1")));
    await assertFails(getDoc(doc(anon(), "users/u1")));
    await assertFails(setDoc(doc(stranger(), "users/u2"), { email: "evil@example.com", ...stamps() }));
  });
  it("cannot delete user doc", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "users/u1"), { email: OWNER }));
    await assertFails(deleteDoc(doc(owner(), "users/u1")));
  });
});

describe("items", () => {
  const path = "users/u1/items/i1";
  it("valid create succeeds", async () => {
    await assertSucceeds(setDoc(doc(owner(), path), item()));
  });
  it("oversized note denied", async () => {
    await assertFails(setDoc(doc(owner(), path), item({ note: "x".repeat(20001) })));
  });
  it("unknown field / bad kind / too many tags denied", async () => {
    await assertFails(setDoc(doc(owner(), path), item({ evil: true })));
    await assertFails(setDoc(doc(owner(), path), item({ kind: "video" })));
    await assertFails(setDoc(doc(owner(), path), item({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })));
  });
  it("client timestamps denied", async () => {
    await assertFails(setDoc(doc(owner(), path), item({ updatedAt: Timestamp.now() })));
  });
  it("foreign uid denied", async () => {
    await assertFails(setDoc(doc(stranger(), path), item()));
    await assertFails(setDoc(doc(anon(), path), item()));
  });
  it("update keeps createdAt", async () => {
    await assertSucceeds(setDoc(doc(owner(), path), item()));
    await assertSucceeds(updateDoc(doc(owner(), path), { title: "New", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(owner(), path), { createdAt: Timestamp.now(), updatedAt: serverTimestamp() }));
  });
  it("hard delete only when isDeleted", async () => {
    await assertSucceeds(setDoc(doc(owner(), path), item()));
    await assertFails(deleteDoc(doc(owner(), path)));
    await assertSucceeds(updateDoc(doc(owner(), path), { isDeleted: true, deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(owner(), path)));
  });
});

describe("tasks, projects", () => {
  it("valid task and project", async () => {
    await assertSucceeds(setDoc(doc(owner(), "users/u1/tasks/t1"), task()));
    await assertSucceeds(setDoc(doc(owner(), "users/u1/projects/p1"), project()));
  });
  it("bad shapes denied", async () => {
    await assertFails(setDoc(doc(owner(), "users/u1/tasks/t1"), task({ priority: 5 })));
    await assertFails(setDoc(doc(owner(), "users/u1/tasks/t1"), task({ title: "" })));
    await assertFails(setDoc(doc(owner(), "users/u1/projects/p1"), project({ status: "zombie" })));
    await assertFails(setDoc(doc(owner(), "users/u1/projects/p1"), project({ problem: "x".repeat(2001) })));
  });
  it("other user denied", async () => {
    await assertFails(setDoc(doc(stranger(), "users/u1/tasks/t1"), task()));
    await assertFails(getDoc(doc(stranger(), "users/u1/projects/p1")));
  });
});

describe("accounts", () => {
  const path = "users/u1/accounts/a1";
  it("valid account", async () => {
    await assertSucceeds(setDoc(doc(owner(), path), account()));
  });
  it("secret-looking notes denied", async () => {
    await assertFails(setDoc(doc(owner(), path), account({ notes: "password: abc123" })));
    await assertFails(setDoc(doc(owner(), path), account({ notes: "key sk-abcdefghijklmnopqrstuvwxyz" })));
  });
  it("password / secret fields denied", async () => {
    await assertFails(setDoc(doc(owner(), path), account({ password: "x" })));
    await assertFails(setDoc(doc(owner(), path), account({ secret: "x" })));
  });
  it("other user denied", async () => {
    await assertFails(setDoc(doc(stranger(), path), account()));
  });
});

describe("other owner collections", () => {
  it("tags, rules, conversations, messages, imports", async () => {
    const db = owner();
    await assertSucceeds(setDoc(doc(db, "users/u1/tags/react"), { name: "react", color: null, lastUsedAt: serverTimestamp(), createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, "users/u1/rules/r1"), {
      name: "R", enabled: true, order: 0, match: "any", conditions: [{ field: "domain", op: "equals", value: "x.com" }],
      actions: {}, hits: 0, lastHitAt: null, ...stamps(),
    }));
    await assertFails(setDoc(doc(db, "users/u1/rules/r2"), { name: "R", enabled: true, order: 0, match: "any", conditions: [], actions: {}, hits: 0, lastHitAt: null, ...stamps() }));
    await assertSucceeds(setDoc(doc(db, "users/u1/conversations/c1"), { title: "Chat", ...stamps() }));
    await assertSucceeds(setDoc(doc(db, "users/u1/conversations/c1/messages/m1"), { role: "user", content: "hi", createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "users/u1/conversations/c1/messages/m2"), { role: "system", content: "hi" }));
    await assertSucceeds(setDoc(doc(db, "users/u1/imports/x"), { type: "csv", status: "review", total: 1 }));
    await assertFails(getDoc(doc(stranger(), "users/u1/tags/react")));
  });
  it("aiUsage is read-only for the owner", async () => {
    await assertSucceeds(getDoc(doc(owner(), "users/u1/aiUsage/2026-11-19")));
    await assertFails(setDoc(doc(owner(), "users/u1/aiUsage/2026-11-19"), { requests: 0 }));
  });
  it("blobs: create and read, no update", async () => {
    const db = owner();
    await assertSucceeds(setDoc(doc(db, "users/u1/blobs/b1"), { itemId: "i1", mime: "image/webp", dataBase64: "AAA" }));
    await assertFails(setDoc(doc(db, "users/u1/blobs/b2"), { itemId: "i1", dataBase64: "A".repeat(80001) }));
    await assertFails(updateDoc(doc(db, "users/u1/blobs/b1"), { dataBase64: "BBB" }));
  });
});

describe("server-only collections", () => {
  it.each(["private/u1/aiKeys/gemini", "captureTokens/abc", "rateLimits/u1_1"])("%s denied", async (p) => {
    await assertFails(getDoc(doc(owner(), p)));
    await assertFails(setDoc(doc(owner(), p), { a: 1 }));
  });
});
