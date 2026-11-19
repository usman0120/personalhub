const TRACKING_PARAMS = new Set([
  "igsh", "igshid", "si", "fbclid", "gclid", "dclid", "msclkid", "yclid", "trk", "trkinfo", "trackingid",
  "lipi", "ref_src", "ref_url", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "mkt_tok", "spm", "share_id",
  "feature", "rcm", "originalsubdomain", "utm_id", "__cft__", "__tn__", "mibextid", "sfnsn", "s_cid",
  "is_from_webapp", "sender_device", "web_id", "_r", "_t",
]);
/** Params stripped only on particular hosts (they carry meaning elsewhere). */
const HOST_TRACKING: Record<string, string[]> = {
  "x.com": ["s", "t"],
  "tiktok.com": ["_d", "checksum", "sec_user_id", "share_app_id", "share_link_id", "u_code"],
  "reddit.com": ["share_id", "utm_name", "context"],
  "medium.com": ["source", "sk"],
};

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/i;

/** Returns the first http(s) URL inside free text, trimming trailing punctuation. */
export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = URL_RE.exec(text);
  if (!m) return null;
  return m[0].replace(/[),.;:!?\]}'"]+$/, "");
}

export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function canonicalHost(host: string): string {
  let h = host.toLowerCase().replace(/\.$/, "");
  if (h.startsWith("www.")) h = h.slice(4);
  if (h === "m.youtube.com" || h === "music.youtube.com") h = "youtube.com";
  if (h === "twitter.com" || h === "mobile.twitter.com" || h === "mobile.x.com") h = "x.com";
  if (h === "m.facebook.com" || h === "web.facebook.com") h = "facebook.com";
  if (h === "m.tiktok.com") h = "tiktok.com";
  if (h.endsWith(".linkedin.com") && h !== "lnkd.in") h = "linkedin.com";
  if (h === "old.reddit.com" || h === "new.reddit.com") h = "reddit.com";
  return h;
}

/**
 * Normalises a URL for dedupe: lowercase host without www, default port and hash removed,
 * tracking params stripped, remaining params sorted, trailing slash removed (except root).
 * Returns null for anything that is not http(s).
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = canonicalHost(u.hostname);
  let path = u.pathname.replace(/\/{2,}/g, "/");
  const params = new URLSearchParams(u.search);

  // youtu.be/ID and /shorts/ID → youtube.com/watch?v=ID
  if (host === "youtu.be") {
    const id = path.split("/")[1];
    if (id) {
      const t = params.get("t");
      const out = new URL(`https://youtube.com/watch?v=${id}`);
      if (t) out.searchParams.set("t", t);
      return out.toString();
    }
  }

  const hostSpecific = HOST_TRACKING[host] ?? [];
  const kept: [string, string][] = [];
  for (const [k, v] of params) {
    const key = k.toLowerCase();
    if (key.startsWith("utm_") || TRACKING_PARAMS.has(key) || hostSpecific.includes(key)) continue;
    kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const port = u.port && !["80", "443"].includes(u.port) ? `:${u.port}` : "";
  const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";
  return `${u.protocol}//${host}${port}${path}${query}`;
}

/** Registrable-ish domain shown in the UI (host without www). */
export function getDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return canonicalHost(new URL(raw).hostname);
  } catch {
    return null;
  }
}

/** SHA-256 hex of a string using Web Crypto (browser, Node ≥ 20, extension). */
export async function sha256Hex(value: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashUrl(normalized: string | null): Promise<string | null> {
  return normalized ? sha256Hex(normalized) : null;
}

/** Google's public favicon service: used as a fallback when the page exposes none. */
export function faviconFor(domain: string | null | undefined): string | null {
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : null;
}
