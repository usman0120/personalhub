import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

export class SsrfError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** True for private, loopback, link-local, CGNAT, multicast, reserved and metadata ranges. */
export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (fam === 6) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isBlockedIp(mapped[1]!);
    if (v === "::" || v === "::1") return true;
    const first = parseInt(v.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8")) return true;
    return false;
  }
  return true;
}

export interface SafeUrlOptions { requireHttps?: boolean }

/** Validates scheme/port and resolves DNS; returns a vetted address to connect to. */
export async function vetUrl(raw: string, opts: SafeUrlOptions = {}): Promise<{ url: URL; address: string; family: number }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (url.protocol !== "https:" && (opts.requireHttps || url.protocol !== "http:")) throw new SsrfError("Scheme not allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new SsrfError("Port not allowed");
  if (url.username || url.password) throw new SsrfError("Credentials in URL not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal") {
    throw new SsrfError("Host not allowed");
  }
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await dnsLookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new SsrfError("Host did not resolve");
  if (addrs.some((a) => isBlockedIp(a.address))) throw new SsrfError("Address not allowed");
  return { url, address: addrs[0]!.address, family: addrs[0]!.family };
}

export interface SafeResponse {
  status: number;
  url: string;
  contentType: string;
  body: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string[];
  method?: "GET" | "HEAD";
}

const UA = "PersonalHubBot/1.0 (+personal link preview)";

function requestOnce(url: URL, address: string, family: number, method: string, signal: AbortSignal): Promise<IncomingMessage> {
  // Pin the connection to the vetted IP to prevent DNS rebinding.
  const lookup: LookupFunction = (_host, options, cb) => {
    if ((options as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
    else cb(null, address, family);
  };
  const fn = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = fn(url, {
      method,
      lookup,
      signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-language": "en" },
    }, resolve);
    req.on("error", reject);
    req.end();
  });
}

/** SSRF-safe fetch: http(s) on 80/443 only, vetted DNS on every hop, ≤ 3 redirects, timeout and size cap. */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { timeoutMs = 5000, maxBytes = 1_000_000, maxRedirects = 3, method = "GET" } = opts;
  const accept = opts.accept ?? ["text/html", "application/xhtml+xml"];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = raw;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const { url, address, family } = await vetUrl(current);
      const res = await requestOnce(url, address, family, method, controller.signal);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        current = new URL(res.headers.location, url).toString();
        continue;
      }
      const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
      if (method === "HEAD") {
        res.resume();
        return { status, url: url.toString(), contentType, body: "" };
      }
      if (!accept.some((a) => contentType.includes(a))) {
        res.destroy();
        return { status, url: url.toString(), contentType, body: "" };
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of res) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) {
          res.destroy();
          break;
        }
        chunks.push(chunk as Buffer);
      }
      return { status, url: url.toString(), contentType, body: Buffer.concat(chunks).toString("utf8").slice(0, maxBytes) };
    }
    throw new SsrfError("Too many redirects");
  } finally {
    clearTimeout(timer);
  }
}
