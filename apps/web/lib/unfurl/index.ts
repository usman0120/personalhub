import "server-only";
import { detectPlatform, faviconFor, getDomain, LOGIN_WALL_PLATFORMS, type UnfurlResult } from "@personalhub/shared";
import { parseMetadata } from "./parse";
import { safeFetch } from "./safeFetch";

/** Unfurls a URL safely. Login-walled platforms return "blocked" without retrying tricks. */
export async function unfurl(url: string, timeoutMs = 5000): Promise<UnfurlResult> {
  const platform = detectPlatform(url);
  const fallbackIcon = faviconFor(getDomain(url)) ?? undefined;
  try {
    const res = await safeFetch(url, { timeoutMs });
    if (res.status >= 400 || !res.body) {
      const blocked = (LOGIN_WALL_PLATFORMS as readonly string[]).includes(platform);
      return { status: blocked ? "blocked" : "failed", faviconUrl: fallbackIcon };
    }
    const meta = parseMetadata(res.body, res.url);
    if ((LOGIN_WALL_PLATFORMS as readonly string[]).includes(platform)) {
      // Login walls return generic page metadata ("Instagram", "Log in") — treat as blocked unless meaningful.
      const generic = !meta.description || /log ?in|sign ?in|sign up/i.test(`${meta.title} ${meta.description}`);
      if (generic) return { status: "blocked", faviconUrl: fallbackIcon, siteName: meta.siteName };
    }
    return { ...meta, faviconUrl: meta.faviconUrl ?? fallbackIcon };
  } catch {
    const blocked = (LOGIN_WALL_PLATFORMS as readonly string[]).includes(platform);
    return { status: blocked ? "blocked" : "failed", faviconUrl: fallbackIcon };
  }
}
