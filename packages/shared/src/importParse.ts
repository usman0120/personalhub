import type { ImportEntry } from "./schemas/api";
import { isHttpUrl, normalizeUrl } from "./url";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
}

const IGNORED_FOLDERS = new Set(["bookmarks bar", "bookmarks toolbar", "other bookmarks", "favorites bar", "bookmarks menu", "mobile bookmarks", "bookmarks"]);

/** Parses the Netscape bookmark format exported by Chrome, Edge and Firefox. */
export function parseBookmarksHtml(html: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  const stack: string[] = [];
  let pendingFolder: string | null = null;
  const tokenRe = /<DT><H3[^>]*>([\s\S]*?)<\/H3>|<DL>|<\/DL>|<DT><A\s+([^>]*)>([\s\S]*?)<\/A>/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html))) {
    const tok = m[0].toUpperCase();
    if (m[1] !== undefined) {
      pendingFolder = decodeEntities(m[1].trim());
    } else if (tok === "<DL>") {
      stack.push(pendingFolder ?? "");
      pendingFolder = null;
    } else if (tok === "</DL>") {
      stack.pop();
    } else if (m[2] !== undefined) {
      const attrs = m[2];
      const href = /HREF="([^"]*)"/i.exec(attrs)?.[1];
      if (!href) continue;
      const url = decodeEntities(href);
      if (!isHttpUrl(url)) continue;
      const add = /ADD_DATE="(\d+)"/i.exec(attrs)?.[1];
      const folderPath = stack.filter((f) => f && !IGNORED_FOLDERS.has(f.toLowerCase()));
      entries.push({
        url,
        title: decodeEntities((m[3] ?? "").replace(/<[^>]+>/g, "").trim()) || url,
        folderPath,
        addDate: add ? Number(add) * 1000 : undefined,
      });
    }
  }
  return entries;
}

export function parseUrlList(text: string): ImportEntry[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => isHttpUrl(l))
    .map((url) => ({ url, title: url, folderPath: [] }));
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** CSV with a header row; recognises url/link/href, title/name, folder/tags/category, date columns. */
export function parseCsv(text: string): ImportEntry[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  let urlIdx = find("url", "link", "href", "address");
  const titleIdx = find("title", "name");
  const folderIdx = find("folder", "tags", "tag", "category", "collection");
  const dateIdx = find("date", "created", "created_at", "added", "add_date");
  let body = rows.slice(1);
  if (urlIdx === -1) {
    urlIdx = rows[0]!.findIndex((f) => isHttpUrl(f.trim()));
    if (urlIdx === -1) return [];
    body = rows;
  }
  const out: ImportEntry[] = [];
  for (const r of body) {
    const url = (r[urlIdx] ?? "").trim();
    if (!isHttpUrl(url)) continue;
    const dateRaw = dateIdx >= 0 ? r[dateIdx]?.trim() : undefined;
    const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
    out.push({
      url,
      title: (titleIdx >= 0 ? r[titleIdx]?.trim() : "") || url,
      folderPath: folderIdx >= 0 && r[folderIdx]?.trim() ? r[folderIdx]!.split(/[/|;>]/).map((s) => s.trim()).filter(Boolean) : [],
      addDate: Number.isNaN(parsed) ? undefined : parsed,
    });
  }
  return out;
}

/** Removes in-file duplicates by normalised URL. */
export function dedupeEntries(entries: ImportEntry[]): { entries: ImportEntry[]; duplicatesInFile: number } {
  const seen = new Set<string>();
  const out: ImportEntry[] = [];
  for (const e of entries) {
    const key = normalizeUrl(e.url) ?? e.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return { entries: out, duplicatesInFile: entries.length - out.length };
}
