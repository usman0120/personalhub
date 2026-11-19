import type { UnfurlResult } from "@personalhub/shared";

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(decode(href), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Extracts title/description/site/image/icon/canonical from HTML (OpenGraph, Twitter, JSON-LD, <title>). */
export function parseMetadata(html: string, baseUrl: string): UnfurlResult {
  const head = html.slice(0, 400_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !(key in meta)) meta[key] = decode(content);
  }
  let ldName: string | undefined;
  let ldDesc: string | undefined;
  for (const m of head.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]!);
      const nodes: unknown[] = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const n of nodes as Array<Record<string, unknown>>) {
        if (!ldName && typeof n?.name === "string") ldName = n.name;
        if (!ldDesc && typeof n?.description === "string") ldDesc = n.description;
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  let icon: string | undefined;
  let canonical: string | undefined;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attr(m[0], "rel")?.toLowerCase() ?? "";
    if (!icon && /\b(icon|apple-touch-icon)\b/.test(rel)) icon = absolute(attr(m[0], "href"), baseUrl);
    if (!canonical && rel === "canonical") canonical = absolute(attr(m[0], "href"), baseUrl);
  }
  const title = meta["og:title"] ?? meta["twitter:title"] ?? (titleTag ? decode(titleTag) : undefined) ?? ldName;
  const description = meta["og:description"] ?? meta["twitter:description"] ?? meta["description"] ?? ldDesc;
  const result: UnfurlResult = {
    title: title?.slice(0, 300) || undefined,
    description: description?.slice(0, 1000) || undefined,
    siteName: meta["og:site_name"]?.slice(0, 120),
    imageUrl: absolute(meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"], baseUrl),
    faviconUrl: icon ?? absolute("/favicon.ico", baseUrl),
    canonicalUrl: canonical ?? absolute(meta["og:url"], baseUrl),
    status: "ok",
  };
  result.status = result.title && result.description ? "ok" : result.title || result.description ? "partial" : "failed";
  return result;
}
