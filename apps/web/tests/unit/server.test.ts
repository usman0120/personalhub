import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_AREAS, type Settings } from "@personalhub/shared";
import { decryptSecret, encryptSecret, needsRotation } from "@/lib/crypto/keys";
import { isBlockedIp, SsrfError, vetUrl } from "@/lib/unfurl/safeFetch";
import { parseMetadata } from "@/lib/unfurl/parse";
import { parseActions } from "@/lib/ai/actions";
import { extractJson } from "@/lib/ai/providers";
import { presign } from "@/lib/storage/r2";

beforeAll(() => {
  process.env.KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
  process.env.KEY_ENCRYPTION_VERSION = "1";
});

describe("crypto (AES-256-GCM)", () => {
  it("round-trips and uses a fresh IV", () => {
    const a = encryptSecret("sk-my-secret-key");
    const b = encryptSecret("sk-my-secret-key");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toContain("secret");
    expect(decryptSecret(a)).toBe("sk-my-secret-key");
    expect(needsRotation(a)).toBe(false);
  });
  it("detects tampering with ciphertext or auth tag", () => {
    const e = encryptSecret("hello world");
    const flipped = Buffer.from(e.ciphertext, "base64");
    flipped[0]! ^= 0xff;
    expect(() => decryptSecret({ ...e, ciphertext: flipped.toString("base64") })).toThrow();
    const tag = Buffer.from(e.authTag, "base64");
    tag[0]! ^= 0xff;
    expect(() => decryptSecret({ ...e, authTag: tag.toString("base64") })).toThrow();
  });
  it("supports versioned keys for rotation", () => {
    process.env.KEY_ENCRYPTION_SECRET_V0 = process.env.KEY_ENCRYPTION_SECRET;
    const old = encryptSecret("rotate me", 0);
    expect(needsRotation(old)).toBe(true);
    expect(decryptSecret(old)).toBe("rotate me");
  });
});

describe("SSRF guard", () => {
  it.each(["10.0.0.1", "172.16.5.4", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));

  it("rejects bad schemes, ports, credentials and private hosts", async () => {
    await expect(vetUrl("ftp://example.com")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://example.com:8080/")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://user:pw@example.com/")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://localhost/")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://[::1]/")).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("http://example.com/", { requireHttps: true })).rejects.toBeInstanceOf(SsrfError);
    await expect(vetUrl("not a url")).rejects.toBeInstanceOf(SsrfError);
  });
});

describe("metadata parser", () => {
  const html = `<html><head>
    <title>Fallback &amp; title</title>
    <meta property="og:title" content="Free for Developers">
    <meta name="description" content="Lists of free tiers">
    <meta property="og:site_name" content="free-for.dev">
    <meta property="og:image" content="/og.png">
    <link rel="icon" href="/favicon.svg">
    <link rel="canonical" href="https://free-for.dev/">
    <script type="application/ld+json">{"name":"LD name","description":"LD desc"}</script>
  </head></html>`;
  it("prefers OpenGraph, resolves relative URLs", () => {
    const r = parseMetadata(html, "https://free-for.dev/x");
    expect(r).toMatchObject({
      title: "Free for Developers", description: "Lists of free tiers", siteName: "free-for.dev",
      imageUrl: "https://free-for.dev/og.png", faviconUrl: "https://free-for.dev/favicon.svg", canonicalUrl: "https://free-for.dev/", status: "ok",
    });
  });
  it("falls back to <title> / JSON-LD and reports partial/failed", () => {
    expect(parseMetadata("<title>Only title</title>", "https://a.com").status).toBe("partial");
    expect(parseMetadata(`<script type="application/ld+json">{"name":"N","description":"D"}</script>`, "https://a.com")).toMatchObject({ title: "N", description: "D" });
    expect(parseMetadata("<p>nothing</p>", "https://a.com").status).toBe("failed");
  });
  it("ignores javascript: icons", () => {
    expect(parseMetadata(`<link rel="icon" href="javascript:alert(1)"><title>x</title>`, "https://a.com").faviconUrl).toBe("https://a.com/favicon.ico");
  });
});

describe("assistant action parsing", () => {
  const settings = { areas: SEED_AREAS } as Pick<Settings, "areas">;
  it("splits text and validated actions, drops unknown areas and invalid payloads", () => {
    const reply = 'Here you go.\n```actions\n[{"type":"create_item","payload":{"title":"free-for.dev","url":"https://free-for.dev","areaId":"dev-resources"}},{"type":"create_task","payload":{"title":"Read it","due":"2026-11-20"}},{"type":"create_item","payload":{"title":"X","areaId":"nope"}},{"type":"delete_everything","payload":{}},{"type":"create_project","payload":{}}]\n```';
    const { text, actions } = parseActions(reply, settings);
    expect(text).toBe("Here you go.");
    expect(actions.map((a) => a.type)).toEqual(["create_item", "create_task", "create_item"]);
    expect(actions[0]!.payload.areaId).toBe("dev-resources");
    expect(actions[2]!.payload.areaId).toBeUndefined();
  });
  it("handles replies without actions or with broken JSON", () => {
    expect(parseActions("Just text", settings)).toEqual({ text: "Just text", actions: [] });
    expect(parseActions("T\n```actions\n[broken", settings).actions).toEqual([]);
  });
  it("extractJson tolerates fences and prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("R2 presigning", () => {
  it("produces a SigV4 query-signed URL scoped to the bucket", () => {
    Object.assign(process.env, { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "AKID", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "hub" });
    const url = new URL(presign("PUT", "u/uid1/item/a b.webp", 300, new Date("2026-11-19T00:00:00Z")));
    expect(url.host).toBe("acc.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/hub/u/uid1/item/a%20b.webp");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("AKID/20261119/auto/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
