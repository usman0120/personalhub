import { describe, expect, it } from "vitest";
import {
  applyRules, buildItem, cleanTags, dedupeEntries, detectPlatform, extractFirstUrl, findSecrets, getDomain,
  hashUrl, hasSecret, isHttpUrl, matchCondition, normalizeUrl, parseBookmarksHtml, parseCsv, parseQuickAdd,
  parseTask, parseUrlList, SEED_RULES, slugify, truncate,
} from "./index";

describe("normalizeUrl", () => {
  it.each([
    ["https://www.instagram.com/reel/ABC123/?igsh=xyz123", "https://instagram.com/reel/ABC123"],
    ["https://www.linkedin.com/posts/foo-bar?trk=public_post&utm_source=share", "https://linkedin.com/posts/foo-bar"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abcdef", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42"],
    ["https://m.youtube.com/watch?v=abc&feature=shared&si=1", "https://youtube.com/watch?v=abc"],
    ["https://example.com/a/?utm_source=x&utm_medium=y&b=2&a=1#section", "https://example.com/a?a=1&b=2"],
    ["HTTPS://Example.COM:443/Path/", "https://example.com/Path"],
    ["http://example.com:8080/", "http://example.com:8080/"],
    ["https://twitter.com/user/status/1?s=20&t=abc", "https://x.com/user/status/1"],
    ["https://pk.linkedin.com/in/someone", "https://linkedin.com/in/someone"],
    ["https://www.facebook.com/watch?v=1&fbclid=abc", "https://facebook.com/watch?v=1"],
    ["https://old.reddit.com/r/webdev/comments/1/x/?share_id=abc", "https://reddit.com/r/webdev/comments/1/x"],
    ["https://free-for.dev/#/", "https://free-for.dev/"],
    ["https://example.com//double//slash", "https://example.com/double/slash"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it("rejects non-http and garbage", () => {
    expect(normalizeUrl("ftp://x.com")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });

  it("hashes consistently and handles null", async () => {
    const a = await hashUrl(normalizeUrl("https://www.example.com/?utm_source=1"));
    const b = await hashUrl(normalizeUrl("https://example.com"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashUrl(null)).toBeNull();
  });
});

describe("url helpers", () => {
  it("extracts first URL from share text", () => {
    expect(extractFirstUrl("Check out this post… https://www.linkedin.com/posts/abc?x=1).")).toBe(
      "https://www.linkedin.com/posts/abc?x=1",
    );
    expect(extractFirstUrl("no url here")).toBeNull();
    expect(extractFirstUrl(undefined)).toBeNull();
  });
  it("isHttpUrl / getDomain", () => {
    expect(isHttpUrl("https://a.com")).toBe(true);
    expect(isHttpUrl("mailto:a@b.c")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(getDomain("https://www.github.com/x")).toBe("github.com");
    expect(getDomain("nope")).toBeNull();
    expect(getDomain(undefined)).toBeNull();
  });
});

describe("detectPlatform", () => {
  it.each([
    ["https://www.instagram.com/reel/x", "instagram"],
    ["https://instagr.am/p/x", "instagram"],
    ["https://lnkd.in/abc", "linkedin"],
    ["https://www.linkedin.com/jobs/view/1", "linkedin"],
    ["https://fb.watch/abc", "facebook"],
    ["https://vm.tiktok.com/abc", "tiktok"],
    ["https://youtu.be/abc", "youtube"],
    ["https://twitter.com/a", "x"],
    ["https://x.com/a", "x"],
    ["https://gist.github.com/a", "github"],
    ["https://user.github.io", "github"],
    ["https://redd.it/abc", "reddit"],
    ["https://medium.com/@a/b", "medium"],
    ["https://free-for.dev", "web"],
    [null, "other"],
  ])("%s → %s", (url, p) => expect(detectPlatform(url)).toBe(p));
});

describe("parseQuickAdd", () => {
  const now = new Date("2026-11-19T10:00:00");
  it("URL → link with tags and area", () => {
    const r = parseQuickAdd("https://free-for.dev #Free-Tier #hosting @dev", now);
    expect(r.type).toBe("link");
    expect(r.url).toBe("https://free-for.dev");
    expect(r.tags).toEqual(["free-tier", "hosting"]);
    expect(r.areaToken).toBe("dev");
  });
  it("text with URL → link, title is the text", () => {
    const r = parseQuickAdd("Great hosting list https://free-for.dev", now);
    expect(r.type).toBe("link");
    expect(r.title).toBe("Great hosting list");
  });
  it("todo: → task with date and priority", () => {
    const r = parseQuickAdd("todo: submit proposal fri 5pm !1 #PersonalHub", now);
    expect(r.type).toBe("task");
    expect(r.task?.title).toBe("submit proposal");
    expect(r.task?.priority).toBe(1);
    expect(r.task?.projectToken).toBe("PersonalHub");
    expect(r.task?.dueHasTime).toBe(true);
    const due = new Date(r.task!.due!);
    expect(due.getDay()).toBe(5);
    expect(due.getHours()).toBe(17);
  });
  it("[] → task without date", () => {
    const r = parseQuickAdd("[] buy milk", now);
    expect(r.type).toBe("task");
    expect(r.task?.due).toBeNull();
    expect(r.task?.priority).toBe(2);
  });
  it("[ ] with date-only → end of day", () => {
    const r = parseQuickAdd("[ ] pay fees tomorrow !3", now);
    expect(r.task?.dueHasTime).toBe(false);
    expect(new Date(r.task!.due!).getHours()).toBe(23);
    expect(r.task?.priority).toBe(3);
  });
  it("idea: → idea", () => {
    const r = parseQuickAdd("idea: a CLI for invoices #freelance", now);
    expect(r.type).toBe("idea");
    expect(r.title).toBe("a CLI for invoices");
    expect(r.tags).toEqual(["freelance"]);
  });
  it("plain text → note", () => {
    const r = parseQuickAdd("Remember to read about CRDTs\nsecond line", now);
    expect(r.type).toBe("note");
    expect(r.title).toBe("Remember to read about CRDTs");
  });
  it("parseTask with area token", () => {
    const t = parseTask("read chapter 4 @study", now);
    expect(t.areaToken).toBe("study");
    expect(t.title).toBe("read chapter 4");
  });
});

describe("applyRules", () => {
  const rules = SEED_RULES;
  it("github → Dev Resources + github tag", () => {
    const r = applyRules({ domain: "github.com", url: "https://github.com/x", platform: "github" }, rules);
    expect(r.areaId).toBe("dev-resources");
    expect(r.tags).toEqual(["github"]);
    expect(r.rulesApplied).toEqual(["seed-github"]);
  });
  it("subdomain matches domain equals", () => {
    expect(applyRules({ domain: "gist.github.com" }, rules).areaId).toBe("dev-resources");
  });
  it("instagram → reel tag", () => {
    expect(applyRules({ platform: "instagram", domain: "instagram.com" }, rules).tags).toEqual(["reel"]);
  });
  it("linkedin jobs → career + job", () => {
    const r = applyRules({ url: "https://linkedin.com/jobs/view/1", domain: "linkedin.com", platform: "linkedin" }, rules);
    expect(r.areaId).toBe("career");
    expect(r.tags).toContain("job");
  });
  it("*.dev → Dev Resources", () => {
    expect(applyRules({ domain: "react.dev" }, rules).areaId).toBe("dev-resources");
  });
  it("no match → empty", () => {
    const r = applyRules({ domain: "example.com" }, rules);
    expect(r).toEqual({ tags: [], rulesApplied: [] });
  });
  it("later rules override, tags union, disabled skipped, match all", () => {
    const r = applyRules({ title: "React hooks guide", domain: "blog.com", kind: "link", source: "web" }, [
      { id: "b", enabled: true, order: 2, match: "all", conditions: [{ field: "title", op: "contains", value: "react" }, { field: "kind", op: "equals", value: "link" }], actions: { setAreaId: "study", addTags: ["react"], setKind: "note", setStatus: "active", setProjectId: "p1", runAi: false } },
      { id: "a", enabled: true, order: 1, match: "any", conditions: [{ field: "title", op: "startsWith", value: "react" }], actions: { setAreaId: "career", addTags: ["react", "js"] } },
      { id: "c", enabled: false, order: 3, match: "any", conditions: [{ field: "source", op: "equals", value: "web" }], actions: { setAreaId: "x" } },
      { id: "d", enabled: true, order: 4, match: "all", conditions: [{ field: "title", op: "endsWith", value: "nope" }, { field: "source", op: "equals", value: "web" }], actions: { setAreaId: "y" } },
      { id: "e", enabled: true, order: 5, match: "any", conditions: [], actions: { setAreaId: "z" } },
    ]);
    expect(r.rulesApplied).toEqual(["a", "b"]);
    expect(r.areaId).toBe("study");
    expect(r.tags).toEqual(["react", "js"]);
    expect(r).toMatchObject({ kind: "note", status: "active", projectId: "p1", runAi: false });
  });
  it("matchCondition edge cases", () => {
    expect(matchCondition({ domain: "" }, { field: "domain", op: "contains", value: "x" })).toBe(false);
    expect(matchCondition({ platform: "youtube" }, { field: "platform", op: "in", value: "tiktok, youtube" })).toBe(true);
    expect(matchCondition({ title: "abc" }, { field: "title", op: "contains", value: "  " })).toBe(false);
    expect(matchCondition({ text: "Hello" }, { field: "text", op: "endsWith", value: ["LO"] })).toBe(true);
  });
});

describe("secrets", () => {
  it.each([
    "password: abc123",
    "pwd=hunter2",
    "backup codes: 12345678",
    "OTP 123456 code",
    "-----BEGIN RSA PRIVATE KEY-----",
    "sk-abcdefghijklmnopqrstuvwxyz123",
    "AIzaSyA1234567890abcdefghijklmnopqrstuv",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "xoxb-123-abc",
    "AKIAABCDEFGHIJKLMNOP",
    "JBSWY3DPEHPK3PXPJBSWY3DP",
    "abandon ability able about above absent absorb abstract absurd abuse access accident",
  ])("flags %s", (t) => expect(hasSecret(t)).toBe(true));
  it("allows normal notes", () => {
    expect(findSecrets("Login via GitHub, 2FA authenticator, Hobby plan. Recovery in Bitwarden.")).toEqual([]);
    expect(findSecrets(null)).toEqual([]);
  });
});

describe("text", () => {
  it("slugify / cleanTags / truncate", () => {
    expect(slugify("Free Tier!")).toBe("free-tier");
    expect(slugify("Café Déjà")).toBe("cafe-deja");
    expect(cleanTags(["A b", "a-b", "", "C"])).toEqual(["a-b", "c"]);
    expect(cleanTags(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("ab", 4)).toBe("ab");
    expect(truncate(null, 4)).toBe("");
  });
});

describe("import parsers", () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p>
    <DT><A HREF="https://github.com/" ADD_DATE="1700000000">GitHub</A>
    <DT><H3>Dev</H3>
    <DL><p>
      <DT><A HREF="https://free-for.dev/" ADD_DATE="1700000001">Free &amp; dev</A>
      <DT><A HREF="javascript:void(0)">bookmarklet</A>
      <DT><A HREF="https://www.github.com/?utm_source=x">GitHub dup</A>
    </DL><p>
  </DL><p>
</DL>`;
  it("parses Netscape HTML with folders", () => {
    const e = parseBookmarksHtml(html);
    expect(e).toHaveLength(3);
    expect(e[0]).toMatchObject({ url: "https://github.com/", title: "GitHub", folderPath: [], addDate: 1700000000000 });
    expect(e[1]).toMatchObject({ title: "Free & dev", folderPath: ["Dev"] });
    const d = dedupeEntries(e);
    expect(d.entries).toHaveLength(2);
    expect(d.duplicatesInFile).toBe(1);
  });
  it("parses url list", () => {
    expect(parseUrlList("https://a.com\nnot\n  https://b.com  \n")).toHaveLength(2);
  });
  it("parses CSV with header and quotes", () => {
    const e = parseCsv('title,url,folder,date\n"Hello, world",https://a.com,Dev/Tools,2024-01-01\nx,notaurl,,\r\n"q ""x""",https://b.com,,\n');
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ title: "Hello, world", folderPath: ["Dev", "Tools"] });
    expect(e[0]!.addDate).toBeTypeOf("number");
    expect(e[1]!.title).toBe('q "x"');
  });
  it("parses headerless CSV", () => {
    expect(parseCsv("https://a.com,A\nhttps://b.com,B")).toHaveLength(2);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("a,b\nc,d")).toEqual([]);
  });
});

describe("buildItem", () => {
  it("fills link defaults", () => {
    const i = buildItem({ kind: "link", source: "web", url: "https://www.instagram.com/reel/x/?igsh=1" }, 1);
    expect(i).toMatchObject({
      title: "instagram.com", domain: "instagram.com", platform: "instagram", status: "inbox",
      urlNormalized: "https://instagram.com/reel/x", unfurl: { status: "pending" }, capturedAt: 1,
    });
  });
  it("note title from first line, idea stage", () => {
    expect(buildItem({ kind: "note", source: "web", note: "First\nSecond" }).title).toBe("First");
    expect(buildItem({ kind: "idea", source: "web", title: "X" }).idea).toEqual({ stage: "someday" });
    expect(buildItem({ kind: "note", source: "web" }).title).toBe("Untitled");
  });
});
